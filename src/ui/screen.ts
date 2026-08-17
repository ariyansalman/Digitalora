/**
 * Centralized screen rendering ("navigation core").
 *
 * The pattern
 *
 *   if (ctx.callbackQuery) await ctx.editMessageText(html, opts);
 *   else await ctx.reply(html, opts);
 *
 * was repeated ~90 times across handlers, each copy handling (or, more
 * often, not handling) the same three Telegram edge cases:
 *
 *   1. "message is not modified" when the user re-taps the current screen
 *   2. "message to edit not found" when the message was deleted
 *   3. a keyboard the Telegram client rejects, needing a plain retry
 *
 * `renderScreen()` is the single place those cases are handled. It is
 * additive: existing call sites keep working unchanged, and new code (and
 * migrated call sites) get the safe behaviour for free.
 *
 * Presentation only — no database access and no business rules.
 */
import type { InlineKeyboard } from 'grammy';
import { logger } from '../logger.js';
import {
  describeError,
  isTelegramMessageGoneError,
  isTelegramNoopEditError,
} from '../core/errors.js';

/** Minimal structural context this module needs; any grammY ctx satisfies it. */
export type RenderCtx = {
  callbackQuery?: unknown;
  editMessageText: (text: string, other?: Record<string, unknown>) => Promise<unknown>;
  reply: (text: string, other?: Record<string, unknown>) => Promise<unknown>;
};

export type ScreenOptions = {
  /** Inline keyboard for the screen. Omit to render a keyboard-less screen. */
  keyboard?: InlineKeyboard | undefined;
  /** Defaults to Telegram HTML, matching the rest of the bot. */
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2' | undefined;
  /** Force a brand new message even when handling a callback query. */
  forceNewMessage?: boolean;
  /** Extra Telegram sendMessage/editMessageText options. */
  extra?: Record<string, unknown>;
  /** Context tag included in warning logs. */
  screen?: string;
};

export type RenderResult = 'edited' | 'sent' | 'unchanged' | 'failed';

function buildOptions(options: ScreenOptions): Record<string, unknown> {
  const out: Record<string, unknown> = {
    parse_mode: options.parseMode ?? 'HTML',
    ...(options.extra ?? {}),
  };
  if (options.keyboard) out['reply_markup'] = options.keyboard;
  return out;
}

/**
 * Renders a screen, editing the current message when the update came from
 * a button tap and sending a new one otherwise. Never throws for the
 * benign Telegram edit failures listed above.
 */
export async function renderScreen(
  ctx: RenderCtx,
  html: string,
  options: ScreenOptions = {},
): Promise<RenderResult> {
  const opts = buildOptions(options);
  const canEdit = Boolean(ctx.callbackQuery) && !options.forceNewMessage;

  if (canEdit) {
    try {
      await ctx.editMessageText(html, opts);
      return 'edited';
    } catch (err) {
      if (isTelegramNoopEditError(err)) return 'unchanged';
      if (!isTelegramMessageGoneError(err)) {
        logger.warn(
          { err: describeError(err), screen: options.screen },
          'renderScreen: edit failed, falling back to a new message',
        );
      }
    }
  }

  try {
    await ctx.reply(html, opts);
    return 'sent';
  } catch (err) {
    logger.error(
      { err: describeError(err), screen: options.screen },
      'renderScreen: failed to deliver screen',
    );
    return 'failed';
  }
}

/**
 * Same contract as `renderScreen`, but retries once without the keyboard
 * when Telegram rejects the markup (premium button chrome, oversized
 * labels). Use for screens that build rich keyboards.
 */
export async function renderScreenWithFallback(
  ctx: RenderCtx,
  html: string,
  options: ScreenOptions = {},
): Promise<RenderResult> {
  const result = await renderScreen(ctx, html, options);
  if (result !== 'failed' || !options.keyboard) return result;
  logger.warn(
    { screen: options.screen },
    'renderScreen: retrying without keyboard markup',
  );
  return renderScreen(ctx, html, { ...options, keyboard: undefined });
}
