-- =====================================================================
-- 0011_user_ban.sql
-- Lets the admin ban specific users so the bot ignores all their
-- updates (messages and inline-button taps) until they are unbanned.
--
--   - is_banned     : boolean flag, defaults to false. Existing users
--                     remain unbanned.
--   - banned_at     : when the most recent ban was applied (or NULL
--                     if never banned / currently unbanned).
--   - banned_reason : optional admin-supplied note shown nowhere to
--                     the banned user, only in the admin user card.
-- =====================================================================

alter table public.users
    add column if not exists is_banned     boolean not null default false,
    add column if not exists banned_at     timestamptz,
    add column if not exists banned_reason text;

create index if not exists users_is_banned_idx on public.users(is_banned)
    where is_banned = true;
