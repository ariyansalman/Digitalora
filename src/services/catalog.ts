/**
 * Catalog experience layer — merchandising badges, partial search,
 * sorting and pagination.
 *
 * Pure functions only: no database access, no Telegram API calls, no
 * business rules about money. Everything is driven by the product row
 * itself, so nothing about any individual product is hardcoded here —
 * the shop owner controls badges, features and delivery mode from the
 * database.
 */
import type { DBProduct } from '../types.js';

export type BadgeKey =
  | 'flash_sale'
  | 'featured'
  | 'new'
  | 'premium'
  | 'best_seller'
  | 'discount';

export type Badge = {
  key: BadgeKey;
  emoji: string;
  /** i18n key for the badge label. */
  labelKey: string;
  /** Template params (e.g. discount percent). */
  params?: Record<string, string | number>;
};

/** Canonical badge glyphs — the single source of truth for the UI. */
export const BADGE_EMOJI: Record<BadgeKey, string> = {
  flash_sale: '🔥',
  featured: '⭐',
  new: '🆕',
  premium: '💎',
  best_seller: '🏆',
  discount: '🏷️',
};

/** A product is "new" for this many days after it was created. */
export const NEW_BADGE_DAYS = 14;

/** Units sold that automatically earn the 🏆 Best Seller badge. */
export const BEST_SELLER_MIN_SALES = 25;

/** Loose shape so tests and admin previews can pass partial rows. */
export type BadgeSource = Partial<DBProduct> & {
  flash_sale_until?: string | null;
  is_featured?: boolean | null;
  is_premium?: boolean | null;
  is_best_seller?: boolean | null;
  compare_at_price?: number | string | null;
  sales_count?: number | null;
  features?: string | null;
  instant_delivery?: boolean | null;
};

export function discountPercent(p: BadgeSource): number {
  const price = Number(p.price ?? 0);
  const was = Number(p.compare_at_price ?? 0);
  if (!Number.isFinite(price) || !Number.isFinite(was)) return 0;
  if (price <= 0 || was <= price) return 0;
  return Math.round(((was - price) / was) * 100);
}

export function isFlashSale(p: BadgeSource, now: Date = new Date()): boolean {
  if (!p.flash_sale_until) return false;
  const until = Date.parse(String(p.flash_sale_until));
  return Number.isFinite(until) && until > now.getTime();
}

export function isNewProduct(p: BadgeSource, now: Date = new Date()): boolean {
  if (!p.created_at) return false;
  const created = Date.parse(String(p.created_at));
  if (!Number.isFinite(created)) return false;
  return now.getTime() - created <= NEW_BADGE_DAYS * 24 * 60 * 60 * 1000;
}

export function isBestSeller(p: BadgeSource): boolean {
  if (p.is_best_seller) return true;
  return Number(p.sales_count ?? 0) >= BEST_SELLER_MIN_SALES;
}

/** True when the product is purchasable right now. */
export function isInStock(p: BadgeSource): boolean {
  return Boolean(p.unlimited_stock) || Number(p.stock ?? 0) > 0;
}

/**
 * Resolve every badge that applies to a product, in a stable
 * presentation order (most attention-grabbing first).
 */
export function resolveBadges(p: BadgeSource, now: Date = new Date()): Badge[] {
  const badges: Badge[] = [];
  if (isFlashSale(p, now)) {
    badges.push({ key: 'flash_sale', emoji: BADGE_EMOJI.flash_sale, labelKey: 'badge.flash_sale' });
  }
  const percent = discountPercent(p);
  if (percent > 0) {
    badges.push({
      key: 'discount',
      emoji: BADGE_EMOJI.discount,
      labelKey: 'badge.discount',
      params: { percent },
    });
  }
  if (p.is_featured) {
    badges.push({ key: 'featured', emoji: BADGE_EMOJI.featured, labelKey: 'badge.featured' });
  }
  if (isBestSeller(p)) {
    badges.push({ key: 'best_seller', emoji: BADGE_EMOJI.best_seller, labelKey: 'badge.best_seller' });
  }
  if (p.is_premium) {
    badges.push({ key: 'premium', emoji: BADGE_EMOJI.premium, labelKey: 'badge.premium' });
  }
  if (isNewProduct(p, now)) {
    badges.push({ key: 'new', emoji: BADGE_EMOJI.new, labelKey: 'badge.new' });
  }
  return badges;
}

/** Compact badge strip for a product card (emoji only, deduped). */
export function badgeStrip(p: BadgeSource, now: Date = new Date()): string {
  return resolveBadges(p, now)
    .map((b) => b.emoji)
    .join(' ');
}

/**
 * Feature bullets for the ✨ Features block. Falls back to the
 * description when the shop owner has not filled in `features`, so a
 * product screen never renders an empty section.
 */
export function featureLines(p: BadgeSource, limit = 6): string[] {
  const raw = (p.features ?? '').trim() || (p.description ?? '').trim();
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-•*]\s*/, '').trim())
    .filter((line) => line.length > 0)
    .slice(0, limit);
}

/**
 * Instant delivery is explicit when the shop owner set the column,
 * otherwise auto-detected: a stocked product without a manual
 * post-purchase form is delivered by the bot the moment it is paid.
 */
export function hasInstantDelivery(p: BadgeSource): boolean {
  if (typeof p.instant_delivery === 'boolean') return p.instant_delivery;
  if (p.delivery_form_enabled) return false;
  return isInStock(p);
}

// ---------------------------------------------------------------
// Search
// ---------------------------------------------------------------

export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Haystack for partial matching: name, description, note, warranty. */
function haystack(p: BadgeSource): string {
  return [p.name, p.description, p.note, p.warranty]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(' \n ')
    .toLowerCase();
}

/**
 * Partial, case-insensitive, order-independent search: every
 * whitespace-separated token must appear somewhere in the product
 * text as a substring. "prem net" matches "Netflix Premium".
 */
export function matchesQuery(p: BadgeSource, query: string): boolean {
  const q = normalizeQuery(query);
  if (!q) return true;
  const text = haystack(p);
  return q.split(' ').every((token) => text.includes(token));
}

/** Rank: name-prefix > name-substring > any-field substring. */
function searchScore(p: BadgeSource, q: string): number {
  const name = (p.name ?? '').toLowerCase();
  if (name.startsWith(q)) return 0;
  if (name.includes(q)) return 1;
  return 2;
}

export function searchProducts<T extends BadgeSource>(products: T[], query: string): T[] {
  const q = normalizeQuery(query);
  if (!q) return [...products];
  return products
    .filter((p) => matchesQuery(p, q))
    .sort((a, b) => searchScore(a, q) - searchScore(b, q));
}

// ---------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------

export const SORT_MODES = [
  'recommended',
  'price_asc',
  'price_desc',
  'name_asc',
  'newest',
  'stock_desc',
] as const;

export type SortMode = (typeof SORT_MODES)[number];

export const SORT_EMOJI: Record<SortMode, string> = {
  recommended: '✨',
  price_asc: '💰',
  price_desc: '💎',
  name_asc: '🔤',
  newest: '🆕',
  stock_desc: '📦',
};

export function parseSortMode(value: unknown): SortMode {
  return SORT_MODES.includes(value as SortMode) ? (value as SortMode) : 'recommended';
}

function createdMs(p: BadgeSource): number {
  const ms = Date.parse(String(p.created_at ?? ''));
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Sort a catalog page. Out-of-stock products always sink to the
 * bottom regardless of the chosen mode — a marketplace should never
 * open on something the customer cannot buy.
 */
export function sortProducts<T extends BadgeSource>(products: T[], mode: SortMode): T[] {
  const rows = [...products];
  rows.sort((a, b) => {
    const aIn = isInStock(a);
    const bIn = isInStock(b);
    if (aIn !== bIn) return aIn ? -1 : 1;
    switch (mode) {
      case 'price_asc':
        return Number(a.price ?? 0) - Number(b.price ?? 0);
      case 'price_desc':
        return Number(b.price ?? 0) - Number(a.price ?? 0);
      case 'name_asc':
        return String(a.name ?? '').localeCompare(String(b.name ?? ''));
      case 'newest':
        return createdMs(b) - createdMs(a);
      case 'stock_desc': {
        const aStock = a.unlimited_stock ? Number.MAX_SAFE_INTEGER : Number(a.stock ?? 0);
        const bStock = b.unlimited_stock ? Number.MAX_SAFE_INTEGER : Number(b.stock ?? 0);
        return bStock - aStock;
      }
      case 'recommended':
      default: {
        // Pinned first, then badge weight, then the admin sort order.
        if (Boolean(a.is_pinned) !== Boolean(b.is_pinned)) return a.is_pinned ? -1 : 1;
        const weight = (p: BadgeSource) => resolveBadges(p).length;
        const wd = weight(b) - weight(a);
        if (wd !== 0) return wd;
        const ao = Number(a.sort_order ?? a.id ?? 0);
        const bo = Number(b.sort_order ?? b.id ?? 0);
        if (ao !== bo) return ao - bo;
        return Number(a.id ?? 0) - Number(b.id ?? 0);
      }
    }
  });
  return rows;
}

// ---------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------

export type Page<T> = {
  rows: T[];
  page: number;
  totalPages: number;
  total: number;
};

export function paginate<T>(rows: T[], page: number, perPage: number): Page<T> {
  const size = Math.max(1, Math.floor(perPage));
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(0, Math.floor(page) || 0), totalPages - 1);
  return {
    rows: rows.slice(safePage * size, (safePage + 1) * size),
    page: safePage,
    totalPages,
    total,
  };
}
