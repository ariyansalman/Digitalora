/**
 * Inline keyboards rendered under the final "verification done /
 * declined" status messages produced by `services/verifyingMsg.ts`.
 *
 * The keyboard always carries the standard "Back" button. On manual
 * (defer) outcomes we additionally show a premium-emoji "Admin Help"
 * button that deep-links to the bot owner's DM with a prefilled
 * message — letting the user one-tap escalate without copy-pasting
 * the deposit id by hand.
 */

import { InlineKeyboard } from 'grammy';
import type { Lang } from '../../config/index.js';
import { inlineBtn } from './helpers.js';
import { getAdminContactUrlWithPrefill, getEmoji } from '../services/settings.js';

/**
 * Plain-text Admin Help label. The leading 🆘 unicode is omitted so
 * the Bot API 9.4 `icon_custom_emoji_id` we attach below renders as
 * the only glyph on the button (otherwise premium clients would
 * see "<premium icon> 🆘 Admin Help" with two emojis side-by-side).
 */
const ADMIN_HELP_LABEL = 'Admin Help';

/**
 * Resolve the premium `custom_emoji_id` rendered next to the Admin
 * Help URL button on the verification-result keyboards. Bot owner
 * picks the underlying id via `/setemoji admin_help` (or the
 * compile-time default in `EMOJI.admin_help` — same id as the
 * Support body header so the help-escalation entry points share a
 * glyph). Returns `undefined` when neither has a custom_emoji_id
 * (e.g. an admin set a plain unicode override) so the button
 * renders without an icon rather than crashing.
 */
function adminHelpIconId(): string | undefined {
  const spec = getEmoji('admin_help');
  return typeof spec === 'object' ? spec.custom_emoji_id : undefined;
}

/**
 * Add the Admin Help URL button + premium icon to the keyboard. The
 * button always carries the configured custom_emoji_id when one is
 * available so the button reads as "[premium support glyph] Admin
 * Help" — matching the main-menu Support button so the buyer
 * recognises both as escalation entry points.
 */
function pushAdminHelpButton(kb: InlineKeyboard, url: string): InlineKeyboard {
  kb.url(ADMIN_HELP_LABEL, url);
  const iconId = adminHelpIconId();
  if (iconId) kb.icon(iconId);
  return kb;
}

/** Build the Admin Help URL for a deposit awaiting manual review. */
export function buildAdminHelpUrl(depositId: number, txOrOrderId: string): string {
  const text =
    `Hi Admin, I need help with my deposit #${depositId}.\n\n` +
    `Tx / Order ID: ${txOrOrderId}\n\n` +
    `My payment was sent but auto-verification didn't pass — please check it manually.`;
  return getAdminContactUrlWithPrefill(text);
}

/**
 * Build the Admin Help URL for a hard-rejected deposit. The user
 * still gets a one-tap escalation in case the rejection was wrong
 * (e.g. their wallet does report the right tx but our verifier
 * didn't find it because of a CDN cache hit).
 */
export function buildAdminHelpUrlForRejection(
  depositId: number,
  txOrOrderId: string,
  reason: string,
): string {
  const text =
    `Hi Admin, my deposit #${depositId} was auto-rejected — please double-check.\n\n` +
    `Tx / Order ID: ${txOrOrderId}\n` +
    `Auto-rejection reason: ${reason}`;
  return getAdminContactUrlWithPrefill(text);
}

export function manualReviewKeyboard(
  lang: Lang,
  depositId: number,
  txOrOrderId: string,
  backCallback: string = 'main:open',
): InlineKeyboard {
  const kb = new InlineKeyboard();
  pushAdminHelpButton(kb, buildAdminHelpUrl(depositId, txOrOrderId));
  kb.row();
  inlineBtn(kb, lang, 'back', backCallback);
  return kb;
}

export function rejectionKeyboard(
  lang: Lang,
  depositId: number,
  txOrOrderId: string,
  reason: string,
  backCallback: string = 'main:open',
): InlineKeyboard {
  const kb = new InlineKeyboard();
  pushAdminHelpButton(
    kb,
    buildAdminHelpUrlForRejection(depositId, txOrOrderId, reason),
  );
  kb.row();
  inlineBtn(kb, lang, 'back', backCallback);
  return kb;
}

export function successKeyboard(
  lang: Lang,
  backCallback: string = 'main:open',
): InlineKeyboard {
  const kb = new InlineKeyboard();
  inlineBtn(kb, lang, 'back', backCallback);
  return kb;
}
