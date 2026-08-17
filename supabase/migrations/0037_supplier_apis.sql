-- Upstream supplier APIs
--
-- These tables let the shop owner connect outside reseller/supplier
-- APIs, map selected local products to supplier product ids, and keep
-- a log of every automatic supplier order attempt.

create table if not exists public.supplier_api_sources (
    id bigserial primary key,
    name text not null,
    base_url text not null,
    api_key text not null default '',
    auth_mode text not null default 'x-api-key'
        check (auth_mode in ('none', 'bearer', 'x-api-key', 'query')),
    key_header text not null default 'x-api-key',
    key_query_param text not null default 'api_key',
    products_path text not null default '/products',
    balance_path text not null default '/balance',
    order_path text not null default '/order',
    order_method text not null default 'POST'
        check (order_method in ('GET', 'POST')),
    balance_json_path text not null default 'balance',
    products_json_path text not null default 'products',
    product_id_json_path text not null default 'id',
    product_name_json_path text not null default 'name',
    product_price_json_path text not null default 'price',
    product_stock_json_path text not null default 'stock',
    order_items_json_path text not null default 'items',
    order_status_json_path text not null default 'status',
    order_request_template jsonb not null default
        '{"product_id":"{{supplier_product_id}}","quantity":"{{qty}}","request_id":"{{request_id}}"}'::jsonb,
    enabled boolean not null default true,
    markup_percent numeric(8,2) not null default 25,
    fixed_markup numeric(12,4) not null default 0,
    low_balance_threshold numeric(12,4) not null default 5,
    notes text,
    last_balance numeric(12,4),
    last_sync_at timestamptz,
    last_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists supplier_api_sources_enabled_idx
    on public.supplier_api_sources(enabled, created_at desc);

create table if not exists public.supplier_product_links (
    id bigserial primary key,
    local_product_id integer not null references public.products(id) on delete cascade,
    supplier_id bigint not null references public.supplier_api_sources(id) on delete cascade,
    supplier_product_id text not null,
    supplier_product_name text,
    supplier_cost numeric(12,4),
    supplier_stock integer,
    auto_order boolean not null default true,
    auto_sync_stock boolean not null default true,
    fallback_manual boolean not null default true,
    last_sync_at timestamptz,
    last_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (local_product_id)
);

create index if not exists supplier_product_links_supplier_idx
    on public.supplier_product_links(supplier_id);

create index if not exists supplier_product_links_product_idx
    on public.supplier_product_links(local_product_id);

create table if not exists public.supplier_order_logs (
    id bigserial primary key,
    supplier_id bigint references public.supplier_api_sources(id) on delete set null,
    local_order_id bigint references public.orders(id) on delete cascade,
    local_product_id integer references public.products(id) on delete set null,
    supplier_product_id text,
    status text not null default 'pending'
        check (status in ('pending', 'success', 'failed', 'manual')),
    request_payload jsonb not null default '{}'::jsonb,
    response_payload jsonb not null default '{}'::jsonb,
    error text,
    created_at timestamptz not null default now()
);

create index if not exists supplier_order_logs_order_idx
    on public.supplier_order_logs(local_order_id);

create index if not exists supplier_order_logs_supplier_created_idx
    on public.supplier_order_logs(supplier_id, created_at desc);
