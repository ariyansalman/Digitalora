/**
 * Pure checkout engine — the single source of truth for *money*.
 *
 * Like `core/cart.ts` this module has **zero** imports: no Supabase, no
 * grammY, no config. Everything it needs arrives as plain data that the
 * server just read from the database, and everything it returns is a
 * number the server computed itself.
 *
 * Both roads into checkout use it:
 *
 *   • 🛒 Cart      → many lines
 *   • ⚡ Buy Now   → exactly one line
 *
 * Golden rules enforced here (and unit-tested in
 * `tests/checkout.test.mjs`):
 *
 *   1. The client may only say *what* it wants (product, qty, coupon
 *      code). Prices, promo discounts, coupon discounts and the
 *      payable amount are always recomputed from server data.
 *   2. No total can ever be negative — every discount is clamped to
 *      the amount it is allowed to reduce.
 *   3. Quantities are clamped to what is actually purchasable right
 *      now, so a stale keyboard can never oversell stock.
 *   4. A checkout is identified by a deterministic fingerprint so a
 *      duplicate tap can be recognised and rejected.
 */

// ---------------------------------------------------------------------
// Money helpers
// ---------------------------------------------------------------------

/** Round to 2 decimals, mapping non-finite input to 0. */
export function round2(n: number): number {
  return Math.round((Number.isFinite(Number(n)) ? Number(n) : 0) * 100) / 100;
}

/** Clamp to `[0, max]` after rounding — used for every discount. */
export function clampMoney(n: number, max: number): number {
  const value = round2(n);
  const ceiling = round2(max);
  if (!(value > 0)) return 0;
  return value > ceiling ? Math.max(0, ceiling) : value;
}

// ---------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------

/** Where the checkout was entered from. Affects copy + navigation only. */
export type CheckoutSourceKind = 'cart' | 'buy_now';

/**
 * One product line as the *server* knows it: the freshly-read catalog
 * row, the per-user effective unit price and the promo discount that
 * `services/promo.ts` resolved for this exact quantity.
 */
export type CheckoutLineInput = {
  product_id: number;
  name: string;
  /** Authoritative unit price (per-user override already applied). */
  unitPrice: number;
  /** What the user asked for. */
  requestedQty: number;
  /** Purchasable ceiling right now (0 = nothing can be sold). */
  maxQty: number;
  active: boolean;
  unlimited: boolean;
  /** Flat promo discount for this line, resolved server-side. */
  promoDiscount?: number;
  /** Promo row id, recorded on the order. */
  promoId?: number | null;
  /** Price the user saw when the line was added (display only). */
  snapshotUnitPrice?: number;
};

export type CheckoutLineStatus =
  | 'ok'
  | 'adjusted'
  | 'inactive'
  | 'out_of_stock';

export type CheckoutLine = {
  product_id: number;
  name: string;
  requestedQty: number;
  /** Quantity that will actually be charged and ordered. */
  qty: number;
  unitPrice: number;
  snapshotUnitPrice: number;
  priceChanged: boolean;
  /** `unitPrice * qty`. */
  gross: number;
  /** Promo discount, clamped to `gross`. */
  promoDiscount: number;
  /** Coupon share allocated to this line (filled by the quote). */
  couponDiscount: number;
  /** `gross - promoDiscount - couponDiscount`, never below 0. */
  subtotal: number;
  promoId: number | null;
  status: CheckoutLineStatus;
  maxQty: number;
  unlimited: boolean;
};

// ---------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------

/** Coupon row as stored in `public.coupons` (plus this user's usage). */
export type CouponRule = {
  code: string;
  kind: 'percent' | 'fixed';
  /** Percent (0-100) when `kind === 'percent'`, else a flat amount. */
  value: number;
  active: boolean;
  /** ISO timestamps; `null` means unbounded. */
  starts_at?: string | null;
  expires_at?: string | null;
  /** Minimum eligible subtotal required to use the coupon. */
  min_subtotal?: number | null;
  /** Ceiling on the resulting discount. */
  max_discount?: number | null;
  /** Restrict to these products; `null`/empty = any product. */
  product_ids?: readonly number[] | null;
  /** Global redemption cap; `null` = unlimited. */
  usage_limit?: number | null;
  used_count?: number | null;
  /** Per-user redemption cap; `null` = unlimited. */
  per_user_limit?: number | null;
  user_used_count?: number | null;
};

export type CouponRejection =
  | 'unknown'
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'min_subtotal'
  | 'usage_limit'
  | 'per_user_limit'
  | 'not_applicable'
  | 'no_effect';

export type CouponEvaluation =
  | {
      ok: true;
      code: string;
      /** Discount to apply, already clamped to the eligible subtotal. */
      discount: number;
      /** Subtotal (post-promo) the coupon was allowed to act on. */
      eligibleSubtotal: number;
    }
  | { ok: false; code: string; reason: CouponRejection };

/**
 * Evaluate a coupon against the *post-promo* line subtotals.
 *
 * The coupon can only ever reduce the eligible portion of the order,
 * and never below zero. Promotions are applied first and are never
 * replaced — a coupon stacks on top of whatever promo already won.
 */
export function evaluateCoupon(
  rule: CouponRule | null | undefined,
  lines: readonly CheckoutLine[],
  now: Date = new Date(),
): CouponEvaluation {
  const code = (rule?.code ?? '').trim().toUpperCase();
  if (!rule) return { ok: false, code, reason: 'unknown' };
  if (!rule.active) return { ok: false, code, reason: 'inactive' };

  const nowMs = now.getTime();
  if (rule.starts_at) {
    const startsMs = Date.parse(rule.starts_at);
    if (Number.isFinite(startsMs) && nowMs < startsMs) {
      return { ok: false, code, reason: 'not_started' };
    }
  }
  if (rule.expires_at) {
    const expiresMs = Date.parse(rule.expires_at);
    if (Number.isFinite(expiresMs) && nowMs >= expiresMs) {
      return { ok: false, code, reason: 'expired' };
    }
  }
  if (
    rule.usage_limit !== null &&
    rule.usage_limit !== undefined &&
    Number(rule.used_count ?? 0) >= Number(rule.usage_limit)
  ) {
    return { ok: false, code, reason: 'usage_limit' };
  }
  if (
    rule.per_user_limit !== null &&
    rule.per_user_limit !== undefined &&
    Number(rule.user_used_count ?? 0) >= Number(rule.per_user_limit)
  ) {
    return { ok: false, code, reason: 'per_user_limit' };
  }

  const scope =
    rule.product_ids && rule.product_ids.length > 0
      ? new Set(rule.product_ids.map(Number))
      : null;
  const eligible = lines.filter(
    (l) => l.qty > 0 && (scope === null || scope.has(l.product_id)),
  );
  const eligibleSubtotal = round2(
    eligible.reduce((sum, l) => sum + (l.gross - l.promoDiscount), 0),
  );
  if (eligible.length === 0 || eligibleSubtotal <= 0) {
    return { ok: false, code, reason: 'not_applicable' };
  }
  if (
    rule.min_subtotal !== null &&
    rule.min_subtotal !== undefined &&
    eligibleSubtotal < round2(rule.min_subtotal)
  ) {
    return { ok: false, code, reason: 'min_subtotal' };
  }

  const raw =
    rule.kind === 'percent'
      ? (eligibleSubtotal * Math.max(0, Math.min(100, Number(rule.value)))) / 100
      : Number(rule.value);
  let discount = clampMoney(raw, eligibleSubtotal);
  if (rule.max_discount !== null && rule.max_discount !== undefined) {
    discount = clampMoney(Math.min(discount, round2(rule.max_discount)), eligibleSubtotal);
  }
  if (discount <= 0) return { ok: false, code, reason: 'no_effect' };
  return { ok: true, code, discount, eligibleSubtotal };
}

/**
 * Split a cart-level coupon discount across the eligible lines so the
 * per-order `total` rows still add up to the payable amount.
 *
 * Proportional by post-promo line subtotal, with the rounding
 * remainder given to the largest line (largest-remainder method), and
 * every share clamped so no line can go negative.
 */
export function allocateCouponDiscount(
  lines: readonly CheckoutLine[],
  discount: number,
  scope: readonly number[] | null = null,
): Map<number, number> {
  const out = new Map<number, number>();
  const total = clampMoney(discount, Number.MAX_SAFE_INTEGER);
  if (total <= 0) return out;

  const scopeSet = scope && scope.length > 0 ? new Set(scope.map(Number)) : null;
  const eligible = lines.filter(
    (l) => l.qty > 0 && (scopeSet === null || scopeSet.has(l.product_id)),
  );
  const base = round2(eligible.reduce((s, l) => s + (l.gross - l.promoDiscount), 0));
  if (eligible.length === 0 || base <= 0) return out;

  const capped = Math.min(total, base);
  let assigned = 0;
  for (const line of eligible) {
    const lineBase = round2(line.gross - line.promoDiscount);
    const share = clampMoney((capped * lineBase) / base, lineBase);
    out.set(line.product_id, share);
    assigned = round2(assigned + share);
  }

  // Hand the rounding remainder (positive or negative) to the biggest
  // eligible line that can absorb it without going negative.
  let remainder = round2(capped - assigned);
  if (remainder !== 0) {
    const ordered = [...eligible].sort(
      (a, b) => b.gross - b.promoDiscount - (a.gross - a.promoDiscount),
    );
    for (const line of ordered) {
      const lineBase = round2(line.gross - line.promoDiscount);
      const current = out.get(line.product_id) ?? 0;
      const next = clampMoney(current + remainder, lineBase);
      const delta = round2(next - current);
      if (delta !== 0) {
        out.set(line.product_id, next);
        remainder = round2(remainder - delta);
      }
      if (remainder === 0) break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// Lines + quote
// ---------------------------------------------------------------------

/** Evaluate one line against live product state. */
export function evaluateCheckoutLine(input: CheckoutLineInput): CheckoutLine {
  const requestedQty = Math.max(0, Math.floor(Number(input.requestedQty) || 0));
  const unitPrice = Math.max(0, round2(input.unitPrice));
  const snapshotUnitPrice = Math.max(0, round2(input.snapshotUnitPrice ?? 0));
  const unlimited = Boolean(input.unlimited);
  // An unlimited product has no stock ceiling: whatever was asked for
  // is purchasable, so a missing/zero `maxQty` must not read as sold out.
  const maxQty = unlimited
    ? requestedQty
    : Math.max(0, Math.floor(Number(input.maxQty) || 0));
  const base = {
    product_id: Number(input.product_id),
    name: input.name,
    requestedQty,
    unitPrice,
    snapshotUnitPrice,
    priceChanged: snapshotUnitPrice > 0 && snapshotUnitPrice !== unitPrice,
    promoId: input.promoId ?? null,
    couponDiscount: 0,
    maxQty,
    unlimited,
  };

  if (!input.active) {
    return {
      ...base,
      qty: 0,
      gross: 0,
      promoDiscount: 0,
      subtotal: 0,
      promoId: null,
      status: 'inactive',
    };
  }
  if (maxQty <= 0) {
    return {
      ...base,
      qty: 0,
      gross: 0,
      promoDiscount: 0,
      subtotal: 0,
      promoId: null,
      status: 'out_of_stock',
    };
  }

  const qty = Math.min(requestedQty, maxQty);
  const gross = round2(unitPrice * qty);
  const promoDiscount = clampMoney(input.promoDiscount ?? 0, gross);
  return {
    ...base,
    qty,
    gross,
    promoDiscount,
    subtotal: round2(Math.max(0, gross - promoDiscount)),
    status: qty === requestedQty ? 'ok' : 'adjusted',
  };
}

export type CheckoutQuote = {
  source: CheckoutSourceKind;
  currency: string;
  /** Every line, including the ones that cannot be sold. */
  lines: CheckoutLine[];
  /** Lines that will actually be ordered. */
  purchasable: CheckoutLine[];
  /** Lines needing the user's attention (adjusted / inactive / oos). */
  problems: CheckoutLine[];
  /** Σ unitPrice × qty over purchasable lines (before any discount). */
  subtotal: number;
  /** Σ promo discounts. */
  promotionDiscount: number;
  /** Coupon discount actually applied (0 when none / rejected). */
  couponDiscount: number;
  /** `promotionDiscount + couponDiscount`. */
  discount: number;
  /** What the user must pay — never negative. */
  payable: number;
  walletBalance: number;
  /** True when the wallet alone can settle `payable`. */
  walletCovers: boolean;
  /** How much more is needed when the wallet is short. */
  shortfall: number;
  itemCount: number;
  lineCount: number;
  isEmpty: boolean;
  hasProblems: boolean;
  canCheckout: boolean;
  /** Coupon outcome, when a code was supplied. */
  coupon: CouponEvaluation | null;
  /** Stable identity of this exact order attempt. */
  fingerprint: string;
};

export type BuildQuoteArgs = {
  source: CheckoutSourceKind;
  currency: string;
  walletBalance: number;
  lines: readonly CheckoutLineInput[];
  /** Coupon row + this user's usage; `null` when no code was entered. */
  coupon?: CouponRule | null;
  /** Code the user typed even if it matched no row (for messaging). */
  couponCode?: string | null;
  now?: Date;
};

/**
 * The one authoritative calculation. Everything the checkout screen
 * shows and everything the wallet is charged comes from here.
 */
export function buildCheckoutQuote(args: BuildQuoteArgs): CheckoutQuote {
  const lines = args.lines.map(evaluateCheckoutLine);
  const purchasable = lines.filter((l) => l.qty > 0);
  const problems = lines.filter((l) => l.status !== 'ok');

  const subtotal = round2(purchasable.reduce((s, l) => s + l.gross, 0));
  const promotionDiscount = round2(
    purchasable.reduce((s, l) => s + l.promoDiscount, 0),
  );

  const typedCode = (args.couponCode ?? args.coupon?.code ?? '').trim().toUpperCase();
  let coupon: CouponEvaluation | null = null;
  if (typedCode) {
    coupon = args.coupon
      ? evaluateCoupon(args.coupon, purchasable, args.now ?? new Date())
      : { ok: false, code: typedCode, reason: 'unknown' };
  }

  let couponDiscount = 0;
  if (coupon?.ok) {
    const scope =
      args.coupon?.product_ids && args.coupon.product_ids.length > 0
        ? args.coupon.product_ids.map(Number)
        : null;
    const allocation = allocateCouponDiscount(purchasable, coupon.discount, scope);
    for (const line of lines) {
      const share = allocation.get(line.product_id) ?? 0;
      line.couponDiscount = share;
      line.subtotal = round2(Math.max(0, line.gross - line.promoDiscount - share));
      couponDiscount = round2(couponDiscount + share);
    }
  }

  const discount = round2(Math.min(promotionDiscount + couponDiscount, subtotal));
  const payable = round2(Math.max(0, subtotal - discount));
  const walletBalance = round2(args.walletBalance);
  const shortfall = round2(Math.max(0, payable - walletBalance));

  return {
    source: args.source,
    currency: args.currency,
    lines,
    purchasable,
    problems,
    subtotal,
    promotionDiscount,
    couponDiscount,
    discount,
    payable,
    walletBalance,
    walletCovers: shortfall <= 0,
    shortfall,
    itemCount: purchasable.reduce((s, l) => s + l.qty, 0),
    lineCount: lines.length,
    isEmpty: lines.length === 0,
    hasProblems: problems.length > 0,
    canCheckout: purchasable.length > 0 && payable >= 0,
    coupon,
    fingerprint: checkoutFingerprint(args.source, purchasable, couponDiscount),
  };
}

/**
 * Deterministic identity for an order attempt: same products, same
 * quantities, same prices and same coupon → same fingerprint. Used as
 * the idempotency key so a double tap cannot create two order batches.
 */
export function checkoutFingerprint(
  source: CheckoutSourceKind,
  lines: readonly CheckoutLine[],
  couponDiscount = 0,
): string {
  const parts = [...lines]
    .sort((a, b) => a.product_id - b.product_id)
    .map((l) => `${l.product_id}x${l.qty}@${l.unitPrice.toFixed(2)}-${l.promoDiscount.toFixed(2)}`);
  return `${source}|${parts.join(',')}|c${round2(couponDiscount).toFixed(2)}`;
}

export type CheckoutReadiness =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'empty'
        | 'nothing_purchasable'
        | 'in_progress'
        | 'closed'
        | 'insufficient_funds';
    };

/**
 * Local mirror of the SQL guards (`begin_cart_checkout`,
 * `begin_checkout_intent`). The database stays authoritative — this
 * just avoids a pointless round-trip and makes the rules testable.
 */
export function checkoutReadiness(
  quote: Pick<
    CheckoutQuote,
    'isEmpty' | 'canCheckout' | 'payable' | 'walletBalance'
  >,
  opts: { status?: 'open' | 'checking_out' | 'completed' | 'abandoned'; requireWallet?: boolean } = {},
): CheckoutReadiness {
  const status = opts.status ?? 'open';
  if (status === 'checking_out') return { ok: false, reason: 'in_progress' };
  if (status !== 'open') return { ok: false, reason: 'closed' };
  if (quote.isEmpty) return { ok: false, reason: 'empty' };
  if (!quote.canCheckout) return { ok: false, reason: 'nothing_purchasable' };
  if (opts.requireWallet && round2(quote.walletBalance) < round2(quote.payable)) {
    return { ok: false, reason: 'insufficient_funds' };
  }
  return { ok: true };
}
