-- =====================================================================
-- 0031_reconcile_product_stock_order.sql
--
-- Reconciles every existing product with the automatic catalog order:
-- out-of-stock products move to the bottom, and restocked products
-- return to their previously stashed position.
-- =====================================================================

alter table public.products
    add column if not exists is_pinned boolean not null default false,
    add column if not exists stashed_sort_order int;

-- Restore products that have stock again but are still sitting at the
-- synthetic out-of-stock sort position.
update public.products
   set sort_order = stashed_sort_order,
       stashed_sort_order = null
 where stock > 0
   and coalesce(unlimited_stock, false) = false
   and stashed_sort_order is not null;

-- Move all currently out-of-stock products to the bottom.
update public.products
   set stashed_sort_order = sort_order,
       sort_order = 1000000000
 where stock <= 0
   and coalesce(unlimited_stock, false) = false
   and stashed_sort_order is null
   and sort_order < 1000000000;
