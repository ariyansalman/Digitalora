-- =====================================================================
-- 0025_product_pinning_and_oos_reorder.sql
--
-- Two related shop-UX features the bot owner asked for:
--
--   1. **Pinning / freeze position.** When `is_pinned = true` the
--      product is exempt from any automatic sort-order tweaks the
--      app might perform — most importantly it does NOT auto-slide
--      to the bottom of the catalog when it runs out of stock. It
--      stays exactly where the admin put it via the manual ↑ / ↓ /
--      ⏫ Top / ⏬ Bottom buttons.
--
--   2. **Auto-reorder on out-of-stock.** When an unpinned product's
--      `stock` transitions to 0 the app stashes the current
--      `sort_order` in `stashed_sort_order` and slams `sort_order` to
--      a sentinel value (`1_000_000_000`) so the catalog list pushes
--      it to the end. When the product is restocked (stock > 0
--      again) the original sort_order is restored from
--      `stashed_sort_order` and the stash is cleared, so the product
--      pops right back to where it used to live.
--
-- Both columns are nullable / default-safe so existing rows pick up
-- the new feature without any data backfill — `is_pinned` defaults
-- to false (no behaviour change) and `stashed_sort_order` defaults
-- to null (meaning "not currently auto-moved").
-- =====================================================================

alter table public.products
    add column if not exists is_pinned          boolean not null default false,
    add column if not exists stashed_sort_order int;

-- The catalog read query orders by `sort_order ASC, id ASC` and we
-- already have an index covering that tuple from migration 0010 —
-- no new index is required for `is_pinned` because the OOS sentinel
-- value in `sort_order` is what does the actual catalog reshuffle.
