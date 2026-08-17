/**
 * Authoritative checkout service — shared by 🛒 Cart and ⚡ Buy Now.
 *
 * This is the *only* place that decides what a user pays. It:
 *
 *   1. Re-reads every product from the database (active flag, live
 *      stock, catalog price) at quote time and again at charge time.
 *   2. Applies the per-user price override (`services/pricing.ts`).
 *   3. Re-resolves the promotion for the *actual* quantity
 *      (`services/promo.ts`) — existing promo/referral pricing rules
 *      are untouched and keep winning exactly as before.
 *   4. Validates the coupon server-side and stacks it on top of the
 *      promo, clamped so nothing can go negative.
 *   5. Hands the numbers to the pure engine (`core/checkout.ts`) which
 *      produces the single quote used by both the screen and the
 *      wallet charge.
 *
 * Nothing here ever reads a total, price or discount from callback
 * data or a message. The client may only say *what* it wants.
 */
import {
  buildCheckoutQuote,
  checkoutReadiness,
  round2,
  type CheckoutLineInput,
  type CheckoutQuote,
  type CheckoutSourceKind,
  type CouponRule,
} from '../core/checkout.js';
import { maxPurchasableQty } from '../core/cart.js';
import {
  beginCheckoutIntent,
  finishCheckoutIntent,
  redeemCoupon,
  resolveCouponRule,
  type DBCheckoutIntent,
} from '../db/repositories/checkout.js';
import {
  beginCartCheckout,
  finishCartCheckout,
  removeCartItem,
} from '../db/repositories/cart.js';
import { createOrder } from '../db/repositories/orders.js';
import { refundWalletOnce } from '../db/repositories/wallet.js';
import { loadCartView, loadPricedProduct } from './cart.js';
import { priceBreakdown, resolvePromo, type PromoMatch } from './promo.js';
import { charge } from './wallet.js';
import { logger } from '../logger.js';
import type { DBOrder, DBProduct } from '../types.js';

/** Where the buyer came from. */
export type CheckoutSource =
  | { kind: 'cart' }
  | { kind: 'buy_now'; product_id: number; qty: number };

export type CheckoutContext = {
  source: CheckoutSourceKind;
  quote: CheckoutQuote;
  /** Authoritative product snapshots keyed by product id. */
  products: Map<number, DBProduct>;
  /** Server-resolved promo per line (never client-supplied). */
  promos: Map<number, PromoMatch | null>;
  /** Cart row id when the checkout came from the cart. */
  cartId: number | null;
  /** Coupon row that was found, if any. */
  couponRule: CouponRule | null;
};

export type BuildCheckoutOptions = {
  /** Code the buyer typed. Validated here, never trusted. */
  couponCode?: string | null;
  /** Wallet balance for display; the charge itself is atomic in SQL. */
  walletBalance: number;
  currency: string;
  now?: Date;
};

function toLineInput(
  product: DBProduct,
  requestedQty: number,
  promo: PromoMatch | null,
  snapshotUnitPrice = 0,
): CheckoutLineInput {
  const snapshot = {
    id: product.id,
    name: product.name,
    price: Number(product.price),
    stock: Number(product.stock),
    unlimited_stock: Boolean(product.unlimited_stock),
    active: (product as DBProduct & { active?: boolean }).active !== false,
  };
  const maxQty = maxPurchasableQty(snapshot);
  const sellableQty = Math.max(0, Math.min(Math.floor(requestedQty), maxQty));
  const promoDiscount =
    sellableQty > 0
      ? priceBreakdown(snapshot.price, sellableQty, promo).discount
      : 0;
  return {
    product_id: product.id,
    name: product.name,
    unitPrice: snapshot.price,
    requestedQty: Math.max(0, Math.floor(requestedQty)),
    maxQty,
    active: snapshot.active,
    unlimited: snapshot.unlimited_stock,
    promoDiscount,
    promoId: promo?.promo.id ?? null,
    snapshotUnitPrice,
  };
}

/**
 * Build the authoritative quote for either checkout road.
 *
 * Safe to call as often as you like — it is a pure read of live state
 * and is deliberately re-run immediately before charging.
 */
export async function buildCheckout(
  telegram_id: number,
  source: CheckoutSource,
  opts: BuildCheckoutOptions,
): Promise<CheckoutContext> {
  const products = new Map<number, DBProduct>();
  const promos = new Map<number, PromoMatch | null>();
  const lines: CheckoutLineInput[] = [];
  let cartId: number | null = null;

  if (source.kind === 'cart') {
    const view = await loadCartView(telegram_id);
    cartId = view.cart.id;
    for (const item of view.items) {
      const product = view.products.get(item.product_id);
      if (!product) {
        // Product vanished from the catalog — surface it as a dead
        // line instead of silently dropping it.
        lines.push({
          product_id: item.product_id,
          name: `#${item.product_id}`,
          unitPrice: 0,
          requestedQty: item.qty,
          maxQty: 0,
          active: false,
          unlimited: false,
          promoDiscount: 0,
          promoId: null,
          snapshotUnitPrice: Number(item.unit_price_snapshot ?? 0),
        });
        continue;
      }
      const promo = view.promos.get(item.product_id) ?? null;
      products.set(item.product_id, product);
      promos.set(item.product_id, promo);
      lines.push(
        toLineInput(product, item.qty, promo, Number(item.unit_price_snapshot ?? 0)),
      );
    }
  } else {
    const product = await loadPricedProduct(telegram_id, source.product_id);
    if (product) {
      const snapshot = {
        id: product.id,
        name: product.name,
        price: Number(product.price),
        stock: Number(product.stock),
        unlimited_stock: Boolean(product.unlimited_stock),
        active: (product as DBProduct & { active?: boolean }).active !== false,
      };
      const sellableQty = Math.max(
        0,
        Math.min(Math.floor(source.qty), maxPurchasableQty(snapshot)),
      );
      const promo =
        sellableQty > 0
          ? await resolvePromo(telegram_id, product.id, sellableQty, snapshot.price)
          : null;
      products.set(product.id, product);
      promos.set(product.id, promo);
      lines.push(toLineInput(product, source.qty, promo));
    }
  }

  const code = (opts.couponCode ?? '').trim();
  const couponRule = code ? await resolveCouponRule(code, telegram_id) : null;

  const quote = buildCheckoutQuote({
    source: source.kind,
    currency: opts.currency,
    walletBalance: opts.walletBalance,
    lines,
    coupon: couponRule,
    couponCode: code || null,
    ...(opts.now ? { now: opts.now } : {}),
  });

  return { source: source.kind, quote, products, promos, cartId, couponRule };
}

/**
 * Validate a coupon against the current checkout without applying it.
 * Used by the 🎟️ Coupon prompt so the buyer gets instant feedback.
 */
export async function previewCoupon(
  telegram_id: number,
  source: CheckoutSource,
  code: string,
  opts: BuildCheckoutOptions,
): Promise<CheckoutContext> {
  return buildCheckout(telegram_id, source, { ...opts, couponCode: code });
}

export type WalletCheckoutOutcome = {
  ok: boolean;
  /** Reason the checkout never started / could not complete. */
  reason?:
    | 'empty'
    | 'nothing_purchasable'
    | 'in_progress'
    | 'closed'
    | 'insufficient_funds'
    | 'duplicate'
    | 'failed';
  quote: CheckoutQuote;
  orders: DBOrder[];
  /** Product names whose line failed and was refunded. */
  failures: string[];
  balanceAfter: number;
};

export type DeliverArgs = {
  product: DBProduct;
  order: DBOrder;
  qty: number;
  total: number;
  discount: number;
  balanceAfter: number;
};

export type ExecuteWalletCheckoutArgs = {
  telegram_id: number;
  source: CheckoutSource;
  couponCode?: string | null;
  walletBalance: number;
  currency: string;
  /** Delivery/fulfilment callback — keeps grammY out of this service. */
  deliver: (args: DeliverArgs) => Promise<void>;
};

/**
 * Charge the wallet and create the orders.
 *
 * Duplicate protection is layered:
 *   • `begin_cart_checkout`  — one live cart checkout per user.
 *   • `begin_checkout_intent` — one live attempt per (user, exact
 *     basket + coupon) and no repeat of an attempt that completed in
 *     the last 5 minutes. This also covers ⚡ Buy Now, which has no
 *     cart row to guard.
 *
 * Everything is recomputed *after* the guards are taken, so stock or
 * price movements between the screen and the tap are respected.
 */
export async function executeWalletCheckout(
  args: ExecuteWalletCheckoutArgs,
): Promise<WalletCheckoutOutcome> {
  const { telegram_id, source } = args;
  let cartCheckoutId: number | null = null;
  let intent: DBCheckoutIntent | null = null;
  const orders: DBOrder[] = [];
  const failures: string[] = [];
  let balanceAfter = round2(args.walletBalance);

  // ---- Guard 1: the cart itself (cart road only) -------------------
  if (source.kind === 'cart') {
    try {
      const cart = await beginCartCheckout(telegram_id);
      cartCheckoutId = cart.id;
    } catch (err) {
      const message = (err as { message?: string }).message ?? '';
      const empty = await buildCheckout(telegram_id, source, {
        walletBalance: args.walletBalance,
        currency: args.currency,
        couponCode: args.couponCode ?? null,
      });
      if (message.includes('CART_CHECKOUT_IN_PROGRESS')) {
        return { ok: false, reason: 'in_progress', quote: empty.quote, orders, failures, balanceAfter };
      }
      return { ok: false, reason: 'empty', quote: empty.quote, orders, failures, balanceAfter };
    }
  }

  // ---- Authoritative recalculation AFTER the guard -----------------
  const context = await buildCheckout(telegram_id, source, {
    walletBalance: args.walletBalance,
    currency: args.currency,
    couponCode: args.couponCode ?? null,
  });
  const quote = context.quote;

  const readiness = checkoutReadiness(quote, { requireWallet: true });
  if (!readiness.ok) {
    if (cartCheckoutId !== null) await safeFinishCart(cartCheckoutId, false);
    return { ok: false, reason: readiness.reason, quote, orders, failures, balanceAfter };
  }

  // ---- Guard 2: idempotent checkout intent -------------------------
  try {
    intent = await beginCheckoutIntent({
      user_id: telegram_id,
      source: quote.source,
      fingerprint: quote.fingerprint,
      payable: quote.payable,
      currency: quote.currency,
      coupon_code: quote.coupon?.ok ? quote.coupon.code : null,
    });
  } catch (err) {
    const message = (err as { message?: string }).message ?? '';
    if (cartCheckoutId !== null) await safeFinishCart(cartCheckoutId, false);
    const duplicate =
      message.includes('CHECKOUT_DUPLICATE') || message.includes('checkout_intents_live_key');
    return {
      ok: false,
      reason: duplicate ? 'duplicate' : 'in_progress',
      quote,
      orders,
      failures,
      balanceAfter,
    };
  }

  // ---- Charge + create orders, line by line ------------------------
  try {
    for (const line of quote.purchasable) {
      const product = context.products.get(line.product_id);
      if (!product) continue;
      const promo = context.promos.get(line.product_id) ?? null;
      const lineTotal = line.subtotal;
      const lineDiscount = round2(line.promoDiscount + line.couponDiscount);
      let order: DBOrder | null = null;
      let charged = false;
      try {
        order = await createOrder({
          user_id: telegram_id,
          product_id: product.id,
          product_name: product.name,
          qty: line.qty,
          unit_price: line.unitPrice,
          total: lineTotal,
          discount: lineDiscount,
          promo_id: promo?.promo.id ?? null,
          delivery:
            source.kind === 'cart'
              ? `Cart #${context.cartId ?? 0} — Checkout ${intent.id}`
              : `Buy Now — Checkout ${intent.id}`,
        });
        if (lineTotal > 0) {
          balanceAfter = await charge(
            telegram_id,
            lineTotal,
            balanceAfter,
            `checkout:${intent.id}:order:${order.id}`,
          );
        }
        charged = true;

        await args.deliver({
          product,
          order,
          qty: line.qty,
          total: lineTotal,
          discount: lineDiscount,
          balanceAfter,
        });
        orders.push(order);
        if (source.kind === 'cart' && context.cartId !== null) {
          await removeCartItem(context.cartId, product.id);
        }
      } catch (err) {
        logger.error(
          { err, productId: product.id, userId: telegram_id },
          'checkout line failed',
        );
        failures.push(product.name);
        if (charged && lineTotal > 0) {
          try {
            balanceAfter = await refundWalletOnce(
              telegram_id,
              lineTotal,
              `checkout_refund:${intent.id}:order:${order?.id ?? product.id}`,
            );
          } catch (refundErr) {
            logger.error(
              { err: refundErr, userId: telegram_id, orderId: order?.id },
              'checkout refund failed',
            );
          }
        }
      }
    }

    // ---- Coupon redemption (only when something was ordered) -------
    if (orders.length > 0 && quote.coupon?.ok && quote.couponDiscount > 0) {
      try {
        await redeemCoupon({
          code: quote.coupon.code,
          user_id: telegram_id,
          amount: quote.couponDiscount,
          reference: `checkout:${intent.id}`,
        });
      } catch (err) {
        // The buyer already got their discount; a failed counter
        // update must never break a paid order.
        logger.error({ err, userId: telegram_id }, 'coupon redemption record failed');
      }
    }

    const ok = orders.length > 0 && failures.length === 0;
    await finishCheckoutIntent(
      intent.id,
      orders.length > 0 ? 'completed' : 'failed',
      orders.map((o) => o.id),
    );
    if (cartCheckoutId !== null) await safeFinishCart(cartCheckoutId, ok);
    return {
      ok,
      ...(ok ? {} : { reason: 'failed' as const }),
      quote,
      orders,
      failures,
      balanceAfter,
    };
  } catch (err) {
    logger.error({ err, userId: telegram_id }, 'checkout failed');
    await finishCheckoutIntent(intent.id, 'failed', orders.map((o) => o.id));
    if (cartCheckoutId !== null) await safeFinishCart(cartCheckoutId, false);
    return { ok: false, reason: 'failed', quote, orders, failures, balanceAfter };
  }
}

async function safeFinishCart(cart_id: number, success: boolean): Promise<void> {
  try {
    await finishCartCheckout(cart_id, success);
  } catch (err) {
    logger.error({ err, cart_id }, 'checkout: cart guard release failed');
  }
}
