/**
 * Centralized callback-query safety.
 *
 * Two classes of bug were spread across the handler layer:
 *
 *   1. `answerCallbackQuery()` called ~480 times, mostly unguarded. When
 *      the query has expired Telegram throws, the throw escapes into
 *      `bot.catch`, and the user's tap looks completely ignored.
 *   2. Callback payloads parsed with ad-hoc `split(':')` + `Number(...)`,
 *      so a stale or malformed payload produced `NaN` ids that reached
 *      the database layer.
 *
 * Everything here is additive and side-effect free at import time.
 */
import { describeError, isExpiredCallbackError, toUserMessage } from '../core/errors.js';
import { logger } from '../logger.js';

export type CallbackCtx = {
  callbackQuery?: { data?: string | undefined } | undefined;
  answerCallbackQuery: (other?: Record<string, unknown>) => Promise<unknown>;
};

/**
 * Answers a callback query without ever throwing. Returns `true` when
 * Telegram accepted the answer.
 */
export async function safeAnswer(
  ctx: CallbackCtx,
  options: { text?: string; showAlert?: boolean; url?: string } = {},
): Promise<boolean> {
  if (!ctx.callbackQuery) return false;
  const payload: Record<string, unknown> = {};
  if (options.text !== undefined) payload['text'] = options.text;
  if (options.showAlert !== undefined) payload['show_alert'] = options.showAlert;
  if (options.url !== undefined) payload['url'] = options.url;
  try {
    await ctx.answerCallbackQuery(payload);
    return true;
  } catch (err) {
    if (isExpiredCallbackError(err)) return false;
    logger.debug({ err: describeError(err) }, 'safeAnswer: answerCallbackQuery failed');
    return false;
  }
}

/** Convenience wrapper for the common "show an alert to the user" case. */
export function alertUser(ctx: CallbackCtx, text: string): Promise<boolean> {
  return safeAnswer(ctx, { text, showAlert: true });
}

/**
 * Splits `"adm:usr:42"` into its parts. Returns an empty array when there
 * is no callback payload, so callers never index into `undefined`.
 */
export function callbackParts(ctx: CallbackCtx): string[] {
  const data = ctx.callbackQuery?.data;
  return typeof data === 'string' && data.length > 0 ? data.split(':') : [];
}

/**
 * Reads a positional segment of the callback payload as a finite integer.
 * Returns `null` for missing/malformed segments instead of `NaN`.
 */
export function callbackInt(ctx: CallbackCtx, index: number): number | null {
  return parseIntSegment(callbackParts(ctx)[index]);
}

/** Same as `callbackInt` but falls back to `fallback` (default `0`). */
export function callbackIntOr(ctx: CallbackCtx, index: number, fallback = 0): number {
  return callbackInt(ctx, index) ?? fallback;
}

export function parseIntSegment(segment: string | undefined): number | null {
  if (segment === undefined || segment === '') return null;
  const value = Number(segment);
  return Number.isFinite(value) && Number.isInteger(value) ? value : null;
}

/** Clamps a page index parsed from a callback into a valid range. */
export function clampPage(page: number | null, totalPages: number): number {
  const max = Math.max(0, totalPages - 1);
  if (page === null || page < 0) return 0;
  return Math.min(page, max);
}

/**
 * Wraps a callback handler with consistent error handling: unexpected
 * throws are logged once, and the user always gets an acknowledgement
 * instead of a silently dead button.
 */
export function guardCallback<C extends CallbackCtx>(
  name: string,
  handler: (ctx: C) => Promise<void>,
): (ctx: C) => Promise<void> {
  return async (ctx: C) => {
    try {
      await handler(ctx);
    } catch (err) {
      logger.error(
        { err: describeError(err), callback: name, data: ctx.callbackQuery?.data },
        'callback handler failed',
      );
      await safeAnswer(ctx, { text: toUserMessage(err), showAlert: true });
    }
  };
}

/**
 * Canonical name for `safeAnswer`, matching `safeEditMessage()` /
 * `safeNavigate()` / `clearFlowState()`. `safeAnswer` remains exported
 * for the existing call sites.
 */
export const safeAnswerCallback = safeAnswer;

/* ------------------------------------------------------------------ *
 * Duplicate-click suppression
 * ------------------------------------------------------------------ *
 * Telegram happily delivers three updates for three impatient taps on
 * the same button. Without a guard that means three order attempts,
 * three edits racing each other, and two of them failing with
 * "message is not modified" — which the user reads as a frozen button.
 *
 * The guard is intentionally tiny and in-memory: it protects the *UI*
 * from double renders. Financial idempotency stays where it belongs, in
 * the Supabase statements that create orders and deposits.
 */

/**
 * A tap is only ever suppressed while an identical tap is still being
 * processed. That is precisely the double-click case (the second update
 * arrives while the first handler is awaiting Supabase/Telegram), and it
 * leaves legitimate re-navigation — going Back to a screen you were on a
 * moment ago — completely untouched.
 *
 * The lock is released when the handler finishes, or abandoned after
 * this timeout so a crashed handler can never freeze a button forever.
 */
export const DUPLICATE_CLICK_WINDOW_MS = 15_000;

type ClickRecord = { at: number; inFlight: boolean };

const recentClicks = new Map<string, ClickRecord>();

function pruneClicks(now: number): void {
  if (recentClicks.size < 512) return;
  for (const [key, record] of recentClicks) {
    if (!record.inFlight && now - record.at > DUPLICATE_CLICK_WINDOW_MS) {
      recentClicks.delete(key);
    }
  }
}

export function callbackClickKey(userId: number | undefined, data: string | undefined): string {
  return `${userId ?? 0}:${data ?? ''}`;
}

/**
 * Registers a tap. Returns `null` when the tap is a duplicate (either an
 * identical tap is still being processed, or it landed inside the
 * de-duplication window); otherwise returns a `release()` to call once
 * the handler has finished.
 */
export function beginCallbackClick(
  key: string,
  now: number = Date.now(),
): (() => void) | null {
  pruneClicks(now);
  const existing = recentClicks.get(key);
  if (existing?.inFlight && now - existing.at < DUPLICATE_CLICK_WINDOW_MS) {
    return null;
  }
  const record: ClickRecord = { at: now, inFlight: true };
  recentClicks.set(key, record);
  return () => {
    record.inFlight = false;
    record.at = Date.now();
  };
}

/** Test/ops helper: forget all click bookkeeping. */
export function resetCallbackClicks(): void {
  recentClicks.clear();
}
