-- =====================================================================
-- 0013_promos.sql
-- Quantity-threshold flat-USDT discount promos.
--
-- Each row is one promo with two optional scope keys:
--   - product_id  : nullable FK → products.id. NULL means the promo
--                   applies to ANY product. ON DELETE CASCADE so
--                   deleting a product also drops every promo that
--                   pointed at it.
--   - telegram_id : nullable. NULL means the promo applies to ANY
--                   user. NOT a FK on users.telegram_id so admins
--                   can pre-set a personalized promo for a user who
--                   hasn't `/start`-ed the bot yet.
--
-- Specificity hierarchy (most specific match wins at order time):
--   3) telegram_id IS NOT NULL AND product_id IS NOT NULL
--   2) telegram_id IS NOT NULL AND product_id IS NULL
--   1) telegram_id IS NULL     AND product_id IS NOT NULL
--   0) telegram_id IS NULL     AND product_id IS NULL          (default)
-- Within a tier, the promo with the largest `discount_amount` wins.
--
-- min_qty:         line qty must be ≥ this for the promo to apply.
-- discount_amount: flat USDT off the line total when qty ≥ min_qty;
--                  application-side logic clamps the actual applied
--                  amount to never exceed the line total.
-- active:          soft-disable so admins can pause without deleting.
--
-- Multiple promos at the same scope tier are allowed (e.g. "10+ → -$5"
-- and "25+ → -$15") — the matching code picks the best one for the
-- caller's qty.
-- =====================================================================

create table if not exists public.promos (
    id              bigserial primary key,
    product_id      bigint references public.products(id) on delete cascade,
    telegram_id     bigint,
    name            text,
    min_qty         int not null check (min_qty >= 1),
    discount_amount numeric(14,2) not null check (discount_amount >= 0),
    active          boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    created_by      bigint
);

-- Hot-path filter: scoped lookup by (telegram_id, product_id) on
-- active rows. We use coalesce to keep NULL scope rows in the index.
create index if not exists promos_scope_idx
    on public.promos(coalesce(telegram_id, 0), coalesce(product_id, 0))
    where active;

create index if not exists promos_product_idx
    on public.promos(product_id) where active;

create index if not exists promos_user_idx
    on public.promos(telegram_id) where active;

-- Audit column on orders: how much discount was applied at the time
-- of purchase. Defaults to 0 for legacy orders. unit_price stays the
-- per-user effective price (pre-discount) and `total` is the actual
-- USDT charged so existing reports stay correct.
alter table public.orders
    add column if not exists discount numeric(14,2) not null default 0
    check (discount >= 0);
