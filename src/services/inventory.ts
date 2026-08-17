/**
 * Inventory presentation + safety helpers.
 *
 * Inventory states (see 0061_inventory_integrity.sql):
 *
 *   Available  📦  in the pool, sellable right now
 *   Reserved   🔒  taken by an in-flight paid order / checkout
 *   Consumed   ✅  delivered to a buyer (never re-sellable)
 *   Expired    ⌛  past its validity window, excluded from claiming
 *
 * This module owns two rules the whole codebase relies on:
 *
 *  1. Digital payloads (keys / accounts / links) NEVER reach a log,
 *     an admin channel diagnostic or an error message. Use
 *     `redactItems()` / `maskPayload()` whenever a payload is near a
 *     logger call.
 *  2. Admin surfaces render inventory through `inventoryLine()` so the
 *     📦 / 🔒 / ✅ vocabulary stays identical everywhere.
 */
import {
  getProductInventoryStats,
  listLowStockProducts,
  type InventoryStats,
} from '../db/queries.js';

export type InventoryState = 'available' | 'reserved' | 'consumed' | 'expired';

export const INVENTORY_STATE_EMOJI: Record<InventoryState, string> = {
  available: '📦',
  reserved: '🔒',
  consumed: '✅',
  expired: '⌛',
};

export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

export { getProductInventoryStats, listLowStockProducts };
export type { InventoryStats };

/**
 * Reduce a digital payload to a non-reversible descriptor that is safe
 * to log or show in a diagnostic. Never returns any part of a key.
 */
export function maskPayload(payload: string | null | undefined): string {
  const len = String(payload ?? '').length;
  return len > 0 ? `[redacted:${len}c]` : '[empty]';
}

/** Log-safe summary of a claimed item batch: counts only, no payloads. */
export function redactItems(items: readonly string[] | null | undefined): {
  count: number;
  payloads: string;
} {
  const count = Array.isArray(items) ? items.length : 0;
  return { count, payloads: '[redacted]' };
}

/** `📦 12 · 🔒 3 · ✅ 148` — the canonical admin inventory line. */
export function inventoryLine(stats: InventoryStats | null): string {
  if (!stats) return '📦 — · 🔒 — · ✅ —';
  const available = stats.unlimited_stock ? '∞' : String(stats.available);
  const parts = [
    `📦 ${available}`,
    `🔒 ${stats.reserved}`,
    `✅ ${stats.delivered}`,
  ];
  if (stats.expired > 0) parts.push(`⌛ ${stats.expired}`);
  return parts.join(' · ');
}

/** `⚠️ Low stock (≤ 5)` suffix, or an empty string when healthy. */
export function lowStockBadge(stats: InventoryStats | null): string {
  if (!stats || stats.unlimited_stock) return '';
  if (!stats.low_stock) return '';
  const threshold = stats.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
  return stats.available <= 0
    ? '🔴 *Out of stock*'
    : `⚠️ *Low stock* (≤ ${threshold})`;
}

/** Human label for an inventory state, e.g. `🔒 Reserved`. */
export function inventoryStateLabel(state: InventoryState): string {
  const name = state.charAt(0).toUpperCase() + state.slice(1);
  return `${INVENTORY_STATE_EMOJI[state]} ${name}`;
}
