-- =====================================================================
-- 0029_ensure_referral_rewards_schema.sql
-- Safety net for Referral Pay.
--
-- Some live databases may have older migrations applied but still miss
-- the Referral Pay schema. This keeps the admin "Referral Pay"
-- button from failing when it saves products.referral_required_count.
-- =====================================================================

alter table public.products
    add column if not exists referral_required_count int not null default 0
        check (referral_required_count >= 0);

create table if not exists public.referral_redemptions (
    id           bigserial primary key,
    user_id      bigint not null references public.users(telegram_id) on delete cascade,
    product_id   bigint not null references public.products(id) on delete cascade,
    order_id     bigint references public.orders(id) on delete set null,
    redeemed_at  timestamptz not null default now(),
    unique (user_id, product_id)
);

create index if not exists referral_redemptions_user_idx
    on public.referral_redemptions(user_id);

create index if not exists referral_redemptions_product_idx
    on public.referral_redemptions(product_id);

alter table public.referral_redemptions enable row level security;
