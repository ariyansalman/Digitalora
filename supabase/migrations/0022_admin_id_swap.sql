-- =====================================================================
-- 0022_admin_id_swap.sql
-- Swap the primary live-support admin telegram_id from the legacy
-- account (7913962419) to the new account (8004955979). The original
-- 0001_init.sql seed only inserts on a fresh database, so existing
-- deployments need this dedicated migration to actually flip the
-- `admins` row that powers `isAdmin()` (live support relay, admin
-- panel access, ban/unban, log-channel fallback DM, etc.).
--
-- Idempotent: insert-then-delete so re-running is a no-op once the
-- new admin is in place. No foreign keys reference `admins.telegram_id`
-- so the delete is safe.
-- =====================================================================

insert into public.admins (telegram_id, username)
values (8004955979, 'digitalora')
on conflict (telegram_id) do nothing;

delete from public.admins
 where telegram_id = 7913962419;
