/**
 * Global ban gate. Runs after `userMiddleware` so we can rely on
 * `ctx.user.is_banned` (already loaded from DB) without doing a
 * second round-trip per update.
 *
 * Behaviour:
 *   - Plain text / media messages from a banned user are silently
 *     dropped — no reply, no logging beyond a single debug line.
 *     This avoids feeding a banned user any signal that the bot is
 *     still alive (so they don't try to brute-force around it).
 *   - Inline-button taps (callback queries) get a tiny "You are
 *     banned." popup so Telegram doesn't leave the spinner stuck
 *     forever, but no message text is changed.
 *   - Admins are NEVER ban-gated even if their row is somehow
 *     flagged, so an admin can always recover access via /admin.
 */
import type { MiddlewareFn } from 'grammy';
import { isAdmin } from '../db/queries.js';
import { logger } from '../logger.js';
import type { AppCtx } from './user.js';

export const banMiddleware: MiddlewareFn<AppCtx> = async (ctx, next) => {
  if (!ctx.from) return next();
  if (!ctx.user?.is_banned) return next();

  // Belt and braces: never ban an admin, even if a stale ban row
  // somehow survived a promotion.
  if (await isAdmin(ctx.from.id)) return next();

  if (ctx.callbackQuery) {
    try {
      await ctx.answerCallbackQuery({
        text: '⛔ You are banned from this bot.',
        show_alert: true,
      });
    } catch {
      // Telegram occasionally fails to answer very old callback
      // queries — nothing actionable, just swallow.
    }
  }

  logger.debug(
    { tg_id: ctx.from.id, update: ctx.update.update_id },
    'ban: dropping update from banned user',
  );
  return;
};
