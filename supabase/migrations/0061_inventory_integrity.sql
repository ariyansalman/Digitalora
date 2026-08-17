-- =====================================================================
-- 0061_inventory_integrity.sql
-- Digital inventory integrity under concurrent purchases.
--
-- Additive + backward compatible. Every existing call site keeps
-- working untouched:
--
--   • product_items gains an explicit lifecycle state
--     (available / reserved / consumed / expired) that is DERIVED from
--     the legacy `consumed_at` / `consumed_order_id` columns by a
--     trigger, so any legacy write path (admin tools, older code,
--     release_product_items_for_order) stays correct automatically.
--   • stock_reservations makes "reserve now, deliver later" atomic and
--     crash-safe, replacing the bare decrement/restore pair while
--     KEEPING decrement_product_stock_atomic / restore_product_stock_atomic
--     in place for legacy callers.
--   • claim_product_items_atomic keeps its exact signature and return
--     shape but becomes idempotent per order — a retry, a double tap,
--     or two workers racing on the same order can never hand out two
--     different key sets, and two users can never receive one item.
--   • order_deliveries + begin_order_delivery() give every payment path
--     a single-winner fulfilment guard (no duplicate fulfilment).
--   • products.low_stock_threshold + inventory views/functions power the
--     admin 📦 Available / 🔒 Reserved / ✅ Delivered card.
--
-- No digital payload (key / account / link) is ever written to a log,
-- an event row, a note column or an exception message here.
-- =====================================================================

-- ---------------------------------------------------------------
-- 1. Explicit inventory states on the item pool
-- ---------------------------------------------------------------
alter table public.product_items
    add column if not exists state             text,
    add column if not exists reserved_at       timestamptz,
    add column if not exists reserved_order_id bigint,
    add column if not exists reservation_ref   text,
    add column if not exists reserved_until    timestamptz,
    add column if not exists delivered_at      timestamptz,
    add column if not exists expires_at        timestamptz;

-- Backfill from the legacy truth (consumed_at) before constraining.
update public.product_items
   set state = case when consumed_at is not null then 'consumed' else 'available' end
 where state is null;

alter table public.product_items
    alter column state set default 'available';

alter table public.product_items
    drop constraint if exists product_items_state_check;
alter table public.product_items
    add constraint product_items_state_check
    check (state in ('available', 'reserved', 'consumed', 'expired'));

-- An item may belong to at most one consuming order, and the consumed
-- flags must always travel together — this is the hard guarantee that
-- two users can never be handed the same item.
alter table public.product_items
    drop constraint if exists product_items_consumed_pair_check;
alter table public.product_items
    add constraint product_items_consumed_pair_check
    check (
        (consumed_at is null and consumed_order_id is null)
        or (consumed_at is not null and consumed_order_id is not null)
        -- legacy rows consumed before order ids were recorded
        or (consumed_at is not null and consumed_order_id is null)
    );

create index if not exists product_items_state_idx
    on public.product_items (product_id, state, id);
create index if not exists product_items_available_idx
    on public.product_items (product_id, id)
    where state = 'available';
create index if not exists product_items_order_idx
    on public.product_items (consumed_order_id)
    where consumed_order_id is not null;
create index if not exists product_items_reserved_idx
    on public.product_items (reserved_until)
    where state = 'reserved';

-- Keep `state` and the legacy columns in lockstep, whichever side a
-- writer touches. This is what preserves existing inventory behaviour:
-- old code that only knows `consumed_at` still produces correct states.
create or replace function public.product_items_sync_state()
returns trigger
language plpgsql
as $$
begin
    if new.consumed_at is not null then
        new.state := 'consumed';
        if new.delivered_at is null then
            new.delivered_at := new.consumed_at;
        end if;
        new.reserved_at := null;
        new.reserved_order_id := null;
        new.reservation_ref := null;
        new.reserved_until := null;
    elsif new.state = 'consumed' then
        -- state was set to consumed without the legacy stamp
        new.consumed_at := coalesce(new.consumed_at, now());
    elsif new.state is null then
        new.state := 'available';
    elsif new.state = 'available' then
        new.delivered_at := null;
        new.reserved_at := null;
        new.reserved_order_id := null;
        new.reservation_ref := null;
        new.reserved_until := null;
    end if;
    return new;
end;
$$;

drop trigger if exists product_items_sync_state_trg on public.product_items;
create trigger product_items_sync_state_trg
    before insert or update on public.product_items
    for each row execute function public.product_items_sync_state();

-- ---------------------------------------------------------------
-- 2. Low-stock thresholds
-- ---------------------------------------------------------------
alter table public.products
    add column if not exists low_stock_threshold integer;

alter table public.products
    drop constraint if exists products_low_stock_threshold_check;
alter table public.products
    add constraint products_low_stock_threshold_check
    check (low_stock_threshold is null or low_stock_threshold >= 0);

insert into public.settings (key, value) values
    ('inventory.low_stock_threshold', '5'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------
-- 3. Stock reservations — atomic reserve → commit / release
-- ---------------------------------------------------------------
create table if not exists public.stock_reservations (
    id           bigserial primary key,
    product_id   bigint not null references public.products(id) on delete cascade,
    order_id     bigint,
    qty          integer not null check (qty > 0),
    -- Idempotency key, e.g. 'order:123' or 'deposit:99'. One live
    -- reservation per reference; a retry returns the same row.
    reference    text not null,
    state        text not null default 'active'
                 check (state in ('active', 'committed', 'released', 'expired')),
    unlimited    boolean not null default false,
    expires_at   timestamptz,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create unique index if not exists stock_reservations_reference_key
    on public.stock_reservations (reference);
create index if not exists stock_reservations_product_idx
    on public.stock_reservations (product_id, state);
create index if not exists stock_reservations_expiry_idx
    on public.stock_reservations (expires_at)
    where state = 'active';

drop trigger if exists stock_reservations_touch_updated_at on public.stock_reservations;
create trigger stock_reservations_touch_updated_at
    before update on public.stock_reservations
    for each row execute function public.touch_checkout_updated_at();

-- reserve_product_stock — the single sanctioned way to take stock.
-- Locks the product row, verifies availability, decrements and records
-- the reservation in ONE transaction, so concurrent buyers can never
-- oversell. Idempotent on p_reference. Raises INSUFFICIENT_STOCK.
create or replace function public.reserve_product_stock(
    p_product_id  bigint,
    p_qty         integer,
    p_reference   text,
    p_order_id    bigint default null,
    p_ttl_seconds integer default 900
)
returns public.stock_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
    v_res       public.stock_reservations;
    v_unlimited boolean;
    v_stock     integer;
begin
    if p_product_id is null or p_product_id <= 0 then raise exception 'INVALID_PRODUCT'; end if;
    if p_qty is null or p_qty <= 0 then raise exception 'INVALID_STOCK_QUANTITY'; end if;
    if nullif(btrim(coalesce(p_reference, '')), '') is null then
        raise exception 'INVALID_RESERVATION_REFERENCE';
    end if;

    -- Existing reservation for this reference ⇒ replay, never double-take.
    select * into v_res
      from public.stock_reservations
     where reference = btrim(p_reference)
     for update;
    if found then
        if v_res.state = 'active' and p_order_id is not null and v_res.order_id is null then
            update public.stock_reservations
               set order_id = p_order_id
             where id = v_res.id
            returning * into v_res;
        end if;
        return v_res;
    end if;

    select coalesce(unlimited_stock, false), coalesce(stock, 0)
      into v_unlimited, v_stock
      from public.products
     where id = p_product_id
     for update;
    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

    if not v_unlimited then
        if v_stock < p_qty then
            raise exception 'INSUFFICIENT_STOCK:%/%', v_stock, p_qty;
        end if;
        update public.products
           set stock = v_stock - p_qty
         where id = p_product_id;
    end if;

    insert into public.stock_reservations
        (product_id, order_id, qty, reference, unlimited, expires_at)
    values
        (p_product_id, p_order_id, p_qty, btrim(p_reference), v_unlimited,
         now() + make_interval(secs => greatest(coalesce(p_ttl_seconds, 900), 60)))
    returning * into v_res;

    return v_res;
end;
$$;

-- commit_stock_reservation — the sale is final; the stock stays gone.
create or replace function public.commit_stock_reservation(p_reference text)
returns public.stock_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
    v_res public.stock_reservations;
begin
    select * into v_res
      from public.stock_reservations
     where reference = btrim(coalesce(p_reference, ''))
     for update;
    if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;
    if v_res.state = 'committed' then return v_res; end if;
    if v_res.state <> 'active' then raise exception 'RESERVATION_NOT_ACTIVE:%', v_res.state; end if;

    update public.stock_reservations
       set state = 'committed', expires_at = null
     where id = v_res.id
    returning * into v_res;
    return v_res;
end;
$$;

-- release_stock_reservation — give the units back exactly once.
create or replace function public.release_stock_reservation(
    p_reference text,
    p_expired   boolean default false
)
returns public.stock_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
    v_res public.stock_reservations;
begin
    select * into v_res
      from public.stock_reservations
     where reference = btrim(coalesce(p_reference, ''))
     for update;
    if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;
    -- Already settled: releasing twice must not inflate stock.
    if v_res.state <> 'active' then return v_res; end if;

    if not v_res.unlimited then
        update public.products
           set stock = coalesce(stock, 0) + v_res.qty
         where id = v_res.product_id;
    end if;

    update public.stock_reservations
       set state = case when p_expired then 'expired' else 'released' end,
           expires_at = null
     where id = v_res.id
    returning * into v_res;
    return v_res;
end;
$$;

-- expire_stock_reservations — janitor for abandoned checkouts.
create or replace function public.expire_stock_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_ref   text;
    v_count integer := 0;
begin
    for v_ref in
        select reference
          from public.stock_reservations
         where state = 'active'
           and expires_at is not null
           and expires_at < now()
         order by id
         for update skip locked
    loop
        perform public.release_stock_reservation(v_ref, true);
        v_count := v_count + 1;
    end loop;
    return v_count;
end;
$$;

-- ---------------------------------------------------------------
-- 4. Item claiming: atomic, idempotent, state aware
--
-- Same signature and return shape as 0047 so every existing caller is
-- untouched. New guarantees:
--   • an order that already holds items replays those items instead of
--     claiming more (no duplicate key delivery, no stock drift)
--   • only state='available' rows that are not past expires_at can be
--     picked, under FOR UPDATE SKIP LOCKED (no two users, one item)
--   • expired rows are flipped to 'expired' instead of being sold
-- ---------------------------------------------------------------
create or replace function public.expire_product_items(p_product_id bigint default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count integer;
begin
    update public.product_items
       set state = 'expired'
     where state = 'available'
       and expires_at is not null
       and expires_at < now()
       and (p_product_id is null or product_id = p_product_id);
    get diagnostics v_count = row_count;
    return v_count;
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
declare
    v_existing integer := 0;
begin
    if p_qty is null or p_qty <= 0 then return; end if;

    if p_order_id is not null and p_order_id > 0 then
        -- Serialize every claim attempt for this order, then replay.
        perform pg_advisory_xact_lock(hashtextextended('order_items_claim', p_order_id));

        select count(*) into v_existing
          from public.product_items pi
         where pi.consumed_order_id = p_order_id;

        if v_existing > 0 then
            return query
                select pi.payload::text
                  from public.product_items pi
                 where pi.consumed_order_id = p_order_id
                 order by pi.id
                 limit p_qty;
            return;
        end if;
    end if;

    perform public.expire_product_items(p_product_id);

    return query
    with picked as (
        select pi.id, pi.payload
          from public.product_items pi
         where pi.product_id = p_product_id
           and pi.state = 'available'
           and pi.consumed_at is null
           and (pi.expires_at is null or pi.expires_at > now())
         order by pi.id
         limit p_qty
         for update skip locked
    ), claimed as (
        update public.product_items pi
           set consumed_at = now(),
               consumed_order_id = p_order_id,
               state = 'consumed',
               delivered_at = now()
          from picked
         where pi.id = picked.id
           and pi.consumed_at is null
        returning picked.payload
    )
    select claimed.payload::text from claimed;
end;
$$;

-- Release: items go back to the pool as 'available' (trigger clears the
-- reservation/delivery stamps for us).
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
         consumed_order_id = null,
         state = 'available'
   where consumed_order_id = p_order_id
     and consumed_at is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------
-- 5. One-winner fulfilment guard (no duplicate fulfilment)
-- ---------------------------------------------------------------
create table if not exists public.order_deliveries (
    order_id     bigint primary key references public.orders(id) on delete cascade,
    state        text not null default 'processing'
                 check (state in ('processing', 'delivered', 'failed')),
    attempts     integer not null default 0,
    -- Count only. Never the payload.
    items_count  integer not null default 0,
    note         text,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

drop trigger if exists order_deliveries_touch_updated_at on public.order_deliveries;
create trigger order_deliveries_touch_updated_at
    before update on public.order_deliveries
    for each row execute function public.touch_checkout_updated_at();

-- begin_order_delivery — returns should_process=true for exactly one
-- caller. A crashed attempt older than p_stale_seconds may be retried.
create or replace function public.begin_order_delivery(
    p_order_id      bigint,
    p_stale_seconds integer default 300
)
returns table (should_process boolean, state text, attempts integer)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_row public.order_deliveries;
begin
    if p_order_id is null or p_order_id <= 0 then raise exception 'INVALID_ORDER_ID'; end if;

    insert into public.order_deliveries(order_id, state, attempts)
    values (p_order_id, 'processing', 1)
    on conflict (order_id) do nothing
    returning * into v_row;

    if found then
        return query select true, v_row.state, v_row.attempts;
        return;
    end if;

    select * into v_row
      from public.order_deliveries
     where order_id = p_order_id
     for update;

    if v_row.state = 'delivered' then
        return query select false, v_row.state, v_row.attempts;
        return;
    end if;

    if v_row.state = 'processing'
       and v_row.updated_at > now() - make_interval(secs => greatest(coalesce(p_stale_seconds, 300), 30)) then
        return query select false, v_row.state, v_row.attempts;
        return;
    end if;

    update public.order_deliveries
       set state = 'processing',
           attempts = attempts + 1
     where order_id = p_order_id
    returning * into v_row;

    return query select true, v_row.state, v_row.attempts;
end;
$$;

create or replace function public.finish_order_delivery(
    p_order_id    bigint,
    p_state       text,
    p_items_count integer default 0,
    p_note        text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_state not in ('delivered', 'failed') then raise exception 'INVALID_DELIVERY_STATE'; end if;
    update public.order_deliveries
       set state = p_state,
           items_count = greatest(coalesce(p_items_count, 0), 0),
           note = left(p_note, 300)
     where order_id = p_order_id;
end;
$$;

-- ---------------------------------------------------------------
-- 6. Inventory reporting for the admin UI
--    📦 Available · 🔒 Reserved · ✅ Delivered
-- ---------------------------------------------------------------
create or replace view public.product_inventory_overview as
select p.id                                   as product_id,
       p.name,
       coalesce(p.unlimited_stock, false)      as unlimited_stock,
       coalesce(p.stock, 0)                    as stock,
       coalesce(p.low_stock_threshold, 5)      as low_stock_threshold,
       count(pi.id) filter (where pi.state = 'available') as available,
       coalesce((
           select sum(sr.qty)::int
             from public.stock_reservations sr
            where sr.product_id = p.id
              and sr.state = 'active'
       ), 0)                                   as reserved,
       count(pi.id) filter (where pi.state = 'consumed')  as delivered,
       count(pi.id) filter (where pi.state = 'expired')   as expired
  from public.products p
  left join public.product_items pi on pi.product_id = p.id
 group by p.id, p.name, p.unlimited_stock, p.stock, p.low_stock_threshold;

create or replace function public.product_inventory_stats(p_product_id bigint)
returns table (
    product_id          bigint,
    unlimited_stock     boolean,
    stock               integer,
    available           integer,
    reserved            integer,
    delivered           integer,
    expired             integer,
    low_stock_threshold integer,
    low_stock           boolean
)
language sql
stable
security definer
set search_path = public
as $$
    select o.product_id,
           o.unlimited_stock,
           o.stock,
           o.available::int,
           o.reserved::int,
           o.delivered::int,
           o.expired::int,
           o.low_stock_threshold,
           (not o.unlimited_stock
            and greatest(o.available, o.stock) <= o.low_stock_threshold) as low_stock
      from public.product_inventory_overview o
     where o.product_id = p_product_id;
$$;

create or replace function public.low_stock_products(p_limit integer default 25)
returns table (
    product_id          bigint,
    name                text,
    available           integer,
    reserved            integer,
    low_stock_threshold integer
)
language sql
stable
security definer
set search_path = public
as $$
    select o.product_id,
           o.name,
           o.available::int,
           o.reserved::int,
           o.low_stock_threshold
      from public.product_inventory_overview o
     where o.unlimited_stock = false
       and greatest(o.available, o.stock) <= o.low_stock_threshold
     order by greatest(o.available, o.stock) asc, o.product_id asc
     limit greatest(coalesce(p_limit, 25), 1);
$$;

-- ---------------------------------------------------------------
-- 7. Permissions — service role only, exactly like the rest of the
--    financial / inventory surface. Digital payloads are never
--    reachable by anon / authenticated.
-- ---------------------------------------------------------------
alter table public.stock_reservations enable row level security;
alter table public.order_deliveries enable row level security;

grant all on public.stock_reservations to service_role;
grant all on public.order_deliveries to service_role;
grant usage, select on sequence public.stock_reservations_id_seq to service_role;
revoke all on public.product_inventory_overview from public, anon, authenticated;
grant select on public.product_inventory_overview to service_role;

revoke execute on function public.reserve_product_stock(bigint,integer,text,bigint,integer) from public, anon, authenticated;
grant execute on function public.reserve_product_stock(bigint,integer,text,bigint,integer) to service_role;

revoke execute on function public.commit_stock_reservation(text) from public, anon, authenticated;
grant execute on function public.commit_stock_reservation(text) to service_role;

revoke execute on function public.release_stock_reservation(text,boolean) from public, anon, authenticated;
grant execute on function public.release_stock_reservation(text,boolean) to service_role;

revoke execute on function public.expire_stock_reservations() from public, anon, authenticated;
grant execute on function public.expire_stock_reservations() to service_role;

revoke execute on function public.expire_product_items(bigint) from public, anon, authenticated;
grant execute on function public.expire_product_items(bigint) to service_role;

revoke execute on function public.claim_product_items_atomic(bigint,integer,bigint) from public, anon, authenticated;
grant execute on function public.claim_product_items_atomic(bigint,integer,bigint) to service_role;

revoke execute on function public.release_product_items_for_order(bigint) from public, anon, authenticated;
grant execute on function public.release_product_items_for_order(bigint) to service_role;

revoke execute on function public.begin_order_delivery(bigint,integer) from public, anon, authenticated;
grant execute on function public.begin_order_delivery(bigint,integer) to service_role;

revoke execute on function public.finish_order_delivery(bigint,text,integer,text) from public, anon, authenticated;
grant execute on function public.finish_order_delivery(bigint,text,integer,text) to service_role;

revoke execute on function public.product_inventory_stats(bigint) from public, anon, authenticated;
grant execute on function public.product_inventory_stats(bigint) to service_role;

revoke execute on function public.low_stock_products(integer) from public, anon, authenticated;
grant execute on function public.low_stock_products(integer) to service_role;
