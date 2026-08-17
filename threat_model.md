# Digitalora Financial Security Threat Model

## Scope

This review covers wallet balance and ledger mutations, manual and automatic
deposits, Crypto Pay callbacks/reconciliation, direct-pay fulfilment, orders,
inventory, coupons/promotions, referral conversion, supplier/API orders,
refunds, and reseller API authentication.

## Trust boundaries

1. Telegram users and callback payloads are untrusted.
2. Payment providers and webhook/reconciliation payloads are untrusted until
   signature, identity, amount, asset, network, recipient, and timing checks pass.
3. Reseller API callers control every request field except their authenticated
   API-key identity.
4. Suppliers and delivery providers are external systems; their credentials,
   product identifiers, balances, and responses are not authoritative for local
   wallet or order accounting.
5. The database transaction/RPC layer is the financial trust boundary.

## High-impact threats and controls

| Threat | Control |
|---|---|
| Duplicate TXID or webhook replay | Unique transaction identity, conditional deposit approval, replay-safe wallet references, and durable fulfilment state. |
| Double approval or rejection race | `approve_deposit_atomic` and `reject_deposit_atomic` update only pending rows. |
| Duplicate wallet credit/debit | Locked user row, unique `(user_id, reference)` ledger index, and conflict detection for reused references. |
| Concurrent overspend or stock oversell | Atomic wallet debit, product/item locks, stock reservation/claim primitives, and one-winner delivery guards. |
| Client price/total/discount tampering | Direct-pay compares against stored order intent and approved deposit; reseller RPC recomputes product price, override, promo, stock, and total. |
| Wrong payment asset/network/recipient/expiry | Provider-specific verifiers validate the expected asset/network/recipient and timing; Crypto Pay requires USDT and an unexpired quote. |
| Duplicate order request | Reseller request IDs are unique per user and direct-pay fulfilment binds one order to one deposit. |
| Refund replay | Durable direct-pay refund RPC locks fulfilment state and credits through the wallet primitive with a stable reference. |
| Secret leakage | Supplier/API credentials and keys are kept outside order responses and are not treated as client-provided financial values. |

## Residual risks and operational requirements

- Apply migrations forward-only and reconcile any pre-existing duplicate
  wallet references before creating the unique index.
- Keep service-role RPC permissions restricted; never expose financial RPCs to
  anonymous or authenticated client roles.
- Monitor failed fulfilments, failed refunds, and provider reconciliation
  alerts; these are recovery signals, not safe-to-ignore errors.
- Run the regression suite and security scans in CI before deployment.
- A live database migration and production payment-provider verification were
  not run in this offline audit copy.