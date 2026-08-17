-- =====================================================================
-- 0042_delivery_completion_notify.sql
--
-- Adds admin completion notification for delivery form orders:
-- - admin_completed_at: timestamp when admin marked order as complete
-- - admin_completion_message: custom message admin sends to buyer
--
-- Admin can now:
-- 1. View pending delivery form submissions
-- 2. Edit completion message per product
-- 3. Click "Notify Buyer Done" to send completion message
-- =====================================================================

-- Add completion tracking to submissions
alter table public.order_delivery_submissions
    add column if not exists admin_completed_at timestamptz,
    add column if not exists admin_completed_by bigint;

-- Add custom completion message per product (reuses existing success message if not set)
alter table public.products
    add column if not exists delivery_completion_message text;

-- RLS already enabled in 0024
