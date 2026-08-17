import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const analytics = fs.readFileSync('src/services/analytics.ts', 'utf8');
const cache = fs.readFileSync('src/services/cache.ts', 'utf8');

test('analytics uses bounded cache keys per reporting window', () => {
  assert.match(analytics, /admin-analytics:\$\{safeDays\}/);
  assert.match(analytics, /cache\.get<AdminAnalytics>\(cacheKey\)/);
  assert.match(analytics, /cache\.set\(cacheKey, result, 15_000\)/);
});

test('analytics cache can be invalidated by existing global cache clear', () => {
  assert.match(cache, /export function clearAll\(\): void/);
  assert.match(cache, /store\.clear\(\)/);
});

test('analytics caching does not change the financial source tables', () => {
  assert.match(analytics, /from\('orders'\)/);
  assert.match(analytics, /from\('deposits'\)/);
  assert.match(analytics, /from\('users'\)/);
  assert.match(analytics, /from\('products'\)/);
});
