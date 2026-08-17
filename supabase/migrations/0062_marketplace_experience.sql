-- =====================================================================
-- 0062_marketplace_experience.sql
-- Premium marketplace experience: merchandising badges, product
-- features / instant-delivery metadata and a persistent wishlist.
--
-- Everything here is ADDITIVE. No existing column, constraint or
-- behaviour is changed, so Buy Now, direct pay, referral pay, promos,
-- carts, checkout and inventory reservations keep working untouched.
--
-- Design rule: badges are DATA, never hardcoded in the bot. Every
-- badge the UI can render resolves from one of the columns below (or
-- from `created_at` for the 🆕 New badge), so the shop owner controls
-- merchandising from the database / admin panel without a redeploy.
-- =====================================================================

alter table public.products
    -- 🔥 Flash Sale — active while the timestamp is in the future.
    add column if not exists flash_sale_until   timestamptz,
    -- ⭐ Featured
    add column if not exists is_featured        boolean not null default false,
    -- 💎 Premium
    add column if not exists is_premium         boolean not null default false,
    -- 🏆 Best Seller
    add column if not exists is_best_seller     boolean not null default false,
    -- 🏷️ Discount — original ("was") price. Badge shows when it is
    -- strictly greater than `price`; the percentage is computed.
    add column if not exists compare_at_price   numeric(14,2),
    -- ✨ Features — one bullet per line, rendered on the product screen.
    add column if not exists features           text,
    -- ⚡ Instant Delivery. NULL = auto-detect (a product with an items
    -- pool and no manual delivery form delivers instantly).
    add column if not exists instant_delivery   boolean,
    -- Lifetime units sold, maintained by fulfilment. Used for the
    -- automatic 🏆 Best Seller badge when the shop owner has not
    -- flagged the product manually.
    add column if not exists sales_count        integer not null default 0;

create index if not exists products_flash_sale_idx
    on public.products(flash_sale_until)
    where flash_sale_until is not null;

create index if not exists products_featured_idx
    on public.products(is_featured)
    where is_featured = true;

-- ---------------------------------------------------------------
-- Wishlist / favorites
-- ---------------------------------------------------------------
create table if not exists public.product_favorites (
    id          bigserial primary key,
    user_id     bigint not null references public.users(telegram_id) on delete cascade,
    product_id  bigint not null references public.products(id) on delete cascade,
    created_at  timestamptz not null default now(),
    unique (user_id, product_id)
);

create index if not exists product_favorites_user_idx
    on public.product_favorites(user_id, created_at desc);
create index if not exists product_favorites_product_idx
    on public.product_favorites(product_id);

alter table public.product_favorites enable row level security;

-- The bot talks to Supabase with the service role key only; no anon
-- or authenticated access is granted for this table.
grant all on public.product_favorites to service_role;
grant usage, select on sequence public.product_favorites_id_seq to service_role;
