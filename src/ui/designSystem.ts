/**
 * Shared Telegram UI design language.
 *
 * This module contains presentation-only primitives. It intentionally
 * contains no database access, business rules, or callback handling.
 *
 * Every user-facing screen composes its copy from the tokens and
 * builders here so typography, emoji, spacing, dividers, headings and
 * the four screen states (empty / loading / error / success) stay
 * identical across the whole marketplace.
 */
export const UI = {
  divider: '━━━━━━━━━━━━━━━━━━',
  thinDivider: '──────────────',
  /** One blank line between blocks — the standard vertical rhythm. */
  gap: '\n\n',
  status: {
    success: '✅',
    warning: '⚠️',
    error: '❌',
    pending: '⏳',
    info: 'ℹ️',
    locked: '🔒',
    empty: '📭',
  },
  section: {
    shop: '🛍️',
    wallet: '💳',
    orders: '📦',
    payment: '💰',
    profile: '👤',
    support: '🆘',
    settings: '⚙️',
    search: '🔍',
    sort: '↕️',
    favorites: '⭐',
    features: '✨',
    delivery: '⚡',
    price: '💰',
    stock: '📦',
  },
} as const;

export function card(title: string, body = ''): string {
  return body
    ? `${title}\n${UI.thinDivider}\n${body}`
    : `${title}\n${UI.thinDivider}`;
}

export function pageLabel(page: number, totalPages: number): string {
  return `${page}/${totalPages}`;
}

/** Standard screen heading: `EMOJI *Title*`, optional subtitle line. */
export function heading(emoji: string, title: string, subtitle?: string): string {
  const head = `${emoji} *${title}*`;
  return subtitle ? `${head}\n_${subtitle}_` : head;
}

/** Standard section label inside a screen body. */
export function section(emoji: string, label: string): string {
  return `${emoji} *${label}*`;
}

/** Standard key/value fact line: `EMOJI *Label:* value`. */
export function fact(emoji: string, label: string, value: string | number): string {
  return `${emoji} *${label}:* ${value}`;
}

/** Bullet used by every list body in the bot. */
export function bullet(text: string): string {
  return `• ${text}`;
}

/** Join blocks with the standard one-blank-line rhythm. */
export function stack(...blocks: Array<string | null | undefined | false>): string {
  return blocks.filter((b): b is string => Boolean(b && b.trim())).join(UI.gap);
}

// ---------------------------------------------------------------
// The four standard screen states
// ---------------------------------------------------------------

export function emptyState(title: string, hint?: string): string {
  return stack(heading(UI.status.empty, title), hint ? `_${hint}_` : '');
}

export function loadingState(label: string): string {
  return `${UI.status.pending} _${label}_`;
}

export function errorState(title: string, hint?: string): string {
  return stack(heading(UI.status.error, title), hint ? `_${hint}_` : '');
}

export function successState(title: string, body?: string): string {
  return stack(heading(UI.status.success, title), body ?? '');
}
