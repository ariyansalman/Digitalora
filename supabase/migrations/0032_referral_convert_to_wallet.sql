-- =====================================================================
-- 0032_referral_convert_to_wallet.sql
--
-- Lets users convert referral balance into wallet balance:
--   20 available refs = 1.00 USDT
--
-- Conversion spends the same referral balance used by Referral Pay, so
-- converted refs cannot also be used for product purchases.
-- =====================================================================

create table if not exists public.referral_conversions (
    id          bigserial primary key,
    user_id     bigint not null references public.users(telegram_id) on delete cascade,
    refs_spent  int not null check (refs_spent > 0),
    amount      numeric(14,2) not null check (amount > 0),
    created_at  timestamptz not null default now()
);

create index if not exists referral_conversions_user_idx
    on public.referral_conversions(user_id, created_at desc);

alter table public.referral_conversions enable row level security;

-- Update product Referral Pay spending to include refs already
-- converted into wallet balance.
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

    select count(*)::int
      into v_total
      from public.referrals
     where referrer_id = p_user_id;

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
    v_new_balance numeric;
begin
    if p_referral_cost <= 0 or p_usdt_amount <= 0 then
        raise exception 'INVALID_REFERRAL_CONVERSION';
    end if;

    perform pg_advisory_xact_lock(p_user_id);

    select count(*)::int
      into v_total
      from public.referrals
     where referrer_id = p_user_id;

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
       set balance = balance + p_usdt_amount
     where telegram_id = p_user_id
     returning balance into v_new_balance;

    insert into public.wallet_ledger (
        user_id,
        type,
        amount,
        reference
    )
    values (
        p_user_id,
        'referral_convert',
        p_usdt_amount,
        'referral_convert:' || p_referral_cost::text
    );

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
