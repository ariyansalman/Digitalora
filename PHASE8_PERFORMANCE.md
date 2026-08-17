# Digitalora Phase 8 — Performance & Scalability

## Scope
Phase 8 adds a bounded in-memory cache for the admin analytics dashboard.

## Change
`src/services/analytics.ts` now caches analytics results by normalized reporting window (`1–365` days) for 15 seconds. Existing admin cache-clear actions invalidate this immediately.

## Safety
- No database schema or migration changes.
- No wallet, payment, order, stock, fulfillment, or reseller business logic changes.
- Analytics remains advisory/admin-only.
- Cache keys are bounded by the existing day-range normalization, preventing unbounded key variation.
- Cache is process-local and naturally resets on restart.

## Verification
- Full Node test suite: 38/38 PASS.
- Phase 8-specific checks: 3/3 PASS.
- No secrets, `.git`, or `node_modules` added to the release archive.
- Railway's Node 24 build remains the production build authority.
