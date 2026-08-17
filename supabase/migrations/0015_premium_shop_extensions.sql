-- =====================================================================
-- 0015_premium_shop_extensions.sql
--
-- Premium-shop UX overhaul. Adds:
--   - Per-product premium emoji (custom_emoji_id) used on the catalog
--     row icon and the product-page header (pic 1: 🎬 youtube ...).
--   - Optional unlimited-stock flag so the catalog row can render
--     "(Stock: ∞)" for digital subscription products.
--   - View Note attachment fields — admin can upload a .txt (or any
--     document) that the bot resends when the buyer taps View Note,
--     matching the "Gemini ⚠️18m Warning ‼️.txt" UX in pic 2.
--   - Per-product Using Method tutorial (text + optional photo /
--     video / document attachment + optional URL). Surfaced as a
--     button under every Order Delivered message.
--   - product_items pool — admin pastes the actual delivered payload
--     (codes, links, account creds) one per line; the bot consumes
--     `qty` items off the top of the pool per purchase. Mirrors the
--     pic-3 "Items: <quoted block>" delivery card.
--   - orders.delivered_items — preserves what was actually delivered
--     so it can be re-shown later (My Orders detail) without
--     re-consuming the pool.
--   - email_nag fields on users — track when we last sent the
--     12-hour "Please add your verified email" reminder so we don't
--     spam every interaction. The matching `email_nag_disabled` flag
--     mirrors the new "Email Reports" notifications toggle.
-- =====================================================================

alter table public.products
    add column if not exists emoji_id           text,
    add column if not exists note_file_id       text,
    add column if not exists note_file_name     text,
    add column if not exists note_file_mime     text,
    add column if not exists tutorial_text      text,
    add column if not exists tutorial_file_id   text,
    add column if not exists tutorial_file_type text,
    add column if not exists tutorial_url       text,
    add column if not exists unlimited_stock    boolean not null default false;

create table if not exists public.product_items (
    id                bigserial primary key,
    product_id        bigint not null references public.products(id) on delete cascade,
    payload           text not null,
    consumed_at       timestamptz,
    consumed_order_id bigint,
    created_at        timestamptz not null default now()
);
create index if not exists product_items_pool
    on public.product_items(product_id, id)
    where consumed_at is null;

alter table public.orders
    add column if not exists delivered_items text;

alter table public.users
    add column if not exists email_nag_disabled boolean not null default false,
    add column if not exists last_email_nag_at  timestamptz;

-- Default settings seeds for the new global tutorial + price-list
-- promo footer. Admin overrides these from the Bot Settings menu.
insert into public.settings (key, value) values
    ('bot_tutorial.text',          'null'::jsonb),
    ('bot_tutorial.file_id',       'null'::jsonb),
    ('bot_tutorial.file_type',     'null'::jsonb),
    ('bot_tutorial.url',           'null'::jsonb),
    ('price_list.promo_text',      'null'::jsonb)
on conflict (key) do nothing;

alter table public.product_items enable row level security;
