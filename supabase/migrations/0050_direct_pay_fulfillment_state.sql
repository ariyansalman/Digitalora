-- 0050_direct_pay_fulfillment_state.sql
-- Durable/idempotent state for per-order direct-pay fulfilment.
-- External supplier calls remain outside the DB transaction, but are keyed by
-- the stable local order id so retries can be safely replayed by providers
-- that honor Idempotency-Key.

create table if not exists public.direct_pay_fulfillments (
    deposit_id bigint primary key references public.deposits(id) on delete cascade,
    user_id bigint not null references public.users(telegram_id) on delete cascade,
    order_id bigint references public.orders(id) on delete set null,
    status text not null check (status in ('processing','completed','refunded','failed')),
    last_error text,
    started_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    completed_at timestamptz
);

create index if not exists direct_pay_fulfillments_status_idx
    on public.direct_pay_fulfillments(status, updated_at);

create or replace function public.begin_direct_pay_fulfillment(p_deposit_id bigint)
returns table (
    should_process boolean,
    status text,
    order_id bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id bigint;
    v_status text;
    v_order_id bigint;
    v_updated_at timestamptz;
begin
    select d.user_id into v_user_id
      from public.deposits d
     where d.id = p_deposit_id
     for update;
    if not found then raise exception 'DEPOSIT_NOT_FOUND'; end if;

    select f.status, f.order_id, f.updated_at
      into v_status, v_order_id, v_updated_at
      from public.direct_pay_fulfillments f
     where f.deposit_id = p_deposit_id
     for update;

    if found then
        if v_status = 'completed' or v_status = 'refunded' then
            return query select false, v_status, v_order_id;
            return;
        end if;
        if v_status = 'processing' and v_updated_at > now() - interval '10 minutes' then
            return query select false, v_status, v_order_id;
            return;
        end if;

        update public.direct_pay_fulfillments
           set status = 'processing',
               updated_at = now(),
               last_error = null
         where deposit_id = p_deposit_id;
        return query select true, 'processing'::text, v_order_id;
        return;
    end if;

    insert into public.direct_pay_fulfillments(deposit_id, user_id, status)
    values (p_deposit_id, v_user_id, 'processing');

    return query select true, 'processing'::text, null::bigint;
end;
$$;

create or replace function public.set_direct_pay_fulfillment_order(
    p_deposit_id bigint,
    p_order_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.direct_pay_fulfillments
       set order_id = p_order_id,
           updated_at = now()
     where deposit_id = p_deposit_id
       and status = 'processing';
    return found;
end;
$$;

create or replace function public.finish_direct_pay_fulfillment(
    p_deposit_id bigint,
    p_status text,
    p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_status not in ('completed','refunded','failed') then
        raise exception 'INVALID_FULFILLMENT_STATUS';
    end if;
    update public.direct_pay_fulfillments
       set status = p_status,
           last_error = left(p_error, 2000),
           updated_at = now(),
           completed_at = case when p_status in ('completed','refunded') then now() else null end
     where deposit_id = p_deposit_id;
    return found;
end;
$$;

revoke execute on function public.begin_direct_pay_fulfillment(bigint) from public, anon, authenticated;
revoke execute on function public.set_direct_pay_fulfillment_order(bigint,bigint) from public, anon, authenticated;
revoke execute on function public.finish_direct_pay_fulfillment(bigint,text,text) from public, anon, authenticated;
grant execute on function public.begin_direct_pay_fulfillment(bigint) to service_role;
grant execute on function public.set_direct_pay_fulfillment_order(bigint,bigint) to service_role;
grant execute on function public.finish_direct_pay_fulfillment(bigint,text,text) to service_role;
