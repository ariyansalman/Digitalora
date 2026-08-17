-- =====================================================================
-- 0005_user_profile_fields.sql
-- Add profile fields shown on the Settings/Profile screen:
--   - email     : user-supplied contact email (optional)
--   - region    : human-readable country/region label (optional)
--   - timezone  : IANA timezone identifier (e.g. 'Asia/Karachi')
--   - status    : free-form status string ('started bot', 'verified', …)
--
-- All fields are nullable; existing rows continue to work unchanged.
-- =====================================================================

alter table public.users
    add column if not exists email     text,
    add column if not exists region    text,
    add column if not exists timezone  text,
    add column if not exists status    text;
