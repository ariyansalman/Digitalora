/**
 * Animated "Verifying Transaction…" message.
 *
 * Renders a single Telegram message that:
 *   1. Shows a 10-cell `▓░` progress bar that fills over the
 *      configured `expectedMs` window.
 *   2. Displays the user-submitted TxID / Order ID in monospace.
 *   3. Shows a `~Xs remaining` countdown (rounded to whole seconds).
 *   4. Refreshes itself every ~1 second via `editMessageText` until
 *      the verifier finishes.
 *
 * On finish:
 *   - `done()` rewrites the message to the success / decline copy
 *     supplied by the caller and schedules the auto-delete.
 *   - 5 seconds after `done()` the message is removed from the chat
 *     (errors swallowed — the user may have closed the chat etc.).
 *
 * The header / footer pieces use the shared premium-emoji renderer
 * via `renderMdHtml`, so admin-overridden custom emojis are honoured
 * (Bot API 9.4 `entities` rendering).
 */

import type { Api } from 'grammy';
import type { InlineKeyboard } from 'grammy';
import { logger } from '../logger.js';
import { renderMdHtml } from './premium.js';

/**
 * How long the verification typically takes. The progress bar fills
 * linearly to ~95 % over this window so the bar visibly *moves*
 * even when the verifier resolves earlier than expected. The bar
 * caps at 95 % until `done()` is called so the user doesn't see
 * "100 %" then a fresh status flash.
 */
const DEFAULT_EXPECTED_MS = 30_000;

/** How often the message is re-rendered (Telegram's edit rate-limit). */
const TICK_MS = 1_000;

// (Auto-delete of the final result message was removed per a
// follow-up user request: "don't del this msg and payment approve
// msg". Keeping the disapproval and the success cards on screen
// makes sure the inline keyboard's `🆘 Admin Help` (rejection) and
// `Back` (success) buttons remain tappable, and gives the user a
// permanent record of how their deposit / direct-pay was resolved.)

const BAR_WIDTH = 10;
const FILLED = '▓';
const EMPTY = '░';

function makeBar(pct: number): string {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const filled = Math.round((clamped / 100) * BAR_WIDTH);
  return FILLED.repeat(filled) + EMPTY.repeat(BAR_WIDTH - filled) + ` ${clamped}%`;
}

export interface VerifyingMessage {
  /** Chat the status message lives in. */
  chatId: number;
  /** Message id of the status message. */
  messageId: number;
  /**
   * Stop the animation and rewrite the message to the supplied
   * final body + keyboard. The message stays on screen indefinitely
   * (no auto-delete) so the user keeps a record of the verification
   * result and any inline-keyboard buttons remain tappable.
   */
  done(opts: {
    text: string;
    reply_markup?: InlineKeyboard;
  }): Promise<void>;
}

/**
 * Begin showing the animated "Verifying Transaction…" message in
 * `chatId`. Call `done()` on the returned handle once the verifier
 * resolves (success or failure) — the handle takes care of the
 * 5-second auto-delete.
 *
 * The animation continues until either `done()` is called or the
 * Telegram edit fails (likely because the chat was closed). It
 * never throws — animation failures are logged at debug level so
 * they don't pollute the bot's logs.
 */
export async function startVerifyingMessage(args: {
  api: Api;
  chatId: number;
  /** User-submitted hash / order id rendered next to the bar. */
  txId: string;
  /**
   * Estimated total verification window in ms. Defaults to 30 s
   * which lines up with on-chain RPC + Binance Pay query latency.
   */
  expectedMs?: number;
}): Promise<VerifyingMessage> {
  const { api, chatId } = args;
  const expectedMs = args.expectedMs ?? DEFAULT_EXPECTED_MS;
  const startedAt = Date.now();

  const renderBody = (): string => {
    const elapsed = Date.now() - startedAt;
    const pct = Math.min(95, Math.round((elapsed / expectedMs) * 100));
    const remainingMs = Math.max(0, expectedMs - elapsed);
    const remainingS = Math.max(1, Math.ceil(remainingMs / 1000));
    return [
      '🔎 *Verifying Transaction…*',
      '',
      `*TxID/Id:* \`${args.txId}\``,
      '',
      makeBar(pct),
      '',
      '⏳ Checking…',
      `~ ${remainingS}s remaining`,
      '',
      'Please wait while we confirm your payment.',
    ].join('\n');
  };

  const sent = await api.sendMessage(chatId, renderMdHtml(renderBody()), {
    parse_mode: 'HTML',
  });
  const messageId = sent.message_id;

  let stopped = false;
  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      await api.editMessageText(chatId, messageId, renderMdHtml(renderBody()), {
        parse_mode: 'HTML',
      });
    } catch (err) {
      const msg = (err as { description?: string })?.description ?? String(err);
      // `message is not modified` happens when the bar didn't move
      // between ticks — silently retry next tick. Anything else
      // (chat closed, message deleted, …) means we should stop the
      // animation but never propagate.
      if (!/not modified/i.test(msg)) {
        logger.debug({ err, chatId, messageId }, 'verifying-msg edit failed; stopping animation');
        stopped = true;
        return;
      }
    }
    if (!stopped) setTimeout(() => void tick(), TICK_MS);
  };
  setTimeout(() => void tick(), TICK_MS);

  return {
    chatId,
    messageId,
    async done({ text, reply_markup }) {
      stopped = true;
      try {
        await api.editMessageText(chatId, messageId, renderMdHtml(text), {
          parse_mode: 'HTML',
          reply_markup,
        });
      } catch (err) {
        logger.debug({ err, chatId, messageId }, 'verifying-msg final edit failed');
      }
      // Final card stays on screen — see comment at the top of this
      // module for the rationale.
    },
  };
}
