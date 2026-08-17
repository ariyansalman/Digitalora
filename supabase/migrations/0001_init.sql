-- =====================================================================
-- Digitalora Bot — initial schema
-- Run this in the Supabase SQL editor (or `supabase db push`).
--
-- All statements use `if not exists` so this file is safe to re-run.
-- If a previous attempt left a half-applied state, run the DROP block
-- below first (it's commented out — uncomment it once, run, then run
-- the rest).
-- =====================================================================

-- ---------- (Optional) clean slate — uncomment to drop everything ---
-- Run these by themselves first if a previous migration attempt left
-- a partial state behind:
--
--   drop view  if exists public.products_view cascade;
--   drop table if exists public.referrals      cascade;
--   drop table if exists public.announcements  cascade;
--   drop table if exists public.settings       cascade;
--   drop table if exists public.payment_methods cascade;
--   drop table if exists public.deposits       cascade;
--   drop table if exists public.orders         cascade;
--   drop table if exists public.products       cascade;
--   drop table if exists public.categories     cascade;
--   drop table if exists public.admins         cascade;
--   drop table if exists public.users          cascade;

-- ---------- USERS ----------
create table if not exists public.users (
    telegram_id     bigint primary key,
    username        text,
    first_name      text,
    last_name       text,
    language        text not null default 'en' check (language in ('en','ar','vi')),
    balance         numeric(14,2) not null default 0,
    stock_alert     boolean not null default true,
    announcements   boolean not null default true,
    ref_code        text unique,
    -- referred_by intentionally has no FK constraint — enforcement
    -- is handled at the application layer to avoid self-reference
    -- quirks in some SQL editors. Add it later if you want strict
    -- integrity:
    --   alter table public.users
    --     add constraint users_referred_by_fkey
    --     foreign key (referred_by) references public.users(telegram_id)
    --     on delete set null;
    referred_by     bigint,
    joined_at       timestamptz not null default now(),
    last_seen_at    timestamptz not null default now()
);

create index if not exists users_referred_by_idx on public.users(referred_by);

-- ---------- ADMINS ----------
create table if not exists public.admins (
    telegram_id  bigint primary key,
    username     text,
    added_at     timestamptz not null default now()
);

-- ---------- CATEGORIES ----------
create table if not exists public.categories (
    id          bigserial primary key,
    name        text not null,
    emoji       text,
    sort_order  int not null default 0,
    active      boolean not null default true,
    created_at  timestamptz not null default now()
);

-- ---------- PRODUCTS ----------
create table if not exists public.products (
    id           bigserial primary key,
    category_id  bigint references public.categories(id) on delete cascade,
    name         text not null,
    description  text,
    note         text,
    price        numeric(14,2) not null check (price >= 0),
    stock        int not null default 0 check (stock >= 0),
    warranty     text,
    emoji        text,
    active       boolean not null default true,
    created_at   timestamptz not null default now()
);
create index if not exists products_category_idx on public.products(category_id);
create index if not exists products_active_idx   on public.products(active);

-- ---------- ORDERS ----------
create table if not exists public.orders (
    id           bigserial primary key,
    user_id      bigint not null references public.users(telegram_id) on delete cascade,
    product_id   bigint references public.products(id) on delete set null,
    product_name text not null,
    qty          int not null check (qty > 0),
    unit_price   numeric(14,2) not null,
    total        numeric(14,2) not null,
    delivery     text,
    status       text not null default 'paid' check (status in ('paid','refunded','cancelled')),
    created_at   timestamptz not null default now()
);
create index if not exists orders_user_idx on public.orders(user_id, created_at desc);

-- ---------- DEPOSITS ----------
create table if not exists public.deposits (
    id          bigserial primary key,
    user_id     bigint not null references public.users(telegram_id) on delete cascade,
    method      text not null,
    amount      numeric(14,2) not null check (amount > 0),
    status      text not null default 'pending' check (status in ('pending','approved','rejected')),
    reference   text,
    note        text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index if not exists deposits_user_idx   on public.deposits(user_id, created_at desc);
create index if not exists deposits_status_idx on public.deposits(status);

-- ---------- PAYMENT METHODS ----------
create table if not exists public.payment_methods (
    id            bigserial primary key,
    name          text not null,
    instructions  text not null,
    min_amount    numeric(14,2) not null default 1,
    active        boolean not null default true,
    sort_order    int not null default 0,
    created_at    timestamptz not null default now()
);

-- ---------- SETTINGS (key/value JSONB; admin-editable runtime config) ---
-- Keys are namespaced like:
--   text.welcome
--   text.shop.title
--   button.shop
--   color.in_stock        -> "blue" | "green"
--   color.out_of_stock    -> "red"
--   emoji.fire            -> { unicode: "🔥", custom_emoji_id: "5440..." }
create table if not exists public.settings (
    key         text primary key,
    value       jsonb not null,
    updated_by  bigint,
    updated_at  timestamptz not null default now()
);

-- ---------- ANNOUNCEMENTS ----------
create table if not exists public.announcements (
    id           bigserial primary key,
    body         text not null,
    sent_at      timestamptz,
    created_by   bigint,
    created_at   timestamptz not null default now()
);

-- ---------- REFERRALS (audit log) ----------
create table if not exists public.referrals (
    id           bigserial primary key,
    referrer_id  bigint not null references public.users(telegram_id) on delete cascade,
    referee_id   bigint not null references public.users(telegram_id) on delete cascade,
    created_at   timestamptz not null default now(),
    unique (referrer_id, referee_id)
);

-- ---------- VIEW: products + category name + in_stock flag ----------
create or replace view public.products_view as
    select
        p.*,
        c.name as category_name,
        case when p.stock > 0 then true else false end as in_stock
    from public.products p
    left join public.categories c on c.id = p.category_id;

-- =====================================================================
-- Row Level Security (defense in depth — bot uses service_role key
-- which bypasses RLS, but enable it for any future anon access).
-- =====================================================================
alter table public.users           enable row level security;
alter table public.admins          enable row level security;
alter table public.categories      enable row level security;
alter table public.products        enable row level security;
alter table public.orders          enable row level security;
alter table public.deposits        enable row level security;
alter table public.payment_methods enable row level security;
alter table public.settings        enable row level security;
alter table public.announcements   enable row level security;
alter table public.referrals       enable row level security;

-- =====================================================================
-- Seed: primary admin (replace with the real ID from your .env)
-- =====================================================================
insert into public.admins (telegram_id, username)
values (8004955979, 'digitalora')
on conflict (telegram_id) do nothing;

-- Default settings seeds
insert into public.settings (key, value) values
    ('color.in_stock',     '"blue"'::jsonb),
    ('color.out_of_stock', '"red"'::jsonb),
    ('text.welcome',       '"Welcome to Digitalora"'::jsonb),
    ('text.menu_button',   '"Main Menu"'::jsonb)
on conflict (key) do nothing;
