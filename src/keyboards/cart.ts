import { InlineKeyboard } from 'grammy';
import type { Lang } from '../../config/index.js';
import type { CartLine } from '../core/cart.js';
import { inlineBtn } from './helpers.js';
import { t } from '../i18n/index.js';

/** Shorten a product name so a 3-button row still fits on mobile. */
function short(name: string, max = 14): string {
  const clean = name.trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/**
 * 🛒 Your Cart keyboard.
 *
 * One row per product (➖ / name × qty / ➕ / 🗑) followed by the
 * cart-level actions: 💳 Checkout, 🛍 Continue Shopping, 🧹 Clear Cart.
 */
export function cartKeyboard(
  lang: Lang,
  lines: readonly CartLine[],
  opts: { canCheckout: boolean } = { canCheckout: false },
): InlineKeyboard {
  const kb = new InlineKeyboard();

  for (const line of lines) {
    inlineBtn(kb, lang, 'cart_dec', `cart:dec:${line.product_id}`);
    kb.text(
      `${short(line.name)} ×${line.qty > 0 ? line.qty : line.requestedQty}`,
      `cart:item:${line.product_id}`,
    );
    inlineBtn(kb, lang, 'cart_inc', `cart:inc:${line.product_id}`);
    inlineBtn(kb, lang, 'cart_remove', `cart:rm:${line.product_id}`);
    kb.row();
  }

  if (opts.canCheckout) {
    inlineBtn(kb, lang, 'cart_checkout', 'co:open:cart');
    kb.row();
  }
  inlineBtn(kb, lang, 'continue_shopping', 'shop:home');
  if (lines.length > 0) inlineBtn(kb, lang, 'cart_clear', 'cart:clear');
  kb.row();
  inlineBtn(kb, lang, 'refresh', 'cart:open');
  inlineBtn(kb, lang, 'back', 'main:open');
  return kb;
}

/** Confirmation card shown before the wallet is charged. */
export function cartCheckoutConfirmKeyboard(lang: Lang): InlineKeyboard {
  const kb = new InlineKeyboard();
  inlineBtn(kb, lang, 'confirm_pay', 'cart:checkout:do');
  kb.row();
  inlineBtn(kb, lang, 'cancel_pay', 'cart:open');
  return kb;
}

/**
 * Post "Add to Cart" card: 🛍 Continue Shopping / 🛒 View Cart, as
 * specified by the product → add → continue-or-view flow.
 */
export function addedToCartKeyboard(lang: Lang, productId: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  inlineBtn(kb, lang, 'cart_view', 'cart:open');
  inlineBtn(kb, lang, 'continue_shopping', 'shop:home');
  kb.row();
  kb.text(t(lang, 'cart.btn.back_to_product'), `prod:${productId}`);
  return kb;
}

/** Clear-cart confirmation (destructive action gets a second tap). */
export function cartClearConfirmKeyboard(lang: Lang): InlineKeyboard {
  const kb = new InlineKeyboard();
  inlineBtn(kb, lang, 'cart_clear_confirm', 'cart:clear:do');
  kb.row();
  inlineBtn(kb, lang, 'cancel_pay', 'cart:open');
  return kb;
}
