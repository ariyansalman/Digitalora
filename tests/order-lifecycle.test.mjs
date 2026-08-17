// Order lifecycle: statuses, transitions, facets and buyer-safe supplier states.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const src = readFileSync(new URL('../src/core/orderLifecycle.ts', import.meta.url), 'utf8');

// Compile the single dependency-free core module to a temp ESM file.
execFileSync('npx', ['tsc', 'src/core/orderLifecycle.ts', '--outDir', 'tests/.tmp-lifecycle', '--module', 'esnext', '--target', 'es2022', '--moduleResolution', 'bundler'], { cwd: new URL('..', import.meta.url).pathname });
const mod = await import('./.tmp-lifecycle/orderLifecycle.js');

const {
  ORDER_STATUSES, LEGACY_ORDER_STATUSES, normalizeOrderStatus,
  canTransition, resolveOrderLifecycle, sanitizeSupplierStatus,
  adminTransitionsFor, isPendingDeliveryPayload,
} = mod;

test('all nine statuses exist and legacy values survive', () => {
  for (const s of ['pending','payment_processing','paid','processing','delivered','completed','cancelled','failed','refunded']) {
    assert.ok(ORDER_STATUSES.includes(s), s);
  }
  for (const legacy of LEGACY_ORDER_STATUSES) {
    assert.equal(normalizeOrderStatus(legacy), legacy);
  }
  // Unknown / missing values fall back to the legacy default so old
  // rows keep behaving exactly as before the migration.
  assert.equal(normalizeOrderStatus('weird-old-value'), 'paid');
  assert.equal(normalizeOrderStatus(null), 'paid');
});

test('happy path transitions are allowed end to end', () => {
  const path = ['pending','payment_processing','paid','processing','delivered','completed'];
  for (let i = 0; i < path.length - 1; i++) {
    assert.ok(canTransition(path[i], path[i + 1]), `${path[i]} -> ${path[i + 1]}`);
  }
});

test('illegal jumps are rejected', () => {
  assert.equal(canTransition('pending', 'delivered'), false);
  assert.equal(canTransition('refunded', 'delivered'), false);
  assert.equal(canTransition('completed', 'pending'), false);
  assert.equal(canTransition('cancelled', 'paid'), false);
});

test('terminal states offer no admin transitions except none', () => {
  assert.deepEqual(adminTransitionsFor('refunded'), []);
  assert.ok(adminTransitionsFor('paid').length > 0);
});

test('facets are derived per status', () => {
  const paid = resolveOrderLifecycle({ status: 'paid' });
  assert.equal(paid.payment, 'paid');
  assert.equal(paid.delivery, 'pending');
  const done = resolveOrderLifecycle({ status: 'completed' });
  assert.equal(done.delivery, 'delivered');
  const refunded = resolveOrderLifecycle({ status: 'refunded' });
  assert.equal(refunded.payment, 'refunded');
});

test('placeholder payloads are never mistaken for delivered goods', () => {
  assert.equal(isPendingDeliveryPayload('Preorder pending'), true);
  assert.equal(isPendingDeliveryPayload('Manual delivery pending'), true);
  assert.equal(isPendingDeliveryPayload(''), true);
  assert.equal(isPendingDeliveryPayload(null), true);
  assert.equal(isPendingDeliveryPayload('CODE-123'), false);
});

test('supplier statuses are coarse and never leak credentials', () => {
  assert.equal(sanitizeSupplierStatus('SUCCESS'), 'Completed');
  assert.equal(sanitizeSupplierStatus('in progress'), 'Processing');
  assert.equal(sanitizeSupplierStatus('api_key=abc123 secret'), null);
  assert.equal(sanitizeSupplierStatus(null), null);
});

test('module has no imports so it is safe everywhere', () => {
  assert.equal(/^\s*import\s/m.test(src), false);
});
