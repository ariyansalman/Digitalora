import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const admin = fs.readFileSync(path.join(root, 'src/handlers/admin/index.ts'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'src/handlers/admin/navigation.ts'), 'utf8');

test('admin root uses the shared navigation module', () => {
  assert.match(admin, /buildAdminRootMenu/);
  assert.match(admin, /addAdminBackRow/);
  assert.doesNotMatch(admin, /\.text\('💳 Payment Methods', 'adm:pay'\)/);
  assert.doesNotMatch(admin, /\.text\('💰 Top-Up Requests', 'adm:dep'\)/);
  for (const label of [
    '📊 Dashboard',
    '🛍️ Products',
    '📦 Orders',
    '👥 Users',
    '💳 Payment Management',
    '🎟️ Promotions',
    '🎁 Referrals',
    '📦 Inventory',
    '🔔 Notifications',
    '📈 Reports',
    '🩺 System Health',
    '⚙️ Settings',
  ]) {
    assert.match(nav, new RegExp(label));
  }
});

test('payment management consolidates existing payment entry points', () => {
  assert.match(admin, /adminBot\.callbackQuery\('adm:payments'/);
  for (const section of [
    '⚡ Automatic Gateways',
    '📝 Manual Methods',
    '⏳ Pending Deposits',
    '🔄 Verification',
    '🔗 Webhooks',
    '⚙️ Payment Settings',
  ]) {
    assert.match(admin, new RegExp(section));
  }
  assert.match(admin, /adm:pay/);
  assert.match(admin, /adm:dep/);
});

test('shared admin navigation preserves stable callbacks', () => {
  for (const callback of [
    'adm:dashboard',
    'adm:prod',
    'adm:usr:0',
    'adm:ord:0',
    'adm:payments',
    'adm:promo',
    'adm:refs:0',
    'adm:inventory',
    'adm:notifications',
    'adm:analytics',
    'adm:health',
    'adm:settings',
    'adm:close',
  ]) {
    assert.match(nav, new RegExp(callback.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(admin, /adminBot\.callbackQuery\('adm:cat'/);
});
