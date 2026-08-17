/**
 * Centralized navigation registry.
 *
 * Callback identifiers were previously written as bare string literals in
 * keyboards, handlers and admin screens. A typo produced a dead button
 * that nothing detects until a user taps it, and renaming a screen meant
 * grepping the whole repository.
 *
 * `ROUTES` is the single source of truth for the stable, buyer-facing
 * callback prefixes. **The values must not change** — they are persisted
 * in live Telegram message keyboards. This module names them; it does not
 * redefine them.
 */

export const ROUTES = Object.freeze({
  mainMenu: 'main:open',
  shopHome: 'shop:home',
  topupOpen: 'topup:open',
  profileOpen: 'profile:open',
  profileOrders: 'profile:orders',
  profileRefer: 'profile:refer',
  profileNotifications: 'profile:notifications',
  profileLanguage: 'profile:lang',
  profileDeposits: 'profile:deposits',
  profileStats: 'profile:stats',
  profileRegion: 'profile:region',
  profileEmail: 'profile:email:set',
  supportOpen: 'support:open',
  supportAi: 'support:ai',
  channelOpen: 'channel:open',
  resellerApi: 'api:open',
  adminRoot: 'adm:root',
  adminClose: 'adm:close',
});

export type RouteId = (typeof ROUTES)[keyof typeof ROUTES];

/** Callback prefixes that are intentionally inert (rendered, never routed). */
export const NOOP_PREFIX = 'noop:';

export function isNoopRoute(data: string | undefined): boolean {
  return typeof data === 'string' && data.startsWith(NOOP_PREFIX);
}

/**
 * Builds a namespaced callback payload: `route('shop:cat', 3, 0)`
 * -> `"shop:cat:3:0"`. Segments are coerced to strings so callers cannot
 * accidentally emit `"undefined"` or `"NaN"`.
 */
export function route(base: string, ...segments: Array<string | number>): string {
  const parts = segments.map((segment) => {
    if (typeof segment === 'number') {
      return Number.isFinite(segment) ? String(segment) : '0';
    }
    return segment ?? '';
  });
  return [base, ...parts].join(':');
}

/** Telegram rejects callback payloads over 64 bytes. */
export const MAX_CALLBACK_BYTES = 64;

export function isValidCallbackData(data: string): boolean {
  return data.length > 0 && Buffer.byteLength(data, 'utf8') <= MAX_CALLBACK_BYTES;
}
