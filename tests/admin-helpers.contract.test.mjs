import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const helper = fs.readFileSync(path.join(root, 'src/handlers/admin/helpers.ts'), 'utf8');
const index = fs.readFileSync(path.join(root, 'src/handlers/admin/index.ts'), 'utf8');

test('admin presentation helpers are isolated from the monolithic handler', () => {
  for (const name of [
    'apiMoney', 'apiDate', 'apiUserLabel', 'buyerHandle',
    'isPendingPreorderOrder', 'supplierProductFilter', 'supplierStockLabel',
    'supplierImportActive', 'supplierImportCategory',
    'supplierImportUsesGroupCategory', 'supplierGroupCategoryName',
  ]) {
    assert.match(helper, new RegExp(`export function ${name}\\b`));
    assert.doesNotMatch(index, new RegExp(`(?:function|const) ${name}\\b`));
  }
  assert.match(index, /from ['"]\.\/helpers\.js['"]/);
});

test('admin helper module contains no database writes or Telegram handlers', () => {
  assert.doesNotMatch(helper, /from ['"].*db\/queries\.js/);
  assert.doesNotMatch(helper, /new Composer|ctx\.(reply|editMessage|answerCallbackQuery)/);
});
