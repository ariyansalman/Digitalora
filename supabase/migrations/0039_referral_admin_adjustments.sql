-- =====================================================================
-- 0039_referral_admin_adjustments.sql
--
-- Admin-controlled referral balance corrections.
-- This keeps real invite rows untouched:
--   effective referral total = real referrals + admin adjustments
--   available referrals = effective total - purchase spend - conversion spend
-- =====================================================================

create table if not exists public.referral_adjustments (
    id          bigserial primary key,
    user_id     bigint not null references public.users(telegram_id) on delete cascade,
    delta       int not null check (delta <> 0),
    reason      text,
    created_by  bigint,
    created_at  timestamptz not null default now()
);

create index if not exists referral_adjustments_user_idx
    on public.referral_adjustments(user_id, created_at desc);

alter table public.referral_adjustments enable row level security;

create or replace function public.spend_referral_balance(
    p_user_id bigint,
    p_product_id bigint,
    p_order_id bigint,
    p_referral_cost int
)
returns table (
    total_referrals int,
    spent_referrals int,
    available_referrals int
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_total int;
    v_spent int;
begin
    if p_referral_cost <= 0 then
        raise exception 'INVALID_REFERRAL_COST';
    end if;

    perform pg_advisory_xact_lock(p_user_id);

    select greatest(
        0,
        (
            select count(*)::int
              from public.referrals
             where referrer_id = p_user_id
        )
        +
        coalesce((
            select sum(delta)
              from public.referral_adjustments
             where user_id = p_user_id
        ), 0)::int
    )
      into v_total;

    select
        coalesce((
            select sum(referral_cost)
              from public.referral_redemptions
             where user_id = p_user_id
        ), 0)::int
        +
        coalesce((
            select sum(refs_spent)
              from public.referral_conversions
             where user_id = p_user_id
        ), 0)::int
      into v_spent;

    if (v_total - v_spent) < p_referral_cost then
        raise exception 'INSUFFICIENT_REFERRALS';
    end if;

    insert into public.referral_redemptions (
        user_id,
        product_id,
        order_id,
        referral_cost
    )
    values (
        p_user_id,
        p_product_id,
        p_order_id,
        p_referral_cost
    );

    return query
    select
        v_total,
        v_spent + p_referral_cost,
        v_total - v_spent - p_referral_cost;
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
    v_available int;
    v_new_balance numeric;
begin
    if p_referral_cost <= 0 then
        raise exception 'INVALID_REFERRAL_COST';
    end if;
    if p_usdt_amount <= 0 then
        raise exception 'INVALID_CONVERSION_AMOUNT';
    end if;

    perform pg_advisory_xact_lock(p_user_id);

    select greatest(
        0,
        (
            select count(*)::int
              from public.referrals
             where referrer_id = p_user_id
        )
        +
        coalesce((
            select sum(delta)
              from public.referral_adjustments
             where user_id = p_user_id
        ), 0)::int
    )
      into v_total;

    select
        coalesce((
            select sum(referral_cost)
              from public.referral_redemptions
             where user_id = p_user_id
        ), 0)::int
        +
        coalesce((
            select sum(refs_spent)
              from public.referral_conversions
             where user_id = p_user_id
        ), 0)::int
      into v_spent;

    v_available := v_total - v_spent;

    if v_available < p_referral_cost then
        raise exception 'INSUFFICIENT_REFERRALS';
    end if;

    insert into public.referral_conversions (
        user_id,
        refs_spent,
        amount
    )
    values (
        p_user_id,
        p_referral_cost,
        p_usdt_amount
    );

    update public.users
       set balance = coalesce(balance, 0) + p_usdt_amount
     where telegram_id = p_user_id
     returning balance into v_new_balance;

    if v_new_balance is null then
        raise exception 'USER_NOT_FOUND';
    end if;

    return query
    select
        v_total,
        v_spent + p_referral_cost,
        v_total - v_spent - p_referral_cost,
        p_usdt_amount,
        v_new_balance;
end;
$$;

grant execute on function public.spend_referral_balance(bigint, bigint, bigint, int)
    to service_role;

grant execute on function public.convert_referrals_to_wallet(bigint, int, numeric)
    to service_role;
