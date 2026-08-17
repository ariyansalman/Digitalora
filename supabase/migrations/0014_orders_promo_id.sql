-- =====================================================================
-- 0014_orders_promo_id.sql
-- Stamp the matching promo (if any) on each new order. Lets the
-- admin promo overview show *exact* impact stats — count of orders
-- and total USDT discounted — instead of inferring from the
-- floating-point `discount` column alone (which collides whenever
-- two promos happen to share the same discount value).
--
-- Nullable + ON DELETE SET NULL: deleting a promo doesn't ripple
-- into order history; the order keeps its `discount` value but
-- the link is forgotten.
-- =====================================================================

alter table public.orders
    add column if not exists promo_id bigint
    references public.promos(id) on delete set null;

-- Partial index so impact-stats queries (`where promo_id = ?`) stay
-- fast without indexing the long historical tail of pre-promo orders.
create index if not exists orders_promo_idx
    on public.orders(promo_id) where promo_id is not null;
