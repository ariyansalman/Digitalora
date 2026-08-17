-- 0059_unified_payment_method_model.sql
--
-- One consistent, provider-agnostic configuration model for every
-- payment method. Adds the missing columns of the unified model and
-- backfills them from the existing `provider` tag so no configured
-- method changes behaviour.
--
-- Model columns:
--   id, name, display_name, type, currency, network,
--   verification_mode, enabled, sort_order, instructions,
--   expiry_minutes, provider, provider_config
--
-- Nothing here labels a manual method automatic: `verification_mode`
-- is derived strictly from the provider's real capability.

-- 1. Configuration columns ---------------------------------------------
alter table public.payment_methods
  add column if not exists display_name text;

alter table public.payment_methods
  add column if not exists type text;

alter table public.payment_methods
  add column if not exists currency text;

alter table public.payment_methods
  add column if not exists network text;

alter table public.payment_methods
  add column if not exists verification_mode text;

-- `enabled` mirrors the historical `active` flag. `active` is kept so
-- existing code and queries continue to work unchanged.
alter table public.payment_methods
  add column if not exists enabled boolean;

alter table public.payment_methods
  add column if not exists expiry_minutes integer;

alter table public.payment_methods
  add column if not exists provider_config jsonb not null default '{}'::jsonb;

-- 2. Backfill from the existing provider tag ---------------------------
update public.payment_methods
set display_name = coalesce(nullif(btrim(display_name), ''), name);

update public.payment_methods
set enabled = coalesce(enabled, active);

update public.payment_methods
set type = coalesce(type, case provider
      when 'manual'       then 'manual'
      when 'binance_pay'  then 'exchange_transfer'
      when 'bybit_pay'    then 'exchange_transfer'
      when 'cryptobot'    then 'invoice'
      else 'onchain'
    end),
    currency = coalesce(currency, case provider
      when 'manual' then 'USD'
      when 'ltc'    then 'LTC'
      else 'USDT'
    end),
    network = coalesce(network, case provider
      when 'manual'      then null
      when 'binance_pay' then 'BINANCE_PAY'
      when 'bybit_pay'   then 'BYBIT_INTERNAL'
      when 'cryptobot'   then 'CRYPTO_PAY'
      when 'usdt_trc20'  then 'TRC20'
      when 'usdt_bep20'  then 'BEP20'
      when 'usdt_ton'    then 'TON'
      when 'ltc'         then 'LITECOIN'
      else null
    end),
    verification_mode = coalesce(verification_mode, case provider
      when 'manual' then 'manual'
      else 'automatic'
    end),
    expiry_minutes = coalesce(expiry_minutes, case provider
      when 'manual' then 60
      when 'ltc'    then 10
      else 30
    end);

-- 3. Defaults + integrity ----------------------------------------------
alter table public.payment_methods
  alter column enabled set default true,
  alter column expiry_minutes set default 30;

alter table public.payment_methods
  drop constraint if exists payment_methods_type_check;
alter table public.payment_methods
  add constraint payment_methods_type_check
  check (type in ('manual', 'exchange_transfer', 'onchain', 'invoice'));

alter table public.payment_methods
  drop constraint if exists payment_methods_verification_mode_check;
alter table public.payment_methods
  add constraint payment_methods_verification_mode_check
  check (verification_mode in ('automatic', 'manual'));

-- A manual provider can never be stored as automatic.
alter table public.payment_methods
  drop constraint if exists payment_methods_manual_mode_check;
alter table public.payment_methods
  add constraint payment_methods_manual_mode_check
  check (provider <> 'manual' or verification_mode = 'manual');

alter table public.payment_methods
  drop constraint if exists payment_methods_expiry_check;
alter table public.payment_methods
  add constraint payment_methods_expiry_check
  check (expiry_minutes is null or expiry_minutes > 0);

-- Keep `active` and `enabled` in sync in both directions so legacy
-- writers and the unified layer never disagree.
create or replace function public.payment_methods_sync_enabled()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.enabled is null then new.enabled := coalesce(new.active, true); end if;
    new.active := new.enabled;
  else
    if new.enabled is distinct from old.enabled then
      new.active := new.enabled;
    elsif new.active is distinct from old.active then
      new.enabled := new.active;
    end if;
  end if;
  if new.display_name is null or btrim(new.display_name) = '' then
    new.display_name := new.name;
  end if;
  return new;
end;
$$;

drop trigger if exists payment_methods_sync_enabled_trg on public.payment_methods;
create trigger payment_methods_sync_enabled_trg
  before insert or update on public.payment_methods
  for each row execute function public.payment_methods_sync_enabled();

create index if not exists payment_methods_enabled_sort_idx
  on public.payment_methods (enabled, sort_order);

-- 4. Deposits must reference the exact payment method ------------------
-- Column and backfill were introduced in 0055; this re-asserts the
-- index and documents the contract for new writers.
create index if not exists deposits_payment_method_id_idx
  on public.deposits (payment_method_id);

comment on column public.deposits.payment_method_id is
  'Authoritative link to payment_methods.id. Verification must resolve the provider through this column, never through the legacy display name in deposits.method.';
