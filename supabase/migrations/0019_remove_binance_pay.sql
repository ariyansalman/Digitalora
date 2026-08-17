-- 0019_remove_binance_pay.sql
--
-- Strip Binance Pay from the payment-methods provider list.
--
-- The Binance Pay merchant API auto-verify path (introduced in 0002
-- and 0016/0017) is being retired because the merchant account is
-- region-blocked from `createOrder` / `queryOrder` (HTTP 451). A
-- fresh Binance Pay implementation will land in a follow-up
-- migration.
--
-- This migration:
--   1. Cancels any still-pending Binance Pay deposits so the dedupe
--      indexes on tx_hash / reference don't conflict with future rows.
--   2. Deletes the Binance Pay payment-method rows so the admin
--      panel never re-renders them.
--   3. Narrows the provider CHECK constraint to drop `binance_pay`.

-- 1. Cancel any pending Binance Pay deposits ---------------------------
-- The deposits table stores the method by its display name in
-- `method` (text), so we match on the names of any binance_pay rows
-- in payment_methods.
update public.deposits
set status = 'rejected',
    note = coalesce(note, '') ||
           case when note is null or note = '' then '' else E'\n' end ||
           '[binance_pay retired — auto-rejected by migration 0019]',
    updated_at = now()
where status = 'pending'
  and method in (
      select name from public.payment_methods where provider = 'binance_pay'
  );

-- 2. Delete the Binance Pay payment-method rows ------------------------
delete from public.payment_methods where provider = 'binance_pay';

-- 3. Narrow the provider CHECK constraint -----------------------------
alter table public.payment_methods
    drop constraint if exists payment_methods_provider_check;

alter table public.payment_methods
    add constraint payment_methods_provider_check
    check (provider in (
        'manual',
        'usdt_trc20',
        'usdt_bep20',
        'usdt_ton',
        'ltc'
    ));
