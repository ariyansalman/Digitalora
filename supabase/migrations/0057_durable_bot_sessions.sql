-- =====================================================================
-- 0057_durable_bot_sessions.sql
-- Durable grammY session storage.
--
-- Purpose: navigation reliability across restarts. A Railway redeploy
-- used to wipe every in-progress multi-step flow (paste tx id, custom
-- quantity keypad, email capture, delivery form), leaving users on a
-- screen whose state no longer existed.
--
-- Scope: UI/flow state only. Orders, deposits, carts, wallet balances
-- and every other financial fact stay authoritative in their own
-- tables — nothing here is ever trusted for money.
--
-- Access: service-role only (the bot). RLS is enabled with no policies
-- for anon/authenticated, so the Data API cannot reach it.
-- =====================================================================

create table if not exists public.bot_sessions (
    key        text primary key,
    data       jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

create index if not exists bot_sessions_updated_at_idx
    on public.bot_sessions(updated_at);

grant all on public.bot_sessions to service_role;

alter table public.bot_sessions enable row level security;

-- Housekeeping helper: drop UI state untouched for 30 days.
create or replace function public.prune_bot_sessions(older_than interval default interval '30 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    removed integer;
begin
    delete from public.bot_sessions
     where updated_at < now() - older_than;
    get diagnostics removed = row_count;
    return removed;
end;
$$;

revoke all on function public.prune_bot_sessions(interval) from public, anon, authenticated;
grant execute on function public.prune_bot_sessions(interval) to service_role;
