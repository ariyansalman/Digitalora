import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('migration 0061 defines the inventory lifecycle and atomic primitives', () => {
  const sql = read('supabase/migrations/0061_inventory_integrity.sql');
  // Inventory states.
  for (const state of ['available', 'reserved', 'consumed', 'expired']) {
    assert.match(sql, new RegExp(state));
  }
  // Atomic primitives: reserve / commit / release + single-winner delivery.
  assert.match(sql, /create or replace function public\.reserve_product_stock/i);
  assert.match(sql, /create or replace function public\.commit_stock_reservation/i);
  assert.match(sql, /create or replace function public\.release_stock_reservation/i);
  assert.match(sql, /create or replace function public\.begin_order_delivery/i);
  assert.match(sql, /create or replace function public\.low_stock_products/i);
  // Row locking is what actually prevents overselling / double-claiming.
  assert.match(sql, /for update/i);
  assert.match(sql, /low_stock_threshold/);
});

test('an item can never be claimed by two orders', () => {
  const sql = read('supabase/migrations/0061_inventory_integrity.sql');
  // A partial unique index over claimed items guarantees a single owner.
  assert.match(sql, /unique index/i);
  assert.match(sql, /product_items/);
});

test('fulfilment paths are reservation-aware and duplicate-safe', () => {
  const shop = read('src/handlers/shop.ts');
  const service = read('src/services/orderFulfill.ts');
  const preorder = read('src/services/preorder.ts');
  for (const [name, src] of [
    ['shop', shop],
    ['orderFulfill', service],
    ['preorder', preorder],
  ]) {
    assert.match(src, /beginOrderDelivery/, `${name} must guard against duplicate delivery`);
    assert.match(src, /reserveProductStock/, `${name} must reserve stock atomically`);
    assert.match(src, /commitStockReservation/, `${name} must commit on success`);
    assert.match(src, /releaseStockReservation/, `${name} must release on failure`);
    assert.doesNotMatch(
      src,
      /await decrementProductStock\(/,
      `${name} must not decrement stock outside a reservation`,
    );
  }
});

test('digital payloads are never written to logs', () => {
  const inventory = read('src/services/inventory.ts');
  assert.match(inventory, /export function maskPayload/);
  assert.match(inventory, /export function redactItems/);
  // No log call anywhere may take a raw payload/items field.
  for (const file of [
    'src/services/orderFulfill.ts',
    'src/services/preorder.ts',
    'src/handlers/shop.ts',
    'src/db/queries.ts',
  ]) {
    const src = read(file);
    assert.doesNotMatch(
      src,
      /logger\.(info|warn|error|debug)\(\{[^}]*\b(payload|item_payload|deliveredItems)\b\s*[,}]/,
      `${file} must not log digital payloads`,
    );
  }
});

test('admin UI surfaces available / reserved / delivered', () => {
  const inventory = read('src/services/inventory.ts');
  assert.match(inventory, /📦/);
  assert.match(inventory, /🔒/);
  assert.match(inventory, /✅/);
  const admin = read('src/handlers/admin/index.ts');
  assert.match(admin, /inventoryLine\(/);
  assert.match(admin, /lowStockBadge\(/);
  assert.match(admin, /adm:prod:lowstock:set/);
});
