/**
 * Global Telegram API safety net.
 *
 * The handler layer contains several hundred direct
 * `answerCallbackQuery()` / `editMessageText()` calls written over many
 * phases. Migrating each one to `safeAnswerCallback()` /
 * `safeEditMessage()` would be a rewrite of unrelated modules, so
 * instead this transformer neutralises the three benign failures at the
 * transport level — every call site, old and new, is covered:
 *
 *   • "message is not modified"  → treated as success (screen already correct)
 *   • "query is too old" / invalid query id → treated as success (nothing to ack)
 *   • "message to edit not found" on `editMessageReplyMarkup` → success
 *
 * Everything else propagates untouched, so real errors still surface in
 * logs and in `bot.catch`. No business logic is involved.
 */
import type { Api, RawApi } from 'grammy';
import { logger } from '../logger.js';

const BENIGN_BY_METHOD: Record<string, readonly string[]> = {
  answerCallbackQuery: [
    'query is too old',
    'QUERY_ID_INVALID',
    'query ID is invalid',
    'response timeout expired',
  ],
  editMessageText: ['message is not modified'],
  editMessageCaption: ['message is not modified'],
  editMessageReplyMarkup: [
    'message is not modified',
    'message to edit not found',
    "message can't be edited",
  ],
};

export function isBenignTelegramFailure(method: string, description: string): boolean {
  const patterns = BENIGN_BY_METHOD[method];
  if (!patterns) return false;
  return patterns.some((pattern) => description.includes(pattern));
}

/**
 * Installs the transformer. Idempotent-safe to call once per bot at
 * startup, before any API call is made.
 */
export function installTelegramSafety(api: Api): void {
  api.config.use(async (prev, method, payload, signal) => {
    const result = await prev(method, payload, signal);
    if (result.ok) return result;

    const description = String(result.description ?? '');
    if (isBenignTelegramFailure(String(method), description)) {
      logger.debug({ method, description }, 'telegramSafety: benign failure swallowed');
      return { ok: true, result: true } as unknown as ReturnType<RawApi[typeof method]> extends never
        ? never
        : typeof result;
    }
    return result;
  });
}
