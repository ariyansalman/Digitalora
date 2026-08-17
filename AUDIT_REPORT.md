# Digitalora Bot — Production Hardening Audit

## Changes implemented

- Replaced application-level wallet read/modify/write with the atomic `adjust_wallet_atomic` RPC.
- Added atomic deposit approval and wallet credit through `approve_deposit_atomic`.
- Made wallet charge/credit update + ledger insertion atomic through `wallet_apply_atomic`.
- Hardened reseller API request-id reservation and added compensation for post-charge failures.
- Added atomic stock restoration for API failure compensation.
- Added concurrent-safe product-item claiming using `FOR UPDATE SKIP LOCKED`.
- Added atomic stock decrement with row locking and an insufficient-stock guard, while preserving stock-transition side effects.
- Updated auto-verification to use the atomic deposit approval path, preventing concurrent duplicate wallet credits.
- Added migration `0047_financial_concurrency_hardening.sql`; it is forward-only and does not modify earlier migrations.

## Important deployment requirement

Apply migration `0047_financial_concurrency_hardening.sql` to the production Supabase database before deploying this build. The application intentionally fails closed if these atomic RPCs are unavailable rather than silently falling back to unsafe read/modify/write behavior.

## Verification

The supplied archive was inspected and the critical financial paths were changed conservatively. A complete TypeScript/build verification could not be completed in this environment because the archived dependency installation was incomplete (`@types/node`, `@types/nodemailer`, `@types/pdfkit`, and related type packages were not materialized correctly by the available npm environment). No claim of a clean build is made.

## Remaining recommended hardening

- Make wallet debit + ledger insertion a single DB transaction for every purchase path (the current balance mutation is atomic, but legacy `charge()` still records its ledger in a separate call).
- Make the reseller API order creation, wallet debit, stock decrement, and item claim a single DB transaction/RPC.
- Add automated concurrency tests against a real Postgres/Supabase test database.
- Run `npm ci`, `npm run typecheck`, `npm run build`, and `npm run lint` in CI after the production dependency lockfile/environment is confirmed healthy.

## Professionalization Phase 2

### Changes implemented
- Added `0048_lock_down_financial_rpc_permissions.sql` to restrict financial/security-definer RPC execution to the Supabase `service_role` and revoke direct execution from `public`, `anon`, and `authenticated`.
- Added CI workflow at `.github/workflows/ci.yml` covering dependency installation, contract tests, typecheck, lint and build.
- Added dependency-free financial hardening contract tests under `tests/`.
- Added `npm test` and `npm run verify` scripts.
- Hardened `setOrderDeliveredItems()` so database errors and unexpected affected-row counts fail closed instead of being silently ignored.
- Hardened `/healthz` to support GET/HEAD only and disable caching.

### Remaining work
- A real Postgres/Supabase concurrency test environment is still required to prove race-safety under load.
- Reseller API order fulfilment is still compensation-based rather than one end-to-end database transaction; this should be the next financial-architecture phase.
- Direct-pay fulfilment remains multi-step because supplier APIs and Telegram delivery are external side effects; it should be protected by an explicit durable fulfilment state/recovery workflow rather than pretending external side effects can be part of a single SQL transaction.

## Professionalization Phase 3 — Atomic Reseller API Orders

### Changes implemented
- Added `0049_atomic_reseller_api_order.sql` with a single PostgreSQL transaction for reseller API fulfillment.
- The transaction serializes wallet-funded API orders per user, validates the API key, locks the product, verifies stock and delivery inventory, creates the order, claims product items, decrements stock, debits the wallet, writes the wallet ledger, and creates the reseller API order record.
- Added database-level request-id replay handling so the same `(user_id, request_id)` returns the original order instead of charging/delivering again.
- Restricted the new financial RPC to the Supabase `service_role` and revoked direct execution from `public`, `anon`, and `authenticated`.
- Updated `placeApiOrder()` to delegate financial side effects to the atomic RPC instead of using compensation-based create/charge/claim/stock steps.
- Added contract tests for the new RPC and source-level delegation behavior.

### Verification
- `npm test`: **6/6 PASS**.
- Static inspection confirms the reseller API handler no longer performs independent order creation, wallet charge, stock decrement, or item claiming after entering the atomic flow.
- A real Supabase/PostgreSQL concurrency test was **not run in this environment**; production verification must still exercise concurrent duplicate `request_id`, concurrent buyers, insufficient balance, stock exhaustion, and rollback scenarios against a disposable database.

### Remaining production validation
- Run `npm ci`, `npm run typecheck`, `npm run lint`, and `npm run build` in CI/production-like environment.
- Apply migrations `0047`, `0048`, and `0049` in order to the target Supabase database.
- Run real Postgres concurrency tests before enabling high-volume reseller API traffic.


## Phase 4 — Durable Direct-Pay Fulfilment Hardening (2026-08-15)

- Added migration `0050_direct_pay_fulfillment_state.sql` with durable per-deposit fulfilment state.
- Added service-role-only RPCs for begin/order association/finalization.
- Direct-pay retries now reuse an existing order when a prior attempt already created one.
- Supplier auto-order retries now use a stable `Idempotency-Key` derived from the local order ID.
- Direct-pay failure/refund paths persist fulfilment state instead of leaving the deposit permanently ambiguous.
- Added contract tests for the durable direct-pay guard and recovery behavior.

### Verification
- `npm test`: 10/10 passing.
- Full TypeScript/build/lint verification: not run successfully in this environment because dependencies/compiler were unavailable.
- Real Supabase/PostgreSQL concurrency test: not run; requires a reachable test database.

### Remaining limitation
External supplier APIs remain outside the PostgreSQL transaction. Their retry safety now depends on the supplier honoring the supplied idempotency key. Local inventory/order state is protected by the durable fulfilment record, but a provider that ignores idempotency keys can still require manual reconciliation.


## Concurrency test phase

A real Supabase/PostgreSQL concurrency run could not be executed because the connected Telegram shop bot project is on a plan where database branching is unavailable. No production data was modified for testing.

Added an additional crash-window hardening migration (`0051_atomic_direct_pay_order.sql`) so direct-pay order creation and attachment to `direct_pay_fulfillments` occur in one database transaction. Added deterministic 50-concurrency contract simulations covering duplicate request idempotency and final-stock overselling. These simulations validate the application-level invariants but are **not a substitute for a real PostgreSQL load test**.

## Architecture / Maintainability Hardening — 2026-08-15

- Added `docs/ARCHITECTURE.md` documenting runtime boundaries, financial invariants, incremental modularization plan, logging policy, and migration rules.
- Added `docs/OPERATIONS.md` with production payment, duplicate-credit, fulfilment, deployment, and rollback procedures.
- Replaced remaining `console.*` logging in Telegram profile handlers with structured Pino logging.
- Added architecture contract tests to prevent regression of handler-level console logging and missing operational documentation.
- No business rules, callback data, payment methods, or database schemas were changed in this phase.

## Architecture Professionalization — Incremental Repository Boundaries

- Added `src/db/repositories/` boundaries for users, products, deposits, and orders.
- Migrated critical payment/order services (`resellerApi`, `depositVerify`, `orderFulfill`) away from direct imports of the monolithic `db/queries.ts`.
- Kept `db/queries.ts` intact for backward compatibility and lower regression risk.
- Added `docs/REPOSITORY_BOUNDARIES.md` documenting the incremental migration rule.
- Added architecture contract tests preventing critical services from regressing to direct `db/queries.ts` imports.

## Admin UX / Navigation Professionalization — 2026-08-15

- Added `src/handlers/admin/navigation.ts` as the first safe admin-navigation extraction.
- Consolidated the root-level `Payment Methods` and `Top-Up Requests` entry points into a single `Payment Management` hub while preserving the existing `adm:pay` and `adm:dep` callbacks.
- Preserved all existing admin callback IDs and business logic.
- Added contract tests covering the navigation boundary and payment-management hub.
- No database schema or financial business rule was changed in this phase.

## Architecture Modularization — Phase 2

- Extracted pure admin presentation helpers from `src/handlers/admin/index.ts` into `src/handlers/admin/helpers.ts`.
- Preserved callback IDs and business logic.
- Added contract tests ensuring helper isolation and preventing DB/Telegram dependencies in the helper module.
- This is an incremental extraction; the remaining monolithic admin handler is intentionally not split in one risky operation.
- Verification: 26 contract tests pass in the supplied environment.
- Full TypeScript verification remains environment-limited because installed dependency/type packages are incomplete in this audit environment.

## Order & Fulfilment Audit — 2026-08-15

### Findings fixed in migration 0053 / current source

- Partial local product-item delivery is now treated as a fulfilment failure instead of being marked completed.
- Reserved stock is restored when fulfilment fails before the delivery commit.
- Partially claimed product items are released during recovery.
- Wallet-pay fulfilment failures refund the wallet exactly once after a successful charge.
- Unpaid wallet orders are removed when the atomic wallet debit rejects.
- Direct-pay product-missing refunds use an idempotent refund primitive.
- Direct-pay post-delivery notification failures no longer trigger financial rollback after the order has been committed.
- Preorder fulfilment now releases partial claims and restores reserved stock on failure.

### Remaining external-system limitation

Supplier APIs execute outside the PostgreSQL transaction. Stable `Idempotency-Key` values are used, but a supplier that ignores idempotency can still require manual reconciliation if it accepts an order and the local process fails before recording the result.

### Verification

- 29/29 contract/regression tests passed.
- TypeScript parser sanity check produced no syntax-error diagnostics; full typecheck remains blocked by missing installed dependencies in the audit environment.
- Real Supabase concurrency/load testing remains pending because the current Supabase plan does not support development database branching.
