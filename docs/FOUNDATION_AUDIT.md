# Foundation Architecture Audit — 2026-08-16

Scope: architecture cleanup and professionalization foundation only.
**No** Cart, **no** new payment gateway, **no** new UI system were implemented.
No feature was removed, no business rule was changed, no file was deleted,
no payment provider was replaced, and every callback identifier is unchanged.

## 1. What was inspected

`src/` (handlers, keyboards, services, middleware, session, db repositories,
ui), `config/`, `supabase/migrations/` (55 migrations), `tests/`,
`docs/`, and the deployment configuration (`Dockerfile`, `Dockerfile.vpn`,
`railway.toml`, `Procfile`, `.github/workflows/ci.yml`, `deploy/wireproxy/`).

Codebase size at audit time: ~44.8k lines of TypeScript across 62 modules.

## 2. Findings

### 2.1 Duplicated logic (confirmed)

| Finding | Evidence | Status |
| --- | --- | --- |
| Money formatting re-implemented three times with identical output | `handlers/resellerApi.ts:money`, `handlers/admin/helpers.ts:apiMoney`, plus 150+ raw `toFixed(2)` call sites | Centralized in `src/ui/format.ts`; the three named helpers now delegate |
| A fourth, intentionally different compact format | `services/publicFeed.ts:money` (drops decimals for whole numbers) | Preserved verbatim as `format.compactMoney` |
| Date rendering (`iso.replace('T',' ').slice(0,16)`) | `handlers/admin/helpers.ts` and inline copies | Centralized as `format.date` / `format.dateOnly` |

### 2.2 Duplicated UI / navigation (confirmed)

The block

```ts
if (ctx.callbackQuery) await ctx.editMessageText(html, opts);
else await ctx.reply(html, opts);
```

appears across the handler layer (`editMessageText` is called 196 times in
6 handler files). Each copy independently decides whether to guard the
three Telegram edge cases; most guard none.

Centralized in `src/ui/screen.ts` (`renderScreen`, `renderScreenWithFallback`).

### 2.3 Unsafe callback state handling (confirmed)

- `answerCallbackQuery` is called 483 times, largely unguarded. An expired
  query throws, escapes to `bot.catch`, and the tap looks ignored.
- Callback payloads are parsed with ad-hoc `split(':')` + `Number(...)`,
  which yields `NaN` ids for stale payloads.

Centralized in `src/ui/callbackSafety.ts` (`safeAnswer`, `callbackParts`,
`callbackInt`, `clampPage`, `guardCallback`).

### 2.4 Inconsistent error handling (confirmed)

`"message is not modified"` was string-matched in three unrelated places
(`bot.ts`, `handlers/shop.ts`, `services/verifyingMsg.ts`) with three
different shapes, and there was no shared notion of a user-presentable
error. Centralized in `src/core/errors.ts` (`AppError`, `toUserMessage`,
`isTelegramNoopEditError`, `isTelegramMessageGoneError`,
`isExpiredCallbackError`).

### 2.5 Conflicting callbacks

None found. All 89 exact `bot.callbackQuery('...')` registrations are
unique; no duplicate literal route is registered twice.

### 2.6 Dead code

No `TODO`/`FIXME`/`HACK` markers and no unreferenced modules were found.
Nothing was deleted.

### 2.7 Hardcoded business values (recorded, not changed)

Rate-limit windows and quotas are inlined at call sites
(`consume('binance_pay:…', 5, 60_000)` in `handlers/directPay.ts` and
`handlers/topup.ts`, `consume('chain_tx:…', 10, 60_000)`), and cache TTLs
are literal (`services/cache.ts`, `services/chainVerify.ts`). These are
**business-affecting values**, so per the task rules they were left exactly
as-is and are documented here for a future, explicitly-approved task.

### 2.8 Fragile dependencies (recorded, not changed)

`process.env` is read directly outside the validated `src/env.ts` schema in
`src/logger.ts`, `src/services/settings.ts`, `src/services/supplierAutoSync.ts`,
`src/services/cryptoPayReconcile.ts`, and `src/middleware/forceJoin.ts`.
Consolidating these into `env.ts` changes startup validation behaviour, so
it is deferred rather than done silently.

### 2.9 Repository / service boundaries

Already sound: `src/db/repositories/{users,products,deposits,orders,wallet}.ts`
exist, and `architecture.contract.test.mjs` already forbids the critical
payment/order services from importing `db/queries.js` directly. No change
needed; the boundary is now also documented as the target for new modules.

## 3. Modules added

| Module | Responsibility |
| --- | --- |
| `src/core/errors.ts` | Error taxonomy, user-safe messages, Telegram error classification |
| `src/ui/format.ts` | Money, dates, percentages, user labels, HTML escaping, truncation |
| `src/ui/screen.ts` | Centralized screen rendering / navigation core |
| `src/ui/callbackSafety.ts` | Non-throwing callback answers, safe payload parsing, handler guard |
| `src/ui/navigation.ts` | Named registry of the stable callback ids + payload builder |

All five are additive. Existing call sites compile and behave unchanged;
`handlers/admin/helpers.ts`, `handlers/resellerApi.ts`,
`services/publicFeed.ts` and `handlers/shop.ts` were migrated as proof of
adoption.

## 4. Verification

- `npm test` — 38/38 passing before the change, **48/48 passing after**
  (10 new foundation contract tests).
- `npm run typecheck` — clean (`tsc --noEmit`, strict, exit 0).
- `npm run build` — clean.

## 5. NOT VERIFIED

The following could not be verified in this environment and are explicitly
marked **NOT VERIFIED**:

- Live Telegram behaviour (long-polling and webhook modes) — requires a real
  `BOT_TOKEN` and Telegram connectivity.
- Supabase migrations and RPC behaviour — no database was reachable; SQL was
  read, not executed.
- Payment provider verification paths (Binance, Bybit, CryptoBot, on-chain) —
  require live provider credentials and network access.
- Railway deployment and the wireproxy VPN image — not built or deployed here.
- `npm run lint` — the pinned ESLint 9 flat config fails to load
  `@typescript-eslint/eslint-plugin` in this sandbox's dependency layout
  (`Cannot find package .../eslint-plugin/index.js`). This is a pre-existing
  environment/resolution issue, present before any change in this task, and
  unrelated to the modules added.
