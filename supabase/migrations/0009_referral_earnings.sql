-- =====================================================================
-- 0009_referral_earnings.sql
-- Referral-earning columns surfaced on the Refer & Earn screen.
--
-- Each referrer accumulates 1 % of every top-up made by users they
-- referred (capped at $1 per top-up — enforced in application code).
-- Earnings start in `available`. The user can transfer them to their
-- wallet at any time, or cash them out via support (≥ $1.00).
--
-- Columns:
--   referral_earned_total  - lifetime total credited (never decreases)
--   referral_available     - balance still claimable
--   referral_transferred   - moved to wallet
--   referral_withdrawn     - cashed out via support
-- =====================================================================

alter table public.users
    add column if not exists referral_earned_total numeric(14,2) not null default 0,
    add column if not exists referral_available    numeric(14,2) not null default 0,
    add column if not exists referral_transferred  numeric(14,2) not null default 0,
    add column if not exists referral_withdrawn    numeric(14,2) not null default 0;
