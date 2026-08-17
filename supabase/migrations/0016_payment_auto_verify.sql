-- 0016_payment_auto_verify.sql
--
-- Automatic payment verification for two new providers:
--
--   * usdt_trc20  – on-chain USDT on TRON  (verified via TronGrid)
--   * usdt_bep20  – on-chain USDT on BSC   (verified via a public BSC RPC)
--
-- Plus we keep `binance_pay` and add a Binance Pay queryOrder
-- auto-verification path on top of the existing webhook listener.
--
-- Schema changes:
--   * payment_methods.provider  – widen the CHECK to accept the two
--                                 new chain providers.
--   * payment_methods.address   – wallet address users send funds to.
--                                 Required for the chain providers,
--                                 ignored for `manual` and `binance_pay`.
--   * deposits.tx_hash          – on-chain transaction hash submitted
--                                 by the user (or merchantTradeNo for
--                                 Binance Pay). Indexed + de-duped so
--                                 the same tx can never credit twice.

-- 1. Widen the provider CHECK constraint --------------------------------
alter table public.payment_methods
    drop constraint if exists payment_methods_provider_check;

alter table public.payment_methods
    add constraint payment_methods_provider_check
    check (provider in ('manual', 'binance_pay', 'usdt_trc20', 'usdt_bep20'));

-- 2. Wallet address column ---------------------------------------------
alter table public.payment_methods
    add column if not exists address text;

-- 3. Per-deposit transaction hash + dedupe -----------------------------
alter table public.deposits
    add column if not exists tx_hash text;

create index if not exists deposits_tx_hash_idx
    on public.deposits (tx_hash);

-- A unique index is preferred but we allow null + repeated null (legacy
-- rows) by indexing only non-null values. Postgres treats duplicate
-- nulls as distinct in a regular UNIQUE INDEX — but to be explicit and
-- portable across editors we use a partial unique index.
create unique index if not exists deposits_tx_hash_uniq
    on public.deposits (tx_hash)
    where tx_hash is not null;
