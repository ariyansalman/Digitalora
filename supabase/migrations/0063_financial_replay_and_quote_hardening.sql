-- 0063_financial_replay_and_quote_hardening.sql
-- Forward-only financial hardening. Apply after 0062.

do $$
begin
    if exists (
        select 1
          from public.wallet_ledger
         where reference is not null
         group by user_id, reference
        having count(*) > 1
    ) then
        raise exception 'DUPLICATE_WALLET_REFERENCES_REQUIRE_RECONCILIATION';
    end if;
end
$$;

create unique index if not exists wallet_ledger_user_reference_uidx
    on public.wallet_ledger(user_id, reference)
    where reference is not null;

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
    v_old_user bigint;
    v_old_type text;
    v_old_amount numeric;
    v_ref text := nullif(trim(p_reference), '');
begin
    if p_delta is null or p_delta = 0 then raise exception 'INVALID_WALLET_DELTA'; end if;
    if p_type is null or trim(p_type) = '' then raise exception 'INVALID_LEDGER_TYPE'; end if;

    perform 1 from public.users where telegram_id = p_telegram_id for update;
    if not found then raise exception 'USER_NOT_FOUND'; end if;

    if v_ref is not null then
        select user_id, type, amount
          into v_old_user, v_old_type, v_old_amount
          from public.wallet_ledger
         where user_id = p_telegram_id
           and reference = v_ref
         limit 1;
        if found then
            if v_old_user <> p_telegram_id
               or v_old_type <> p_type
               or v_old_amount <> p_delta then
                raise exception 'WALLET_REFERENCE_CONFLICT';
            end if;
            select balance into v_balance
              from public.users
             where telegram_id = p_telegram_id;
            return v_balance;
        end if;
    end if;

    update public.users
       set balance = coalesce(balance, 0) + p_delta
     where telegram_id = p_telegram_id
       and (p_delta >= 0 or coalesce(balance, 0) + p_delta >= 0)
     returning balance into v_balance;
    if not found then raise exception 'INSUFFICIENT_FUNDS'; end if;

    insert into public.wallet_ledger(user_id, type, amount, reference)
    values (p_telegram_id, p_type, p_delta, v_ref);
    return v_balance;
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
    return public.wallet_apply_atomic(
        p_telegram_id, p_delta, 'wallet_adjustment', null
    );
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
       set amount = p_amount, status = 'approved', tx_hash = p_tx_hash, updated_at = now()
     where d.id = p_deposit_id and d.status = 'pending'
    returning d.user_id, d.amount, (d.order_intent is not null)
      into v_user_id, v_amount, v_direct;
    if not found then
        return query select false, null::bigint, null::numeric, null::numeric, false;
        return;
    end if;

    if v_direct then
        return query select true, v_user_id, v_amount, null::numeric, true;
        return;
    end if;

    v_balance := public.wallet_apply_atomic(
        v_user_id, v_amount, 'deposit_credit', p_tx_hash
    );
    return query select true, v_user_id, v_amount, v_balance, false;
end;
$$;

create or replace function public.convert_referrals_to_wallet(
    p_user_id bigint,
    p_referral_cost int default 20,
    p_usdt_amount numeric default 1.00
)
returns table (
    total_referrals int,
    spent_referrals int,
    available_referrals int,
    converted_amount numeric,
    new_balance numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_total int;
    v_spent int;
    v_new_balance numeric;
    v_conversion_id bigint;
begin
    if p_referral_cost <= 0 or p_usdt_amount <= 0 then
        raise exception 'INVALID_REFERRAL_CONVERSION';
    end if;
    perform pg_advisory_xact_lock(p_user_id);

    select greatest(
        0,
        (select count(*)::int from public.referrals where referrer_id = p_user_id)
        + coalesce((select sum(delta) from public.referral_adjustments where user_id = p_user_id), 0)::int
    ) into v_total;
    select coalesce((select sum(referral_cost) from public.referral_redemptions where user_id = p_user_id), 0)::int
         + coalesce((select sum(refs_spent) from public.referral_conversions where user_id = p_user_id), 0)::int
      into v_spent;
    if v_total - v_spent < p_referral_cost then raise exception 'INSUFFICIENT_REFERRALS'; end if;

    insert into public.referral_conversions(user_id, refs_spent, amount)
    values (p_user_id, p_referral_cost, p_usdt_amount)
    returning id into v_conversion_id;

    v_new_balance := public.wallet_apply_atomic(
        p_user_id,
        p_usdt_amount,
        'referral_conversion',
        'referral_conversion:' || v_conversion_id
    );
    return query select v_total, v_spent + p_referral_cost,
        v_total - v_spent - p_referral_cost, p_usdt_amount, v_new_balance;
end;
$$;

create or replace function public.create_direct_pay_order_atomic(
    p_deposit_id bigint,
    p_user_id bigint,
    p_product_id bigint,
    p_product_name text,
    p_qty integer,
    p_unit_price numeric,
    p_total numeric,
    p_discount numeric default 0,
    p_promo_id bigint default null,
    p_delivery text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
    v_order public.orders;
    v_guard_order_id bigint;
    v_guard_status text;
    v_deposit_user bigint;
    v_deposit_amount numeric;
    v_deposit_status text;
    v_intent jsonb;
begin
    if p_qty is null or p_qty <= 0 then raise exception 'INVALID_QUANTITY'; end if;
    if p_unit_price is null or p_unit_price < 0 then raise exception 'INVALID_UNIT_PRICE'; end if;
    if p_total is null or p_total < 0 then raise exception 'INVALID_TOTAL'; end if;
    if p_discount is null or p_discount < 0 then raise exception 'INVALID_DISCOUNT'; end if;

    select d.user_id, d.amount, d.status, d.order_intent
      into v_deposit_user, v_deposit_amount, v_deposit_status, v_intent
      from public.deposits d where d.id = p_deposit_id for update;
    if not found then raise exception 'DEPOSIT_NOT_FOUND'; end if;
    if v_deposit_user <> p_user_id then raise exception 'DEPOSIT_USER_MISMATCH'; end if;
    if v_deposit_status <> 'approved' then raise exception 'DEPOSIT_NOT_APPROVED'; end if;
    if v_intent is null then raise exception 'DIRECT_PAY_INTENT_MISSING'; end if;
    if (v_intent->>'product_id')::bigint <> p_product_id
       or (v_intent->>'qty')::integer <> p_qty
       or (v_intent->>'product_name') <> p_product_name
       or (v_intent->>'unit_price')::numeric <> p_unit_price
       or (v_intent->>'discount')::numeric <> p_discount
       or (v_intent->>'total')::numeric <> p_total
       or coalesce((v_intent->>'promo_id')::bigint, null) is distinct from p_promo_id
       or v_deposit_amount <> p_total then
        raise exception 'DIRECT_PAY_INTENT_MISMATCH';
    end if;

    select f.status, f.order_id into v_guard_status, v_guard_order_id
      from public.direct_pay_fulfillments f where f.deposit_id = p_deposit_id for update;
    if not found then raise exception 'FULFILLMENT_GUARD_NOT_FOUND'; end if;
    if v_guard_order_id is not null then
        select * into v_order from public.orders where id = v_guard_order_id;
        if found then return v_order; end if;
        raise exception 'FULFILLMENT_ORDER_MISSING';
    end if;
    if v_guard_status <> 'processing' then raise exception 'FULFILLMENT_NOT_PROCESSING'; end if;

    insert into public.orders(
        user_id, product_id, product_name, qty, unit_price, total,
        discount, promo_id, delivery, status
    ) values (
        p_user_id, p_product_id, p_product_name, p_qty, p_unit_price,
        p_total, p_discount, p_promo_id, p_delivery, 'paid'
    ) returning * into v_order;

    update public.direct_pay_fulfillments
       set order_id = v_order.id, updated_at = now()
     where deposit_id = p_deposit_id and status = 'processing';
    if not found then raise exception 'FULFILLMENT_GUARD_LOST'; end if;
    return v_order;
end;
$$;

create or replace function public.refund_direct_pay_once(
    p_deposit_id bigint,
    p_user_id bigint,
    p_amount numeric,
    p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_status text;
    v_user_id bigint;
    v_balance numeric;
begin
    if p_amount is null or p_amount <= 0 then raise exception 'INVALID_REFUND_AMOUNT'; end if;
    select f.status, d.user_id into v_status, v_user_id
      from public.direct_pay_fulfillments f
      join public.deposits d on d.id = f.deposit_id
     where f.deposit_id = p_deposit_id for update;
    if not found then raise exception 'FULFILLMENT_GUARD_NOT_FOUND'; end if;
    if v_user_id <> p_user_id then raise exception 'REFUND_USER_MISMATCH'; end if;
    if v_status in ('completed', 'refunded') then return false; end if;
    v_balance := public.wallet_apply_atomic(
        p_user_id, p_amount, 'direct_pay_refund', 'direct_pay_refund:' || p_deposit_id
    );
    update public.direct_pay_fulfillments
       set status = 'refunded', last_error = left(p_reason, 2000),
           updated_at = now(), completed_at = now()
     where deposit_id = p_deposit_id;
    return true;
end;
$$;

create or replace function public.place_reseller_api_order_atomic(
    p_user_id bigint,
    p_api_key_id bigint,
    p_product_id bigint,
    p_qty integer,
    p_total numeric,
    p_discount numeric default 0,
    p_promo_id bigint default null,
    p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_order_id bigint;
    v_created_at timestamptz;
    v_balance numeric;
    v_stock integer;
    v_unlimited boolean;
    v_product_name text;
    v_unit_price numeric;
    v_gross numeric;
    v_authoritative_discount numeric := 0;
    v_authoritative_total numeric;
    v_selected_promo bigint;
    v_items text[];
    v_existing record;
    v_existing_discount numeric;
    v_existing_total numeric;
    v_available integer;
begin
    if p_user_id is null or p_user_id <= 0 then raise exception 'INVALID_USER'; end if;
    if p_product_id is null or p_product_id <= 0 then raise exception 'INVALID_PRODUCT'; end if;
    if p_qty is null or p_qty <= 0 then raise exception 'INVALID_QUANTITY'; end if;
    if p_total is null or p_total < 0 then raise exception 'INVALID_TOTAL'; end if;
    if p_discount is null or p_discount < 0 then raise exception 'INVALID_DISCOUNT'; end if;
    if p_api_key_id is null or p_api_key_id <= 0 then raise exception 'INVALID_API_KEY'; end if;
    if not exists (
        select 1 from public.reseller_api_keys
         where id = p_api_key_id and user_id = p_user_id
           and active = true and revoked_at is null
    ) then raise exception 'INVALID_API_KEY'; end if;

    perform 1 from public.users where telegram_id = p_user_id for update;
    if not found then raise exception 'USER_NOT_FOUND'; end if;

    if p_request_id is not null and trim(p_request_id) <> '' then
        select r.order_id, r.product_id, r.qty, r.total
          into v_existing
          from public.reseller_api_orders r
         where r.user_id = p_user_id and r.request_id = trim(p_request_id)
         limit 1;
        if found then
            select o.created_at, u.balance, o.id, o.product_name, o.unit_price,
                   o.discount, o.total
              into v_created_at, v_balance, v_order_id, v_product_name, v_unit_price,
                   v_existing_discount, v_existing_total
              from public.orders o
              join public.users u on u.telegram_id = p_user_id
             where o.id = v_existing.order_id;
            select coalesce(array_agg(pi.payload order by pi.id), '{}'::text[])
              into v_items
              from public.product_items pi
             where pi.consumed_order_id = v_existing.order_id;
            return jsonb_build_object(
                'duplicate', true, 'order_id', v_order_id, 'created_at', v_created_at,
                'balance_after', v_balance, 'product_id', v_existing.product_id,
                'product_name', v_product_name, 'qty', v_existing.qty,
                'unit_price', v_unit_price, 'discount', coalesce(v_existing_discount, 0),
                'total', v_existing_total, 'items', to_jsonb(coalesce(v_items, '{}'::text[]))
            );
        end if;
    end if;

    select p.name, coalesce(upo.price, p.price), p.stock, p.unlimited_stock
      into v_product_name, v_unit_price, v_stock, v_unlimited
      from public.products p
      left join public.user_price_overrides upo
        on upo.product_id = p.id and upo.telegram_id = p_user_id
     where p.id = p_product_id and p.active = true
     for update of p;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
    if not coalesce(v_unlimited, false) and coalesce(v_stock, 0) < p_qty then
        raise exception 'OUT_OF_STOCK';
    end if;

    select count(*) into v_available
      from public.product_items pi
     where pi.product_id = p_product_id and pi.consumed_at is null;
    if v_available < p_qty then raise exception 'DELIVERY_NOT_READY'; end if;

    select pr.id, least(pr.discount_amount, round(v_unit_price * p_qty, 2))
      into v_selected_promo, v_authoritative_discount
      from public.promos pr
     where pr.active = true
       and pr.min_qty <= p_qty
       and (pr.telegram_id is null or pr.telegram_id = p_user_id)
       and (pr.product_id is null or pr.product_id = p_product_id)
       and not (p_user_id = any(coalesce(pr.excluded_telegram_ids, '{}'::bigint[])))
     order by
       ((pr.telegram_id is not null)::int + (pr.product_id is not null)::int) desc,
       pr.discount_amount desc, pr.id desc
     limit 1;
    v_gross := round(v_unit_price * p_qty, 2);
    v_authoritative_discount := least(coalesce(v_authoritative_discount, 0), v_gross);
    v_authoritative_total := round(v_gross - v_authoritative_discount, 2);

    insert into public.orders(
        user_id, product_id, product_name, qty, unit_price, total,
        discount, promo_id, delivery, status
    ) values (
        p_user_id, p_product_id, v_product_name, p_qty, v_unit_price,
        v_authoritative_total, v_authoritative_discount, v_selected_promo,
        'API order', 'paid'
    ) returning id, created_at into v_order_id, v_created_at;

    with picked as (
        select pi.id from public.product_items pi
         where pi.product_id = p_product_id and pi.consumed_at is null
         order by pi.id limit p_qty for update skip locked
    ), claimed as (
        update public.product_items pi
           set consumed_at = now(), consumed_order_id = v_order_id
          from picked where pi.id = picked.id
        returning pi.id, pi.payload
    )
    select coalesce(array_agg(c.payload order by c.id), '{}'::text[])
      into v_items from claimed c;
    if coalesce(array_length(v_items, 1), 0) <> p_qty then raise exception 'DELIVERY_RACE'; end if;

    if not coalesce(v_unlimited, false) then
        update public.products set stock = stock - p_qty
         where id = p_product_id and stock >= p_qty
         returning stock into v_stock;
        if not found then raise exception 'OUT_OF_STOCK'; end if;
    end if;

    v_balance := public.wallet_apply_atomic(
        p_user_id, -v_authoritative_total, 'wallet_purchase', 'api_order:' || v_order_id
    );
    update public.orders
       set delivery = 'API order', delivered_items = array_to_string(v_items, E'\n')
     where id = v_order_id;
    insert into public.reseller_api_orders(
        user_id, api_key_id, order_id, product_id, qty, total, request_id
    ) values (
        p_user_id, p_api_key_id, v_order_id, p_product_id, p_qty,
        v_authoritative_total, nullif(trim(p_request_id), '')
    );
    return jsonb_build_object(
        'duplicate', false, 'order_id', v_order_id, 'created_at', v_created_at,
        'balance_after', v_balance, 'product_id', p_product_id,
        'product_name', v_product_name, 'qty', p_qty, 'unit_price', v_unit_price,
        'discount', v_authoritative_discount, 'total', v_authoritative_total,
        'items', to_jsonb(v_items)
    );
exception
    when unique_violation then
        if p_request_id is not null and trim(p_request_id) <> '' then
            select r.order_id, r.product_id, r.qty, r.total
              into v_existing
              from public.reseller_api_orders r
             where r.user_id = p_user_id and r.request_id = trim(p_request_id)
             limit 1;
            if found then
                select o.created_at, u.balance, o.id, o.product_name, o.unit_price,
                       o.discount, o.total
                  into v_created_at, v_balance, v_order_id, v_product_name, v_unit_price,
                       v_existing_discount, v_existing_total
                  from public.orders o
                  join public.users u on u.telegram_id = p_user_id
                 where o.id = v_existing.order_id;
                select coalesce(array_agg(pi.payload order by pi.id), '{}'::text[])
                  into v_items from public.product_items pi
                 where pi.consumed_order_id = v_existing.order_id;
                return jsonb_build_object(
                    'duplicate', true, 'order_id', v_order_id, 'created_at', v_created_at,
                    'balance_after', v_balance, 'product_id', v_existing.product_id,
                    'product_name', v_product_name, 'qty', v_existing.qty,
                    'unit_price', v_unit_price, 'discount', coalesce(v_existing_discount, 0),
                    'total', v_existing_total, 'items', to_jsonb(coalesce(v_items, '{}'::text[]))
                );
            end if;
        end if;
        raise;
end;
$$;

revoke execute on function public.place_reseller_api_order_atomic(bigint,bigint,bigint,integer,numeric,numeric,bigint,text) from public, anon, authenticated;
grant execute on function public.place_reseller_api_order_atomic(bigint,bigint,bigint,integer,numeric,numeric,bigint,text) to service_role;

revoke execute on function public.wallet_apply_atomic(bigint,numeric,text,text) from public, anon, authenticated;
revoke execute on function public.refund_direct_pay_once(bigint,bigint,numeric,text) from public, anon, authenticated;
grant execute on function public.wallet_apply_atomic(bigint,numeric,text,text) to service_role;
grant execute on function public.refund_direct_pay_once(bigint,bigint,numeric,text) to service_role;