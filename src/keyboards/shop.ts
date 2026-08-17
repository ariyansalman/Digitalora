import { InlineKeyboard } from 'grammy';
import { formatPriceWithCurrency } from '../../config/currencies.js';
import { EMOJI, PRODUCTS_PER_PAGE, colorModeToStyle, type Lang } from '../../config/index.js';
import { inlineBtn, inlineCopyText } from './helpers.js';
import {
  getCategoryColor,
  getCategoryDefaultColor,
  getProductColor,
  getStateColor,
} from '../services/settings.js';
import type { DBProduct } from '../types.js';
import { t } from '../i18n/index.js';
import { badgeStrip, SORT_MODES, type SortMode } from '../services/catalog.js';

export type ShopProductRow =
  | { kind: 'product'; product: DBProduct }
  | {
      kind: 'group';
      category_id: number;
      name: string;
      emoji: string | null;
      count: number;
      stock: number;
      unlimited_stock: boolean;
      min_price: number;
      in_stock: boolean;
    };

/**
 * Resolve the premium `custom_emoji_id` for the given EMOJI key.
 * Returns `undefined` when the key is absent or its value is plain
 * unicode (icons in Bot API 9.4 require a real `custom_emoji_id`).
 */
function premiumIconId(key: string): string | undefined {
  const v = EMOJI[key];
  return typeof v === 'object' && v.custom_emoji_id ? v.custom_emoji_id : undefined;
}

const CE_BUTTON_MARKER_RX = /\{\{ce:([^|}\n]+)\|([^}\n]+)\}\}/;

function buttonEmojiParts(text: string | null | undefined): {
  iconId: string | undefined;
  label: string;
  fallback: string;
} {
  const raw = text ?? '';
  const match = raw.match(CE_BUTTON_MARKER_RX);
  if (!match) return { iconId: undefined, label: raw.trim(), fallback: '' };
  return {
    iconId: match[1]?.trim() || undefined,
    fallback: match[2] ?? '',
    label: raw.replace(CE_BUTTON_MARKER_RX, '').trim(),
  };
}

/**
 * Top-level Shop home — paginated all-products list. The categories
 * step has been removed; tapping the Shop button drops the user
 * straight onto this screen.
 *
 * Each row renders as `{name} - {price} USDT (Stock: {N or ∞})` to
 * match the bot-owner reference UX (pic 1). The row icon is the
 * per-product premium emoji_id when set, falling back to the
 * default 📦 (in-stock) / red ❌ (out-of-stock) glyphs.
 *
 * Out-of-stock items remain tappable — tapping opens the product
 * page where the green Buy Now turns into a red ❌ Buy Now that
 * pops up the "contact admin to restock" alert.
 */
export type ShopListOptions = {
  allMode?: boolean;
  /** Callback prefix used by Prev / Refresh / Next (`<prefix>:<page>`). */
  pagePrefix?: string;
  /** Render the 🔍 Search / ↕️ Sort / ⭐ Favorites toolbar row. */
  toolbar?: boolean;
  /** A search query is active — show 🧹 Clear Search. */
  searchActive?: boolean;
  /** Product ids the user has favorited (⭐ marker on the row). */
  favoriteIds?: ReadonlySet<number>;
  /** Callback for the bottom Back button. */
  backCallback?: string;
};

export function shopProductsKeyboard(
  lang: Lang,
  products: ShopProductRow[],
  page: number,
  totalPages: number,
  currency = 'USDT',
  opts: ShopListOptions = {},
): InlineKeyboard {
  const kb = new InlineKeyboard();
  const pagePrefix = opts.pagePrefix ?? 'shop:p';
  const backCallback = opts.backCallback ?? 'main:open';

  const defaultInStockIcon = premiumIconId('orders_product');
  const oosIcon = premiumIconId('gift_invalid');

  products.forEach((entry) => {
    if (entry.kind === 'group') {
      const emojiParts = buttonEmojiParts(entry.emoji);
      const nameParts = buttonEmojiParts(entry.name);
      const iconId = emojiParts.iconId ?? nameParts.iconId;
      const prefix = iconId ? '' : (emojiParts.label || emojiParts.fallback ? `${emojiParts.label || emojiParts.fallback} ` : '');
      const name = nameParts.label || nameParts.fallback || entry.name;
      const label = `${prefix}${name} ▸ ${entry.count} plans (${formatPriceWithCurrency(entry.min_price, currency)}+)`.trim();
      kb.text(label, `grp:${entry.category_id}`);
      if (iconId) kb.icon(iconId);
      const style = colorModeToStyle(entry.in_stock ? getStateColor('in_stock') : getStateColor('out_of_stock'));
      if (style !== undefined) kb.style(style);
      kb.row();
      return;
    }
    const p = entry.product;
    const inStock = p.unlimited_stock || p.stock > 0;
    // Keep product rows compact and consistent across the marketplace:
    // `{emoji} name • price • stock`. Premium custom emoji remains
    // rendered by Telegram when configured; unicode is the fallback.
    const priceLabel = formatPriceWithCurrency(p.price, currency);
    const hasPremiumIcon = Boolean(p.emoji_id);
    const productEmoji = p.emoji === '🛒' ? '' : (p.emoji ?? '');
    const namePrefix = hasPremiumIcon ? '' : (productEmoji ? `${productEmoji} ` : '');
    // Badges (🔥 ⭐ 🆕 💎 🏆 🏷️) and the ⭐ wishlist marker are data
    // driven — nothing about any specific product is hardcoded.
    const badges = badgeStrip(p);
    const favMark = opts.favoriteIds?.has(p.id) ? '⭐ ' : '';
    const productName = `${favMark}${namePrefix}${p.name}${badges ? ` ${badges}` : ''}`.trim();
    const label = inStock
      ? t(
          lang,
          p.unlimited_stock ? 'shop.product.button.unlimited' : 'shop.product.button',
          { name: productName, price: priceLabel, stock: p.unlimited_stock ? '∞' : String(p.stock) },
        )
      : t(lang, 'shop.product.button.oos', { name: productName, price: priceLabel });
    // Out-of-stock products still navigate to the product page so
    // the user sees details + a popup-armed Buy Now button.
    kb.text(label, `prod:${p.id}`);
    const iconId = inStock
      ? p.emoji_id ?? defaultInStockIcon
      : p.emoji_id ?? oosIcon;
    if (iconId) kb.icon(iconId);
    // In-stock rows inherit the category color when the admin set one.
    // If a category has no custom color, fall back to the global
    // in-stock state color; out-of-stock rows keep the OOS warning color.
    const categoryMode =
      p.category_id == null ? 'none' : getCategoryColor(p.category_id);
    const defaultCategoryMode = getCategoryDefaultColor();
    const productMode = getProductColor(p.id);
    const mode = inStock
      ? productMode ??
        (categoryMode !== 'none'
          ? categoryMode
          : defaultCategoryMode !== 'none'
            ? defaultCategoryMode
            : getStateColor('in_stock'))
      : getStateColor('out_of_stock');
    const style = colorModeToStyle(mode);
    if (style !== undefined) kb.style(style);
    kb.row();
  });

  // Footer layout (bot-owner spec v2): the page indicator always
  // lives in the middle, the page-nav arrow takes its natural side
  // (Prev on the left, Next on the right), and Refresh fills the
  // opposite end of the nav row. Back is back to its classic full-
  // width row at the very bottom — the biggest, easiest tap target.
  //
  //  • First page  →  [Refresh]    [1/N]   [Next]
  //  • Last  page  →  [Prev]       [N/N]   [Refresh]
  //  • Middle page →  [Prev]       [k/N]   [Next]   (nav row)
  //                   [Refresh]                     (dedicated row)
  //  • Single page →  [Refresh]    [1/1]
  //
  //  Bottom row, every case: [Back] (full width).
  const toolbar = () => {
    if (!opts.toolbar) return;
    inlineBtn(kb, lang, 'shop_search', 'shop:search');
    inlineBtn(kb, lang, 'shop_sort', 'shop:sort');
    inlineBtn(kb, lang, 'favorites', 'fav:open');
    kb.row();
    if (opts.searchActive) {
      inlineBtn(kb, lang, 'shop_search_clear', 'shop:search:clear');
      kb.row();
    }
  };

  if (opts.allMode) {
    inlineBtn(kb, lang, 'refresh', `${pagePrefix}:0`);
    kb.row();
    toolbar();
    inlineBtn(kb, lang, 'back', backCallback);
    return kb;
  }

  const hasPrev = page > 0;
  const hasNext = page + 1 < totalPages;
  const indicator = `${page + 1}/${totalPages}`;
  if (hasPrev && hasNext) {
    // Middle page: keep the nav row symmetric, push Refresh down so
    // both arrows stay flush against their natural edge.
    inlineBtn(kb, lang, 'prev', `${pagePrefix}:${page - 1}`);
    kb.text(indicator, 'noop:page');
    inlineBtn(kb, lang, 'next', `${pagePrefix}:${page + 1}`);
    kb.row();
    inlineBtn(kb, lang, 'refresh', `${pagePrefix}:${page}`);
    kb.row();
  } else if (hasNext) {
    // First page of a multi-page list.
    inlineBtn(kb, lang, 'refresh', `${pagePrefix}:${page}`);
    kb.text(indicator, 'noop:page');
    inlineBtn(kb, lang, 'next', `${pagePrefix}:${page + 1}`);
    kb.row();
  } else if (hasPrev) {
    // Last page of a multi-page list.
    inlineBtn(kb, lang, 'prev', `${pagePrefix}:${page - 1}`);
    kb.text(indicator, 'noop:page');
    inlineBtn(kb, lang, 'refresh', `${pagePrefix}:${page}`);
    kb.row();
  } else {
    // Single-page list — no nav arrows to render.
    inlineBtn(kb, lang, 'refresh', `${pagePrefix}:${page}`);
    kb.text(indicator, 'noop:page');
    kb.row();
  }
  toolbar();
  // Bottom row: full-width Back, like the old layout used to be.
  inlineBtn(kb, lang, 'back', backCallback);
  return kb;
}

/** Sort picker for the marketplace list. */
export function sortMenuKeyboard(lang: Lang, current: SortMode): InlineKeyboard {
  const kb = new InlineKeyboard();
  const keyFor: Record<SortMode, Parameters<typeof inlineBtn>[2]> = {
    recommended: 'sort_recommended',
    price_asc: 'sort_price_asc',
    price_desc: 'sort_price_desc',
    name_asc: 'sort_name_asc',
    newest: 'sort_newest',
    stock_desc: 'sort_stock_desc',
  };
  for (const mode of SORT_MODES) {
    const label = t(lang, `btn.${keyFor[mode]}`);
    kb.text(mode === current ? `✅ ${label}` : label, `shop:sort:${mode}`);
    kb.row();
  }
  inlineBtn(kb, lang, 'back', 'shop:home');
  return kb;
}

/** Keyboard for the 🔍 Search prompt screen. */
export function searchPromptKeyboard(lang: Lang, searchActive = false): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (searchActive) {
    inlineBtn(kb, lang, 'shop_search_clear', 'shop:search:clear');
    kb.row();
  }
  inlineBtn(kb, lang, 'back', 'shop:home');
  return kb;
}

export function productVariantKeyboard(
  lang: Lang,
  products: DBProduct[],
  currency = 'USDT',
  opts: { categoryId?: number; page?: number; totalPages?: number; icons?: boolean } = {},
): InlineKeyboard {
  const kb = new InlineKeyboard();
  const useIcons = opts.icons !== false;
  const defaultInStockIcon = premiumIconId('orders_product');
  const oosIcon = premiumIconId('gift_invalid');
  for (const p of products) {
    const inStock = p.unlimited_stock || p.stock > 0;
    const stockLabel = p.unlimited_stock ? '∞' : String(p.stock);
    const hasPremiumIcon = Boolean(p.emoji_id);
    const productEmoji = p.emoji === '🛒' ? '' : (p.emoji ?? '');
    const namePrefix = hasPremiumIcon ? '' : (productEmoji ? `${productEmoji} ` : '');
    kb.text(`${namePrefix}${p.name} - ${formatPriceWithCurrency(p.price, currency)} (Stock: ${stockLabel})`.trim(), `prod:${p.id}`);
    const iconId = inStock ? p.emoji_id ?? defaultInStockIcon : p.emoji_id ?? oosIcon;
    if (useIcons && iconId) kb.icon(iconId);
    const style = colorModeToStyle(inStock ? getStateColor('in_stock') : getStateColor('out_of_stock'));
    if (style !== undefined) kb.style(style);
    kb.row();
  }
  if (opts.categoryId !== undefined && opts.totalPages && opts.totalPages > 1) {
    const page = opts.page ?? 0;
    if (page > 0) inlineBtn(kb, lang, 'prev', `grp:${opts.categoryId}:${page - 1}`);
    inlineBtn(kb, lang, 'refresh', `grp:${opts.categoryId}:${page}`);
    if (page + 1 < opts.totalPages) inlineBtn(kb, lang, 'next', `grp:${opts.categoryId}:${page + 1}`);
    kb.row();
  }
  inlineBtn(kb, lang, 'back', 'shop:home');
  return kb;
}

export function productVariantPage(products: DBProduct[], page: number): {
  rows: DBProduct[];
  page: number;
  totalPages: number;
} {
  const totalPages = Math.max(1, Math.ceil(products.length / PRODUCTS_PER_PAGE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  return {
    rows: products.slice(safePage * PRODUCTS_PER_PAGE, (safePage + 1) * PRODUCTS_PER_PAGE),
    page: safePage,
    totalPages,
  };
}

/**
 * The product-detail page keyboard. The 🔢 *Custom Quantity* button
 * opens a numeric keypad (digits accumulate — tapping `1` then `1`
 * sets qty to `11`); the inline `➖ N ➕` adder lets the user nudge
 * the qty one step at a time without leaving the product page; and
 * the 🔄 *Refresh* button re-renders the page so the user sees the
 * latest stock / wallet balance.
 *
 * Back returns to the Shop home (page 0) since the categories step
 * has been removed.
 */
export function productKeyboard(
  lang: Lang,
  product: DBProduct,
  qty: number,
  shareUrl: string,
  opts: { isFavorite?: boolean } = {},
): InlineKeyboard {
  const kb = new InlineKeyboard();
  const inStock = product.unlimited_stock || product.stock > 0;
  // Inline qty stepper first: ➖ on the left, the live qty in the
  // middle (tap is a no-op — it's a label), ➕ on the right.
  // Out-of-stock products use the same controls as a preorder
  // surface; handlers cap preorder qty at QTY_MAX instead of stock 0.
  inlineBtn(kb, lang, 'qty_minus', `qty:${product.id}:dec`);
  kb.text(String(qty), 'noop:qty');
  inlineBtn(kb, lang, 'qty_plus', `qty:${product.id}:inc`);
  kb.row();
  // Buy Now / Pre Order sits directly under the stepper so the user's
  // tap path is "set qty → buy".
  inlineBtn(kb, lang, inStock ? 'buy_now' : 'pre_order', `buy:${product.id}`);
  kb.row();
  // Cart is an ADDITIONAL option — Buy Now above stays the untouched
  // direct-purchase path. In-stock products can be staged in the
  // persistent cart; out-of-stock ones can't (preorder is Buy Now only).
  if (inStock) {
    inlineBtn(kb, lang, 'cart_add', `cart:add:${product.id}`);
    inlineBtn(kb, lang, 'cart_view', 'cart:open');
    kb.row();
  }
  // 1) Refresh re-fetches and re-renders the product page so any
  // out-of-band stock / wallet balance updates show up. 2) Custom
  // Quantity opens the numeric keypad.
  inlineBtn(kb, lang, 'refresh', `prod:${product.id}`);
  inlineBtn(kb, lang, 'custom_qty', `qty:${product.id}:custom`);
  kb.row();
  // Topup Wallet removed; replaced with a 1-tap *copy* link to
  // this product. Tapping copies the deep-link URL to the user's
  // clipboard with a "Copied" toast — no share-to-chat dialog, no
  // auto-forward. The receiver lands on this product page when they
  // paste the link anywhere.
  inlineCopyText(kb, lang, 'share_product', shareUrl);
  inlineBtn(kb, lang, 'view_note', `note:${product.id}`);
  kb.row();
  // ⭐ Favorite / 💔 Unfavorite — the wishlist works for in-stock and
  // out-of-stock products alike, so a sold-out item is still savable.
  inlineBtn(
    kb,
    lang,
    opts.isFavorite ? 'favorite_remove' : 'favorite_add',
    `fav:toggle:${product.id}`,
  );
  kb.row();
  inlineBtn(kb, lang, 'back', 'shop:home');
  return kb;
}

export function shopHomeBackKeyboard(lang: Lang): InlineKeyboard {
  return inlineBtn(new InlineKeyboard(), lang, 'back', 'shop:home');
}

/**
 * Numeric keypad for the *Custom Quantity* prompt. Tapping a digit
 * appends to a session buffer (string concat, not arithmetic — so
 * `1` then `1` becomes `11`); ⌫ pops the last digit; 🗑 Clear empties
 * the buffer; ✅ Confirm validates against `[1, min(QTY_MAX, stock)]`
 * and either applies the qty (and returns to the product page) or
 * surfaces the premium-emoji invalid-quantity warning.
 *
 * The user can also send a number directly via the chat input — the
 * text-message handler short-circuits for any active keypad session
 * and reuses the same validation path.
 *
 * Layout:
 *   ┌─────┬─────┬─────┐
 *   │  1  │  2  │  3  │
 *   ├─────┼─────┼─────┤
 *   │  4  │  5  │  6  │
 *   ├─────┼─────┼─────┤
 *   │  7  │  8  │  9  │
 *   ├─────┼─────┼─────┤
 *   │  ⌫  │  0  │ 🗑  │
 *   ├─────┼─────┼─────┤
 *   │ 25  │ 50  │ 100 │
 *   ├─────┴─────┴─────┤
 *   │ 🎯 Max │ ✅ Confirm│
 *   ├─────────────────┤
 *   │      Back        │
 *   └─────────────────┘
 *
 * Callbacks:
 *   qkp:<id>:d:<digit>   — push the digit onto the buffer
 *   qkp:<id>:back        — pop the last digit
 *   qkp:<id>:clear       — wipe the buffer
 *   qkp:<id>:p:<value>   — snap buffer to a preset (25 / 50 / 100),
 *                          clamped down to min(QTY_MAX, stock)
 *   qkp:<id>:max         — fill buffer with min(QTY_MAX, stock)
 *   qkp:<id>:confirm     — validate + apply
 *   prod:<id>            — Back / cancel (no apply)
 */

/**
 * Quick-pick quantity presets shown above the Max / Confirm row on
 * the custom-quantity keypad. Each tap snaps the digit buffer to the
 * preset value (clamped down to `min(QTY_MAX, stock)` so a small-
 * stock product never silently exceeds availability). Order them
 * smallest-to-largest left-to-right so the row reads naturally.
 */
export const QTY_KEYPAD_PRESETS = [25, 50, 100] as const;

export function qtyKeypadKeyboard(
  lang: Lang,
  product: DBProduct,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  const id = product.id;
  const digitRows: ReadonlyArray<ReadonlyArray<string>> = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
  ];
  for (const row of digitRows) {
    for (const d of row) kb.text(d, `qkp:${id}:d:${d}`);
    kb.row();
  }
  // Bottom action row: backspace, 0, clear.
  inlineBtn(kb, lang, 'qty_keypad_back', `qkp:${id}:back`);
  kb.text('0', `qkp:${id}:d:0`);
  inlineBtn(kb, lang, 'qty_keypad_clear', `qkp:${id}:clear`);
  kb.row();
  // Quick-pick preset row — saves the bulk-buy user from tapping
  // each digit individually. Snapping happens in the keypad action
  // handler in `src/handlers/shop.ts` (clamps down to the user's
  // purchasable ceiling).
  for (const preset of QTY_KEYPAD_PRESETS) {
    kb.text(String(preset), `qkp:${id}:p:${preset}`);
  }
  kb.row();
  // Max + Confirm share a row so the bulk-buy gesture (Max → Confirm)
  // is two adjacent taps. The action handler in
  // `src/handlers/shop.ts` snaps the buffer to
  // `min(QTY_MAX, stock)` (or `QTY_MAX` for unlimited-stock items)
  // before re-rendering the card.
  inlineBtn(kb, lang, 'qty_keypad_max', `qkp:${id}:max`);
  inlineBtn(kb, lang, 'qty_keypad_confirm', `qkp:${id}:confirm`);
  kb.row();
  inlineBtn(kb, lang, 'back', `prod:${id}`);
  return kb;
}

/**
 * Payment-method picker shown after the user taps *Buy Now* on the
 * product page. Renders the order summary above three buttons:
 * 👛 *Wallet Pay* (charges the user's wallet via the existing
 * `pay:wallet:<id>` flow), 💸 *Pay Directly* (Phase B per-order
 * crypto direct-pay, fulfils the order on tx confirmation without
 * touching the wallet), and 🪙 *Top Up* (deep-links into the top-up
 * flow at `topup:open`).
 */
export function paymentMethodKeyboard(
  lang: Lang,
  product: DBProduct,
  _options?: { showReferralPay?: boolean },
): InlineKeyboard {
  const kb = new InlineKeyboard();
  inlineBtn(kb, lang, 'pay_wallet', `co:open:buy:${product.id}`);
  kb.row();
  inlineBtn(kb, lang, 'pay_direct', `pay:direct:${product.id}`);
  kb.row();
  // Top-up Wallet from the buy flow carries the originating product
  // id so the topup screen's Back button returns the user to THIS
  // payment-method picker (`buy:<productId>`) instead of dropping
  // them on the main menu.
  inlineBtn(kb, lang, 'pay_topup', `topup:open:from:buy:${product.id}`);
  kb.row();
  inlineBtn(kb, lang, 'back', `prod:${product.id}`);
  return kb;
}
