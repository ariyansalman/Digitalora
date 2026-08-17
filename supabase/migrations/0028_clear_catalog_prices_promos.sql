-- =====================================================================
-- 0028_clear_catalog_prices_promos.sql
--
-- NO-OP SAFETY MIGRATION.
--
-- The original version of this file deleted catalog products, promos,
-- product items, and per-user price overrides. It is intentionally kept
-- as a no-op so future deploys do not accidentally wipe live shop data.
-- =====================================================================

do $$
begin
    raise notice '0028_clear_catalog_prices_promos is disabled; no data was changed.';
end;
$$;
