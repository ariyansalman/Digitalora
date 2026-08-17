-- =====================================================================
-- 0011_user_price_overrides.sql
-- Per-user, per-product price overrides.
--
-- Keyed by `telegram_id` (NOT users.telegram_id FK) so the admin can
-- pre-set a custom price for a Telegram ID that has never `/start`-ed
-- the bot yet — the override applies the moment that user opens the
-- product page for the first time.
--
-- Columns:
--   - telegram_id : the Telegram user this override applies to.
--   - product_id  : FK to public.products. ON DELETE CASCADE so
--                   deleting a product also drops every per-user
--                   override that pointed at it.
--   - price       : numeric(14,2), same shape as products.price.
--                   `>= 0` is enforced to match the product table.
--   - created_at  : when the override was first created.
--   - updated_at  : refreshed on every UPSERT.
--   - created_by  : Telegram ID of the admin who set/last-updated it
--                   (audit trail; nullable for migrations).
-- =====================================================================

create table if not exists public.user_price_overrides (
    telegram_id  bigint not null,
    product_id   bigint not null references public.products(id) on delete cascade,
    price        numeric(14,2) not null check (price >= 0),
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    created_by   bigint,
    primary key (telegram_id, product_id)
);

create index if not exists user_price_overrides_telegram_idx
    on public.user_price_overrides(telegram_id);

create index if not exists user_price_overrides_product_idx
    on public.user_price_overrides(product_id);
