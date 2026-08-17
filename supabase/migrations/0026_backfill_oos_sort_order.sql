-- =====================================================================
-- 0026_backfill_oos_sort_order.sql
--
-- One-shot backfill for the OOS auto-reorder feature introduced in
-- migration 0025.
--
-- The TypeScript `applyStockTransition` hook only fires when a
-- product's stock value *changes* across the zero boundary (i.e. when
-- the catalog actually sees the in-stock -> OOS transition at
-- runtime). Products that were already at stock 0 *before* the new
-- code was deployed never go through that transition, so the new
-- code has no opportunity to stash their sort_order and shove them
-- to the end of the catalog.
--
-- Result: the bot-owner ships the new code, restarts the bot, and
-- sees the new ⏫ / ⏬ / 📌 buttons in the admin product list — but
-- the products that were already out of stock are still sitting in
-- their original slots, mixed in with in-stock products. That's the
-- exact symptom we're patching here.
--
-- This migration walks every currently-OOS product that:
--   * is NOT pinned (admin's explicit "stay put"),
--   * is NOT marked `unlimited_stock` (those have no concept of
--     OOS),
--   * doesn't already have a `stashed_sort_order` (so re-running
--     this migration is a no-op),
--   * has a `sort_order` strictly below the OOS sentinel
--     `1_000_000_000` (defense-in-depth — if the row is already at
--     the sentinel it must have been auto-moved by 0025+code on a
--     real transition, leave it alone),
-- and stashes its current sort_order into `stashed_sort_order` then
-- slams `sort_order` to the same sentinel value the TS hook uses
-- (`OUT_OF_STOCK_SORT_ORDER = 1_000_000_000`). The catalog read
-- query orders by (sort_order ASC, id ASC) so the backfilled rows
-- naturally fall to the very end of the list.
--
-- On the next restock (admin uploads items / increments stock /
-- syncs the pool), the existing TS transition hook will see the
-- in-stock value, read the stash, and pop the product right back to
-- its old admin-set slot. No code changes required — this migration
-- is purely a data fix.
-- =====================================================================

update public.products
   set stashed_sort_order = sort_order,
       sort_order         = 1000000000
 where (stock is null or stock <= 0)
   and coalesce(unlimited_stock, false) = false
   and coalesce(is_pinned, false)       = false
   and stashed_sort_order is null
   and sort_order < 1000000000;
