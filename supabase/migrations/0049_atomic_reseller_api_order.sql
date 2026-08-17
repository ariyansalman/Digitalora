-- 0049_atomic_reseller_api_order.sql
-- Make reseller API fulfillment a single database transaction.
-- Forward-only migration.

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
         where id = p_api_key_id
           and user_id = p_user_id
           and active = true
           and revoked_at is null
    ) then
        raise exception 'INVALID_API_KEY';
    end if;

    -- Serialize wallet-funded API orders for the same user. This also makes
    -- concurrent request_id checks deterministic before any side effect.
    perform 1 from public.users where telegram_id = p_user_id for update;
    if not found then raise exception 'USER_NOT_FOUND'; end if;

    if p_request_id is not null and trim(p_request_id) <> '' then
        select r.id, r.order_id, r.product_id, r.qty, r.total
          into v_existing
          from public.reseller_api_orders r
         where r.user_id = p_user_id
           and r.request_id = trim(p_request_id)
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
                'duplicate', true,
                'order_id', v_order_id,
                'created_at', v_created_at,
                'balance_after', v_balance,
                'product_id', v_existing.product_id,
                'product_name', v_product_name,
                'qty', v_existing.qty,
                'unit_price', v_unit_price,
                'discount', coalesce(v_existing_discount, 0),
                'total', v_existing_total,
                'items', to_jsonb(coalesce(v_items, '{}'::text[]))
            );
        end if;
    end if;

    select p.name, p.price, p.stock, p.unlimited_stock
      into v_product_name, v_unit_price, v_stock, v_unlimited
      from public.products p
     where p.id = p_product_id
       and p.active = true
     for update;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

    if not coalesce(v_unlimited, false) and coalesce(v_stock, 0) < p_qty then
        raise exception 'OUT_OF_STOCK';
    end if;

    select count(*) into v_available
      from public.product_items pi
     where pi.product_id = p_product_id
       and pi.consumed_at is null;
    if v_available < p_qty then
        raise exception 'DELIVERY_NOT_READY';
    end if;

    -- Create the order before assigning product items so the item rows can
    -- carry the final order id. All following operations remain in this
    -- single database transaction.
    insert into public.orders(
        user_id, product_id, product_name, qty, unit_price, total,
        discount, promo_id, delivery, status
    ) values (
        p_user_id, p_product_id, v_product_name, p_qty, v_unit_price,
        p_total, p_discount, p_promo_id, 'API order', 'paid'
    ) returning id, created_at into v_order_id, v_created_at;

    -- Claim again now that the order id exists. The first CTE above intentionally
    -- only validated availability while holding row locks; the transaction lock
    -- on the product keeps concurrent API orders from racing this section.
    with picked as (
        select pi.id
          from public.product_items pi
         where pi.product_id = p_product_id
           and pi.consumed_at is null
         order by pi.id
         limit p_qty
         for update skip locked
    ), claimed as (
        update public.product_items pi
           set consumed_at = now(), consumed_order_id = v_order_id
          from picked
         where pi.id = picked.id
        returning pi.id, pi.payload
    )
    select coalesce(array_agg(c.payload order by c.id), '{}'::text[])
      into v_items
      from claimed c;

    if coalesce(array_length(v_items, 1), 0) <> p_qty then
        raise exception 'DELIVERY_RACE';
    end if;

    if not coalesce(v_unlimited, false) then
        update public.products
           set stock = stock - p_qty
         where id = p_product_id
           and stock >= p_qty
        returning stock into v_stock;
        if not found then raise exception 'OUT_OF_STOCK'; end if;
    end if;

    -- The wallet row is already locked above, so this debit cannot be raced by
    -- another wallet-funded API order for the same user.
    update public.users
       set balance = coalesce(balance, 0) - p_total
     where telegram_id = p_user_id
       and coalesce(balance, 0) >= p_total
     returning balance into v_balance;
    if not found then raise exception 'INSUFFICIENT_FUNDS'; end if;

    insert into public.wallet_ledger(user_id, type, amount, reference)
    values (p_user_id, 'wallet_purchase', -p_total, 'api_order:' || v_order_id);

    update public.orders
       set delivery = 'API order', delivered_items = array_to_string(v_items, E'\n')
     where id = v_order_id;

    insert into public.reseller_api_orders(
        user_id, api_key_id, order_id, product_id, qty, total, request_id
    ) values (
        p_user_id, p_api_key_id, v_order_id, p_product_id, p_qty, p_total,
        nullif(trim(p_request_id), '')
    );

    return jsonb_build_object(
        'duplicate', false,
        'order_id', v_order_id,
        'created_at', v_created_at,
        'balance_after', v_balance,
        'product_id', p_product_id,
        'product_name', v_product_name,
        'qty', p_qty,
        'unit_price', v_unit_price,
        'discount', p_discount,
        'total', p_total,
        'items', to_jsonb(v_items)
    );
exception
    when unique_violation then
        -- This is primarily defensive. The per-user lock above normally makes
        -- concurrent request_id attempts serialize before this point.
        if p_request_id is not null and trim(p_request_id) <> '' then
            select r.order_id, r.product_id, r.qty, r.total
              into v_existing
              from public.reseller_api_orders r
             where r.user_id = p_user_id
               and r.request_id = trim(p_request_id)
             limit 1;
            if found then
                select o.created_at, u.balance, o.product_name, o.unit_price,
                       o.discount, o.total
                  into v_created_at, v_balance, v_product_name, v_unit_price,
                       v_existing_discount, v_existing_total
                  from public.orders o
                  join public.users u on u.telegram_id = p_user_id
                 where o.id = v_existing.order_id;
                select coalesce(array_agg(pi.payload order by pi.id), '{}'::text[])
                  into v_items
                  from public.product_items pi
                 where pi.consumed_order_id = v_existing.order_id;
                return jsonb_build_object(
                    'duplicate', true,
                    'order_id', v_existing.order_id,
                    'created_at', v_created_at,
                    'balance_after', v_balance,
                    'product_id', v_existing.product_id,
                    'product_name', v_product_name,
                    'qty', v_existing.qty,
                    'unit_price', v_unit_price,
                    'discount', coalesce(v_existing_discount, 0),
                    'total', v_existing_total,
                    'items', to_jsonb(coalesce(v_items, '{}'::text[]))
                );
            end if;
        end if;
        raise;
end;
$$;

revoke execute on function public.place_reseller_api_order_atomic(bigint,bigint,bigint,integer,numeric,numeric,bigint,text) from public, anon, authenticated;
grant execute on function public.place_reseller_api_order_atomic(bigint,bigint,bigint,integer,numeric,numeric,bigint,text) to service_role;
