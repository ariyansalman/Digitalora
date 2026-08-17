/**
 * Cart repository boundary.
 *
 * All Supabase access for the persistent shopping cart lives here —
 * services and handlers never touch `supabase` for cart data. The cart
 * is stored in `carts` / `cart_items` (migration 0056), which is what
 * makes it survive bot restarts.
 */
import { supabase } from '../supabase.js';
import { logger } from '../../logger.js';
import type { CartItemRecord, CartStatus } from '../../core/cart.js';

export type DBCart = {
  id: number;
  user_id: number;
  status: CartStatus;
  created_at: string;
  updated_at: string;
};

export type DBCartItem = {
  id: number;
  cart_id: number;
  product_id: number;
  qty: number;
  unit_price_snapshot: number;
  created_at: string;
  updated_at: string;
};

/** Return (creating if needed) the user's single live cart. */
export async function getOrCreateCart(user_id: number): Promise<DBCart> {
  const { data, error } = await supabase.rpc('get_or_create_cart', { p_user_id: user_id });
  if (error) {
    logger.error({ err: error, user_id }, 'getOrCreateCart failed');
    throw error;
  }
  const row = (Array.isArray(data) ? data[0] : data) as DBCart | null;
  if (!row) throw new Error('getOrCreateCart returned no cart');
  return row;
}

export async function listCartItems(cart_id: number): Promise<DBCartItem[]> {
  const { data, error } = await supabase
    .from('cart_items')
    .select('*')
    .eq('cart_id', cart_id)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) {
    logger.error({ err: error, cart_id }, 'listCartItems failed');
    throw error;
  }
  return (data ?? []) as DBCartItem[];
}

/** Convenience: rows in the shape the pure cart engine expects. */
export function toCartItemRecords(rows: readonly DBCartItem[]): CartItemRecord[] {
  return rows.map((r) => ({
    product_id: Number(r.product_id),
    qty: Number(r.qty),
    unit_price_snapshot: Number(r.unit_price_snapshot ?? 0),
  }));
}

/** Insert or update one line. `qty` must already be server-clamped. */
export async function upsertCartItem(args: {
  cart_id: number;
  product_id: number;
  qty: number;
  unit_price_snapshot: number;
}): Promise<void> {
  if (!Number.isInteger(args.qty) || args.qty <= 0) {
    throw new Error('Invalid cart quantity');
  }
  const { error } = await supabase.from('cart_items').upsert(
    {
      cart_id: args.cart_id,
      product_id: args.product_id,
      qty: args.qty,
      unit_price_snapshot: args.unit_price_snapshot,
    },
    { onConflict: 'cart_id,product_id' },
  );
  if (error) {
    logger.error({ err: error, ...args }, 'upsertCartItem failed');
    throw error;
  }
}

export async function removeCartItem(cart_id: number, product_id: number): Promise<void> {
  const { error } = await supabase
    .from('cart_items')
    .delete()
    .eq('cart_id', cart_id)
    .eq('product_id', product_id);
  if (error) {
    logger.error({ err: error, cart_id, product_id }, 'removeCartItem failed');
    throw error;
  }
}

export async function clearCart(cart_id: number): Promise<void> {
  const { error } = await supabase.from('cart_items').delete().eq('cart_id', cart_id);
  if (error) {
    logger.error({ err: error, cart_id }, 'clearCart failed');
    throw error;
  }
}

/**
 * Atomically flip the cart into `checking_out`. Throws with a
 * `CART_EMPTY` / `CART_CHECKOUT_IN_PROGRESS` message when the guard
 * rejects — this is the server-side duplicate-click protection.
 */
export async function beginCartCheckout(user_id: number): Promise<DBCart> {
  const { data, error } = await supabase.rpc('begin_cart_checkout', { p_user_id: user_id });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as DBCart | null;
  if (!row) throw new Error('CART_EMPTY');
  return row;
}

/** Release the checkout guard. Success empties + archives the cart. */
export async function finishCartCheckout(cart_id: number, success: boolean): Promise<void> {
  const { error } = await supabase.rpc('finish_cart_checkout', {
    p_cart_id: cart_id,
    p_success: success,
  });
  if (error) {
    logger.error({ err: error, cart_id, success }, 'finishCartCheckout failed');
    throw error;
  }
}
