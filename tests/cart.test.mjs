/**
 * Persistent shopping cart — behavioural tests.
 *
 * The cart engine (`src/core/cart.ts`) is intentionally dependency-free
 * so it can be executed directly here (Node 22 type stripping) with an
 * in-memory store standing in for `carts` / `cart_items`. Every rule the
 * bot enforces at runtime — clamping, stock changes, price changes,
 * promo discounts, duplicate checkout clicks, persistence across a
 * restart — is asserted against the same functions the handlers call.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  CART_QTY_MAX,
  applyQtyAction,
  checkoutGuard,
  clampQty,
  evaluateCart,
  evaluateCartLine,
  maxPurchasableQty,
  mergeAddToCart,
} = await import('../src/core/cart.ts');

const product = (over = {}) => ({
  id: 1,
  name: 'Netflix 1 Month',
  price: 3.5,
  stock: 10,
  unlimited_stock: false,
  active: true,
  ...over,
});

/** Minimal stand-in for the `carts` / `cart_items` tables. */
class MemoryCartStore {
  constructor(items = []) {
    this.items = items.map((i) => ({ ...i }));
    this.status = 'open';
  }
  add(p, qty) {
    const result = mergeAddToCart(this.items, p, qty, p.price);
    this.items = result.items;
    return result;
  }
  update(productId, action, p) {
    const current = this.items.find((i) => i.product_id === productId)?.qty ?? 0;
    const next = applyQtyAction(current, action, p);
    this.items =
      next <= 0
        ? this.items.filter((i) => i.product_id !== productId)
        : this.items.map((i) => (i.product_id === productId ? { ...i, qty: next } : i));
    return next;
  }
  clear() {
    this.items = [];
  }
  /** Simulates a bot restart: only the persisted rows survive. */
  reload() {
    return new MemoryCartStore(this.items);
  }
}

test('empty cart renders as empty and cannot be checked out', () => {
  const totals = evaluateCart([], []);
  assert.equal(totals.isEmpty, true);
  assert.equal(totals.itemCount, 0);
  assert.equal(totals.total, 0);
  assert.equal(totals.canCheckout, false);
  assert.deepEqual(checkoutGuard('open', totals), { ok: false, reason: 'empty' });
});

test('multiple products accumulate with per-line subtotals and a cart total', () => {
  const a = product({ id: 1, price: 3.5 });
  const b = product({ id: 2, name: 'Spotify', price: 2.25, stock: 4 });
  const store = new MemoryCartStore();
  store.add(a, 2);
  store.add(b, 3);

  const totals = evaluateCart(store.items, [a, b]);
  assert.equal(totals.lineCount, 2);
  assert.equal(totals.itemCount, 5);
  assert.equal(totals.lines[0].subtotal, 7);
  assert.equal(totals.lines[1].subtotal, 6.75);
  assert.equal(totals.total, 13.75);
  assert.equal(totals.canCheckout, true);
});

test('adding the same product twice increases the line instead of duplicating it', () => {
  const p = product();
  const store = new MemoryCartStore();
  store.add(p, 2);
  store.add(p, 3);
  assert.equal(store.items.length, 1);
  assert.equal(store.items[0].qty, 5);
});

test('quantity actions clamp to stock and never go below one', () => {
  const p = product({ stock: 3 });
  const store = new MemoryCartStore();
  store.add(p, 1);
  assert.equal(store.update(1, { type: 'inc' }, p), 2);
  assert.equal(store.update(1, { type: 'set', qty: 99 }, p), 3, 'set is clamped to stock');
  assert.equal(store.update(1, { type: 'inc' }, p), 3, 'cannot exceed stock');
  assert.equal(store.update(1, { type: 'dec' }, p), 2);
  assert.equal(store.update(1, { type: 'dec' }, p), 1);
  assert.equal(store.update(1, { type: 'dec' }, p), 0, 'decrementing past 1 removes the line');
  assert.equal(store.items.length, 0);
});

test('remove deletes exactly one line and keeps the rest', () => {
  const a = product({ id: 1 });
  const b = product({ id: 2, name: 'Spotify' });
  const store = new MemoryCartStore();
  store.add(a, 1);
  store.add(b, 2);
  store.update(1, { type: 'remove' }, a);
  assert.deepEqual(
    store.items.map((i) => i.product_id),
    [2],
  );
});

test('unlimited stock products are capped by the global quantity ceiling only', () => {
  const p = product({ unlimited_stock: true, stock: 0 });
  assert.equal(maxPurchasableQty(p), CART_QTY_MAX);
  assert.equal(clampQty(100000, maxPurchasableQty(p)), CART_QTY_MAX);
  const totals = evaluateCart([{ product_id: 1, qty: 50, unit_price_snapshot: 3.5 }], [p]);
  assert.equal(totals.lines[0].status, 'ok');
  assert.equal(totals.total, 175);
});

test('stock dropping below the stored quantity adjusts the line instead of over-selling', () => {
  const store = new MemoryCartStore();
  store.add(product({ stock: 10 }), 8);
  // Admin sells the rest elsewhere: stock is now 3.
  const totals = evaluateCart(store.items, [product({ stock: 3 })]);
  assert.equal(totals.lines[0].status, 'adjusted');
  assert.equal(totals.lines[0].qty, 3);
  assert.equal(totals.lines[0].subtotal, 10.5);
  assert.equal(totals.hasProblems, true);
  assert.equal(totals.canCheckout, true);
});

test('out-of-stock and inactive products are detected and excluded from the total', () => {
  const items = [
    { product_id: 1, qty: 2, unit_price_snapshot: 3.5 },
    { product_id: 2, qty: 1, unit_price_snapshot: 5 },
    { product_id: 3, qty: 1, unit_price_snapshot: 7 },
  ];
  const totals = evaluateCart(items, [
    product({ id: 1, stock: 0 }),
    product({ id: 2, name: 'Retired', price: 5, active: false }),
    product({ id: 3, name: 'Live', price: 7 }),
  ]);
  assert.equal(totals.lines[0].status, 'out_of_stock');
  assert.equal(totals.lines[1].status, 'inactive');
  assert.equal(totals.lines[2].status, 'ok');
  assert.equal(totals.total, 7);
  assert.equal(totals.purchasable.length, 1);
});

test('a deleted product is reported instead of silently vanishing', () => {
  const line = evaluateCartLine({ product_id: 9, qty: 2, unit_price_snapshot: 4 }, null);
  assert.equal(line.status, 'missing');
  assert.equal(line.subtotal, 0);
});

test('price changes always use the authoritative catalog price, never the stored snapshot', () => {
  const items = [{ product_id: 1, qty: 2, unit_price_snapshot: 3.5 }];
  const totals = evaluateCart(items, [product({ price: 4.25 })]);
  assert.equal(totals.lines[0].unitPrice, 4.25);
  assert.equal(totals.lines[0].priceChanged, true);
  assert.equal(totals.total, 8.5, 'client-side price is ignored');
});

test('promo discounts are applied per line and clamped to the line total', () => {
  const p = product({ price: 3.5, stock: 10 });
  const items = [{ product_id: 1, qty: 4, unit_price_snapshot: 3.5 }];
  const totals = evaluateCart(items, [p], new Map([[1, 2]]));
  assert.equal(totals.gross, 14);
  assert.equal(totals.discount, 2);
  assert.equal(totals.total, 12);

  const overshoot = evaluateCart(items, [p], new Map([[1, 999]]));
  assert.equal(overshoot.total, 0, 'a discount can never make the total negative');
});

test('duplicate checkout clicks are rejected while one checkout is in flight', () => {
  const totals = evaluateCart([{ product_id: 1, qty: 1, unit_price_snapshot: 3.5 }], [product()]);
  assert.deepEqual(checkoutGuard('open', totals), { ok: true });
  // Second tap arrives after the first flipped the cart to checking_out.
  assert.deepEqual(checkoutGuard('checking_out', totals), { ok: false, reason: 'in_progress' });
  assert.deepEqual(checkoutGuard('completed', totals), { ok: false, reason: 'closed' });
});

test('checkout of a cart whose items all became unavailable is blocked', () => {
  const totals = evaluateCart(
    [{ product_id: 1, qty: 1, unit_price_snapshot: 3.5 }],
    [product({ stock: 0 })],
  );
  assert.deepEqual(checkoutGuard('open', totals), { ok: false, reason: 'nothing_purchasable' });
});

test('checkout charges exactly the recomputed total of the purchasable lines', () => {
  const a = product({ id: 1, price: 3.5, stock: 5 });
  const b = product({ id: 2, name: 'Spotify', price: 2, stock: 0 });
  const store = new MemoryCartStore();
  store.add(a, 2);
  store.add(product({ id: 2, name: 'Spotify', price: 2, stock: 5 }), 1);

  const totals = evaluateCart(store.items, [a, b], new Map([[1, 1]]));
  const charged = totals.purchasable.reduce((sum, l) => sum + l.subtotal, 0);
  assert.equal(charged, totals.total);
  assert.equal(totals.total, 6);
});

test('clearing the cart empties every line', () => {
  const store = new MemoryCartStore();
  store.add(product({ id: 1 }), 2);
  store.add(product({ id: 2, name: 'Spotify' }), 1);
  store.clear();
  assert.equal(store.items.length, 0);
  assert.equal(evaluateCart(store.items, []).isEmpty, true);
});

test('the cart survives a restart because it lives in the database rows', () => {
  const p = product({ stock: 10 });
  const store = new MemoryCartStore();
  store.add(p, 3);
  const before = evaluateCart(store.items, [p]);

  const afterRestart = store.reload();
  const after = evaluateCart(afterRestart.items, [p]);

  assert.deepEqual(
    afterRestart.items.map((i) => [i.product_id, i.qty]),
    [[1, 3]],
  );
  assert.equal(after.total, before.total);
  assert.equal(after.itemCount, 3);
});

test('add to cart refuses unavailable products and overflowing carts', () => {
  const oos = mergeAddToCart([], product({ stock: 0 }), 1);
  assert.equal(oos.added, false);
  assert.equal(oos.reason, 'unavailable');

  const full = Array.from({ length: 30 }, (_, i) => ({
    product_id: i + 100,
    qty: 1,
    unit_price_snapshot: 1,
  }));
  const overflow = mergeAddToCart(full, product({ id: 999 }), 1);
  assert.equal(overflow.added, false);
  assert.equal(overflow.reason, 'too_many_lines');
});
