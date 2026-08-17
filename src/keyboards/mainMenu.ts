import { InlineKeyboard } from 'grammy';
import { MAIN_MENU_LAYOUT, BUTTON_KEYS, type Lang } from '../../config/index.js';
import { getChannelUrl } from '../services/settings.js';
import { inlineBtn, inlineUrl } from './helpers.js';

const DEFAULT_CHANNEL_URL = 'https://t.me/digitalorastore';

function normalizeChannelUrl(value: string | undefined): string {
  const raw = (value ?? DEFAULT_CHANNEL_URL).trim();
  if (!raw) return DEFAULT_CHANNEL_URL;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('@')) return `https://t.me/${raw.slice(1)}`;
  if (/^-100\d+$/.test(raw)) return DEFAULT_CHANNEL_URL;
  return `https://t.me/${raw.replace(/^t\.me\//i, '')}`;
}

/**
 * Map main-menu button keys to their callback data.
 *
 * `Partial` so we don't have to enumerate every BUTTON_KEYS entry —
 * only the ones reachable from MAIN_MENU_LAYOUT actually need a
 * callback here. Unknown keys fall back to a `noop:` callback below.
 */
const CALLBACK: Partial<Record<keyof typeof BUTTON_KEYS, string>> = {
  shop: 'shop:home',
  cart: 'cart:open',
  topup: 'topup:open',
  profile: 'profile:open',
  support: 'support:open',
  ai_support: 'support:ai',
  main_menu: 'main:open',
  back: 'main:open',
  buy_now: 'noop:buy',
  topup_wallet: 'topup:open',
  my_orders: 'profile:orders',
  refer: 'profile:refer',
  notifications: 'profile:notifications',
  language: 'profile:lang',
  deposit_history: 'profile:deposits',
  channel: 'channel:open',
  reseller_api: 'api:open',
  back_to_settings: 'profile:open',
  stats: 'profile:stats',
  stats_refresh: 'profile:stats:refresh',
  set_region: 'profile:region',
  set_email: 'profile:email:set',
};

/** Inline keyboard rendered under the welcome message. */
export function mainMenuKeyboard(lang: Lang): InlineKeyboard {
  const kb = new InlineKeyboard();
  MAIN_MENU_LAYOUT.forEach((row, i) => {
    row.forEach((k) => {
      if (k === 'channel') {
        inlineUrl(kb, lang, k, normalizeChannelUrl(getChannelUrl()));
        return;
      }
      inlineBtn(kb, lang, k, CALLBACK[k] ?? `noop:${k}`);
    });
    if (i < MAIN_MENU_LAYOUT.length - 1) kb.row();
  });
  return kb;
}

/** "⬅️ Back" button used at the bottom of sub-screens. Returns to main menu. */
export function backToMenuKeyboard(lang: Lang): InlineKeyboard {
  return inlineBtn(new InlineKeyboard(), lang, 'back', 'main:open');
}
