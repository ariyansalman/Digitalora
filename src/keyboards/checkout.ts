/**
 * 🧾 Order Summary keyboard — shared by 🛒 Cart and ⚡ Buy Now.
 *
 *   ┌─────────────────────────────┐
 *   │ 👛 Pay with Wallet          │
 *   ├──────────────┬──────────────┤
 *   │ 💳 Payment…  │ 🎟️ Coupon    │
 *   ├──────────────┼──────────────┤
 *   │ ⬅️ Back      │ ❌ Cancel     │
 *   └──────────────┴──────────────┘
 *
 * The labels come from the locale files (`checkout.btn.*`) so all
 * three languages stay in sync; the callbacks carry *intent only* —
 * never a price, quantity or total.
 */
import { InlineKeyboard } from 'grammy';
import type { Lang } from '../../config/index.js';
import { t } from '../i18n/index.js';

export type CheckoutKeyboardOptions = {
  /** Enable 👛 Pay with Wallet (payable > 0 and balance is enough). */
  canPayWallet: boolean;
  /** Show 🎟️ Coupon (hidden when there is nothing to discount). */
  showCoupon?: boolean;
  /** A coupon is currently applied — offer to remove it. */
  couponApplied?: boolean;
};

export function checkoutKeyboard(
  lang: Lang,
  opts: CheckoutKeyboardOptions,
): InlineKeyboard {
  const kb = new InlineKeyboard();

  if (opts.canPayWallet) {
    kb.text(t(lang, 'checkout.btn.wallet'), 'co:pay');
    kb.row();
  }

  kb.text(t(lang, 'checkout.btn.methods'), 'co:methods');
  kb.text(
    opts.couponApplied ? t(lang, 'checkout.btn.coupon_remove') : t(lang, 'checkout.btn.coupon'),
    opts.couponApplied ? 'co:coupon:clear' : 'co:coupon',
  );
  kb.row();

  kb.text(t(lang, 'checkout.btn.back'), 'co:back');
  kb.text(t(lang, 'checkout.btn.cancel'), 'co:cancel');
  return kb;
}

/** Second tap before the wallet is actually charged. */
export function checkoutConfirmKeyboard(lang: Lang): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.text(t(lang, 'checkout.btn.confirm'), 'co:pay:do');
  kb.row();
  kb.text(t(lang, 'checkout.btn.back'), 'co:open');
  kb.text(t(lang, 'checkout.btn.cancel'), 'co:cancel');
  return kb;
}

/** Shown while the buyer is typing a coupon code. */
export function couponPromptKeyboard(lang: Lang): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.text(t(lang, 'checkout.btn.back'), 'co:open');
  kb.text(t(lang, 'checkout.btn.cancel'), 'co:cancel');
  return kb;
}
