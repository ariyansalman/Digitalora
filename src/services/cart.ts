/**
 * Cart service — composes the persistent cart rows with the
 * authoritative, server-side pricing pipeline.
 *
 * Nothing here trusts the client. Every read re-fetches the product
 * row, re-applies the per-user price override and re-resolves promos
 * for the *current* quantity before any total is shown or charged.
 */
import {
  applyQtyAction,
  evaluateCart,
  mergeAddToCart,
  maxPurchasableQty,
  type CartItemRecord,
  type CartProduct,
  type CartTotals,
  type QtyAction,
} from '../core/cart.js';
import {
  clearCart as clearCartRows,
  getOrCreateCart,
  listCartItems,
  removeCartItem,
  toCartItemRecords,
  upsertCartItem,
  type DBCart,
} from '../db/repositories/cart.js';
import { getProduct } from '../db/repositories/products.js';
import { applyUserPriceToProduct } from './pricing.js';
import { priceBreakdown, resolvePromo, type PromoMatch } from './promo.js';
import type { DBProduct } from '../types.js';

export type CartView = {
  cart: DBCart;
  items: CartItemRecord[];
  totals: CartTotals;
  /** Authoritative product snapshots keyed by product id. */
  products: Map<number, DBProduct>;
  /** Promo match per product line (server-resolved). */
  promos: Map<number, PromoMatch | null>;
};

function toCartProduct(p: DBProduct): CartProduct {
  return {
    id: p.id,
    name: p.name,
    price: Number(p.price),
    stock: Number(p.stock),
    unlimited_stock: Boolean(p.unlimited_stock),
    active: (p as DBProduct & { active?: boolean }).active !== false,
  };
}

/** Resolve one product with the per-user effective price applied. */
export async function loadPricedProduct(
  telegram_id: number,
  product_id: number,
): Promise<DBProduct | null> {
  const raw = await getProduct(product_id);
  if (!raw) return null;
  return applyUserPriceToProduct(telegram_id, raw);
}

/**
 * Load the user's cart and recompute everything from scratch:
 * product state, effective unit prices, per-line promos and totals.
 */
export async function loadCartView(telegram_id: number): Promise<CartView> {
  const cart = await getOrCreateCart(telegram_id);
  const rows = await listCartItems(cart.id);
  const items = toCartItemRecords(rows);

  const products = new Map<number, DBProduct>();
  const snapshots = new Map<number, CartProduct>();
  const promos = new Map<number, PromoMatch | null>();
  const discounts = new Map<number, number>();

  for (const item of items) {
    const product = await loadPricedProduct(telegram_id, item.product_id);
    if (!product) continue;
    products.set(item.product_id, product);
    const snapshot = toCartProduct(product);
    snapshots.set(item.product_id, snapshot);
    // Promo is resolved for the quantity we can actually sell, not
    // the quantity stored on the row (stock may have dropped).
    const sellableQty = Math.min(item.qty, maxPurchasableQty(snapshot));
    if (sellableQty <= 0) {
      promos.set(item.product_id, null);
      continue;
    }
    const promo = await resolvePromo(telegram_id, product.id, sellableQty, Number(product.price));
    promos.set(item.product_id, promo);
    discounts.set(
      item.product_id,
      priceBreakdown(Number(product.price), sellableQty, promo).discount,
    );
  }

  return {
    cart,
    items,
    totals: evaluateCart(items, snapshots, discounts),
    products,
    promos,
  };
}

export type AddToCartResult =
  | { ok: true; qty: number; product: DBProduct }
  | { ok: false; reason: 'missing' | 'unavailable' | 'too_many_lines' };

/** Add (or top up) a product line. Quantity is clamped server-side. */
export async function addToCart(
  telegram_id: number,
  product_id: number,
  qty: number,
): Promise<AddToCartResult> {
  const product = await loadPricedProduct(telegram_id, product_id);
  if (!product) return { ok: false, reason: 'missing' };

  const cart = await getOrCreateCart(telegram_id);
  const items = toCartItemRecords(await listCartItems(cart.id));
  const snapshot = toCartProduct(product);
  const merged = mergeAddToCart(items, snapshot, qty, Number(product.price));
  if (!merged.added) {
    return { ok: false, reason: merged.reason ?? 'unavailable' };
  }
  await upsertCartItem({
    cart_id: cart.id,
    product_id,
    qty: merged.qty,
    unit_price_snapshot: Number(product.price),
  });
  return { ok: true, qty: merged.qty, product };
}

/**
 * Apply ➕ / ➖ / set / 🗑 remove to a line. Returns the resulting
 * quantity (0 when the line was removed).
 */
export async function updateCartQty(
  telegram_id: number,
  product_id: number,
  action: QtyAction,
): Promise<{ qty: number; removed: boolean }> {
  const cart = await getOrCreateCart(telegram_id);
  const items = toCartItemRecords(await listCartItems(cart.id));
  const current = items.find((i) => i.product_id === product_id)?.qty ?? 0;
  const product = await loadPricedProduct(telegram_id, product_id);
  const snapshot = product ? toCartProduct(product) : null;

  const next = applyQtyAction(current, action, snapshot);
  if (next <= 0) {
    await removeCartItem(cart.id, product_id);
    return { qty: 0, removed: true };
  }
  await upsertCartItem({
    cart_id: cart.id,
    product_id,
    qty: next,
    unit_price_snapshot: Number(product?.price ?? 0),
  });
  return { qty: next, removed: false };
}

export async function emptyCart(telegram_id: number): Promise<void> {
  const cart = await getOrCreateCart(telegram_id);
  await clearCartRows(cart.id);
}

/**
 * Re-validate a cart immediately before charging. Returns the freshly
 * recomputed view plus the lines that are safe to order. Callers must
 * charge `totals.total` — never a number that came from a message or
 * callback payload.
 */
export async function revalidateForCheckout(telegram_id: number): Promise<CartView> {
  return loadCartView(telegram_id);
}
