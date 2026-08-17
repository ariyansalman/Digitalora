-- 0020_binance_pay_restore.sql
--
-- Re-introduce Binance Pay as an auto-verifying payment provider, this
-- time using the personal-account Binance Spot API
-- (`GET /sapi/v1/pay/transactions`) instead of the merchant API. The
-- merchant API path was retired in 0019 because the merchant endpoints
-- (`createOrder` / `queryOrder`) returned HTTP 451 from every cloud
-- region we tried; the personal-account endpoint works through any VPN
-- exit IP that Binance allows.
--
-- Schema changes:
--   * payment_methods.provider — widen the CHECK to re-accept
--                                'binance_pay'.
--   * payment_methods.pay_name — NEW. Stores the human-readable
--                                Binance Pay Name (e.g. "urweebboii")
--                                rendered next to the Pay ID on the
--                                user-facing top-up screen. Null for
--                                every other provider.
--
-- The existing `address` column is reused to hold the merchant's
-- 10-digit Binance Pay ID (e.g. "1101801594") for binance_pay rows.
-- The verifier compares this against `receiverInfo.binanceId` of the
-- matched Pay transaction.

-- 1. Widen the provider CHECK constraint -------------------------------
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

-- 2. New pay_name column ----------------------------------------------
alter table public.payment_methods
    add column if not exists pay_name text;
