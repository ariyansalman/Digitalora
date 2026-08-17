# Navigation & State-Transition Reliability Audit — 2026-08-16

Scope: every `callbackQuery`, inline keyboard, Back / Cancel / Retry button,
pagination control, multi-step input flow and session transition.
No business logic, payment rule or callback identifier was changed.

## 1. Audit results

| Area | Finding | Resolution |
| --- | --- | --- |
| Callback acknowledgement | ~480 `answerCallbackQuery()` calls, most unguarded; slow handlers left the button spinning; expired queries threw into `bot.catch` | Global `callbackGuard` middleware + API-level safety net |
| Duplicate clicks | Double-tapping Checkout / Buy delivered 2–3 updates; second render failed with "message is not modified", which reads as a frozen button | In-flight, per-user + per-payload lock; duplicates are acknowledged and dropped |
| "query is too old" | Escaped as an unhandled error | Swallowed at transport level (`ui/telegramSafety.ts`) |
| "message is not modified" | Handled in `bot.catch` only, after the render already failed | Treated as success (`unchanged`) everywhere |
| Deleted / un-editable message | Produced a dead screen | `safeEditMessage()` falls back to a new message |
| Back / Cancel | `main:open` cleared `userFlow` but left `qtyInput`; `shop:home` and `cart:open` cleared nothing, so the next typed message was still parsed as a quantity | `clearFlowState()` / `clearTransientFlowState()` at the navigation entry points |
| Protected flows | A navigation tap could silently drop Live Support (leaving a pinned panel) or a half-filled delivery form | `PROTECTED_FLOW_TYPES` survive navigation and only end via their own Cancel/End button |
| Pagination | Ad-hoc `Number(split(':')[n])` produced `NaN` pages from stale payloads | `callbackInt()` + `clampPage()` |
| Dead buttons | Full static sweep of `callback_data` vs registered string/regex/array handlers | 0 dead buttons |
| Session durability | grammY in-memory session: every redeploy stranded in-progress flows (paste tx id, keypad, email, delivery form) | Sessions persisted in Supabase `public.bot_sessions` with a write-through memory cache |

## 2. New reusable helpers (all additive, all backward-compatible)

| Helper | File | Purpose |
| --- | --- | --- |
| `safeAnswerCallback()` (alias of the existing `safeAnswer()`) | `src/ui/callbackSafety.ts` | Acknowledge a tap, never throw |
| `beginCallbackClick()` / `callbackClickKey()` | `src/ui/callbackSafety.ts` | Duplicate-click suppression |
| `safeEditMessage()` | `src/ui/navigate.ts` | Edit in place, fall back to a new message, no-op edits are success |
| `safeNavigate()` / `safeNavigateBack()` | `src/ui/navigate.ts` | Acknowledge → clear stale flow → render, in one call |
| `clearFlowState()` / `clearTransientFlowState()` | `src/ui/flowState.ts` | One teardown routine for multi-step input state |
| `installTelegramSafety()` | `src/ui/telegramSafety.ts` | Transport-level neutralisation of benign Telegram failures for *all* existing call sites |
| `callbackGuard` | `src/middleware/callbackGuard.ts` | Prompt ack (1.2 s watchdog), duplicate drop, `noop:` handling, guaranteed ack on error |
| `SupabaseSessionStorage` | `src/middleware/sessionStorage.ts` | Durable session state, degrades to memory on DB outage |

Existing exports (`safeAnswer`, `renderScreen`, `renderScreenWithFallback`,
`guardCallback`, `ROUTES`, every callback identifier) are unchanged.

## 3. Critical-state policy

* **Authoritative in Supabase:** orders, deposits, carts, wallet balances,
  fulfilment state, promo usage. Nothing financial is read back from session.
* **Session (`bot_sessions`):** transient UI state only — open flow + step,
  prompt message ids, quantity buffers, Back-link origin. It is now durable so a
  restart no longer strands a flow, but it is still never a source of truth for money.

## 4. Tests

`tests/navigation-reliability.test.mjs` — 33 assertions, run by `npm test`:
16 functional checks executed against the real modules through a fake grammY
context (acknowledgement, expired queries, no-op edits, deleted messages,
duplicate taps, throwing handlers, `noop:` rows, pagination clamping, the full
Home → Store → Product → Quantity → Checkout → Payment path plus every reverse
hop, protected flows, and a simulated bot restart), plus wiring and
migration contracts.

`npm run verify` (tests + typecheck + lint + build) passes.
