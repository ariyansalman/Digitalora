-- 0048_lock_down_financial_rpc_permissions.sql
-- Financial RPCs are server-side primitives. The bot uses the Supabase
-- service-role connection; browser/anonymous clients must not be able to
-- invoke wallet, deposit, stock or item-claim functions directly.
--
-- Forward-only migration. Do not edit previously applied migrations.

do $$
begin
  if to_regprocedure('public.wallet_apply_atomic(bigint,numeric,text,text)') is not null then
    execute 'revoke execute on function public.wallet_apply_atomic(bigint,numeric,text,text) from public, anon, authenticated';
    execute 'grant execute on function public.wallet_apply_atomic(bigint,numeric,text,text) to service_role';
  end if;
  if to_regprocedure('public.restore_product_stock_atomic(bigint,integer)') is not null then
    execute 'revoke execute on function public.restore_product_stock_atomic(bigint,integer) from public, anon, authenticated';
    execute 'grant execute on function public.restore_product_stock_atomic(bigint,integer) to service_role';
  end if;
  if to_regprocedure('public.adjust_wallet_atomic(bigint,numeric)') is not null then
    execute 'revoke execute on function public.adjust_wallet_atomic(bigint,numeric) from public, anon, authenticated';
    execute 'grant execute on function public.adjust_wallet_atomic(bigint,numeric) to service_role';
  end if;
  if to_regprocedure('public.approve_deposit_atomic(bigint,text,numeric)') is not null then
    execute 'revoke execute on function public.approve_deposit_atomic(bigint,text,numeric) from public, anon, authenticated';
    execute 'grant execute on function public.approve_deposit_atomic(bigint,text,numeric) to service_role';
  end if;
  if to_regprocedure('public.claim_product_items_atomic(bigint,integer,bigint)') is not null then
    execute 'revoke execute on function public.claim_product_items_atomic(bigint,integer,bigint) from public, anon, authenticated';
    execute 'grant execute on function public.claim_product_items_atomic(bigint,integer,bigint) to service_role';
  end if;
  if to_regprocedure('public.decrement_product_stock_atomic(bigint,integer)') is not null then
    execute 'revoke execute on function public.decrement_product_stock_atomic(bigint,integer) from public, anon, authenticated';
    execute 'grant execute on function public.decrement_product_stock_atomic(bigint,integer) to service_role';
  end if;
  if to_regprocedure('public.credit_cryptopay_deposit(bigint,text)') is not null then
    execute 'revoke execute on function public.credit_cryptopay_deposit(bigint,text) from public, anon, authenticated';
    execute 'grant execute on function public.credit_cryptopay_deposit(bigint,text) to service_role';
  end if;
  if to_regprocedure('public.credit_cryptobot_deposit(bigint,text)') is not null then
    execute 'revoke execute on function public.credit_cryptobot_deposit(bigint,text) from public, anon, authenticated';
    execute 'grant execute on function public.credit_cryptobot_deposit(bigint,text) to service_role';
  end if;
  if to_regprocedure('public.spend_referral_balance(bigint,bigint,bigint,integer)') is not null then
    execute 'revoke execute on function public.spend_referral_balance(bigint,bigint,bigint,integer) from public, anon, authenticated';
    execute 'grant execute on function public.spend_referral_balance(bigint,bigint,bigint,integer) to service_role';
  end if;
  if to_regprocedure('public.convert_referrals_to_wallet(bigint,integer,numeric)') is not null then
    execute 'revoke execute on function public.convert_referrals_to_wallet(bigint,integer,numeric) from public, anon, authenticated';
    execute 'grant execute on function public.convert_referrals_to_wallet(bigint,integer,numeric) to service_role';
  end if;
end
$$;
