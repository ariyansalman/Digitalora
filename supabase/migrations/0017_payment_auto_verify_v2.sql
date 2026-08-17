-- 0017_payment_auto_verify_v2.sql
--
-- Phase A of the rebuilt auto-verification flow. We re-introduce the
-- `binance_pay`, `usdt_trc20`, `usdt_bep20` providers (the columns
-- and indexes from migration 0016 still exist) and add two new ones:
--
--   * usdt_ton  – USDT Jetton on TON, verified via TonCenter REST API
--   * ltc       – Native Litecoin, verified via BlockCypher REST API
--
-- Schema changes:
--   * payment_methods.provider  – widen the CHECK to accept the two
--                                 new providers in addition to the
--                                 existing four.
--   * deposits.expected_amount  – locked LTC quote amount (in LTC),
--                                 used to validate the user-paid
--                                 amount against the rate locked at
--                                 deposit-creation time. Null for
--                                 every other provider.
--   * deposits.quote_expires_at – timestamp when the LTC rate quote
--                                 stops being valid. Null for every
--                                 other provider.

-- 1. Widen the provider CHECK constraint --------------------------------
alter table public.payment_methods
    drop constraint if exists payment_methods_provider_check;

alter table public.payment_methods
    add constraint payment_methods_provider_check
    check (provider in (
        'manual',
        'binance_pay',
        'usdt_trc20',
        'usdt_bep20',
        'usdt_ton',
        'ltc'
    ));

-- 2. LTC quote columns on deposits -------------------------------------
alter table public.deposits
    add column if not exists expected_amount numeric(20, 8);

alter table public.deposits
    add column if not exists quote_expires_at timestamptz;
