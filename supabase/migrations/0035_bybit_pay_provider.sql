-- 0035_bybit_pay_provider.sql
--
-- Add Bybit Pay / Bybit internal-transfer verification to the
-- payment method provider constraint.

alter table public.payment_methods
    drop constraint if exists payment_methods_provider_check;

alter table public.payment_methods
    add constraint payment_methods_provider_check
    check (provider in (
        'manual',
        'binance_pay',
        'bybit_pay',
        'usdt_trc20',
        'usdt_bep20',
        'usdt_ton',
        'ltc'
    ));
