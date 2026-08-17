-- =====================================================================
-- 0058_checkout_layer.sql
-- Shared professional checkout layer (Cart + Buy Now).
--
-- Additive only. Products, wallets, promos, referrals, payments and
-- orders keep their existing schema and behaviour; this migration adds
--
--   • public.coupons             — coupon catalog (percent / fixed)
--   • public.coupon_redemptions  — who used what, for the usage caps
--   • public.checkout_intents    — idempotency + duplicate-order guard
--
-- plus the SQL guards the bot uses so a double-tapped "Pay with
-- Wallet" can never produce two order batches, even across processes.
-- =====================================================================

-- ---------------------------------------------------------------
-- Coupons
-- ---------------------------------------------------------------
create table if not exists public.coupons (
    id             bigserial primary key,
    code           text not null,
    kind           text not null default 'fixed' check (kind in ('percent', 'fixed')),
    -- percent: 0-100. fixed: flat amount in the shop base currency.
    value          numeric(14,2) not null check (value >= 0),
    active         boolean not null default true,
    starts_at      timestamptz,
    expires_at     timestamptz,
    -- Minimum post-promo subtotal required for the coupon to apply.
    min_subtotal   numeric(14,2),
    -- Ceiling on the resulting discount (mostly for percent coupons).
    max_discount   numeric(14,2),
    -- Restrict to a product set; null / empty = any product.
    product_ids    bigint[],
    -- Global and per-user redemption caps; null = unlimited.
    usage_limit    integer check (usage_limit is null or usage_limit > 0),
    used_count     integer not null default 0 check (used_count >= 0),
    per_user_limit integer check (per_user_limit is null or per_user_limit > 0),
    note           text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create unique index if not exists coupons_code_key
    on public.coupons (upper(code));

create table if not exists public.coupon_redemptions (
    id          bigserial primary key,
    coupon_id   bigint not null references public.coupons(id) on delete cascade,
    user_id     bigint not null references public.users(telegram_id) on delete cascade,
    -- Discount actually granted, in the shop base currency.
    amount      numeric(14,2) not null default 0 check (amount >= 0),
    -- Checkout reference (`checkout:<intent id>`), for reconciliation.
    reference   text,
    created_at  timestamptz not null default now()
);

create index if not exists coupon_redemptions_coupon_idx
    on public.coupon_redemptions (coupon_id);
create index if not exists coupon_redemptions_user_idx
    on public.coupon_redemptions (user_id);
create unique index if not exists coupon_redemptions_reference_key
    on public.coupon_redemptions (reference)
    where reference is not null;

-- ---------------------------------------------------------------
-- Checkout intents — one row per *attempt* to pay.
--
-- `fingerprint` is computed by `src/core/checkout.ts` from the exact
-- products / quantities / prices / coupon of the attempt. A second tap
-- reuses the same fingerprint and is rejected while the first is still
-- running (or already succeeded), which is what prevents duplicate
-- checkouts and duplicate orders.
-- ---------------------------------------------------------------
create table if not exists public.checkout_intents (
    id           bigserial primary key,
    user_id      bigint not null references public.users(telegram_id) on delete cascade,
    source       text not null check (source in ('cart', 'buy_now')),
    fingerprint  text not null,
    status       text not null default 'pending'
                 check (status in ('pending', 'completed', 'failed', 'cancelled')),
    payable      numeric(14,2) not null default 0 check (payable >= 0),
    currency     text,
    coupon_code  text,
    order_ids    bigint[] not null default '{}',
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create index if not exists checkout_intents_user_idx
    on public.checkout_intents (user_id, created_at desc);

-- At most one live attempt per (user, fingerprint).
create unique index if not exists checkout_intents_live_key
    on public.checkout_intents (user_id, fingerprint)
    where status = 'pending';

create or replace function public.touch_checkout_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists coupons_touch_updated_at on public.coupons;
create trigger coupons_touch_updated_at
    before update on public.coupons
    for each row execute function public.touch_checkout_updated_at();

drop trigger if exists checkout_intents_touch_updated_at on public.checkout_intents;
create trigger checkout_intents_touch_updated_at
    before update on public.checkout_intents
    for each row execute function public.touch_checkout_updated_at();

-- ---------------------------------------------------------------
-- begin_checkout_intent — atomic duplicate-checkout guard.
--
-- Raises:
--   CHECKOUT_IN_PROGRESS  another attempt with the same fingerprint
--                         is still running
--   CHECKOUT_DUPLICATE    the identical attempt already completed in
--                         the last 5 minutes (double tap after success)
-- ---------------------------------------------------------------
create or replace function public.begin_checkout_intent(
    p_user_id     bigint,
    p_source      text,
    p_fingerprint text,
    p_payable     numeric,
    p_currency    text default null,
    p_coupon_code text default null
)
returns public.checkout_intents
language plpgsql
security definer
set search_path = public
as $$
declare
    v_intent public.checkout_intents;
begin
    perform 1
       from public.checkout_intents
      where user_id = p_user_id
        and fingerprint = p_fingerprint
        and status = 'pending'
      for update;
    if found then
        raise exception 'CHECKOUT_IN_PROGRESS';
    end if;

    perform 1
       from public.checkout_intents
      where user_id = p_user_id
        and fingerprint = p_fingerprint
        and status = 'completed'
        and updated_at > now() - interval '5 minutes';
    if found then
        raise exception 'CHECKOUT_DUPLICATE';
    end if;

    insert into public.checkout_intents
        (user_id, source, fingerprint, payable, currency, coupon_code)
    values
        (p_user_id, p_source, p_fingerprint, greatest(coalesce(p_payable, 0), 0),
         p_currency, p_coupon_code)
    returning * into v_intent;

    return v_intent;
end;
$$;

-- ---------------------------------------------------------------
-- finish_checkout_intent — release the guard and record the outcome.
-- ---------------------------------------------------------------
create or replace function public.finish_checkout_intent(
    p_intent_id bigint,
    p_status    text,
    p_order_ids bigint[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_status not in ('completed', 'failed', 'cancelled') then
        raise exception 'CHECKOUT_BAD_STATUS';
    end if;
    update public.checkout_intents
       set status = p_status,
           order_ids = coalesce(p_order_ids, '{}')
     where id = p_intent_id;
end;
$$;

-- ---------------------------------------------------------------
-- resolve_coupon — coupon row + this user's redemption count.
-- Read-only; all pricing decisions are made in TypeScript so the
-- rules stay unit-testable.
-- ---------------------------------------------------------------
create or replace function public.resolve_coupon(
    p_code    text,
    p_user_id bigint
)
returns table (
    id             bigint,
    code           text,
    kind           text,
    value          numeric,
    active         boolean,
    starts_at      timestamptz,
    expires_at     timestamptz,
    min_subtotal   numeric,
    max_discount   numeric,
    product_ids    bigint[],
    usage_limit    integer,
    used_count     integer,
    per_user_limit integer,
    user_used_count integer
)
language sql
stable
security definer
set search_path = public
as $$
    select c.id,
           c.code,
           c.kind,
           c.value,
           c.active,
           c.starts_at,
           c.expires_at,
           c.min_subtotal,
           c.max_discount,
           c.product_ids,
           c.usage_limit,
           c.used_count,
           c.per_user_limit,
           (select count(*)::int
              from public.coupon_redemptions r
             where r.coupon_id = c.id
               and r.user_id = p_user_id) as user_used_count
      from public.coupons c
     where upper(c.code) = upper(btrim(p_code))
     limit 1;
$$;

-- ---------------------------------------------------------------
-- redeem_coupon — atomically record a redemption and bump the
-- global counter, re-checking both caps inside the transaction so a
-- race cannot exceed them. Idempotent on `p_reference`.
-- Raises COUPON_USAGE_LIMIT / COUPON_PER_USER_LIMIT / COUPON_UNKNOWN.
-- ---------------------------------------------------------------
create or replace function public.redeem_coupon(
    p_code      text,
    p_user_id   bigint,
    p_amount    numeric,
    p_reference text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_coupon public.coupons;
    v_user_count integer;
begin
    select * into v_coupon
      from public.coupons
     where upper(code) = upper(btrim(p_code))
     for update;
    if not found then
        raise exception 'COUPON_UNKNOWN';
    end if;

    if p_reference is not null then
        perform 1 from public.coupon_redemptions where reference = p_reference;
        if found then
            return; -- already recorded; keep the call idempotent
        end if;
    end if;

    if v_coupon.usage_limit is not null
       and v_coupon.used_count >= v_coupon.usage_limit then
        raise exception 'COUPON_USAGE_LIMIT';
    end if;

    if v_coupon.per_user_limit is not null then
        select count(*) into v_user_count
          from public.coupon_redemptions
         where coupon_id = v_coupon.id and user_id = p_user_id;
        if v_user_count >= v_coupon.per_user_limit then
            raise exception 'COUPON_PER_USER_LIMIT';
        end if;
    end if;

    insert into public.coupon_redemptions (coupon_id, user_id, amount, reference)
    values (v_coupon.id, p_user_id, greatest(coalesce(p_amount, 0), 0), p_reference);

    update public.coupons
       set used_count = used_count + 1
     where id = v_coupon.id;
end;
$$;

-- ---------------------------------------------------------------
-- Security. The bot talks to Postgres with the service-role key;
-- RLS is defense in depth and the RPCs stay service-role only.
-- ---------------------------------------------------------------
alter table public.coupons            enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.checkout_intents   enable row level security;

grant select, insert, update, delete on public.coupons to service_role;
grant select, insert, update, delete on public.coupon_redemptions to service_role;
grant select, insert, update, delete on public.checkout_intents to service_role;
grant usage, select on sequence public.coupons_id_seq to service_role;
grant usage, select on sequence public.coupon_redemptions_id_seq to service_role;
grant usage, select on sequence public.checkout_intents_id_seq to service_role;

revoke all on public.coupons            from public, anon, authenticated;
revoke all on public.coupon_redemptions from public, anon, authenticated;
revoke all on public.checkout_intents   from public, anon, authenticated;

revoke execute on function public.begin_checkout_intent(bigint, text, text, numeric, text, text)
    from public, anon, authenticated;
grant execute on function public.begin_checkout_intent(bigint, text, text, numeric, text, text)
    to service_role;
revoke execute on function public.finish_checkout_intent(bigint, text, bigint[])
    from public, anon, authenticated;
grant execute on function public.finish_checkout_intent(bigint, text, bigint[])
    to service_role;
revoke execute on function public.resolve_coupon(text, bigint) from public, anon, authenticated;
grant execute on function public.resolve_coupon(text, bigint) to service_role;
revoke execute on function public.redeem_coupon(text, bigint, numeric, text)
    from public, anon, authenticated;
grant execute on function public.redeem_coupon(text, bigint, numeric, text) to service_role;
