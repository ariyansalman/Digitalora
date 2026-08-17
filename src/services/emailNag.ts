/**
 * 12-hour "Please add your verified email" nag.
 *
 * The bot owner asked for a soft, recurring reminder for users who
 * haven't saved an email yet. Implemented as an interaction-driven
 * check (no separate cron job) so it works on every deploy platform:
 *
 *   - On any handler entry, call `maybeSendEmailNag(ctx)`.
 *   - Skip when the user already has an email, when notifications
 *     are disabled (`email_nag_disabled = true`), or when the last
 *     nag was less than 12 hours ago.
 *   - When eligible, send the premium-emoji reminder and stamp
 *     `last_email_nag_at = now()`.
 *
 * The reminder is registered at the lowest level so it does not
 * interfere with any in-progress flow (e.g. qty keypad, set-email
 * input).
 */
import type { AppCtx } from '../middleware/user.js';
import { markEmailNagSent } from '../db/queries.js';
import { renderMdHtml } from './premium.js';
import { logger } from '../logger.js';

const NAG_INTERVAL_MS = 12 * 60 * 60 * 1000;

export async function maybeSendEmailNag(ctx: AppCtx): Promise<void> {
  // Bail when the user has nothing to nag about.
  if (ctx.user.email) return;
  if (ctx.user.email_nag_disabled) return;
  // Skip when the user is mid-flow — sending an unsolicited message
  // during a guided input (qty keypad, set-email) breaks the UX.
  if (ctx.session.userFlow) return;

  const last = ctx.user.last_email_nag_at
    ? new Date(ctx.user.last_email_nag_at).getTime()
    : 0;
  const now = Date.now();
  if (now - last < NAG_INTERVAL_MS) return;

  try {
    const body = ctx.t('profile.email.nag');
    await ctx.api.sendMessage(ctx.user.telegram_id, renderMdHtml(body), {
      parse_mode: 'HTML',
    });
    await markEmailNagSent(ctx.user.telegram_id);
    ctx.user.last_email_nag_at = new Date(now).toISOString();
  } catch (err) {
    // Telegram blocks (e.g. user blocked the bot) and DB errors
    // should never break the parent handler — just log and move on.
    logger.warn({ err, telegram_id: ctx.user.telegram_id }, 'email nag failed');
  }
}
