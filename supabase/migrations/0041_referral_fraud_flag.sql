-- =====================================================================
-- 0041_referral_fraud_flag.sql
-- Add referral_fraud_suspected flag to users table.
-- This flag is used to block users suspected of referral fraud from
-- converting referrals to wallet or buying products with referrals.
-- =====================================================================

alter table public.users
    add column if not exists referral_fraud_suspected boolean not null default false;

-- Index for fast lookup when checking fraud status
create index if not exists users_referral_fraud_idx
    on public.users(referral_fraud_suspected)
    where referral_fraud_suspected = true;

comment on column public.users.referral_fraud_suspected is
    'When true, the user is flagged as suspected of referral fraud and cannot convert/use referrals.';
