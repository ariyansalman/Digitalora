import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function read(relative) {
  return fs.readFile(path.join(root, relative), 'utf8');
}

test('financial hardening migration contains atomic primitives', async () => {
  const sql = await read('supabase/migrations/0047_financial_concurrency_hardening.sql');
  for (const name of [
    'wallet_apply_atomic',
    'approve_deposit_atomic',
    'claim_product_items_atomic',
    'decrement_product_stock_atomic',
    'restore_product_stock_atomic',
  ]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${name}\\b`, 'i'));
  }
  assert.match(sql, /for update skip locked/i);
});

test('financial RPC permissions are explicitly locked down', async () => {
  const sql = await read('supabase/migrations/0048_lock_down_financial_rpc_permissions.sql');
  assert.match(sql, /revoke execute on function public\.wallet_apply_atomic/i);
  assert.match(sql, /grant execute on function public\.wallet_apply_atomic/i);
  assert.match(sql, /to service_role/i);
});

test('reseller request IDs remain database-unique per user', async () => {
  const sql = await read('supabase/migrations/0036_reseller_api.sql');
  assert.match(sql, /unique \(user_id, request_id\)/i);
});

test('critical order delivery writes fail closed', async () => {
  const source = await read('src/db/queries.ts');
  assert.match(source, /setOrderDeliveredItems[\s\S]*?if \(error\) throw error/);
  assert.match(source, /order .* was not updated/);
});


test('reseller API order fulfillment is end-to-end atomic', async () => {
  const sql = await read('supabase/migrations/0049_atomic_reseller_api_order.sql');
  assert.match(sql, /create or replace function public\.place_reseller_api_order_atomic\b/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /insert into public\.orders/i);
  assert.match(sql, /update public\.users/i);
  assert.match(sql, /insert into public\.wallet_ledger/i);
  assert.match(sql, /insert into public\.reseller_api_orders/i);
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /revoke execute on function public\.place_reseller_api_order_atomic/i);
  assert.match(sql, /grant execute on function public\.place_reseller_api_order_atomic[\s\S]*to service_role/i);
});

test('reseller API handler delegates financial side effects to the atomic RPC', async () => {
  const source = await read('src/services/resellerApi.ts');
  assert.match(source, /supabase\.rpc\('place_reseller_api_order_atomic'/);
  assert.doesNotMatch(source, /createOrder\(/);
  assert.doesNotMatch(source, /await charge\(/);
  assert.doesNotMatch(source, /await decrementProductStock\(/);
  assert.doesNotMatch(source, /await claimProductItems\(/);
});

test('direct-pay fulfilment has durable idempotency state and service-role-only RPCs', async () => {
  const sql = await read('supabase/migrations/0050_direct_pay_fulfillment_state.sql');
  assert.match(sql, /create table if not exists public\.direct_pay_fulfillments/i);
  assert.match(sql, /deposit_id bigint primary key/i);
  assert.match(sql, /begin_direct_pay_fulfillment/i);
  assert.match(sql, /set_direct_pay_fulfillment_order/i);
  assert.match(sql, /finish_direct_pay_fulfillment/i);
  assert.match(sql, /revoke execute on function public\.begin_direct_pay_fulfillment/i);
  assert.match(sql, /grant execute on function public\.finish_direct_pay_fulfillment[\s\S]*to service_role/i);
});

test('direct-pay handler uses durable fulfilment guard', async () => {
  const source = await read('src/services/orderFulfill.ts');
  assert.match(source, /beginDirectPayFulfillment\(deposit\.id\)/);
  assert.match(source, /createDirectPayOrderAtomic\(/);
  assert.match(source, /finishDirectPayFulfillment\(deposit\.id, 'completed'/);
});

test('supplier auto-order retries use a stable idempotency key', async () => {
  const source = await read('src/services/supplierApi.ts');
  assert.match(source, /requestId: `order_\$\{args\.localOrderId\}`/);
});

test('direct-pay recovery reuses an existing order instead of creating a duplicate', async () => {
  const source = await read('src/services/orderFulfill.ts');
  assert.match(source, /let order = guard\.order_id \? await getOrder\(guard\.order_id\) : null/);
  assert.match(source, /else if \(order\.delivered_items && !order\.delivered_items\.startsWith\('Fulfillment failed/);
  assert.match(source, /return \{ ok: true, orderId: order\.id, orderPublicId: publicOrderId\(order\) \}/);
});


test('direct-pay order creation and fulfilment binding are atomic', async () => {
  const sql = await read('supabase/migrations/0051_atomic_direct_pay_order.sql');
  assert.match(sql, /create or replace function public\.create_direct_pay_order_atomic\b/i);
  assert.match(sql, /select d\.user_id[\s\S]*for update/i);
  assert.match(sql, /select f\.status, f\.order_id[\s\S]*for update/i);
  assert.match(sql, /insert into public\.orders/i);
  assert.match(sql, /update public\.direct_pay_fulfillments[\s\S]*order_id = v_order\.id/i);
  assert.match(sql, /revoke execute on function public\.create_direct_pay_order_atomic/i);
  assert.match(sql, /grant execute on function public\.create_direct_pay_order_atomic[\s\S]*to service_role/i);
});

test('direct-pay handler uses atomic order creation and has no create-then-bind crash window', async () => {
  const source = await read('src/services/orderFulfill.ts');
  assert.match(source, /createDirectPayOrderAtomic\(/);
  assert.doesNotMatch(source, /createOrder\(/);
  assert.doesNotMatch(source, /setDirectPayFulfillmentOrder\(/);
});

test('concurrency simulation preserves one debit/order/item for duplicate request', async () => {
  const state = { balance: 100, stock: 1, orders: 0, items: 1, request: null };
  const lock = { busy: false };
  async function atomicOrder(requestId) {
    while (lock.busy) await new Promise(r => setTimeout(r, 0));
    lock.busy = true;
    try {
      if (state.request === requestId) return 'duplicate';
      if (state.stock < 1 || state.items < 1 || state.balance < 10) throw new Error('precondition');
      state.request = requestId;
      state.stock -= 1;
      state.items -= 1;
      state.balance -= 10;
      state.orders += 1;
      return 'created';
    } finally { lock.busy = false; }
  }
  const results = await Promise.all(Array.from({ length: 50 }, () => atomicOrder('same-request')));
  assert.equal(results.filter(x => x === 'created').length, 1);
  assert.equal(results.filter(x => x === 'duplicate').length, 49);
  assert.equal(state.balance, 90);
  assert.equal(state.stock, 0);
  assert.equal(state.items, 0);
  assert.equal(state.orders, 1);
});

test('concurrency simulation prevents overselling final stock across distinct requests', async () => {
  const state = { stock: 1, orders: 0 };
  const lock = { busy: false };
  async function buy() {
    while (lock.busy) await new Promise(r => setTimeout(r, 0));
    lock.busy = true;
    try {
      if (state.stock < 1) return false;
      state.stock -= 1;
      state.orders += 1;
      return true;
    } finally { lock.busy = false; }
  }
  const results = await Promise.all(Array.from({ length: 50 }, buy));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(state.stock, 0);
  assert.equal(state.orders, 1);
});


test('manual deposit resolution is race-safe and uses the atomic approval primitive', async () => {
  const sql = await read('supabase/migrations/0052_atomic_manual_deposit_resolution.sql');
  const source = await read('src/handlers/admin/index.ts');
  assert.match(sql, /create or replace function public\.reject_deposit_atomic\b/i);
  assert.match(sql, /where id = p_deposit_id[\s\S]*and status = 'pending'/i);
  assert.match(sql, /revoke execute on function public\.reject_deposit_atomic/i);
  assert.match(sql, /grant execute on function public\.reject_deposit_atomic\(bigint\) to service_role/i);
  assert.match(source, /approveDepositAtomic\(id, txHash, amount\)/);
  assert.match(source, /rejectDepositAtomic\(id\)/);
  assert.doesNotMatch(source, /await setDepositStatus\(id, 'approved'\)/);
  assert.doesNotMatch(source, /await credit\(\s*dep\.user_id,[\s\S]*deposit_credit/);
});

test('on-chain top-ups enforce the configured minimum amount', async () => {
  const source = await read('src/services/depositVerify.ts');
  assert.match(source, /const configuredMinimum = Math\.max\(0\.01, Number\(method\.min_amount\) \|\| 0\)/);
  assert.match(source, /minAmount \}\);/);
  assert.match(source, /below the minimum top-up/);
});


test('minimum top-up failures are classified as hard rejects', async () => {
  const source = await read('src/services/verifyReason.ts');
  assert.match(source, /'below the minimum'/);
});
