import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

test('architecture documentation exists', () => {
  assert.ok(fs.existsSync(path.join(root, 'docs', 'ARCHITECTURE.md')));
  assert.ok(fs.existsSync(path.join(root, 'docs', 'OPERATIONS.md')));
});

test('telegram handlers do not use console logging', () => {
  const handlers = path.join(root, 'src', 'handlers');
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) {
        const text = fs.readFileSync(full, 'utf8');
        if (/console\.(log|error|warn|info|debug)\s*\(/.test(text)) offenders.push(path.relative(root, full));
      }
    }
  };
  walk(handlers);
  assert.deepEqual(offenders, []);
});

test('critical payment/order services use repository boundaries', () => {
  const services = [
    'src/services/resellerApi.ts',
    'src/services/depositVerify.ts',
    'src/services/orderFulfill.ts',
  ];
  const offenders = services.filter((rel) => {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    return /from ['\"](?:\.\.\/)+db\/queries\.js['\"]/.test(text);
  });
  assert.deepEqual(offenders, []);
});

test('repository boundary documentation exists', () => {
  assert.ok(fs.existsSync(path.join(root, 'docs', 'REPOSITORY_BOUNDARIES.md')));
  for (const file of [
    'src/db/repositories/users.ts',
    'src/db/repositories/products.ts',
    'src/db/repositories/deposits.ts',
    'src/db/repositories/orders.ts',
    'src/db/repositories/index.ts',
  ]) assert.ok(fs.existsSync(path.join(root, file)), file);
});
