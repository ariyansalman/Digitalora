-- 0055_deposit_payment_method_id.sql
-- Persist the exact payment_methods row used to create each deposit.
-- This removes fragile display-name matching and prevents provider
-- mix-ups when methods are renamed or duplicate names exist.
alter table public.deposits
  add column if not exists payment_method_id bigint references public.payment_methods(id) on delete set null;

create index if not exists deposits_payment_method_id_idx
  on public.deposits(payment_method_id);

-- Best-effort backfill for legacy rows. Rows with ambiguous duplicate
-- method names are intentionally left NULL and continue using the legacy
-- name fallback in application code.
update public.deposits d
set payment_method_id = pm.id
from public.payment_methods pm
where d.payment_method_id is null
  and d.method = pm.name
  and (
    select count(*)
    from public.payment_methods pm2
    where pm2.name = d.method
  ) = 1;
