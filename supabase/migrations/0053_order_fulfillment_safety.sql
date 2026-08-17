-- 0053_order_fulfillment_safety.sql
-- Safe recovery primitives for order fulfilment failures.
-- Forward-only migration.

create or replace function public.release_product_items_for_order(p_order_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_order_id is null or p_order_id <= 0 then
    raise exception 'INVALID_ORDER_ID';
  end if;

  update public.product_items
     set consumed_at = null,
         consumed_order_id = null
   where consumed_order_id = p_order_id
     and consumed_at is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.release_product_items_for_order(bigint) from public, anon, authenticated;
grant execute on function public.release_product_items_for_order(bigint) to service_role;

create or replace function public.refund_wallet_once(
  p_user_id bigint,
  p_amount numeric,
  p_reference text
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
begin
  if p_user_id is null or p_user_id <= 0 then raise exception 'INVALID_USER'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_REFUND_AMOUNT'; end if;
  if p_reference is null or trim(p_reference) = '' then raise exception 'INVALID_REFUND_REFERENCE'; end if;

  perform 1 from public.users where telegram_id = p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;

  if exists (
    select 1 from public.wallet_ledger
     where user_id = p_user_id and reference = p_reference
  ) then
    select balance into v_balance from public.users where telegram_id = p_user_id;
    return v_balance;
  end if;

  update public.users
     set balance = coalesce(balance, 0) + p_amount
   where telegram_id = p_user_id
   returning balance into v_balance;

  insert into public.wallet_ledger(user_id, type, amount, reference)
  values (p_user_id, 'delivery_refund', p_amount, p_reference);

  return v_balance;
end;
$$;

revoke execute on function public.refund_wallet_once(bigint,numeric,text) from public, anon, authenticated;
grant execute on function public.refund_wallet_once(bigint,numeric,text) to service_role;
