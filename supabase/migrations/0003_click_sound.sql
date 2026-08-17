-- =====================================================================
-- Per-user click-sound preferences.
--
-- click_sound       : master ON/OFF for the click-sound effect.
-- click_sound_off   : list of button keys the user has individually
--                     muted (e.g. {'shop','topup'}).
-- =====================================================================

alter table public.users
  add column if not exists click_sound boolean not null default true;

alter table public.users
  add column if not exists click_sound_off text[] not null default '{}';
