-- Reseller Product API
--
-- Users can generate an API key from Telegram and use it from their
-- own website/bot to list products, check wallet balance, and place
-- wallet-funded orders. Keys are stored as SHA-256 hashes only.

create table if not exists public.reseller_api_keys (
    id bigserial primary key,
    user_id bigint not null references public.users(telegram_id) on delete cascade,
    key_hash text not null unique,
    key_prefix text not null,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    last_used_at timestamptz,
    revoked_at timestamptz
);

create index if not exists reseller_api_keys_user_active_idx
    on public.reseller_api_keys(user_id, active);

create table if not exists public.reseller_api_orders (
    id bigserial primary key,
    user_id bigint not null references public.users(telegram_id) on delete cascade,
    api_key_id bigint references public.reseller_api_keys(id) on delete set null,
    order_id bigint not null references public.orders(id) on delete cascade,
    product_id integer not null references public.products(id) on delete restrict,
    qty integer not null check (qty > 0),
    total numeric not null check (total >= 0),
    request_id text,
    created_at timestamptz not null default now(),
    unique (user_id, request_id)
);

create index if not exists reseller_api_orders_user_created_idx
    on public.reseller_api_orders(user_id, created_at desc);

