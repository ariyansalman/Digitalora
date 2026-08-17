-- =====================================================================
-- 0060_order_lifecycle.sql
-- Professional order lifecycle. Additive + backward compatible.
--
--   • widens orders.status to the full lifecycle while KEEPING the
--     legacy values 'paid' / 'refunded' / 'cancelled' valid and the
--     legacy default ('paid') unchanged, so existing rows and every
--     existing insert path keep working untouched.
--   • adds explicit payment / fulfilment / delivery facets plus a
--     credential-free supplier state.
--   • adds an append-only audit trail (order_status_events).
--   • adds set_order_lifecycle() which validates every transition
--     server-side, so no code path can force an illegal state.
-- =====================================================================

-- ---------------------------------------------------------------
-- 1. Widen the status domain (backward compatible)
-- ---------------------------------------------------------------
alter table public.orders
    drop constraint if exists orders_status_check;

alter table public.orders
    add constraint orders_status_check
    check (status in (
        'pending',
        'payment_processing',
        'paid',            -- legacy
        'processing',
        'delivered',
        'completed',
        'cancelled',       -- legacy
        'failed',
        'refunded'         -- legacy
    ));

-- ---------------------------------------------------------------
-- 2. Lifecycle facets
-- ---------------------------------------------------------------
alter table public.orders
    add column if not exists payment_status     text,
    add column if not exists fulfillment_status text,
    add column if not exists delivery_status    text,
    -- Coarse, sanitized supplier state ONLY (Queued / Processing /
    -- Completed / Failed / …). Never store supplier keys, endpoints,
    -- raw responses or account data here.
    add column if not exists supplier_status    text,
    add column if not exists status_note        text,
    add column if not exists status_updated_at  timestamptz;

alter table public.orders
    drop constraint if exists orders_payment_status_check;
alter table public.orders
    add constraint orders_payment_status_check
    check (payment_status is null or payment_status in
        ('unpaid','processing','paid','refunded','failed','cancelled'));

alter table public.orders
    drop constraint if exists orders_fulfillment_status_check;
alter table public.orders
    add constraint orders_fulfillment_status_check
    check (fulfillment_status is null or fulfillment_status in
        ('not_started','in_progress','fulfilled','failed','cancelled'));

alter table public.orders
    drop constraint if exists orders_delivery_status_check;
alter table public.orders
    add constraint orders_delivery_status_check
    check (delivery_status is null or delivery_status in
        ('pending','processing','delivered','failed','cancelled'));

alter table public.orders
    drop constraint if exists orders_supplier_status_check;
alter table public.orders
    add constraint orders_supplier_status_check
    check (supplier_status is null or supplier_status in
        ('Queued','Processing','Partially delivered','Completed','Cancelled','Refunded','Failed'));

create index if not exists orders_status_idx
    on public.orders (status, created_at desc);

-- NOTE: facet columns are intentionally left NULL for pre-existing
-- rows. The application derives them from `status` when they are NULL
-- (see src/core/orderLifecycle.ts), which keeps historic orders
-- rendering exactly as before instead of rewriting paid history.

-- ---------------------------------------------------------------
-- 3. Audit trail
-- ---------------------------------------------------------------
create table if not exists public.order_status_events (
    id          bigserial primary key,
    order_id    bigint not null references public.orders(id) on delete cascade,
    from_status text,
    to_status   text not null,
    actor       text not null default 'system'
                check (actor in ('system','admin','user','supplier')),
    actor_id    bigint,
    note        text,
    created_at  timestamptz not null default now()
);

create index if not exists order_status_events_order_idx
    on public.order_status_events (order_id, created_at desc);

grant select, insert on public.order_status_events to service_role;
grant usage, select on sequence public.order_status_events_id_seq to service_role;
grant all on public.order_status_events to service_role;

alter table public.order_status_events enable row level security;

-- No anon / authenticated grants: the bot reaches this table with the
-- service role only, exactly like public.orders.

-- ---------------------------------------------------------------
-- 4. Transition guard
-- ---------------------------------------------------------------
create or replace function public.order_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
    select case
        when p_to is null then false
        when p_from is null then true
        when p_from = p_to then true
        when p_from = 'pending'            then p_to in ('payment_processing','paid','cancelled','failed')
        when p_from = 'payment_processing' then p_to in ('paid','failed','cancelled')
        when p_from = 'paid'               then p_to in ('processing','delivered','completed','failed','cancelled','refunded')
        when p_from = 'processing'         then p_to in ('delivered','completed','failed','refunded')
        when p_from = 'delivered'          then p_to in ('completed','refunded')
        when p_from = 'completed'          then p_to in ('refunded')
        when p_from = 'cancelled'          then p_to in ('refunded')
        when p_from = 'failed'             then p_to in ('processing','cancelled','refunded')
        when p_from = 'refunded'           then false
        else false
    end;
$$;

-- ---------------------------------------------------------------
-- 5. set_order_lifecycle — the only sanctioned status writer.
--
-- Raises ORDER_NOT_FOUND / ORDER_INVALID_TRANSITION so callers can
-- surface a precise message instead of silently no-op'ing.
-- ---------------------------------------------------------------
create or replace function public.set_order_lifecycle(
    p_order_id           bigint,
    p_status             text,
    p_payment_status     text default null,
    p_fulfillment_status text default null,
    p_delivery_status    text default null,
    p_supplier_status    text default null,
    p_actor              text default 'system',
    p_actor_id           bigint default null,
    p_note               text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
    v_order public.orders;
    v_from  text;
begin
    select * into v_order from public.orders where id = p_order_id for update;
    if not found then
        raise exception 'ORDER_NOT_FOUND';
    end if;

    v_from := v_order.status;

    if not public.order_transition_allowed(v_from, p_status) then
        raise exception 'ORDER_INVALID_TRANSITION:% -> %', v_from, p_status;
    end if;

    update public.orders
       set status             = p_status,
           payment_status     = coalesce(p_payment_status, payment_status),
           fulfillment_status = coalesce(p_fulfillment_status, fulfillment_status),
           delivery_status    = coalesce(p_delivery_status, delivery_status),
           supplier_status    = coalesce(p_supplier_status, supplier_status),
           status_note        = left(p_note, 500),
           status_updated_at  = now()
     where id = p_order_id
    returning * into v_order;

    insert into public.order_status_events(order_id, from_status, to_status, actor, actor_id, note)
    values (p_order_id, v_from, p_status,
            coalesce(p_actor, 'system'), p_actor_id, left(p_note, 500));

    return v_order;
end;
$$;

revoke execute on function public.set_order_lifecycle(bigint,text,text,text,text,text,text,bigint,text)
    from public, anon, authenticated;
grant execute on function public.set_order_lifecycle(bigint,text,text,text,text,text,text,bigint,text)
    to service_role;
