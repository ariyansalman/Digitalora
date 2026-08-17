/**
 * Quantity-threshold flat-USDT promo resolution.
 *
 * Each promo row defines (optionally per-product, optionally per-user)
 * a `min_qty` and a flat `discount_amount` taken off the line total.
 * At order time we want exactly *one* promo applied:
 *
 *   - The most specific scope tier that matches the (user, product)
 *     pair: per-user-per-product → per-user → per-product → default.
 *   - Within a tier, the largest discount wins (best for the buyer).
 *
 * The applied discount is always clamped to `unit_price * qty` so the
 * line total can never go below zero.
 */
import {
  findApplicablePromos,
  findScopedActivePromos,
  getPromoTiersForPromos,
} from '../db/queries.js';
import type { DBPromo, DBPromoTier } from '../types.js';

export type PromoMatch = {
  promo: DBPromo;
  /**
   * Scope tier — higher is more specific.
   *   3 = per-user + per-product
   *   2 = per-user (any product)
   *   1 = per-product (any user)
   *   0 = default (any user, any product)
   */
  specificity: 0 | 1 | 2 | 3;
  /** Effective USDT discount, clamped to the line total. */
  discount: number;
  /** Selected tier, when this is a tiered promo. */
  selectedTier?: DBPromoTier;
  /** Charged unit price after the promo, when tiered. */
  chargedUnitPrice?: number;
};

export function promoTierForQty(
  promo: DBPromo,
  qty: number,
): DBPromoTier | null {
  const tiers = promo.tiers ?? [];
  if (tiers.length === 0) return null;
  return (
    tiers.find(
      (t) => t.min_qty <= qty && (t.max_qty === null || qty <= t.max_qty),
    ) ??
    tiers
      .filter((t) => t.min_qty <= qty)
      .sort((a, b) => b.min_qty - a.min_qty)[0] ??
    null
  );
}

export function nextPromoTier(promo: DBPromo, qty: number): DBPromoTier | null {
  return (
    (promo.tiers ?? [])
      .filter((t) => t.min_qty > qty)
      .sort((a, b) => a.min_qty - b.min_qty)[0] ?? null
  );
}

function tier(p: DBPromo): 0 | 1 | 2 | 3 {
  if (p.telegram_id !== null && p.product_id !== null) return 3;
  if (p.telegram_id !== null) return 2;
  if (p.product_id !== null) return 1;
  return 0;
}

/**
 * Pick the single best promo (if any) for the given line. Returns
 * `null` when no active promo matches, or when the line qty / total
 * is too small to apply any candidate.
 */
export async function resolvePromo(
  telegram_id: number,
  product_id: number,
  qty: number,
  unit_price: number,
): Promise<PromoMatch | null> {
  if (qty <= 0 || unit_price < 0) return null;
  const lineTotal = +(unit_price * qty).toFixed(2);
  if (lineTotal <= 0) return null;
  const promos = await findApplicablePromos(telegram_id, product_id, qty);
  if (promos.length === 0) return null;
  const tierMap = await getPromoTiersForPromos(promos.map((p) => p.id));
  const candidates: PromoMatch[] = [];
  for (const p of promos) {
    const tiers = tierMap.get(p.id) ?? [];
    if (tiers.length > 0) {
      const selectedTier = promoTierForQty({ ...p, tiers }, qty);
      if (!selectedTier) continue;
      const chargedUnitPrice = Math.min(unit_price, Number(selectedTier.unit_price));
      const total = +(chargedUnitPrice * qty).toFixed(2);
      candidates.push({
        promo: { ...p, tiers },
        specificity: tier(p),
        discount: Math.max(0, +(lineTotal - total).toFixed(2)),
        selectedTier,
        chargedUnitPrice,
      });
    } else {
      candidates.push({
        promo: p,
        specificity: tier(p),
        discount: Math.min(Number(p.discount_amount), lineTotal),
      });
    }
  }
  // Highest specificity tier; within tier, largest effective discount.
  candidates.sort(
    (a, b) =>
      b.specificity - a.specificity ||
      b.discount - a.discount ||
      // Stable-ish tiebreaker: newer promo wins when discount + tier
      // are identical so the most recently added promo takes effect.
      Number(b.promo.created_at >= a.promo.created_at ? 1 : -1),
  );
  const best = candidates[0];
  if (!best || best.discount <= 0) return null;
  return best;
}

/**
 * Compute a price preview for the product page / payment screen.
 * `gross` is `unit_price * qty` (raw); `discount` is the applied
 * promo discount (0 when none); `total` is what the user is actually
 * charged. Always returns valid finite numbers.
 */
export function priceBreakdown(
  unit_price: number,
  qty: number,
  match: PromoMatch | null,
): { gross: number; discount: number; total: number } {
  const gross = +(unit_price * qty).toFixed(2);
  const discount = match ? Math.min(match.discount, gross) : 0;
  const total = match?.selectedTier
    ? +(Math.min(unit_price, match.chargedUnitPrice ?? unit_price) * qty).toFixed(2)
    : +(gross - discount).toFixed(2);
  return { gross, discount, total };
}

/**
 * Resolve the "upcoming" promo to surface on the product page as a
 * teaser when the buyer hasn't reached the threshold qty yet (or
 * has reached one, but a strictly better tier is still upcoming).
 *
 * Selection rules — purely cosmetic, never affects the actual charge:
 *   - Only considers upcoming rules: `min_qty > qty`.
 *   - When a promo is already applying (`currentDiscount > 0`),
 *     filters to upcoming rules whose `discount_amount` is strictly
 *     larger than the current applied amount — surfacing a "weaker"
 *     upcoming promo on top of an active one would be misleading.
 *   - Most-specific scope tier first (per-user-product → per-user
 *     → per-product → default).
 *   - Within tier, the closest threshold wins (lowest `min_qty`).
 *   - Within that, largest `discount_amount` wins.
 *
 * Returns `null` when no qualifying upcoming promo exists.
 */
export async function nextPromoTeaser(
  telegram_id: number,
  product_id: number,
  qty: number,
  currentDiscount = 0,
): Promise<DBPromo | null> {
  const all = await findScopedActivePromos(telegram_id, product_id);
  const tierMap = await getPromoTiersForPromos(all.map((p) => p.id));
  const tiered = all
    .map((p) => ({ promo: p, tiers: tierMap.get(p.id) ?? [] }))
    .filter((x) => x.tiers.length > 0);
  const flat = all.filter((p) => !tierMap.has(p.id));
  let upcoming = flat.filter((p) => p.min_qty > qty);
  if (currentDiscount > 0) {
    upcoming = upcoming.filter(
      (p) => Number(p.discount_amount) > currentDiscount,
    );
  }
  const tierUpcoming = tiered
    .flatMap(({ promo, tiers }) =>
      tiers
        .filter((t) => t.min_qty > qty)
        .map((t) => ({ promo: { ...promo, tiers }, tier: t })),
    )
    .sort(
      (a, b) =>
        tier(b.promo) - tier(a.promo) ||
        a.tier.min_qty - b.tier.min_qty,
    )[0];
  if (tierUpcoming) return tierUpcoming.promo;
  if (upcoming.length === 0) return null;
  upcoming.sort(
    (a, b) =>
      tier(b) - tier(a) ||
      a.min_qty - b.min_qty ||
      Number(b.discount_amount) - Number(a.discount_amount),
  );
  return upcoming[0]!;
}
