/**
 * Checkout repository boundary.
 *
 * All Supabase access for coupons and checkout intents lives here —
 * services and handlers never touch `supabase` for this data directly
 * (see `docs/REPOSITORY_BOUNDARIES.md`).
 */
import { supabase } from '../supabase.js';
import { logger } from '../../logger.js';
import type { CheckoutSourceKind, CouponRule } from '../../core/checkout.js';

export type DBCheckoutIntent = {
  id: number;
  user_id: number;
  source: CheckoutSourceKind;
  fingerprint: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  payable: number;
  currency: string | null;
  coupon_code: string | null;
  order_ids: number[];
  created_at: string;
  updated_at: string;
};

/**
 * Look up a coupon by code together with this user's redemption count.
 * Returns `null` when the code doesn't exist — validation itself is
 * done by the pure engine (`core/checkout.ts`).
 */
export async function resolveCouponRule(
  code: string,
  user_id: number,
): Promise<CouponRule | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase.rpc('resolve_coupon', {
    p_code: trimmed,
    p_user_id: user_id,
  });
  if (error) {
    logger.error({ err: error, user_id }, 'resolveCouponRule failed');
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | (Record<string, unknown> & { code: string })
    | null
    | undefined;
  if (!row) return null;
  return {
    code: String(row.code),
    kind: (row.kind === 'percent' ? 'percent' : 'fixed') as CouponRule['kind'],
    value: Number(row.value ?? 0),
    active: row.active !== false,
    starts_at: (row.starts_at as string | null) ?? null,
    expires_at: (row.expires_at as string | null) ?? null,
    min_subtotal: row.min_subtotal === null || row.min_subtotal === undefined
      ? null
      : Number(row.min_subtotal),
    max_discount: row.max_discount === null || row.max_discount === undefined
      ? null
      : Number(row.max_discount),
    product_ids: Array.isArray(row.product_ids)
      ? (row.product_ids as unknown[]).map(Number)
      : null,
    usage_limit: row.usage_limit === null || row.usage_limit === undefined
      ? null
      : Number(row.usage_limit),
    used_count: Number(row.used_count ?? 0),
    per_user_limit: row.per_user_limit === null || row.per_user_limit === undefined
      ? null
      : Number(row.per_user_limit),
    user_used_count: Number(row.user_used_count ?? 0),
  };
}

/** Record a coupon redemption. Idempotent on `reference`. */
export async function redeemCoupon(args: {
  code: string;
  user_id: number;
  amount: number;
  reference: string;
}): Promise<void> {
  const { error } = await supabase.rpc('redeem_coupon', {
    p_code: args.code,
    p_user_id: args.user_id,
    p_amount: args.amount,
    p_reference: args.reference,
  });
  if (error) {
    logger.error({ err: error, user_id: args.user_id }, 'redeemCoupon failed');
    throw error;
  }
}

/**
 * Atomically open a checkout intent. Throws with
 * `CHECKOUT_IN_PROGRESS` / `CHECKOUT_DUPLICATE` when the database
 * guard rejects the attempt — this is the cross-process duplicate
 * checkout / duplicate order protection.
 */
export async function beginCheckoutIntent(args: {
  user_id: number;
  source: CheckoutSourceKind;
  fingerprint: string;
  payable: number;
  currency?: string | null;
  coupon_code?: string | null;
}): Promise<DBCheckoutIntent> {
  const { data, error } = await supabase.rpc('begin_checkout_intent', {
    p_user_id: args.user_id,
    p_source: args.source,
    p_fingerprint: args.fingerprint,
    p_payable: args.payable,
    p_currency: args.currency ?? null,
    p_coupon_code: args.coupon_code ?? null,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as DBCheckoutIntent | null;
  if (!row) throw new Error('CHECKOUT_INTENT_FAILED');
  return row;
}

export async function finishCheckoutIntent(
  intent_id: number,
  status: 'completed' | 'failed' | 'cancelled',
  order_ids: readonly number[] = [],
): Promise<void> {
  const { error } = await supabase.rpc('finish_checkout_intent', {
    p_intent_id: intent_id,
    p_status: status,
    p_order_ids: [...order_ids],
  });
  if (error) {
    logger.error({ err: error, intent_id, status }, 'finishCheckoutIntent failed');
  }
}
