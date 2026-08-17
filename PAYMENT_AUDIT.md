# Payment Gateway Audit — Current Hardened Build

## Fixed in this phase

- Manual admin deposit approval now uses the existing atomic `approve_deposit_atomic` primitive instead of `set status -> credit` as two independent operations.
- Manual admin rejection now uses a conditional `reject_deposit_atomic` operation, preventing approval/rejection races from overwriting a resolved deposit.
- Manual direct-pay approval now continues through the durable direct-pay fulfilment state instead of incorrectly crediting the payment as a normal wallet top-up.
- On-chain USDT top-ups now enforce the configured payment-method minimum amount.
- Binance Pay and Bybit Pay top-ups now enforce the configured minimum amount when there is no direct-pay order intent.
- Minimum-payment rejection wording is classified as a hard rejection rather than silently falling into manual-review classification.

## Remaining security consideration

Plain on-chain USDT payments to a shared merchant address do not contain a user-bound payment identity. A user can potentially submit another customer's recent valid transaction hash if they know it and the transaction satisfies the amount/time/address checks. The current 30-minute window and TX-hash uniqueness reduce replay risk but do not cryptographically bind a payment to a specific user.

A stronger future design is to generate a unique payment amount/reference per deposit, or use provider invoices/payment links that carry a unique merchant-side invoice identifier. This should be implemented only with a deliberate UX/business decision because it changes the current "send any amount" chain-top-up flow.

## Gateway observations

- Crypto Pay webhook signature verification uses HMAC-SHA256 and constant-time comparison.
- Crypto Pay reconciliation worker exists and retries pending invoices.
- Binance Pay verifies order type, asset, merchant receiver and transaction time.
- Bybit verifies successful USDT internal transfers and transaction time.
- TRC20/BEP20/TON verify recipient and USDT contract/token data.
- LTC verifies the configured recipient and locked quote amount.
- Deposit approval is now database-atomic for both automatic and manual approval paths.

## Verification limitation

A real production Supabase concurrency load test was not run because the current Supabase plan does not support development database branches. No destructive concurrent test was run against production.

## 2026-08-15 Payment Gateway Hardening — Phase 2

Fixed verified issues:
- Crypto Pay direct-pay could be credited to wallet before fulfilment; it now uses `approve_deposit_atomic`, which explicitly skips wallet credit for `order_intent`.
- TRC20 verification could stop at the first USDT Transfer event and reject a valid later transfer to the merchant; it now selects a matching recipient event.
- LTC verification allowed a 2% merchant underpayment; it now permits only one-satoshi rounding tolerance.
- Manual direct-pay admin messaging could falsely state that a payment was credited; messaging now reflects order fulfilment/refund/recovery state.

Not claimed:
- Live provider API verification was not performed because no production payment credentials were used.
- Real Supabase concurrent-load testing remains unavailable on the current plan.
