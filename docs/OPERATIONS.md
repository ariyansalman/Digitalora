# Production Operations Runbook

## Pre-deploy

1. Apply pending Supabase migrations in order.
2. Run `npm test`.
3. Run `npm run typecheck`.
4. Run `npm run lint`.
5. Run `npm run build`.
6. Confirm required environment variables are present.
7. Confirm payment webhook endpoints and secrets are configured.

## Payment incident

If a payment is reported as paid but the user is not credited:

1. Do not manually credit the wallet first.
2. Inspect the deposit/payment record and provider transaction ID.
3. Run reconciliation or the provider status check.
4. Confirm whether the deposit is still `pending`, already resolved, or in a fulfilment state.
5. Only perform a manual resolution through the admin flow.

## Duplicate-credit incident

1. Stop automated retries only if the provider is repeatedly replaying a malformed event.
2. Identify the external transaction ID / tx hash.
3. Check the deposit status and wallet ledger reference.
4. Do not issue a second credit if an atomic approval already succeeded.
5. Record the incident and reconcile the provider ledger with the internal ledger.

## Stock / fulfilment incident

For an order marked paid but not delivered:

1. Check the order state and direct-pay fulfilment state.
2. Check whether product items were claimed.
3. Check supplier order status and idempotency key.
4. Retry the durable fulfilment path rather than creating a new order.
5. Refund only through the existing refund state machine when fulfilment is definitively impossible.

## Rollback

Do not roll back financial migrations by deleting schema objects in production. Prefer a forward migration that restores compatibility. Preserve financial records for auditability.
