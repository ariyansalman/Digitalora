import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));

test('foundation modules exist', () => {
  for (const rel of [
    'src/core/errors.ts',
    'src/ui/format.ts',
    'src/ui/screen.ts',
    'src/ui/callbackSafety.ts',
    'src/ui/navigation.ts',
    'src/ui/designSystem.ts',
  ]) {
    assert.ok(exists(rel), `missing ${rel}`);
  }
});

test('centralized formatting exposes the shared primitives', () => {
  const src = read('src/ui/format.ts');
  for (const name of [
    'export function money',
    'export function compactMoney',
    'export function date',
    'export function userLabel',
    'export function escapeHtml',
    'export function truncate',
  ]) {
    assert.match(src, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('money/date/user formatting is not re-implemented in handlers', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) {
        const text = fs.readFileSync(full, 'utf8');
        if (/function\s+(money|apiMoney)\s*\(/.test(text) && !text.includes("from '../../ui/format.js'") && !text.includes("from '../ui/format.js'")) {
          offenders.push(path.relative(root, full));
        }
      }
    }
  };
  walk(path.join(root, 'src', 'handlers'));
  assert.deepEqual(offenders, []);
});

test('error taxonomy centralizes the benign Telegram edit failures', () => {
  const src = read('src/core/errors.ts');
  assert.match(src, /export class AppError/);
  assert.match(src, /export function isTelegramNoopEditError/);
  assert.match(src, /export function isTelegramMessageGoneError/);
  assert.match(src, /export function isExpiredCallbackError/);
  assert.match(src, /export function toUserMessage/);
});

test('screen renderer handles both callback edits and fresh replies', () => {
  const src = read('src/ui/screen.ts');
  assert.match(src, /export async function renderScreen/);
  assert.match(src, /export async function renderScreenWithFallback/);
  assert.match(src, /isTelegramNoopEditError/);
  assert.match(src, /ctx\.editMessageText/);
  assert.match(src, /ctx\.reply/);
});

test('callback safety exposes non-throwing answer and safe parsing', () => {
  const src = read('src/ui/callbackSafety.ts');
  for (const name of ['safeAnswer', 'callbackParts', 'callbackInt', 'clampPage', 'guardCallback']) {
    assert.match(src, new RegExp(`export (async )?function ${name}`));
  }
});

test('navigation registry keeps the stable buyer callback ids', () => {
  const src = read('src/ui/navigation.ts');
  for (const id of ['main:open', 'shop:home', 'topup:open', 'profile:open', 'support:open', 'adm:root']) {
    assert.ok(src.includes(`'${id}'`), `route ${id} missing from ROUTES`);
  }
  assert.match(src, /export function route/);
  assert.match(src, /MAX_CALLBACK_BYTES = 64/);
});

test('presentation modules stay free of database and business logic', () => {
  for (const rel of [
    'src/ui/format.ts',
    'src/ui/screen.ts',
    'src/ui/navigation.ts',
    'src/ui/designSystem.ts',
    'src/core/errors.ts',
  ]) {
    const src = read(rel);
    assert.ok(!/db\/queries\.js|db\/repositories|supabase/.test(src), `${rel} must not touch the data layer`);
  }
});

test('shop handler uses the centralized renderer', () => {
  const src = read('src/handlers/shop.ts');
  assert.match(src, /from '\.\.\/ui\/screen\.js'/);
  assert.match(src, /renderScreen\(ctx/);
});

test('foundation audit documentation exists', () => {
  assert.ok(exists('docs/FOUNDATION_AUDIT.md'));
  const doc = read('docs/FOUNDATION_AUDIT.md');
  assert.match(doc, /NOT VERIFIED|Not verified/);
});
