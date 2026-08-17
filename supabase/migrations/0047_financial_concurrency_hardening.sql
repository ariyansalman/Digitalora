-- 0047_financial_concurrency_hardening.sql
-- Atomic wallet, deposit, stock and product-item operations.
-- Forward-only migration; do not edit previously applied migrations.



create or replace function public.wallet_apply_atomic(
    p_telegram_id bigint,
    p_delta numeric,
    p_type text,
    p_reference text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
    v_balance numeric;
begin
    if p_delta is null or p_delta = 0 then raise exception 'INVALID_WALLET_DELTA'; end if;
    if p_type is null or trim(p_type) = '' then raise exception 'INVALID_LEDGER_TYPE'; end if;

    update public.users
       set balance = coalesce(balance, 0) + p_delta
     where telegram_id = p_telegram_id
       and (p_delta >= 0 or coalesce(balance, 0) + p_delta >= 0)
     returning balance into v_balance;

    if not found then
        if exists (select 1 from public.users where telegram_id = p_telegram_id) then
            raise exception 'INSUFFICIENT_FUNDS';
        end if;
        raise exception 'USER_NOT_FOUND';
    end if;

    insert into public.wallet_ledger(user_id, type, amount, reference)
    values (p_telegram_id, p_type, p_delta, p_reference);

    return v_balance;
end;
$$;

create or replace function public.restore_product_stock_atomic(
    p_product_id bigint,
    p_qty integer
)
returns table (success boolean, old_stock integer, new_stock integer)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_old_stock integer;
    v_unlimited boolean;
begin
    if p_qty is null or p_qty <= 0 then raise exception 'INVALID_STOCK_QUANTITY'; end if;
    select stock, unlimited_stock into v_old_stock, v_unlimited
      from public.products where id = p_product_id for update;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    if coalesce(v_unlimited, false) then
        return query select true, v_old_stock, v_old_stock;
        return;
    end if;
    update public.products set stock = stock + p_qty where id = p_product_id;
    return query select true, v_old_stock, v_old_stock + p_qty;
end;
$$;

create or replace function public.adjust_wallet_atomic(
    p_telegram_id bigint,
    p_delta numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
    v_balance numeric;
begin
    if p_delta is null or p_delta = 0 then
        select balance into v_balance from public.users where telegram_id = p_telegram_id;
        if not found then raise exception 'USER_NOT_FOUND'; end if;
        return v_balance;
    end if;

    update public.users
       set balance = coalesce(balance, 0) + p_delta
     where telegram_id = p_telegram_id
       and (p_delta >= 0 or coalesce(balance, 0) + p_delta >= 0)
     returning balance into v_balance;

    if not found then
        if exists (select 1 from public.users where telegram_id = p_telegram_id) then
            raise exception 'INSUFFICIENT_FUNDS';
        end if;
        raise exception 'USER_NOT_FOUND';
    end if;
    return v_balance;
end;
$$;

create or replace function public.approve_deposit_atomic(
    p_deposit_id bigint,
    p_tx_hash text,
    p_amount numeric
)
returns table (
    approved boolean,
    user_id bigint,
    amount numeric,
    new_balance numeric,
    is_direct boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id bigint;
    v_amount numeric;
    v_balance numeric;
    v_direct boolean;
begin
    if p_amount is null or p_amount <= 0 then raise exception 'INVALID_DEPOSIT_AMOUNT'; end if;
    if nullif(trim(p_tx_hash), '') is null then raise exception 'INVALID_TX_HASH'; end if;

    if exists (select 1 from public.deposits where tx_hash = p_tx_hash and id <> p_deposit_id) then
        raise exception 'TX_ALREADY_USED';
    end if;

    update public.deposits as d
       set amount = p_amount,
           status = 'approved',
           tx_hash = p_tx_hash,
           updated_at = now()
     where d.id = p_deposit_id
       and d.status = 'pending'
    returning d.user_id, d.amount, (d.order_intent is not null)
      into v_user_id, v_amount, v_direct;

    if not found then
        return query
            select false::boolean,
                   null::bigint,
                   null::numeric,
                   null::numeric,
                   false::boolean;
        return;
    end if;

    if v_direct then
        return query select true, v_user_id, v_amount, null::numeric, true;
        return;
    end if;

    update public.users
       set balance = coalesce(balance, 0) + v_amount
     where telegram_id = v_user_id
     returning balance into v_balance;

    if not found then raise exception 'USER_NOT_FOUND'; end if;

    insert into public.wallet_ledger(user_id, type, amount, reference)
    values (v_user_id, 'deposit_credit', v_amount, p_tx_hash);

    return query select true, v_user_id, v_amount, v_balance, false;
end;
$$;

create or replace function public.claim_product_items_atomic(
    p_product_id bigint,
    p_qty integer,
    p_order_id bigint
)
returns table (payload text)
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_qty is null or p_qty <= 0 then return; end if;
    return query
    with picked as (
        select pi.id, pi.payload
          from public.product_items pi
         where pi.product_id = p_product_id
           and pi.consumed_at is null
         order by pi.id
         limit p_qty
         for update skip locked
    ), claimed as (
        update public.product_items pi
           set consumed_at = now(),
               consumed_order_id = p_order_id
          from picked
         where pi.id = picked.id
        returning picked.payload
    )
    select claimed.payload::text from claimed;
end;
$$;

drop function if exists public.decrement_product_stock_atomic(bigint, integer);

create or replace function public.decrement_product_stock_atomic(
    p_product_id bigint,
    p_qty integer
)
returns table (success boolean, old_stock integer, new_stock integer)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_unlimited boolean;
    v_old_stock integer;
    v_new_stock integer;
begin
    if p_qty is null or p_qty <= 0 then raise exception 'INVALID_STOCK_QUANTITY'; end if;
    select unlimited_stock, stock into v_unlimited, v_old_stock
      from public.products where id = p_product_id for update;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    if coalesce(v_unlimited, false) then
        return query select true, v_old_stock, v_old_stock;
        return;
    end if;
    if coalesce(v_old_stock, 0) < p_qty then
        return query select false, v_old_stock, v_old_stock;
        return;
    end if;
    v_new_stock := v_old_stock - p_qty;
    update public.products set stock = v_new_stock where id = p_product_id;
    return query select true, v_old_stock, v_new_stock;
end;
$$;
