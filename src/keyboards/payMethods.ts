/**
 * Shared "Top Up Wallet / Select Payment Method" keyboard layout.
 *
 * Renders the per-method buttons in the order shown on the canonical
 * mock-up:
 *
 *   ┌─────────────────────────┐
 *   │ Binance Pay             │  full row
 *   ├─────────────────────────┤
 *   │ USDT (BEP-20)           │  full row
 *   ├─────────────┬───────────┤
 *   │ TON         │ Tron      │  paired row
 *   ├─────────────┴───────────┤
 *   │ Others (primary blue)   │  full row
 *   ├─────────────────────────┤
 *   │ Back                    │  full row
 *   └─────────────────────────┘
 *
 * Methods are rendered in the order returned by `listPaymentMethods()`.
 * Adjacent TRC-20 / TON rows are paired into a single keyboard row to
 * mirror the mock; everything else is one button per row.
 *
 * Each button picks up:
 *   - per-method `color_mode` → Bot API 9.4 button style (admin-edit
 *     via `setPaymentMethodColor`).
 *   - per-method `emoji_id` → Bot API 9.4 `icon_custom_emoji_id`
 *     (admin-edit via `setPaymentMethodIcon`). The bot owner asked
 *     us to render *only* premium icons here — there is no unicode
 *     fallback prefix on the label, so when an admin hasn't set a
 *     premium icon the button shows just the method name.
 *
 * The keyboard always ends with an "Others" button (callback specified
 * by the caller) and a Back button (callback specified by the caller).
 */

import { InlineKeyboard } from 'grammy';
import type { Lang } from '../../config/index.js';
import { inlineBtn } from './helpers.js';
import { colorModeToStyle, type ColorMode } from '../../config/index.js';
import type { DBPaymentMethod, PaymentProvider } from '../types.js';

/**
 * Build the visible button label for a payment method. The bot owner
 * explicitly asked for *no* default unicode emoji prefixes on this
 * keyboard ("delete these default free emojies and just premium") —
 * any visual glyph should come from the admin-set premium icon
 * (`emoji_id`), applied via `kb.icon()` in `applyChrome()` below.
 *
 * We therefore drop both the per-provider hard-coded glyph
 * (`PROVIDER_GLYPHS`) and the per-row unicode fallback
 * (`m.emoji_unicode`) from the label. When the admin has set a
 * premium icon, premium clients render the animated glyph and
 * non-premium clients render the unicode representation Telegram
 * derives from the `custom_emoji_id`. When no premium icon is set,
 * the button simply shows the bare method name.
 */
function labelFor(m: DBPaymentMethod): string {
  return m.name;
}

function applyChrome(kb: InlineKeyboard, m: DBPaymentMethod): void {
  if (m.emoji_id && m.emoji_id.length > 0) {
    kb.icon(m.emoji_id);
  }
  const style = colorModeToStyle(m.color_mode as ColorMode);
  if (style !== undefined) kb.style(style);
}

/**
 * Push one method button onto the keyboard with its admin-configured
 * chrome applied. Caller decides row breaks.
 */
function pushMethod(
  kb: InlineKeyboard,
  m: DBPaymentMethod,
  callbackData: string,
): void {
  kb.text(labelFor(m), callbackData);
  applyChrome(kb, m);
}

/**
 * Build the canonical payment-method keyboard.
 *
 *   - `methods` — payment methods to render.
 *   - `methodCallback` — given a method id, returns the callback data
 *      to attach to its button (e.g. `(id) => `topup:method:${id}`).
 *   - `othersCallback` — callback for the "Others" button. Pass `null`
 *      to omit the Others row entirely (used by Direct-Pay where the
 *      bot-owner explicitly asked us to drop the Others / payment-
 *      support entry point — buyers can still reach support via the
 *      main Support menu).
 *   - `backCallback` — callback for the trailing "Back" button.
 */
export function paymentMethodsKeyboard(
  lang: Lang,
  methods: DBPaymentMethod[],
  methodCallback: (id: number) => string,
  othersCallback: string | null,
  backCallback: string,
): InlineKeyboard {
  const kb = new InlineKeyboard();

  // Bot-owner spec layout (pic 2):
  //
  //   [ Binance Pay              ]   ← full row
  //   [ USDT BEP-20              ]   ← full row
  //   [ Bybit Pay                ]   ← full row
  //   [ USDT TON   ][ USDT TRC-20 ]  ← paired row (small)
  //   [ Others                    ]
  //   [ Back (red)                ]
  //
  // To make this happen *regardless* of admin sort_order (which the
  // bot-owner doesn't want to micro-manage), we apply a stable
  // provider-priority sort first. Within the same provider, ties
  // are broken by the admin-controlled `sort_order` then by id —
  // so two TRC-20 methods (e.g. main + backup wallet) keep the
  // admin's relative ordering. The original `methods` array is not
  // mutated.
  const PROVIDER_PRIORITY: Record<PaymentProvider, number> = {
    binance_pay: 0,
    usdt_bep20: 1,
    bybit_pay: 2,
    usdt_ton: 3,
    usdt_trc20: 4,
    ltc: 5,
    cryptobot: 6,
    manual: 7,
  };
  const sorted = methods.slice().sort((a, b) => {
    const pa = PROVIDER_PRIORITY[a.provider] ?? 99;
    const pb = PROVIDER_PRIORITY[b.provider] ?? 99;
    if (pa !== pb) return pa - pb;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.id - b.id;
  });

  // Pair *only* TON and TRC-20, and only when they sit next to each
  // other in the sorted list (which they always do given the
  // priority above when both are configured). BEP-20 stays
  // full-width — the bot-owner's sketch shows it on its own row
  // because the "USDT BEP-20" label is wide enough to dominate the
  // row, and pairing it with TON would leave both buttons feeling
  // squeezed.
  const PAIR_PROVIDERS = new Set<PaymentProvider>(['usdt_trc20', 'usdt_ton']);
  // Hard guard: if an admin renames a chain method to something
  // verbose ("USDT on the TRON Network", etc.) the pair would wrap
  // to two lines and look broken. Fall back to one-per-row when
  // either label is too long.
  const SHORT_LABEL_LIMIT = 12;
  const isPairable = (m: DBPaymentMethod) =>
    PAIR_PROVIDERS.has(m.provider) && labelFor(m).length <= SHORT_LABEL_LIMIT;
  let i = 0;
  while (i < sorted.length) {
    const m = sorted[i]!;
    const next = sorted[i + 1];
    if (next && isPairable(m) && isPairable(next)) {
      pushMethod(kb, m, methodCallback(m.id));
      pushMethod(kb, next, methodCallback(next.id));
      kb.row();
      i += 2;
      continue;
    }
    pushMethod(kb, m, methodCallback(m.id));
    kb.row();
    i += 1;
  }

  // Others — primary-blue button. Goes through `inlineBtn` so the
  // configured premium icon (`btnicon.paymethod_others` or the
  // compile-time default mapping to `EMOJI.paymethod_others`) is
  // applied via Bot API 9.4 `icon_custom_emoji_id`. Premium
  // subscribers see the animated glyph; non-premium users see the
  // unicode fallback baked into the locale label. Caller passes
  // `null` to suppress the row — Direct-Pay does that since the
  // bot-owner asked us to drop the Others / payment-support entry
  // point from the buy-flow picker.
  if (othersCallback !== null) {
    inlineBtn(kb, lang, 'paymethod_others', othersCallback);
    kb.row();
  }
  // Back — same `inlineBtn` treatment so the row gets the configured
  // colour (red by default — matches the Cancel-pay arrow on the
  // wallet-confirm card) plus the premium back-arrow icon.
  inlineBtn(kb, lang, 'paymethod_back', backCallback);
  return kb;
}
