import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('Phase 6 adds graceful shutdown lifecycle', () => {
  const src = read('src/index.ts');
  assert.match(src, /Graceful shutdown started/);
  assert.match(src, /stopSupplierStockSyncLoop/);
  assert.match(src, /stopCryptoPayReconciliationLoop/);
  assert.match(src, /process\.on\('unhandledRejection'/);
  assert.match(src, /process\.on\('uncaughtException'/);
  assert.match(src, /server\.close/);
});

test('Phase 6 exposes a non-sensitive readiness endpoint', () => {
  const src = read('src/services/resellerApiHttp.ts');
  assert.match(src, /url\.pathname === '\/readyz'/);
  assert.match(src, /service: 'digitalora'/);
  assert.doesNotMatch(src, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(src, /TELEGRAM_BOT_TOKEN/);
});

test('Phase 6 provides explicit stop hooks for background loops', () => {
  const supplier = read('src/services/supplierAutoSync.ts');
  const crypto = read('src/services/cryptoPayReconcile.ts');
  assert.match(supplier, /export function stopSupplierStockSyncLoop/);
  assert.match(supplier, /clearInterval\(timer\)/);
  assert.match(crypto, /export function stopCryptoPayReconciliationLoop/);
  assert.match(crypto, /clearInterval\(timer\)/);
});
