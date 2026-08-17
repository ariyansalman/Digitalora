-- =====================================================================
-- 0023_promo_user_exclusions.sql
-- Per-promo user exclusion list. Lets the admin keep a default
-- (or per-product) promo running for everyone *except* a specific
-- set of users — e.g. promo abusers, competitors, or anyone the
-- bot owner wants to opt out individually.
--
-- The exclusion is checked at resolve time AFTER the existing
-- scope filter:
--   1) the user's telegram_id matches the promo's scope, AND
--   2) the user's telegram_id is NOT in `excluded_telegram_ids`.
--
-- Defaults to an empty array so every existing promo row keeps
-- behaving exactly as it did before this migration.
-- =====================================================================

alter table public.promos
    add column if not exists excluded_telegram_ids bigint[] not null default '{}';

-- GIN index on the exclusion array. Cheap to maintain (most rows
-- stay empty) and lets the resolver short-circuit at query time
-- once we start filtering on it via the supabase-js `.contains` /
-- `.overlaps` operators.
create index if not exists promos_excluded_idx
    on public.promos using gin (excluded_telegram_ids);
