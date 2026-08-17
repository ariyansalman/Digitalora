import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('order fulfillment rejects partial delivery and has recovery primitives', () => {
  const service = read('src/services/orderFulfill.ts');
  const shop = read('src/handlers/shop.ts');
  const migration = read('supabase/migrations/0053_order_fulfillment_safety.sql');
  const preorder = read('src/services/preorder.ts');
  assert.match(service, /claimed\.length !== intent\.qty/);
  assert.match(service, /releaseProductItemsForOrder/);
  // Stock rollback now goes through the reservation primitive
  // (releaseStockReservation), which itself falls back to
  // restoreProductStock on pre-0061 schemas.
  assert.match(service, /releaseStockReservation|restoreProductStock/);
  assert.match(service, /refundWalletOnce/);
  assert.match(shop, /claimed\.length !== qty/);
  assert.match(shop, /delivery_refund:order:/);
  assert.match(shop, /walletCharged/);
  assert.match(migration, /release_product_items_for_order/);
  assert.match(migration, /refund_wallet_once/);
  assert.match(preorder, /releaseProductItemsForOrder/);
  assert.match(preorder, /releaseStockReservation|restoreProductStock/);
});

test('unpaid wallet orders are removed when the atomic debit rejects', () => {
  const shop = read('src/handlers/shop.ts');
  assert.match(shop, /createdOrderId !== null && !walletCharged/);
  assert.match(shop, /from\('orders'\)\.delete\(\)\.eq\('id', createdOrderId\)/);
});

test('direct-pay product-missing refund is idempotent', () => {
  const service = read('src/services/orderFulfill.ts');
  assert.match(service, /delivery_refund:deposit:\$\{deposit\.id\}:product_gone/);
  assert.doesNotMatch(service, /deposit:\$\{deposit\.id\}:product_gone',\n      'deposit_credit'/);
});
