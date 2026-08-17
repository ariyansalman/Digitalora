-- =====================================================================
-- 0030_referral_payment_balance.sql
--
-- Converts the old one-time "referral reward" table into a reusable
-- referral-payment ledger:
--   available referrals = invited users - referrals already spent
--
-- This migration is non-destructive. Existing redemption rows are
-- retained and backfilled with the referral cost that applied to the
-- original order where possible.
-- =====================================================================

alter table public.products
    add column if not exists referral_required_count int not null default 0
        check (referral_required_count >= 0);

create table if not exists public.referral_redemptions (
    id             bigserial primary key,
    user_id        bigint not null references public.users(telegram_id) on delete cascade,
    product_id     bigint not null references public.products(id) on delete cascade,
    order_id       bigint references public.orders(id) on delete set null,
    referral_cost  int not null default 0 check (referral_cost >= 0),
    redeemed_at    timestamptz not null default now()
);

alter table public.referral_redemptions
    add column if not exists referral_cost int not null default 0
        check (referral_cost >= 0);

-- The old model allowed one referral purchase per user/product.
-- Referral Pay is a balance, so repeat purchases must be allowed.
alter table public.referral_redemptions
    drop constraint if exists referral_redemptions_user_id_product_id_key;

drop index if exists public.referral_redemptions_user_id_product_id_key;

-- Preserve the referral cost of purchases made under the old model.
update public.referral_redemptions rr
   set referral_cost = greatest(
       coalesce((
           select p.referral_required_count
             from public.products p
            where p.id = rr.product_id
       ), 0)
       *
       coalesce((
           select o.qty
             from public.orders o
            where o.id = rr.order_id
       ), 1),
       0
   )
 where rr.referral_cost = 0;

create index if not exists referral_redemptions_user_idx
    on public.referral_redemptions(user_id);

create index if not exists referral_redemptions_product_idx
    on public.referral_redemptions(product_id);

create unique index if not exists referral_redemptions_order_unique_idx
    on public.referral_redemptions(order_id)
    where order_id is not null;

alter table public.referral_redemptions enable row level security;

-- Atomically verify and spend referral balance. The advisory lock
-- serializes simultaneous purchases by the same Telegram user.
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

    select coalesce(sum(referral_cost), 0)::int
      into v_spent
      from public.referral_redemptions
     where user_id = p_user_id;

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

grant execute on function public.spend_referral_balance(bigint, bigint, bigint, int)
    to service_role;
