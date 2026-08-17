# Architecture Guide

## Runtime layers

```text
Telegram / HTTP entrypoints
        ↓
Handlers / API controllers
        ↓
Application services
        ↓
Database queries / PostgreSQL RPC
        ↓
Supabase PostgreSQL
```

Payment providers and supplier APIs are external boundaries. Financial state transitions must be idempotent and, where possible, committed in one PostgreSQL transaction.

## Financial invariants

1. A wallet mutation and its ledger entry are one atomic operation.
2. A deposit can transition out of `pending` only once.
3. A product item can be claimed by only one order.
4. A finite-stock product cannot be decremented below zero.
5. Reseller `request_id` is idempotent.
6. Direct-pay fulfilment is recoverable after a process restart.

## Module boundaries

The current codebase contains several intentionally large legacy modules. Future refactors should be incremental and behavior-preserving:

- `src/handlers/admin/index.ts` → split by admin domain (users, products, orders, payments, suppliers, notifications, settings).
- `src/db/queries.ts` → split by repository/domain (users, products, orders, deposits, wallet, suppliers, promotions).
- `src/handlers/profile.ts`, `shop.ts`, `support.ts`, and `topup.ts` → move reusable business rules into services before splitting handlers.

Do not perform a mechanical file split without tests. Preserve callback data, exported function names, database semantics, and user-visible behavior.

## Error and logging policy

- Handlers should not use `console.*`; use the structured Pino logger.
- Financial failures must be logged with operation context but never with secrets, tokens, API keys, or private keys.
- User-facing errors should be translated into safe, stable messages rather than exposing database/provider errors.

## Deployment rule

Database migrations are forward-only. Apply migrations before deploying code that depends on them, and verify the migration state before enabling a new financial flow.

## Shared foundation modules (2026-08-16)

All later features must build on these instead of re-implementing them.
See `docs/FOUNDATION_AUDIT.md` for the audit that produced them.

- `src/core/errors.ts` — error taxonomy (`AppError`, `toUserMessage`) and
  Telegram error classification (`isTelegramNoopEditError`, …).
- `src/ui/format.ts` — the only place money, dates, percentages, user
  labels, HTML escaping and truncation are formatted.
- `src/ui/screen.ts` — `renderScreen()` / `renderScreenWithFallback()`:
  the centralized edit-vs-reply navigation core.
- `src/ui/callbackSafety.ts` — `safeAnswer()`, `callbackInt()`,
  `clampPage()`, `guardCallback()`.
- `src/ui/navigation.ts` — `ROUTES` registry of stable callback ids and
  the `route()` payload builder. Route values are persisted in live
  Telegram keyboards and must never change.
- `src/ui/designSystem.ts` — visual primitives (dividers, status icons).

Layering rule: `handlers` -> `services` -> `db/repositories` -> `db/supabase`.
`src/ui/*` and `src/core/errors.ts` are presentation/utility leaves and must
never import the data layer; `tests/foundation.contract.test.mjs` enforces this.
