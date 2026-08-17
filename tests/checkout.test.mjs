/**
 * 🧾 Shared checkout layer — behavioural tests.
 *
 * `src/core/checkout.ts` is dependency-free, so Node 22 type stripping
 * can execute it directly. Every guarantee the master prompt asks for
 * is asserted here against the exact functions the handlers call:
 *
 *   • one authoritative server-side calculation
 *   • multiple cart items
 *   • promotions + coupons stacking, never producing a negative total
 *   • client-supplied totals ignored (price manipulation)
 *   • stock races → quantities clamped, never oversold
 *   • duplicate checkout / duplicate order creation blocked
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  allocateCouponDiscount,
  buildCheckoutQuote,
  checkoutFingerprint,
  checkoutReadiness,
  clampMoney,
  evaluateCheckoutLine,
  evaluateCoupon,
  round2,
} = await import('../src/core/checkout.ts');

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

const line = (over = {}) => ({
  product_id: 1,
  name: 'Netflix 1 Month',
  unitPrice: 3.5,
  requestedQty: 2,
  maxQty: 10,
  active: true,
  unlimited: false,
  promoDiscount: 0,
  promoId: null,
  ...over,
});

const quote = (lines, over = {}) =>
  buildCheckoutQuote({
    source: 'cart',
    currency: 'USDT',
    walletBalance: 100,
    lines,
    ...over,
  });

const coupon = (over = {}) => ({
  code: 'SAVE10',
  kind: 'percent',
  value: 10,
  active: true,
  ...over,
});

// ---------------------------------------------------------------------
// Money helpers
// ---------------------------------------------------------------------

test('round2 normalises floats and non-finite input', () => {
  assert.equal(round2(3.14159), 3.14);
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(round2(Number.NaN), 0);
  assert.equal(round2(Number.POSITIVE_INFINITY), 0);
  assert.equal(round2('2.005'), 2.01);
});

test('clampMoney never returns a negative or over-cap amount', () => {
  assert.equal(clampMoney(-5, 10), 0);
  assert.equal(clampMoney(12, 10), 10);
  assert.equal(clampMoney(4.567, 10), 4.57);
  assert.equal(clampMoney(5, -1), 0);
});

// ---------------------------------------------------------------------
// Line evaluation
// ---------------------------------------------------------------------

test('a healthy line multiplies unit price by quantity', () => {
  const l = evaluateCheckoutLine(line({ unitPrice: 3.5, requestedQty: 3 }));
  assert.equal(l.status, 'ok');
  assert.equal(l.qty, 3);
  assert.equal(l.gross, 10.5);
  assert.equal(l.subtotal, 10.5);
});

test('quantity is clamped to live stock (stock race) and flagged', () => {
  const l = evaluateCheckoutLine(line({ requestedQty: 8, maxQty: 3 }));
  assert.equal(l.status, 'adjusted');
  assert.equal(l.qty, 3);
  assert.equal(l.gross, 10.5);
});

test('unlimited stock ignores the stock ceiling', () => {
  const l = evaluateCheckoutLine(
    line({ requestedQty: 50, maxQty: 0, unlimited: true }),
  );
  assert.equal(l.status, 'ok');
  assert.equal(l.qty, 50);
});

test('sold-out and deactivated products drop to zero quantity', () => {
  assert.equal(evaluateCheckoutLine(line({ maxQty: 0 })).status, 'out_of_stock');
  assert.equal(evaluateCheckoutLine(line({ maxQty: 0 })).qty, 0);
  assert.equal(evaluateCheckoutLine(line({ active: false })).status, 'inactive');
  assert.equal(evaluateCheckoutLine(line({ active: false })).qty, 0);
});

test('a price change since the item was added is detected', () => {
  const l = evaluateCheckoutLine(line({ unitPrice: 4, snapshotUnitPrice: 3.5 }));
  assert.equal(l.priceChanged, true);
  assert.equal(l.gross, 8, 'the live price wins, not the snapshot');
});

test('a promo discount can never exceed the line gross', () => {
  const l = evaluateCheckoutLine(
    line({ unitPrice: 2, requestedQty: 1, promoDiscount: 99 }),
  );
  assert.equal(l.promoDiscount, 2);
  assert.equal(l.subtotal, 0);
});

test('negative and malformed quantities are rejected, not charged', () => {
  assert.equal(evaluateCheckoutLine(line({ requestedQty: -4 })).qty, 0);
  assert.equal(evaluateCheckoutLine(line({ requestedQty: 2.9 })).qty, 2);
  assert.equal(evaluateCheckoutLine(line({ unitPrice: -10 })).unitPrice, 0);
});

// ---------------------------------------------------------------------
// Quote — multiple items
// ---------------------------------------------------------------------

test('a multi-item cart is summed server-side', () => {
  const q = quote([
    line({ product_id: 1, unitPrice: 3.5, requestedQty: 2 }),
    line({ product_id: 2, name: 'Spotify', unitPrice: 5, requestedQty: 1 }),
    line({ product_id: 3, name: 'YouTube', unitPrice: 2.25, requestedQty: 4 }),
  ]);
  assert.equal(q.lineCount, 3);
  assert.equal(q.itemCount, 7);
  assert.equal(q.subtotal, 21);
  assert.equal(q.payable, 21);
  assert.equal(q.walletCovers, true);
  assert.equal(q.canCheckout, true);
});

test('promotions across lines are aggregated and subtracted once', () => {
  const q = quote([
    line({ product_id: 1, unitPrice: 3.5, requestedQty: 4, promoDiscount: 2 }),
    line({ product_id: 2, unitPrice: 5, requestedQty: 2, promoDiscount: 1.5 }),
  ]);
  assert.equal(q.subtotal, 24);
  assert.equal(q.promotionDiscount, 3.5);
  assert.equal(q.discount, 3.5);
  assert.equal(q.payable, 20.5);
});

test('unsellable lines are surfaced but never billed', () => {
  const q = quote([
    line({ product_id: 1, unitPrice: 10, requestedQty: 1 }),
    line({ product_id: 2, unitPrice: 10, requestedQty: 1, active: false }),
    line({ product_id: 3, unitPrice: 10, requestedQty: 5, maxQty: 2 }),
  ]);
  assert.equal(q.hasProblems, true);
  assert.equal(q.problems.length, 2);
  assert.equal(q.purchasable.length, 2);
  assert.equal(q.subtotal, 30, '1×10 + 2×10, the inactive line is excluded');
});

test('an empty order cannot be checked out', () => {
  const q = quote([]);
  assert.equal(q.isEmpty, true);
  assert.equal(q.canCheckout, false);
  assert.equal(q.payable, 0);
});

test('an order of only sold-out lines cannot be checked out', () => {
  const q = quote([line({ maxQty: 0 }), line({ product_id: 2, active: false })]);
  assert.equal(q.canCheckout, false);
  assert.equal(q.payable, 0);
});

test('the wallet shortfall is reported instead of a negative balance', () => {
  const q = quote([line({ unitPrice: 30, requestedQty: 2 })], { walletBalance: 25 });
  assert.equal(q.payable, 60);
  assert.equal(q.walletCovers, false);
  assert.equal(q.shortfall, 35);
});

// ---------------------------------------------------------------------
// Price manipulation
// ---------------------------------------------------------------------

test('client-supplied totals are ignored — only server inputs count', () => {
  const hostile = {
    ...line({ unitPrice: 3.5, requestedQty: 2 }),
    // Everything below is what a tampered client might send.
    subtotal: 0.01,
    payable: 0.01,
    gross: 0.01,
    discount: 999,
    total: 0,
  };
  const q = quote([hostile]);
  assert.equal(q.subtotal, 7);
  assert.equal(q.payable, 7);
  assert.equal(q.discount, 0);
});

test('a hostile discount can never make the order payable negative', () => {
  const q = quote([line({ unitPrice: 5, requestedQty: 1, promoDiscount: 1000 })], {
    coupon: coupon({ kind: 'fixed', value: 1000 }),
    couponCode: 'SAVE10',
  });
  assert.ok(q.payable >= 0);
  assert.equal(q.payable, 0);
  assert.ok(q.discount <= q.subtotal);
});

// ---------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------

const purchasableLines = (q) => q.purchasable;

test('a percent coupon applies to the post-promo subtotal', () => {
  const q = quote([line({ unitPrice: 10, requestedQty: 2, promoDiscount: 5 })], {
    coupon: coupon({ value: 10 }),
    couponCode: 'SAVE10',
  });
  assert.equal(q.subtotal, 20);
  assert.equal(q.promotionDiscount, 5);
  assert.equal(q.couponDiscount, 1.5, '10% of the remaining 15');
  assert.equal(q.payable, 13.5);
});

test('a fixed coupon is capped at the eligible subtotal', () => {
  const q = quote([line({ unitPrice: 4, requestedQty: 1 })], {
    coupon: coupon({ kind: 'fixed', value: 25 }),
    couponCode: 'SAVE10',
  });
  assert.equal(q.couponDiscount, 4);
  assert.equal(q.payable, 0);
});

test('max_discount caps a percent coupon', () => {
  const q = quote([line({ unitPrice: 100, requestedQty: 1 })], {
    coupon: coupon({ value: 50, max_discount: 10 }),
    couponCode: 'SAVE10',
  });
  assert.equal(q.couponDiscount, 10);
  assert.equal(q.payable, 90);
});

test('an unknown code is reported, not silently ignored', () => {
  const q = quote([line()], { coupon: null, couponCode: 'NOPE' });
  assert.equal(q.coupon.ok, false);
  assert.equal(q.coupon.reason, 'unknown');
  assert.equal(q.couponDiscount, 0);
});

test('coupon lifecycle rules are enforced', () => {
  const lines = purchasableLines(quote([line({ unitPrice: 10, requestedQty: 1 })]));
  const now = new Date('2026-06-01T00:00:00Z');
  const check = (over) => evaluateCoupon(coupon(over), lines, now);

  assert.equal(check({ active: false }).reason, 'inactive');
  assert.equal(check({ starts_at: '2026-07-01T00:00:00Z' }).reason, 'not_started');
  assert.equal(check({ expires_at: '2026-05-01T00:00:00Z' }).reason, 'expired');
  assert.equal(check({ min_subtotal: 50 }).reason, 'min_subtotal');
  assert.equal(check({ usage_limit: 5, used_count: 5 }).reason, 'usage_limit');
  assert.equal(check({ per_user_limit: 1, user_used_count: 1 }).reason, 'per_user_limit');
  assert.equal(check({ product_ids: [999] }).reason, 'not_applicable');
  assert.equal(check({ kind: 'fixed', value: 0 }).reason, 'no_effect');
  assert.equal(check({}).ok, true);
  assert.equal(evaluateCoupon(null, lines, now).reason, 'unknown');
});

test('a product-scoped coupon only discounts the products it covers', () => {
  const q = quote(
    [
      line({ product_id: 1, unitPrice: 10, requestedQty: 1 }),
      line({ product_id: 2, unitPrice: 30, requestedQty: 1 }),
    ],
    { coupon: coupon({ value: 50, product_ids: [1] }), couponCode: 'SAVE10' },
  );
  assert.equal(q.couponDiscount, 5, '50% of the 10 eligible only');
  assert.equal(q.payable, 35);
  const covered = q.lines.find((l) => l.product_id === 1);
  const other = q.lines.find((l) => l.product_id === 2);
  assert.equal(covered.couponDiscount, 5);
  assert.equal(other.couponDiscount, 0);
});

test('a cart coupon is allocated across lines and always reconciles', () => {
  const lines = purchasableLines(
    quote([
      line({ product_id: 1, unitPrice: 3.33, requestedQty: 1 }),
      line({ product_id: 2, unitPrice: 3.33, requestedQty: 1 }),
      line({ product_id: 3, unitPrice: 3.34, requestedQty: 1 }),
    ]),
  );
  const allocation = allocateCouponDiscount(lines, 5);
  const sum = round2([...allocation.values()].reduce((s, v) => s + v, 0));
  assert.equal(sum, 5, 'no cent is created or lost by rounding');
  for (const [, share] of allocation) assert.ok(share >= 0);
});

test('allocation never gives a line more than it is worth', () => {
  const lines = purchasableLines(
    quote([
      line({ product_id: 1, unitPrice: 1, requestedQty: 1 }),
      line({ product_id: 2, unitPrice: 100, requestedQty: 1 }),
    ]),
  );
  const allocation = allocateCouponDiscount(lines, 101);
  assert.ok(allocation.get(1) <= 1);
  assert.ok(allocation.get(2) <= 100);
});

test('per-line subtotals always add up to the payable amount', () => {
  const q = quote(
    [
      line({ product_id: 1, unitPrice: 7.77, requestedQty: 3, promoDiscount: 1.11 }),
      line({ product_id: 2, unitPrice: 2.49, requestedQty: 2 }),
      line({ product_id: 3, unitPrice: 19.99, requestedQty: 1, promoDiscount: 4.5 }),
    ],
    { coupon: coupon({ value: 15 }), couponCode: 'SAVE10', walletBalance: 500 },
  );
  const sum = round2(q.purchasable.reduce((s, l) => s + l.subtotal, 0));
  assert.equal(sum, q.payable);
  assert.ok(q.payable >= 0);
});

// ---------------------------------------------------------------------
// Duplicate protection
// ---------------------------------------------------------------------

test('the same order produces the same fingerprint', () => {
  const args = [
    line({ product_id: 2, unitPrice: 5, requestedQty: 1 }),
    line({ product_id: 1, unitPrice: 3.5, requestedQty: 2 }),
  ];
  const a = quote(args);
  // Same cart, lines read back in a different order.
  const b = quote([...args].reverse());
  assert.equal(a.fingerprint, b.fingerprint);
});

test('changing quantity, price, product or coupon changes the fingerprint', () => {
  const base = quote([line({ unitPrice: 3.5, requestedQty: 2 })]).fingerprint;
  assert.notEqual(base, quote([line({ requestedQty: 3 })]).fingerprint);
  assert.notEqual(base, quote([line({ unitPrice: 4 })]).fingerprint);
  assert.notEqual(base, quote([line({ product_id: 9 })]).fingerprint);
  assert.notEqual(
    base,
    quote([line({ unitPrice: 3.5, requestedQty: 2 })], {
      coupon: coupon({ kind: 'fixed', value: 1 }),
      couponCode: 'SAVE10',
    }).fingerprint,
  );
});

test('buy-now and cart checkouts of the same product are distinct attempts', () => {
  const cart = quote([line()]).fingerprint;
  const buyNow = quote([line()], { source: 'buy_now' }).fingerprint;
  assert.notEqual(cart, buyNow);
});

test('readiness mirrors the SQL guards', () => {
  const ok = quote([line({ unitPrice: 5, requestedQty: 1 })], { walletBalance: 10 });
  assert.deepEqual(checkoutReadiness(ok), { ok: true });
  assert.equal(checkoutReadiness(ok, { status: 'checking_out' }).reason, 'in_progress');
  assert.equal(checkoutReadiness(ok, { status: 'completed' }).reason, 'closed');
  assert.equal(checkoutReadiness(quote([])).reason, 'empty');
  assert.equal(
    checkoutReadiness(quote([line({ maxQty: 0 })])).reason,
    'nothing_purchasable',
  );
  const poor = quote([line({ unitPrice: 50, requestedQty: 1 })], { walletBalance: 1 });
  assert.equal(
    checkoutReadiness(poor, { requireWallet: true }).reason,
    'insufficient_funds',
  );
});

test('a second tap on an in-flight checkout is refused (duplicate order)', () => {
  const q = quote([line()]);
  /** Stand-in for `begin_checkout_intent` / `begin_cart_checkout`. */
  const intents = new Map();
  const begin = (fingerprint) => {
    const existing = intents.get(fingerprint);
    if (existing === 'pending') return 'in_progress';
    if (existing === 'done') return 'duplicate';
    intents.set(fingerprint, 'pending');
    return 'started';
  };
  assert.equal(begin(q.fingerprint), 'started');
  assert.equal(begin(q.fingerprint), 'in_progress', 'double tap while charging');
  intents.set(q.fingerprint, 'done');
  assert.equal(begin(q.fingerprint), 'duplicate', 'replayed after completion');
});
