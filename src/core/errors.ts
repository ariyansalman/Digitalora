/**
 * Centralized error taxonomy.
 *
 * The bot previously distinguished failures by string-matching Telegram
 * or Supabase error descriptions in a dozen places. This module gives the
 * rest of the codebase one vocabulary:
 *
 *   - `AppError`        — an expected, user-presentable failure.
 *   - `describeError()` — safe log/debug string for anything thrown.
 *   - `isTelegramNoopEditError()` / `isTelegramMessageGoneError()` —
 *     the two Telegram edit failures that are never real errors.
 *
 * This module is deliberately dependency-free so it can be imported from
 * repositories, services, handlers and middleware alike.
 */

export type AppErrorKind =
  | 'validation'
  | 'not_found'
  | 'conflict'
  | 'forbidden'
  | 'rate_limited'
  | 'upstream'
  | 'internal';

export class AppError extends Error {
  readonly kind: AppErrorKind;
  /** Message safe to show a Telegram user (never contains internals). */
  readonly userMessage: string;
  override readonly cause: unknown;

  constructor(
    kind: AppErrorKind,
    message: string,
    options: { userMessage?: string; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.kind = kind;
    this.userMessage = options.userMessage ?? DEFAULT_USER_MESSAGE[kind];
    this.cause = options.cause;
  }
}

const DEFAULT_USER_MESSAGE: Record<AppErrorKind, string> = {
  validation: 'That input looks invalid. Please check it and try again.',
  not_found: 'That item is no longer available.',
  conflict: 'That action conflicts with the current state. Please refresh and retry.',
  forbidden: 'You do not have access to that action.',
  rate_limited: 'Too many attempts. Please wait a moment and try again.',
  upstream: 'A provider is temporarily unavailable. Please try again shortly.',
  internal: 'Temporary error. Please try again in a few seconds.',
};

/** The generic fallback shown when nothing more specific is known. */
export const GENERIC_USER_ERROR = DEFAULT_USER_MESSAGE.internal;

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/** Message safe to present to an end user for any thrown value. */
export function toUserMessage(err: unknown): string {
  return isAppError(err) ? err.userMessage : GENERIC_USER_ERROR;
}

/** Stable, non-throwing description of any thrown value, for logs. */
export function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function errorDescription(err: unknown): string {
  const description = (err as { description?: unknown } | null | undefined)?.description;
  if (typeof description === 'string') return description;
  return err instanceof Error ? err.message : '';
}

/**
 * Telegram rejects an edit that would produce byte-identical content.
 * This happens whenever a user re-taps the button for the screen they are
 * already on — cosmetic, never an application failure.
 */
export function isTelegramNoopEditError(err: unknown): boolean {
  return errorDescription(err).includes('message is not modified');
}

/** The message we tried to edit was deleted or is too old to edit. */
export function isTelegramMessageGoneError(err: unknown): boolean {
  const description = errorDescription(err);
  return (
    description.includes('message to edit not found') ||
    description.includes("message can't be edited") ||
    description.includes('MESSAGE_ID_INVALID')
  );
}

/** The callback query expired (Telegram allows ~15 minutes to answer). */
export function isExpiredCallbackError(err: unknown): boolean {
  const description = errorDescription(err);
  return (
    description.includes('query is too old') ||
    description.includes('QUERY_ID_INVALID') ||
    description.includes('query ID is invalid')
  );
}
