/**
 * Navigation core: one call that performs a *complete* screen transition.
 *
 * A reliable Telegram transition is always the same four steps, in this
 * order:
 *
 *   1. acknowledge the callback query (kills the client-side spinner and
 *      prevents "query is too old" later on)
 *   2. tear down any stale multi-step input flow, so the destination
 *      screen cannot be hijacked by the previous step's message handler
 *   3. edit the current message in place (or send a fresh one when the
 *      original is gone / this is not a button tap)
 *   4. never throw for the benign Telegram edit failures
 *
 * Back / Cancel / Retry buttons and pagination all reduce to this. The
 * helpers are additive — existing call sites keep working untouched.
 */
import type { InlineKeyboard } from 'grammy';
import { safeAnswerCallback, type CallbackCtx } from './callbackSafety.js';
import { clearFlowState, type ClearFlowOptions, type FlowCtx } from './flowState.js';
import {
  renderScreen,
  renderScreenWithFallback,
  type RenderCtx,
  type RenderResult,
  type ScreenOptions,
} from './screen.js';

export type NavigateCtx = RenderCtx & Partial<CallbackCtx> & Partial<FlowCtx>;

export type NavigateOptions = ScreenOptions & {
  /** Toast/alert text passed to `answerCallbackQuery`. */
  toast?: string;
  /** Show the toast as a modal alert instead of a top banner. */
  alert?: boolean;
  /**
   * Clear the active multi-step input flow before rendering.
   * Defaults to `true` — a navigation always leaves the previous flow.
   * Pass `false` for in-flow re-renders (e.g. the quantity keypad).
   */
  clearFlow?: boolean;
  /** Fine-grained control over what `clearFlowState` wipes. */
  clearFlowOptions?: ClearFlowOptions;
  /** Retry once without the inline keyboard if Telegram rejects it. */
  keyboardFallback?: boolean;
};

/**
 * Edits the message behind a button tap, falling back to a new message.
 * Never throws: "message is not modified" and "message to edit not
 * found" are both normal outcomes of a user tapping fast.
 */
export function safeEditMessage(
  ctx: NavigateCtx,
  html: string,
  options: ScreenOptions & { keyboardFallback?: boolean } = {},
): Promise<RenderResult> {
  return options.keyboardFallback === false
    ? renderScreen(ctx, html, options)
    : renderScreenWithFallback(ctx, html, options);
}

/**
 * Full, safe navigation: acknowledge → clear stale flow → render.
 * Returns the render result so callers can branch if they need to.
 */
export async function safeNavigate(
  ctx: NavigateCtx,
  html: string,
  options: NavigateOptions = {},
): Promise<RenderResult> {
  if (typeof ctx.answerCallbackQuery === 'function' && ctx.callbackQuery) {
    await safeAnswerCallback(ctx as CallbackCtx, {
      ...(options.toast !== undefined ? { text: options.toast } : {}),
      ...(options.alert !== undefined ? { showAlert: options.alert } : {}),
    });
  }

  if (options.clearFlow !== false && ctx.session) {
    clearFlowState(ctx as FlowCtx, options.clearFlowOptions ?? {});
  }

  const { toast, alert, clearFlow, clearFlowOptions, keyboardFallback, ...screenOptions } =
    options;
  void toast;
  void alert;
  void clearFlow;
  void clearFlowOptions;

  return safeEditMessage(ctx, html, {
    ...screenOptions,
    ...(keyboardFallback !== undefined ? { keyboardFallback } : {}),
  });
}

/**
 * Convenience wrapper used by Back / Cancel buttons: identical to
 * `safeNavigate`, but always wipes the flow (including the quantity
 * buffers) so a cancelled flow can never resurrect.
 */
export function safeNavigateBack(
  ctx: NavigateCtx,
  html: string,
  options: Omit<NavigateOptions, 'clearFlow'> & { keyboard?: InlineKeyboard | undefined } = {},
): Promise<RenderResult> {
  return safeNavigate(ctx, html, {
    ...options,
    clearFlow: true,
    clearFlowOptions: { quantityInput: true, ...(options.clearFlowOptions ?? {}) },
  });
}
