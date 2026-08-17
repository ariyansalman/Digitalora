-- 0002_binance_pay.sql
-- Adds an optional `provider` column to payment_methods so the topup
-- flow can recognise auto-approving providers like Binance Pay.

alter table public.payment_methods
    add column if not exists provider text not null default 'manual'
    check (provider in ('manual', 'binance_pay'));

-- Index used to look up deposits by their merchantTradeNo when a
-- Binance Pay webhook arrives.
create index if not exists deposits_reference_idx
    on public.deposits (reference);
