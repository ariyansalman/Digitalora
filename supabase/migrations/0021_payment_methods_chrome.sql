-- 0021_payment_methods_chrome.sql
--
-- Add per-payment-method "chrome" (color + premium emoji icon) so the
-- bot owner can style each payment-method button on the new Top-Up
-- Wallet / Select Payment Method screens individually. Stored on the
-- payment_methods row itself (rather than the generic settings table)
-- because the values are tied to a specific row's lifetime — when an
-- admin deletes a payment method, the customisation goes with it.
--
-- Columns:
--   * color_mode — one of 'none' | 'blue' | 'green' | 'red' | 'yellow'.
--                  Maps to the Bot API 9.4 button `style` (primary /
--                  success / danger / app-default). Defaults to 'none'
--                  so existing rows keep their current look.
--   * emoji_unicode — fallback unicode glyph rendered on non-premium
--                  Telegram clients (e.g. '🟡', '💎').
--   * emoji_id — Telegram premium custom_emoji_id rendered as the
--                  button icon for premium users (Bot API 9.4
--                  icon_custom_emoji_id). Null falls back to the
--                  generic provider glyph.

alter table public.payment_methods
    add column if not exists color_mode text not null default 'none'
        check (color_mode in ('none', 'blue', 'green', 'red', 'yellow'));

alter table public.payment_methods
    add column if not exists emoji_unicode text;

alter table public.payment_methods
    add column if not exists emoji_id text;
