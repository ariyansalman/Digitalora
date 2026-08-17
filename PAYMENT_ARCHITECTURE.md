# Digitalora — Unified Payment Architecture

Date: 2026-08-16

One provider-agnostic payment architecture. Existing provider
implementations are preserved; nothing that worked before was replaced
or renamed. No verification path was invented, and no manual method is
labelled automatic anywhere in this layer.

---

## 1. Provider audit

Classification rules (implemented in `src/payments/config.ts`):

| Status | Meaning |
| --- | --- |
| `AUTOMATIC` | A real provider/chain verification path exists **and** the deployment has the credentials and merchant address it needs. |
| `MANUAL` | Admin approves/rejects by design. |
| `DISABLED` | The `payment_methods` row exists but `enabled = false`. |
| `UNAVAILABLE` | Declared automatic, but credentials or merchant configuration are missing, so automatic verification cannot run. Submissions fall back to admin review. |

Status is computed at runtime per method row — it is not hardcoded.
`auditPaymentMethods()` returns the live classification.

| Provider | Type | Currency / Network | Real verification path | Classification |
| --- | --- | --- | --- | --- |
| `manual` | manual | USD / — | none (by design) | **MANUAL** always |
| `binance_pay` | exchange_transfer | USDT / BINANCE_PAY | `GET /sapi/v1/pay/transactions`, matched by user-pasted 18-digit Pay Order ID; checks order type `C2C`, asset USDT, receiver Pay ID, transaction time window | **AUTOMATIC** when `BINANCE_PAY_API_KEY` + `BINANCE_PAY_API_SECRET` and `address` are set, else **UNAVAILABLE** |
| `bybit_pay` | exchange_transfer | USDT / BYBIT_INTERNAL | `GET /v5/asset/deposit/query-internal-record`, matched by internal transfer TXID; checks asset, status, timestamp | **AUTOMATIC** when `BYBIT_API_KEY` + `BYBIT_API_SECRET` and `address` are set, else **UNAVAILABLE** |
| `usdt_trc20` | onchain | USDT / TRC20 | TronGrid tx lookup; verifies USDT contract, recipient, amount, freshness | **AUTOMATIC** when `address` is set (TRONGRID_API_KEY only raises rate limits) |
| `usdt_bep20` | onchain | USDT / BEP20 | BSC RPC tx + receipt lookup; verifies token contract, recipient, amount | **AUTOMATIC** when `address` is set |
| `usdt_ton` | onchain | USDT / TON | TonCenter REST lookup; verifies jetton master, recipient, amount | **AUTOMATIC** when `address` is set |
| `ltc` | onchain | LTC / LITECOIN | BlockCypher tx lookup against a locked USD→LTC quote; one-satoshi rounding tolerance only | **AUTOMATIC** when `address` is set; an expired quote defers to admin review |
| `cryptobot` | invoice | USDT / CRYPTO_PAY | Crypto Pay invoice API + HMAC-SHA256 signed webhook + reconciliation sweep | **AUTOMATIC** when `CRYPTOBOT_API_TOKEN` is set, else **UNAVAILABLE** |

Any row with `enabled = false` is **DISABLED** regardless of provider.

Honest limitations kept from the previous audit:

- Live provider API calls were not exercised here; no production
  payment credentials were used.
- On-chain payments to a shared merchant address carry no user-bound
  identity; the 30-minute window, session-anchored freshness gate and
  TX-hash uniqueness index remain the mitigations.

---

## 2. Configuration model

Every method is normalised into one shape (`PaymentMethodConfig`), no
matter which provider backs it:

```
id
name
display_name
type                 manual | exchange_transfer | onchain | invoice
currency             USDT | LTC | USD | ...
network              TRC20 | BEP20 | TON | LITECOIN | BINANCE_PAY | BYBIT_INTERNAL | CRYPTO_PAY | null
verification_mode    automatic | manual
enabled
sort_order
instructions
expiry_minutes
provider             implementation tag
provider_configuration { address, pay_name, min_amount, extra }
```

Storage: migration `0059_unified_payment_method_model.sql` adds
`display_name`, `type`, `currency`, `network`, `verification_mode`,
`enabled`, `expiry_minutes` and `provider_config`, backfills them from
the existing `provider` tag, and adds:

- `payment_methods_type_check` / `payment_methods_verification_mode_check`
- `payment_methods_manual_mode_check` — a `manual` provider can never be
  stored as `automatic`
- a trigger keeping legacy `active` and new `enabled` in sync in both
  directions, so older code paths keep working unchanged

`src/payments/config.ts` fills provider-derived defaults when the
migration has not been applied yet, so the layer is safe to deploy
before or after the SQL.

---

## 3. Deposit ↔ method linkage

- `deposits.payment_method_id` is the authoritative link (introduced in
  `0055`, re-asserted and documented in `0059`).
- All deposit creations in `handlers/topup.ts` and `handlers/directPay.ts`
  pass `payment_method_id`; `BasePaymentService.createPayment()` always
  sets it.
- `resolveDepositMethodConfig()` resolves by id. The legacy display-name
  fallback only applies to pre-`0055` rows **and is refused when the name
  is ambiguous**, so a renamed or duplicated method can never redirect
  verification to the wrong provider.
- A contract test (`tests/payment-architecture.contract.test.mjs`) fails
  the build if any `createDeposit` call omits `payment_method_id`.

---

## 4. Unified `PaymentService` interface

`src/payments/types.ts`:

```ts
interface PaymentService {
  provider; type; verification_mode;
  isAvailable(config)      // credentials / merchant config readiness
  createPayment(input)     // persists a deposit bound to payment_method_id
  verifyPayment(input)     // approved | manual_review | rejected
  expirePayment(input)     // close an unpaid payment after its window
  approve(input)           // atomic credit / order fulfilment
  reject(input)            // atomic rejection
  reconcile({ api })       // provider settlement sweep, or supported:false
}
```

`verifyPayment` can never return `approved` without the provider
confirming. When a provider is unavailable, its result is
`manual_review` with the reason — never a synthetic success.

Implementations (`src/payments/providers/`):

- `manual.ts` — always `manual_review`
- `exchangeTransfer.ts` — Binance Pay, Bybit Pay
- `onchain.ts` — TRC20, BEP20, TON, LTC (LTC additionally defers on an
  expired quote)
- `invoice.ts` — Crypto Pay; the only provider reporting
  `reconcile → supported: true`, delegating to the existing
  reconciliation worker. Every other provider reports
  `supported: false` with a reason instead of pretending to sweep.

All of them delegate the actual provider checks to the existing,
unchanged services: `services/binance.ts`, `services/bybit.ts`,
`services/chainVerify.ts`, `services/cryptoPay*.ts` and the atomic
approval RPCs (`approve_deposit_atomic`, `reject_deposit_atomic`).

---

## 5. Files added / changed

Added:
- `src/payments/types.ts`, `config.ts`, `registry.ts`, `basePaymentService.ts`, `index.ts`
- `src/payments/providers/{manual,exchangeTransfer,onchain,invoice}.ts`
- `supabase/migrations/0059_unified_payment_method_model.sql`
- `tests/payment-architecture.contract.test.mjs`
- `PAYMENT_ARCHITECTURE.md`

Changed (additive only):
- `src/types.ts` — optional unified-model fields on `DBPaymentMethod`
- `src/db/queries.ts` — `listAllPaymentMethods()`, `getPaymentMethodById()`
- `src/db/repositories/{deposits,users}.ts` — boundary exports

No existing handler, verifier or RPC behaviour was modified.

Verification run: `tsc --noEmit` clean, `npm test` — all tests pass.
