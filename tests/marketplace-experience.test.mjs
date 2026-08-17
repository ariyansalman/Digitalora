/**
 * Marketplace experience contract (0062).
 *
 * Covers the premium-marketplace pass: standardized design system,
 * data-driven badges, partial search, sorting, pagination,
 * out-of-stock handling and the favorites/wishlist surface.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const catalog = read('src/services/catalog.ts');
const ui = read('src/ui/designSystem.ts');
const keyboards = read('src/keyboards/shop.ts');
const handler = read('src/handlers/shop.ts');
const queries = read('src/db/queries.ts');
const migration = read('supabase/migrations/0062_marketplace_experience.sql');

// ---------------------------------------------------------------
// Design system
// ---------------------------------------------------------------
test('design system exposes standardized states and typography helpers', () => {
  for (const fn of [
    'export function heading',
    'export function section',
    'export function fact',
    'export function bullet',
    'export function stack',
    'export function emptyState',
    'export function loadingState',
    'export function errorState',
    'export function successState',
  ]) {
    assert.ok(ui.includes(fn), `designSystem missing ${fn}`);
  }
});

test('locales carry one divider glyph family and the shared state copy', () => {
  for (const lang of ['en', 'ar', 'vi']) {
    const locale = read(`config/locales/${lang}.ts`);
    assert.ok(!/———/.test(locale), `${lang}: em-dash divider must use the design-system divider`);
    for (const key of ['state.loading', 'state.error', 'shop.out_of_stock.notice']) {
      assert.ok(locale.includes(`'${key}'`), `${lang}: missing ${key}`);
    }
  }
});

// ---------------------------------------------------------------
// Product screen contract
// ---------------------------------------------------------------
test('product screen renders the standardized blocks', () => {
  for (const key of [
    'shop.product.heading',
    'shop.product.price',
    'shop.product.stock',
    'shop.product.features.title',
    'shop.product.instant_delivery',
  ]) {
    assert.ok(handler.includes(key), `product screen missing ${key}`);
  }
  const en = read('config/locales/en.ts');
  assert.match(en, /'shop\.product\.heading': '🛍️ \*\{name\}\*'/);
  assert.match(en, /'shop\.product\.price': '💰/);
  assert.match(en, /'shop\.product\.stock': '📦/);
  assert.match(en, /'shop\.product\.features\.title': '✨/);
  assert.match(en, /'shop\.product\.instant_delivery': '⚡/);
});

test('standard buttons use the specified glyphs', () => {
  const en = read('config/locales/en.ts');
  assert.match(en, /'btn\.buy_now': '🛒 Buy Now'/);
  assert.match(en, /'btn\.cart_add': '🛒 Add to Cart'/);
  assert.match(en, /'btn\.favorite_add': '⭐ Favorite'/);
  assert.match(en, /'btn\.back': '⬅️ Back'/);
});

test('every badge is defined in all locales', () => {
  for (const lang of ['en', 'ar', 'vi']) {
    const locale = read(`config/locales/${lang}.ts`);
    for (const key of [
      'badge.flash_sale',
      'badge.featured',
      'badge.new',
      'badge.premium',
      'badge.best_seller',
      'badge.discount',
    ]) {
      assert.ok(locale.includes(`'${key}'`), `${lang}: missing ${key}`);
    }
  }
});

// ---------------------------------------------------------------
// Data-driven catalog logic
// ---------------------------------------------------------------
test('badges resolve from product data only — nothing hardcoded', () => {
  assert.match(catalog, /export function resolveBadges/);
  assert.match(catalog, /flash_sale_until/);
  assert.match(catalog, /compare_at_price/);
  assert.match(catalog, /sales_count/);
  // No product names, ids or prices baked into the catalog service.
  assert.ok(
    !/product_id\s*===\s*\d+/.test(catalog),
    'catalog must not branch on specific product ids',
  );
});

test('search is partial, case-insensitive and token based', () => {
  assert.match(catalog, /export function searchProducts/);
  assert.match(catalog, /export function matchesQuery/);
  assert.match(catalog, /toLowerCase\(\)/);
  assert.match(catalog, /\.every\(\(token\) => text\.includes\(token\)\)/);
});

test('sorting exposes every mode and sinks out-of-stock rows', () => {
  for (const mode of [
    'recommended',
    'price_asc',
    'price_desc',
    'name_asc',
    'newest',
    'stock_desc',
  ]) {
    assert.ok(catalog.includes(`'${mode}'`), `missing sort mode ${mode}`);
  }
  assert.match(catalog, /if \(aIn !== bIn\) return aIn \? -1 : 1;/);
});

test('pagination is centralized', () => {
  assert.match(catalog, /export function paginate/);
  assert.match(handler, /paginate\(shopRows, page, PRODUCTS_PER_PAGE\)/);
});

// ---------------------------------------------------------------
// Wishlist
// ---------------------------------------------------------------
test('favorites are persisted and wired into the UI', () => {
  assert.match(migration, /create table if not exists public\.product_favorites/);
  assert.match(migration, /unique \(user_id, product_id\)/);
  assert.match(migration, /grant all on public\.product_favorites to service_role/);
  for (const fn of [
    'export async function toggleFavorite',
    'export async function listFavoriteProducts',
    'export async function isFavorite',
  ]) {
    assert.ok(queries.includes(fn), `queries missing ${fn}`);
  }
  assert.match(keyboards, /fav:toggle:\$\{product\.id\}/);
  assert.match(handler, /fav:toggle:/);
  assert.match(handler, /export async function showFavorites/);
});

test('shop toolbar exposes search, sort and favorites', () => {
  assert.match(keyboards, /'shop_search', 'shop:search'/);
  assert.match(keyboards, /'shop_sort', 'shop:sort'/);
  assert.match(keyboards, /'favorites', 'fav:open'/);
  assert.match(keyboards, /export function sortMenuKeyboard/);
});

// ---------------------------------------------------------------
// Out-of-stock handling & non-regression
// ---------------------------------------------------------------
test('out-of-stock products stay reachable and clearly marked', () => {
  assert.match(keyboards, /shop\.product\.button\.oos/);
  assert.match(handler, /shop\.product\.stock\.out/);
  assert.match(handler, /shop\.product\.line\.preorder_notice/);
});

test('existing product features are preserved', () => {
  for (const marker of [
    'buy:${product.id}',
    'cart:add:${product.id}',
    'qty:${product.id}:dec',
    'note:${product.id}',
    'share_product',
  ]) {
    assert.ok(keyboards.includes(marker), `regression: product keyboard lost ${marker}`);
  }
  assert.match(handler, /resolvePromo/);
  assert.match(handler, /reserveProductStock/);
});
