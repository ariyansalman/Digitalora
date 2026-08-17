-- =====================================================================
-- 0008_wallet_alert.sql
-- Add a third notification toggle so users can independently enable
-- wallet-related alerts (deposits, ledger entries, low-balance, …)
-- alongside Stock Alerts and Info Alerts.
--
-- Existing rows default to ON to preserve current behaviour.
-- =====================================================================

alter table public.users
    add column if not exists wallet_alert boolean not null default true;
