import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('unified payment layer exists', () => {
  for (const rel of [
    'src/payments/types.ts',
    'src/payments/config.ts',
    'src/payments/registry.ts',
    'src/payments/basePaymentService.ts',
    'src/payments/providers/manual.ts',
    'src/payments/providers/onchain.ts',
    'src/payments/providers/exchangeTransfer.ts',
    'src/payments/providers/invoice.ts',
    'PAYMENT_ARCHITECTURE.md',
  ]) {
    assert.ok(fs.existsSync(path.join(root, rel)), `missing ${rel}`);
  }
});

test('PaymentService declares all six operations', () => {
  const text = read('src/payments/types.ts');
  for (const op of [
    'createPayment',
    'verifyPayment',
    'expirePayment',
    'approve',
    'reject',
    'reconcile',
  ]) {
    assert.match(text, new RegExp(`${op}\\(`), `PaymentService missing ${op}`);
  }
});

test('configuration model covers every required field', () => {
  const text = read('src/payments/types.ts');
  for (const field of [
    'id:',
    'name:',
    'display_name:',
    'type:',
    'currency:',
    'network:',
    'verification_mode:',
    'enabled:',
    'sort_order:',
    'instructions:',
    'expiry_minutes:',
    'provider_configuration:',
  ]) {
    assert.ok(text.includes(field), `PaymentMethodConfig missing ${field}`);
  }
});

test('manual provider never reports an automatic confirmation', () => {
  const text = read('src/payments/providers/manual.ts');
  assert.ok(text.includes("status: 'manual_review'"));
  assert.ok(!text.includes("status: 'approved'"));
});

test('every deposit creation binds the exact payment_method_id', () => {
  const files = ['src/handlers/topup.ts', 'src/handlers/directPay.ts'];
  for (const rel of files) {
    const text = read(rel);
    const creations = text.split('createDeposit({').slice(1);
    for (const block of creations) {
      const head = block.slice(0, 400);
      assert.ok(
        head.includes('payment_method_id'),
        `${rel}: createDeposit call without payment_method_id`,
      );
    }
  }
});

test('unified layer resolves deposits by id, not by display name only', () => {
  const text = read('src/payments/registry.ts');
  assert.ok(text.includes('deposit.payment_method_id'));
  assert.ok(text.includes('matches.length === 1'));
});

test('unified payment model migration is present', () => {
  const sql = read('supabase/migrations/0059_unified_payment_method_model.sql');
  for (const col of [
    'display_name',
    'type',
    'currency',
    'network',
    'verification_mode',
    'enabled',
    'expiry_minutes',
    'provider_config',
  ]) {
    assert.ok(sql.includes(col), `migration missing ${col}`);
  }
  assert.ok(sql.includes('payment_methods_manual_mode_check'));
});
