-- =====================================================================
-- Remove the click-sound user preference columns.
-- The click-sound feature was removed; these columns are no longer
-- read or written by the bot, so drop them to keep the schema clean.
-- =====================================================================

alter table public.users drop column if exists click_sound;
alter table public.users drop column if exists click_sound_off;
