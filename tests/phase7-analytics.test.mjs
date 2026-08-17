import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const analytics = fs.readFileSync(path.join(root, 'src/services/analytics.ts'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'src/handlers/admin/navigation.ts'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'src/handlers/admin/index.ts'), 'utf8');

assert.match(analytics, /getAdminAnalytics/);
assert.match(analytics, /aov/);
assert.match(analytics, /lowStock/);
assert.match(analytics, /outOfStock/);
assert.match(analytics, /topCustomer/);
assert.match(analytics, /\.eq\('status', 'paid'\)/);
assert.match(nav, /📈 Reports/);
assert.match(nav, /adm:analytics/);
assert.match(admin, /services\/analytics\.js/);
assert.match(admin, /adm:analytics/);
assert.match(admin, /adm:analytics:r/);
assert.match(admin, /📊 Detailed Stats/);

console.log('Phase 7 analytics tests: 11/11 PASS');
