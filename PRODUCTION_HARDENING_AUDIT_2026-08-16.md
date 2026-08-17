# Digitalora Production Hardening — 2026-08-16

## Changes applied

### 1. Stable payment-method linkage
Added `deposits.payment_method_id` and a migration (`0055_deposit_payment_method_id.sql`).

New deposits created by top-up and direct-pay flows now persist the exact `payment_methods.id` used to create them.

The verifier and admin manual-approval lookup prefer this ID and retain the legacy display-name fallback for older rows.

This prevents provider mix-ups caused by duplicate/renamed payment-method names.

### 2. All deposit creation paths updated
All 11 `createDeposit()` call sites in:
- `src/handlers/topup.ts`
- `src/handlers/directPay.ts`

now persist `payment_method_id`.

### 3. Backward compatibility
Existing deposits without `payment_method_id` continue to resolve by the legacy `method` name.

The migration performs a safe best-effort backfill only when a payment-method name is unique. Ambiguous legacy rows remain NULL rather than being guessed.

## Verification performed

- Existing test suite: **38/38 PASS**
- Static check: all 11 deposit creation paths include `payment_method_id`.
- Migration file present and ordered after existing migrations.

## Not independently verified in this environment

`npm run typecheck`, `npm run build`, and `npm run lint` were not independently executed because project dependencies were not installed in the supplied archive and dependency installation was not available in this environment.

The existing repository's prior verification documents may claim these checks passed, but those claims are not treated as independently re-verified here.

## Important remaining limitation

Mobile Money (bKash/Nagad/Rocket) remains manual verification unless a real supported API integration is configured. The codebase's automatic verifier currently implements Binance Pay, Bybit Pay, supported crypto networks, LTC, and CryptoBot; `manual` providers intentionally fall back to admin review.

No payment provider credentials or secrets were modified.
