-- =====================================================================
-- 0056_shopping_cart.sql
-- Persistent shopping cart.
--
-- The cart is *additive*: Buy Now / direct pay / referral pay and the
-- existing orders table are untouched. A cart is simply a durable
-- staging area (survives bot restarts) that ends in the very same
-- `orders` rows the direct flow already creates.
--
-- Concurrency model
-- -----------------
--   • Exactly one live cart per user, enforced by a partial unique
--     index on (user_id) where status in ('open','checking_out').
--   • Checkout flips 'open' -> 'checking_out' inside a single
--     statement with FOR UPDATE, so a double-tapped 💳 Checkout
--     button can never produce two order batches.
--   • Prices are NEVER trusted from the client. `unit_price_snapshot`
--     exists purely to detect price drift and show the user a
--     "price changed" notice; the authoritative price is always
--     re-read from `products` (+ user overrides + promos) at
--     checkout time.
-- =====================================================================

create table if not exists public.carts (
    id          bigserial primary key,
    user_id     bigint not null references public.users(telegram_id) on delete cascade,
    -- open           → user is still shopping
    -- checking_out   → a checkout is in flight (duplicate-click guard)
    -- completed      → historical record of a converted cart
    -- abandoned      → cleared by the user / admin
    status      text not null default 'open'
                check (status in ('open', 'checking_out', 'completed', 'abandoned')),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create unique index if not exists carts_one_live_per_user_idx
    on public.carts(user_id)
    where status in ('open', 'checking_out');

create index if not exists carts_user_idx on public.carts(user_id);

create table if not exists public.cart_items (
    id                  bigserial primary key,
    cart_id             bigint not null references public.carts(id) on delete cascade,
    product_id          bigint not null references public.products(id) on delete cascade,
    qty                 integer not null check (qty > 0),
    -- Snapshot of the price the user saw when the line was added.
    -- Display / drift-detection only — never used to charge.
    unit_price_snapshot numeric(14,2) not null default 0,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    unique (cart_id, product_id)
);

create index if not exists cart_items_cart_idx on public.cart_items(cart_id);
create index if not exists cart_items_product_idx on public.cart_items(product_id);

-- ---------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------
create or replace function public.touch_cart_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists carts_touch_updated_at on public.carts;
create trigger carts_touch_updated_at
    before update on public.carts
    for each row execute function public.touch_cart_updated_at();

drop trigger if exists cart_items_touch_updated_at on public.cart_items;
create trigger cart_items_touch_updated_at
    before update on public.cart_items
    for each row execute function public.touch_cart_updated_at();

-- ---------------------------------------------------------------
-- get_or_create_cart — idempotent "give me this user's live cart"
-- ---------------------------------------------------------------
create or replace function public.get_or_create_cart(p_user_id bigint)
returns public.carts
language plpgsql
security definer
set search_path = public
as $$
declare
    v_cart public.carts;
begin
    if p_user_id is null or p_user_id <= 0 then
        raise exception 'INVALID_USER';
    end if;

    select * into v_cart
      from public.carts
     where user_id = p_user_id
       and status in ('open', 'checking_out')
     limit 1;

    if found then
        return v_cart;
    end if;

    insert into public.carts (user_id, status)
    values (p_user_id, 'open')
    on conflict do nothing
    returning * into v_cart;

    if v_cart.id is null then
        select * into v_cart
          from public.carts
         where user_id = p_user_id
           and status in ('open', 'checking_out')
         limit 1;
    end if;

    return v_cart;
end;
$$;

-- ---------------------------------------------------------------
-- begin_cart_checkout — atomic duplicate-click guard
-- Returns the cart row locked into 'checking_out'. Raises
-- CART_EMPTY / CART_CHECKOUT_IN_PROGRESS otherwise.
-- ---------------------------------------------------------------
create or replace function public.begin_cart_checkout(p_user_id bigint)
returns public.carts
language plpgsql
security definer
set search_path = public
as $$
declare
    v_cart  public.carts;
    v_items integer;
begin
    if p_user_id is null or p_user_id <= 0 then
        raise exception 'INVALID_USER';
    end if;

    select * into v_cart
      from public.carts
     where user_id = p_user_id
       and status in ('open', 'checking_out')
     limit 1
       for update;

    if not found then
        raise exception 'CART_EMPTY';
    end if;

    if v_cart.status <> 'open' then
        raise exception 'CART_CHECKOUT_IN_PROGRESS';
    end if;

    select count(*) into v_items from public.cart_items where cart_id = v_cart.id;
    if v_items = 0 then
        raise exception 'CART_EMPTY';
    end if;

    update public.carts
       set status = 'checking_out'
     where id = v_cart.id
    returning * into v_cart;

    return v_cart;
end;
$$;

-- ---------------------------------------------------------------
-- finish_cart_checkout — release the guard.
--   p_success = true  → cart is emptied and archived as 'completed';
--                       a fresh empty cart is created for the user.
--   p_success = false → cart returns to 'open' with items intact.
-- ---------------------------------------------------------------
create or replace function public.finish_cart_checkout(
    p_cart_id bigint,
    p_success boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_cart public.carts;
begin
    select * into v_cart from public.carts where id = p_cart_id for update;
    if not found then
        return;
    end if;

    if not p_success then
        update public.carts set status = 'open' where id = v_cart.id;
        return;
    end if;

    delete from public.cart_items where cart_id = v_cart.id;
    update public.carts set status = 'completed' where id = v_cart.id;
    insert into public.carts (user_id, status) values (v_cart.user_id, 'open')
    on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------
-- Security. The bot talks to Postgres with the service-role key;
-- RLS is defense in depth and the RPCs stay service-role only.
-- ---------------------------------------------------------------
alter table public.carts      enable row level security;
alter table public.cart_items enable row level security;

grant select, insert, update, delete on public.carts to service_role;
grant select, insert, update, delete on public.cart_items to service_role;
grant usage, select on sequence public.carts_id_seq to service_role;
grant usage, select on sequence public.cart_items_id_seq to service_role;

revoke all on public.carts from public, anon, authenticated;
revoke all on public.cart_items from public, anon, authenticated;

revoke execute on function public.get_or_create_cart(bigint) from public, anon, authenticated;
grant execute on function public.get_or_create_cart(bigint) to service_role;
revoke execute on function public.begin_cart_checkout(bigint) from public, anon, authenticated;
grant execute on function public.begin_cart_checkout(bigint) to service_role;
revoke execute on function public.finish_cart_checkout(bigint, boolean) from public, anon, authenticated;
grant execute on function public.finish_cart_checkout(bigint, boolean) to service_role;
