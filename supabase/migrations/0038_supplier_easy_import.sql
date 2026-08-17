-- Supplier API easy import controls
--
-- Adds button-driven supplier options on top of 0037:
-- - auto import newly seen supplier products during sync
-- - choose whether auto-imported products are visible immediately
-- - choose the local category name for imported supplier products

alter table public.supplier_api_sources
  add column if not exists auto_import_new_products boolean not null default false,
  add column if not exists auto_import_active boolean not null default false,
  add column if not exists import_category_name text;

update public.supplier_api_sources
set import_category_name = coalesce(import_category_name, 'Supplier - ' || name)
where import_category_name is null;
