-- 0051_atomic_direct_pay_order.sql
-- Atomically create the direct-pay order and attach it to the durable
-- fulfilment record. This closes the crash window between createOrder()
-- and setDirectPayFulfillmentOrder().

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
    v_guard_status text;
    v_guard_order_id bigint;
    v_deposit_user bigint;
begin
    if p_deposit_id is null or p_deposit_id <= 0 then raise exception 'INVALID_DEPOSIT'; end if;
    if p_user_id is null or p_user_id <= 0 then raise exception 'INVALID_USER'; end if;
    if p_product_id is null or p_product_id <= 0 then raise exception 'INVALID_PRODUCT'; end if;
    if p_qty is null or p_qty <= 0 then raise exception 'INVALID_QUANTITY'; end if;
    if p_unit_price is null or p_unit_price < 0 then raise exception 'INVALID_UNIT_PRICE'; end if;
    if p_total is null or p_total < 0 then raise exception 'INVALID_TOTAL'; end if;
    if p_discount is null or p_discount < 0 then raise exception 'INVALID_DISCOUNT'; end if;

    select d.user_id
      into v_deposit_user
      from public.deposits d
     where d.id = p_deposit_id
     for update;
    if not found then raise exception 'DEPOSIT_NOT_FOUND'; end if;
    if v_deposit_user <> p_user_id then raise exception 'DEPOSIT_USER_MISMATCH'; end if;

    select f.status, f.order_id
      into v_guard_status, v_guard_order_id
      from public.direct_pay_fulfillments f
     where f.deposit_id = p_deposit_id
     for update;
    if not found then raise exception 'FULFILLMENT_GUARD_NOT_FOUND'; end if;

    if v_guard_order_id is not null then
        select * into v_order from public.orders where id = v_guard_order_id;
        if found then return v_order; end if;
        raise exception 'FULFILLMENT_ORDER_MISSING';
    end if;

    if v_guard_status <> 'processing' then
        raise exception 'FULFILLMENT_NOT_PROCESSING';
    end if;

    insert into public.orders(
        user_id, product_id, product_name, qty, unit_price, total,
        discount, promo_id, delivery, status
    ) values (
        p_user_id, p_product_id, p_product_name, p_qty, p_unit_price,
        p_total, p_discount, p_promo_id, p_delivery, 'paid'
    ) returning * into v_order;

    update public.direct_pay_fulfillments
       set order_id = v_order.id,
           updated_at = now()
     where deposit_id = p_deposit_id;

    return v_order;
end;
$$;

revoke execute on function public.create_direct_pay_order_atomic(bigint,bigint,bigint,text,integer,numeric,numeric,numeric,bigint,text) from public, anon, authenticated;
grant execute on function public.create_direct_pay_order_atomic(bigint,bigint,bigint,text,integer,numeric,numeric,numeric,bigint,text) to service_role;
