/**
 * Centralized UI formatting primitives.
 *
 * Presentation only: no database access, no business rules, no Telegram
 * API calls. Every module that renders money, dates, quantities or user
 * labels should import from here instead of re-implementing `toFixed(2)`
 * and ad-hoc date slicing.
 *
 * Backward compatibility: these helpers reproduce the exact output of the
 * pre-existing inline implementations (`money()` in handlers/resellerApi.ts,
 * `apiMoney()`/`apiDate()` in handlers/admin/helpers.ts, `money()` in
 * services/publicFeed.ts). They are drop-in replacements, not new formats.
 */

/** `12.5` -> `"12.50"`. Non-finite input degrades to `"0.00"`. */
export function money(n: number): string {
  const value = Number(n);
  return (Number.isFinite(value) ? value : 0).toFixed(2);
}

/** `12.5, 'USDT'` -> `"12.50 USDT"`. */
export function moneyWithCurrency(n: number, currency: string): string {
  return `${money(n)} ${currency}`;
}

/** ISO timestamp -> `"2026-08-16 10:32"`. `null` -> em dash. */
export function date(iso: string | null | undefined): string {
  if (!iso) return EM_DASH;
  return String(iso).replace('T', ' ').slice(0, 16);
}

/** ISO timestamp -> `"2026-08-16"`. `null` -> em dash. */
export function dateOnly(iso: string | null | undefined): string {
  if (!iso) return EM_DASH;
  return String(iso).slice(0, 10);
}

/** The single placeholder character used across every screen. */
export const EM_DASH = '—';

/** `0.125` -> `"12.5%"`; whole numbers drop the decimal. */
export function percent(ratio: number, digits = 1): string {
  const value = Number.isFinite(ratio) ? ratio * 100 : 0;
  const text = value.toFixed(digits);
  return `${text.replace(/\.0+$/, '')}%`;
}

/** Human label for a user row, preferring @username. */
export function userLabel(user: {
  userId: number;
  username: string | null;
  firstName: string | null;
}): string {
  if (user.username) return `@${user.username}`;
  if (user.firstName) return `${user.firstName} (${user.userId})`;
  return String(user.userId);
}

/** Escapes the five characters Telegram's HTML parse mode cares about. */
export function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Hard-truncates to `max` characters with a single ellipsis. */
export function truncate(text: string, max: number): string {
  const value = String(text);
  if (max <= 1 || value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

/**
 * Clamps text to Telegram's 64-byte inline button label budget without
 * splitting surrogate pairs.
 */
export function buttonLabel(text: string, max = 60): string {
  return truncate(text, max);
}

/** `1` -> `"1 item"`, `3` -> `"3 items"`. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Compact money: whole numbers render without decimals (`12` / `12.50`). */
export function compactMoney(amount: number): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(value % 1 === 0 ? 0 : 2);
}
