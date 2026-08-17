-- =====================================================================
-- 0007_gift_codes.sql
-- Admin-issued gift codes that users can redeem from Settings →
-- Redeem Gift Code. Each code has a fixed USDT value, optional expiry,
-- and a per-user redemption limit (default 1). Owner can raise the
-- limit per code if they want a code reusable across users.
-- =====================================================================

create table if not exists public.gift_codes (
    code              text primary key,
    amount            numeric(14,2) not null,
    -- Maximum total redemptions across ALL users (null = unlimited).
    max_redemptions   integer,
    -- Per-user redemption cap. 1 = each user can redeem once.
    per_user_limit    integer not null default 1,
    -- Optional expiry; null = no expiry.
    expires_at        timestamptz,
    note              text,
    created_by        bigint,
    created_at        timestamptz not null default now()
);

create table if not exists public.gift_code_redemptions (
    id          bigserial primary key,
    code        text not null references public.gift_codes(code) on delete cascade,
    user_id     bigint not null references public.users(telegram_id) on delete cascade,
    amount      numeric(14,2) not null,
    redeemed_at timestamptz not null default now()
);

create index if not exists gift_redemptions_user_idx
    on public.gift_code_redemptions(user_id);
create index if not exists gift_redemptions_code_idx
    on public.gift_code_redemptions(code);
