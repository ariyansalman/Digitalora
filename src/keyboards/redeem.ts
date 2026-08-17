/**
 * Keyboard for the Redeem Gift Code screen.
 *
 * - Back → Settings
 * - Buy Code → URL button to admin contact (DM via t.me link)
 */
import { InlineKeyboard } from 'grammy';
import { type Lang } from '../../config/index.js';
import { inlineBtn, inlineUrl } from './helpers.js';

export function redeemKeyboard(lang: Lang, adminContactUrl: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  inlineBtn(kb, lang, 'back_to_settings', 'profile:open');
  inlineUrl(kb, lang, 'buy_code', adminContactUrl);
  return kb;
}
