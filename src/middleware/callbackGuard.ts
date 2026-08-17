/**
 * Global callback-query reliability middleware.
 *
 * This sits in front of every handler and fixes the four failure modes
 * that make an otherwise-working bot feel broken, without any handler
 * needing to change:
 *
 *   1. **Frozen buttons** — Telegram spins the button until the query is
 *      answered. If a handler does slow work (Supabase + provider calls)
 *      before answering, the tap looks ignored. A watchdog answers the
 *      query after `ACK_WATCHDOG_MS` if the handler has not.
 *   2. **Stale / "query is too old"** — an answer is never attempted
 *      twice, and failures are swallowed (see `safeAnswerCallback`).
 *   3. **Duplicate clicks** — identical taps from the same user inside a
 *      short window (or while the first is still running) are dropped
 *      after being acknowledged, so no screen is rendered twice and no
 *      flow advances twice.
 *   4. **Dead buttons** — any handler that returns without answering
 *      gets a final acknowledgement, and any handler that throws gets an
 *      acknowledgement plus a user-safe alert.
 *
 * `noop:` payloads (decorative rows) are answered and dropped here.
 */
import { logger } from '../logger.js';
import { describeError, toUserMessage } from '../core/errors.js';
import {
  beginCallbackClick,
  callbackClickKey,
  safeAnswerCallback,
  type CallbackCtx,
} from '../ui/callbackSafety.js';
import { isNoopRoute } from '../ui/navigation.js';

/** How long a handler may run before we answer the query for it. */
export const ACK_WATCHDOG_MS = 1_200;

type GuardedCtx = {
  callbackQuery?: { data?: string | undefined } | undefined;
  from?: { id: number } | undefined;
  answerCallbackQuery: (other?: Record<string, unknown>) => Promise<unknown>;
};

/**
 * Wraps `ctx.answerCallbackQuery` so it can only ever run once per
 * update and can never throw. Returns a probe telling whether the query
 * has already been answered.
 */
function makeAnswerOnce(ctx: GuardedCtx): { answered: () => boolean } {
  let answered = false;
  const original = ctx.answerCallbackQuery.bind(ctx);
  ctx.answerCallbackQuery = async (other?: Record<string, unknown>) => {
    if (answered) return true;
    answered = true;
    try {
      return await original(other);
    } catch (err) {
      // Expired / already-answered queries are normal, not failures.
      logger.debug({ err: describeError(err) }, 'callbackGuard: answer suppressed');
      return false;
    }
  };
  return { answered: () => answered };
}

export async function callbackGuard(
  ctx: GuardedCtx,
  next: () => Promise<void>,
): Promise<void> {
  if (!ctx.callbackQuery) {
    await next();
    return;
  }

  const data = ctx.callbackQuery.data;
  const probe = makeAnswerOnce(ctx);

  // Decorative rows: acknowledge, render nothing.
  if (isNoopRoute(data)) {
    await safeAnswerCallback(ctx as CallbackCtx);
    return;
  }

  const release = beginCallbackClick(callbackClickKey(ctx.from?.id, data));
  if (!release) {
    // Duplicate tap: acknowledge so the spinner stops, then drop it.
    await safeAnswerCallback(ctx as CallbackCtx);
    logger.debug({ data, userId: ctx.from?.id }, 'callbackGuard: duplicate tap dropped');
    return;
  }

  const watchdog = setTimeout(() => {
    if (!probe.answered()) void safeAnswerCallback(ctx as CallbackCtx);
  }, ACK_WATCHDOG_MS);

  try {
    await next();
    if (!probe.answered()) await safeAnswerCallback(ctx as CallbackCtx);
  } catch (err) {
    logger.error({ err: describeError(err), data }, 'callbackGuard: handler failed');
    await safeAnswerCallback(ctx as CallbackCtx, {
      text: toUserMessage(err),
      showAlert: true,
    });
  } finally {
    clearTimeout(watchdog);
    release();
  }
}
