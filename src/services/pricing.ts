/**
 * Per-user price-override resolution.
 *
 * The shop catalog stores a single default price per product; the
 * `user_price_overrides` table layers a `(telegram_id, product_id)
 * → price` map on top so the admin can charge specific users a
 * different amount for the same product.
 *
 * Every customer-facing price read goes through one of these
 * helpers so we never accidentally show a default price after an
 * override has been set.
 */
import {
  getUserProductPrice,
  getUserProductPriceMap,
} from '../db/queries.js';
import type { DBProduct } from '../types.js';

/**
 * Return a shallow copy of `product` with `price` replaced by the
 * effective price for `telegram_id` (override if set, else the
 * stored default). The original product object is left unchanged so
 * callers passing the same row to multiple helpers don't get
 * surprising mutations.
 */
export async function applyUserPriceToProduct(
  telegram_id: number,
  product: DBProduct,
): Promise<DBProduct> {
  const override = await getUserProductPrice(telegram_id, product.id);
  if (override === null) return product;
  return { ...product, price: override };
}

/**
 * Same as `applyUserPriceToProduct` but for an array — uses a
 * single bulk query so the shop list view is one extra round-trip
 * regardless of page size.
 */
export async function applyUserPriceToProducts(
  telegram_id: number,
  products: DBProduct[],
): Promise<DBProduct[]> {
  if (products.length === 0) return products;
  const overrides = await getUserProductPriceMap(
    telegram_id,
    products.map((p) => p.id),
  );
  if (overrides.size === 0) return products;
  return products.map((p) => {
    const v = overrides.get(p.id);
    return v === undefined ? p : { ...p, price: v };
  });
}
