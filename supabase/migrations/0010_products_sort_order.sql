-- =====================================================================
-- 0010_products_sort_order.sql
-- Manual product reordering for the admin product-management screen.
--
-- Mirrors the `sort_order` column already on `categories` and
-- `payment_methods`. Defaulted to 0 so legacy rows keep their
-- existing relative order (the queries break ties on `id ASC`,
-- preserving the historic insertion-order behaviour). Admin UI now
-- exposes ↑ / ↓ "move up" / "move down" buttons next to each
-- product row that swap the `sort_order` of two adjacent rows
-- across pages.
-- =====================================================================

alter table public.products
    add column if not exists sort_order int not null default 0;

create index if not exists products_sort_order_idx
    on public.products(sort_order, id);
