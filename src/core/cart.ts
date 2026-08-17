/**
 * Pure cart engine.
 *
 * This module deliberately has **zero** imports: no Supabase, no
 * grammY, no config. Everything the cart needs to decide (quantities,
 * availability, authoritative pricing, checkout eligibility) lives
 * here as plain functions over plain data, so it can be unit-tested
 * directly (`tests/cart.test.mjs`) and reused by the repository,
 * service and handler layers without duplication.
 *
 * Golden rule: the client (Telegram callback data) may only ever say
 * *what* it wants (add / inc / dec / set / remove). The quantity and
 * the price that come back out of this module are always recomputed
 * from the product snapshot the server just read from the database.
 */

export const CART_QTY_MIN = 1;
export const CART_QTY_MAX = 999;
/** Hard ceiling on distinct products in one cart. */
export const CART_MAX_LINES = 30;

/** Product fields the cart engine needs. Mirrors `DBProduct`. */
export type CartProduct = {
  id: number;
  name: string;
  /** Authoritative, server-resolved unit price (override applied). */
  price: number;
  stock: number;
  unlimited_stock: boolean;
  active: boolean;
};

/** A persisted cart row (`cart_items`). */
export type CartItemRecord = {
  product_id: number;
  qty: number;
  /** Price the user saw when the line was added — display only. */
  unit_price_snapshot: number;
};

export type CartLineStatus =
  /** Line is purchasable exactly as requested. */
  | 'ok'
  /** Quantity was reduced to the purchasable maximum. */
  | 'adjusted'
  /** Product row disappeared from the catalog. */
  | 'missing'
  /** Product exists but was deactivated by the admin. */
  | 'inactive'
  /** Product is active but has no stock left. */
  | 'out_of_stock';

export type CartLine = {
  product_id: number;
  name: string;
  /** Quantity stored in the database. */
  requestedQty: number;
  /** Quantity that can actually be bought right now. */
  qty: number;
  /** Authoritative unit price. */
  unitPrice: number;
  /** Price when the line was added (0 when unknown). */
  snapshotUnitPrice: number;
  /** True when the catalog price moved since the line was added. */
  priceChanged: boolean;
  /** Promo discount applied to this line (flat, already clamped). */
  discount: number;
  /** `unitPrice * qty - discount`, never below 0. */
  subtotal: number;
  status: CartLineStatus;
  /** Purchasable ceiling for this product right now. */
  maxQty: number;
  unlimited: boolean;
};

export type CartTotals = {
  lines: CartLine[];
  /** Lines that can be ordered right now. */
  purchasable: CartLine[];
  /** Lines blocking a clean checkout (missing/inactive/oos/adjusted). */
  problems: CartLine[];
  /** Sum of `unitPrice * qty` over purchasable lines. */
  gross: number;
  /** Sum of promo discounts over purchasable lines. */
  discount: number;
  /** What the user actually pays. */
  total: number;
  /** Number of distinct products. */
  lineCount: number;
  /** Sum of quantities. */
  itemCount: number;
  isEmpty: boolean;
  /** True when at least one line needs the user's attention. */
  hasProblems: boolean;
  /** True when there is something to charge for. */
  canCheckout: boolean;
};

export function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/** Clamp any client-supplied quantity into `[min, max]` as an integer. */
export function clampQty(
  qty: number,
  max: number = CART_QTY_MAX,
  min: number = CART_QTY_MIN,
): number {
  const n = Math.floor(Number(qty));
  if (!Number.isFinite(n)) return min;
  const ceiling = Math.max(min, Math.min(max, CART_QTY_MAX));
  if (n < min) return min;
  if (n > ceiling) return ceiling;
  return n;
}

/**
 * Purchasable ceiling for a product. Unlimited-stock products are
 * capped by `CART_QTY_MAX` only; everything else by real stock.
 */
export function maxPurchasableQty(product: CartProduct | null | undefined): number {
  if (!product || !product.active) return 0;
  if (product.unlimited_stock) return CART_QTY_MAX;
  return Math.max(0, Math.min(CART_QTY_MAX, Math.floor(product.stock)));
}

export function isPurchasable(product: CartProduct | null | undefined): boolean {
  return maxPurchasableQty(product) > 0;
}

/**
 * Evaluate a single stored cart item against the *current* product
 * snapshot and the server-resolved promo discount for that line.
 */
export function evaluateCartLine(
  item: CartItemRecord,
  product: CartProduct | null | undefined,
  discount = 0,
): CartLine {
  const requestedQty = Math.max(0, Math.floor(item.qty));
  const snapshotUnitPrice = round2(item.unit_price_snapshot ?? 0);

  if (!product) {
    return {
      product_id: item.product_id,
      name: `#${item.product_id}`,
      requestedQty,
      qty: 0,
      unitPrice: 0,
      snapshotUnitPrice,
      priceChanged: false,
      discount: 0,
      subtotal: 0,
      status: 'missing',
      maxQty: 0,
      unlimited: false,
    };
  }

  const unitPrice = round2(product.price);
  const maxQty = maxPurchasableQty(product);
  const base = {
    product_id: product.id,
    name: product.name,
    requestedQty,
    snapshotUnitPrice,
    priceChanged: snapshotUnitPrice > 0 && round2(snapshotUnitPrice) !== unitPrice,
    unitPrice,
    maxQty,
    unlimited: product.unlimited_stock,
  };

  if (!product.active) {
    return { ...base, qty: 0, discount: 0, subtotal: 0, status: 'inactive' };
  }
  if (maxQty === 0) {
    return { ...base, qty: 0, discount: 0, subtotal: 0, status: 'out_of_stock' };
  }

  const qty = Math.min(requestedQty, maxQty);
  const gross = round2(unitPrice * qty);
  const appliedDiscount = Math.min(Math.max(0, round2(discount)), gross);
  return {
    ...base,
    qty,
    discount: appliedDiscount,
    subtotal: round2(gross - appliedDiscount),
    status: qty === requestedQty ? 'ok' : 'adjusted',
  };
}

/**
 * Evaluate a whole cart. `products` may be a Map or an array; missing
 * products are reported as `missing` lines rather than dropped, so the
 * user sees why their total changed.
 *
 * `discounts` maps product_id → flat promo discount for that line and
 * MUST be computed server-side (see `services/cart.ts`).
 */
export function evaluateCart(
  items: readonly CartItemRecord[],
  products: ReadonlyMap<number, CartProduct> | readonly CartProduct[],
  discounts: ReadonlyMap<number, number> = new Map(),
): CartTotals {
  const map: ReadonlyMap<number, CartProduct> = Array.isArray(products)
    ? new Map(products.map((p) => [p.id, p]))
    : (products as ReadonlyMap<number, CartProduct>);

  const lines = items.map((item) =>
    evaluateCartLine(item, map.get(item.product_id) ?? null, discounts.get(item.product_id) ?? 0),
  );
  const purchasable = lines.filter((l) => l.qty > 0);
  const problems = lines.filter((l) => l.status !== 'ok');
  const gross = round2(purchasable.reduce((sum, l) => sum + l.unitPrice * l.qty, 0));
  const discount = round2(purchasable.reduce((sum, l) => sum + l.discount, 0));
  const total = round2(Math.max(0, gross - discount));

  return {
    lines,
    purchasable,
    problems,
    gross,
    discount,
    total,
    lineCount: lines.length,
    itemCount: purchasable.reduce((sum, l) => sum + l.qty, 0),
    isEmpty: lines.length === 0,
    hasProblems: problems.length > 0,
    canCheckout: purchasable.length > 0,
  };
}

export type QtyAction =
  | { type: 'inc'; by?: number }
  | { type: 'dec'; by?: number }
  | { type: 'set'; qty: number }
  | { type: 'remove' };

/**
 * Apply a quantity action to a line. Returns the new quantity; `0`
 * means "delete this line". Always clamped to the product's current
 * purchasable ceiling, so a stale keyboard can never over-order.
 */
export function applyQtyAction(
  currentQty: number,
  action: QtyAction,
  product: CartProduct | null | undefined,
): number {
  const max = maxPurchasableQty(product);
  if (action.type === 'remove') return 0;
  if (max === 0) return 0;

  const current = Math.max(0, Math.floor(currentQty));
  let next: number;
  switch (action.type) {
    case 'inc':
      next = current + Math.max(1, Math.floor(action.by ?? 1));
      break;
    case 'dec':
      next = current - Math.max(1, Math.floor(action.by ?? 1));
      break;
    case 'set':
      next = Math.floor(action.qty);
      break;
  }
  if (!Number.isFinite(next) || next <= 0) return 0;
  return clampQty(next, max);
}

/**
 * Merge an "Add to Cart" tap into the existing item list. Adding a
 * product already in the cart increases its quantity instead of
 * creating a duplicate line.
 */
export function mergeAddToCart(
  items: readonly CartItemRecord[],
  product: CartProduct,
  qty: number,
  unitPrice = product.price,
): { items: CartItemRecord[]; qty: number; added: boolean; reason?: 'unavailable' | 'too_many_lines' } {
  const max = maxPurchasableQty(product);
  if (max === 0) {
    return { items: [...items], qty: 0, added: false, reason: 'unavailable' };
  }
  const existing = items.find((i) => i.product_id === product.id);
  if (!existing && items.length >= CART_MAX_LINES) {
    return { items: [...items], qty: 0, added: false, reason: 'too_many_lines' };
  }
  const wanted = clampQty((existing?.qty ?? 0) + clampQty(qty, max), max);
  const next = existing
    ? items.map((i) =>
        i.product_id === product.id
          ? { ...i, qty: wanted, unit_price_snapshot: round2(unitPrice) }
          : i,
      )
    : [...items, { product_id: product.id, qty: wanted, unit_price_snapshot: round2(unitPrice) }];
  return { items: next, qty: wanted, added: true };
}

/** Cart lifecycle status as stored in `carts.status`. */
export type CartStatus = 'open' | 'checking_out' | 'completed' | 'abandoned';

export type CheckoutGuardResult =
  | { ok: true }
  | { ok: false; reason: 'empty' | 'in_progress' | 'closed' | 'nothing_purchasable' };

/**
 * Mirror of the `begin_cart_checkout` SQL guard, used for fast local
 * rejection (and unit-tested for the double-click case). The database
 * remains the authority — this only avoids a pointless round-trip.
 */
export function checkoutGuard(
  status: CartStatus,
  totals: Pick<CartTotals, 'isEmpty' | 'canCheckout'>,
): CheckoutGuardResult {
  if (status === 'checking_out') return { ok: false, reason: 'in_progress' };
  if (status !== 'open') return { ok: false, reason: 'closed' };
  if (totals.isEmpty) return { ok: false, reason: 'empty' };
  if (!totals.canCheckout) return { ok: false, reason: 'nothing_purchasable' };
  return { ok: true };
}
