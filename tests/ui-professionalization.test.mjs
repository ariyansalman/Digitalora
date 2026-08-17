import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const shop = fs.readFileSync(path.join(root, 'src/keyboards/shop.ts'), 'utf8');
const handler = fs.readFileSync(path.join(root, 'src/handlers/shop.ts'), 'utf8');
const orders = fs.readFileSync(path.join(root, 'src/keyboards/orders.ts'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'src/ui/designSystem.ts'), 'utf8');

assert.match(ui, /export const UI/);
assert.match(ui, /export function card/);
assert.match(shop, /shop\.product\.button/);
assert.match(shop, /shop\.product\.button\.oos/);
assert.match(handler, /shop\.home\.header\.professional/);
assert.match(orders, /t\(lang, 'btn\.prev'/);
assert.match(orders, /t\(lang, 'btn\.next'/);

for (const lang of ['en', 'ar', 'vi']) {
  const locale = fs.readFileSync(path.join(root, `config/locales/${lang}.ts`), 'utf8');
  assert.match(locale, /shop\.home\.header\.professional/);
  assert.match(locale, /shop\.product\.button/);
  assert.match(locale, /shop\.product\.button\.oos/);
}

console.log('UI professionalization tests: 10/10 PASS');
