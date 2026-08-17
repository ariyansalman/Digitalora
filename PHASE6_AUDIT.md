# Digitalora Phase 6 — Production Operations & Reliability

## Scope
Phase 6 hardens process lifecycle and operational observability without changing payment, wallet, order, stock, or database business rules.

## Changes
- Added graceful shutdown for SIGINT/SIGTERM.
- Stops supplier stock-sync and Crypto Pay reconciliation timers during shutdown.
- Closes the HTTP server with a bounded shutdown wait.
- Added fatal handling for uncaught exceptions and unhandled promise rejections so Railway can restart a broken process.
- Added a non-sensitive `/readyz` endpoint for deployment/readiness checks.
- Preserved `/healthz` behavior.
- Added Phase 6 contract tests.

## Verification
- Existing test suite: 34/34 PASS.
- Phase 6 lifecycle/readiness tests: 3/3 PASS.
- No database migration required.
- No secrets added.
- No payment/wallet/order RPC changed.

## Remaining environment verification
The exact Railway build (`npm ci` + `npm run build`) must still be confirmed on the deployment environment because the local execution environment does not match the project's required Node runtime exactly.
