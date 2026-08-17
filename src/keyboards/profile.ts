import { InlineKeyboard } from 'grammy';
import { CURRENCIES, type CurrencyCode } from '../../config/currencies.js';
import { type Lang } from '../../config/index.js';
import { inlineBtn, inlineCopyText, inlineUrl } from './helpers.js';

/**
 * Settings (profile) keyboard — eight buttons in a tidy 2×4 grid:
 *
 *   Stats          | My Orders
 *   Language       | Notifications
 *   Email Settings | My Deposits
 *   Set Region     | Gift Code
 *
 * with a Back row at the bottom. Email Settings is a single button
 * that opens a submenu with Set / Change / Why, so the main grid
 * stays compact regardless of whether an email has been saved.
 */
export function profileKeyboard(lang: Lang): InlineKeyboard {
  const kb = new InlineKeyboard();
  inlineBtn(kb, lang, 'stats', 'profile:stats');
  inlineBtn(kb, lang, 'my_orders', 'profile:orders');
  kb.row();
  inlineBtn(kb, lang, 'language', 'profile:lang');
  inlineBtn(kb, lang, 'notifications', 'profile:notifications');
  kb.row();
  inlineBtn(kb, lang, 'email_settings', 'profile:email');
  inlineBtn(kb, lang, 'deposit_history', 'profile:deposits');
  kb.row();
  inlineBtn(kb, lang, 'set_region', 'profile:region');
  inlineBtn(kb, lang, 'redeem', 'profile:redeem');
  kb.row();
  // Premium-shop overhaul: two new admin-editable info screens
  // surfaced from Settings.
  inlineBtn(kb, lang, 'bot_tutorial', 'profile:tutorial');
  inlineBtn(kb, lang, 'send_price_list', 'profile:pricelist');
  kb.row();
  inlineBtn(kb, lang, 'currency', 'profile:currency');
  inlineBtn(kb, lang, 'reseller_api', 'api:open');
  kb.row();
  inlineBtn(kb, lang, 'shop_view', 'profile:shopview');
  inlineBtn(kb, lang, 'shop_grouping', 'profile:shopgroup');
  kb.row();
  inlineBtn(kb, lang, 'back', 'main:open');
  return kb;
}

export function shopListModeKeyboard(
  lang: Lang,
  selected: 'paged' | 'all',
): InlineKeyboard {
  const kb = new InlineKeyboard();
  inlineBtn(kb, lang, 'shop_view_paged', 'profile:shopview:set:paged');
  kb.style(selected === 'paged' ? 'success' : 'primary');
  kb.row();
  inlineBtn(kb, lang, 'shop_view_all', 'profile:shopview:set:all');
  kb.style(selected === 'all' ? 'success' : 'primary');
  kb.row();
  inlineBtn(kb, lang, 'back_to_settings', 'profile:open');
  return kb;
}

export function shopGroupModeKeyboard(
  lang: Lang,
  selected: 'grouped' | 'ungrouped',
): InlineKeyboard {
  const kb = new InlineKeyboard();
  inlineBtn(kb, lang, 'shop_grouped', 'profile:shopgroup:set:grouped');
  kb.style(selected === 'grouped' ? 'success' : 'primary');
  kb.row();
  inlineBtn(kb, lang, 'shop_ungrouped', 'profile:shopgroup:set:ungrouped');
  kb.style(selected === 'ungrouped' ? 'success' : 'primary');
  kb.row();
  inlineBtn(kb, lang, 'back_to_settings', 'profile:open');
  return kb;
}

/**
 * Send Price List sub-screen — two delivery options (mail / chat)
 * stacked on full-width rows so the inline icons line up cleanly.
 */
export function priceListKeyboard(lang: Lang): InlineKeyboard {
  const kb = new InlineKeyboard();
  inlineBtn(kb, lang, 'send_price_list_mail', 'profile:pricelist:mail');
  kb.row();
  inlineBtn(kb, lang, 'send_price_list_chat', 'profile:pricelist:chat');
  kb.row();
  inlineBtn(kb, lang, 'back_to_settings', 'profile:open');
  return kb;
}

/** Bot Tutorial viewer footer — just a Back button. */
export function botTutorialKeyboard(lang: Lang, url: string | null): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (url) {
    inlineUrl(kb, lang, 'tutorial_open_link', url);
    kb.row();
  }
  inlineBtn(kb, lang, 'back_to_settings', 'profile:open');
  return kb;
}

/**
 * Email Settings hub — Set / Change / Delete / Why Email each on
 * their own full-width row, mirroring the Top-Up Wallet layout, with
 * a Back row at the bottom.
 */
export function emailHubKeyboard(lang: Lang): InlineKeyboard {
  const kb = new InlineKeyboard();
  inlineBtn(kb, lang, 'email_set', 'profile:email:set');
  kb.row();
  inlineBtn(kb, lang, 'email_change', 'profile:email:change');
  kb.row();
  inlineBtn(kb, lang, 'email_delete', 'profile:email:delete');
  kb.row();
  inlineBtn(kb, lang, 'email_why', 'profile:email:why');
  kb.row();
  inlineBtn(kb, lang, 'back_to_settings', 'profile:open');
  return kb;
}

/**
 * Delete-Email confirmation keyboard — Confirm Delete (destructive)
 * on top, Cancel below to bounce back to the Email Settings hub.
 */
export function emailDeleteConfirmKeyboard(lang: Lang): InlineKeyboard {
  const kb = new InlineKeyboard();
  inlineBtn(kb, lang, 'email_delete_confirm', 'profile:email:delete:confirm');
  kb.row();
  inlineBtn(kb, lang, 'email_delete_cancel', 'profile:email');
  return kb;
}

/** Email sub-screen footer — Why + Back to Email Settings. */
export function emailScreenKeyboard(lang: Lang): InlineKeyboard {
  const kb = new InlineKeyboard();
  inlineBtn(kb, lang, 'email_why', 'profile:email:why');
  inlineBtn(kb, lang, 'back_to_settings', 'profile:email');
  return kb;
}

/**
 * Why-Email screen.
 *
 * `pdfUrl` is read from runtime settings (admin-editable). When set,
 * the "Know More" button is a *URL button* — tapping it opens the
 * PDF directly in Telegram's in-app browser, no extra chat clutter.
 * Otherwise the button is a callback that sends the bundled PDF as
 * a chat document (fallback for deployments that haven't configured
 * the public URL yet).
 */
export function whyEmailKeyboard(lang: Lang, pdfUrl: string | null): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (pdfUrl) {
    inlineUrl(kb, lang, 'email_know_more', pdfUrl);
  } else {
    inlineBtn(kb, lang, 'email_know_more', 'profile:email:why:more');
  }
  kb.row();
  inlineBtn(kb, lang, 'back_to_settings', 'profile:email');
  return kb;
}

/** Stats screen keyboard — Refresh + Send PDF + Back to Settings. */
export function statsKeyboard(lang: Lang): InlineKeyboard {
  const kb = new InlineKeyboard();
  inlineBtn(kb, lang, 'stats_refresh', 'profile:stats:refresh');
  kb.row();
  inlineBtn(kb, lang, 'stats_24h', 'profile:stats:range:1');
  inlineBtn(kb, lang, 'stats_7d', 'profile:stats:range:7');
  kb.row();
  inlineBtn(kb, lang, 'stats_30d', 'profile:stats:range:30');
  inlineBtn(kb, lang, 'stats_custom', 'profile:stats:custom');
  kb.row();
  inlineBtn(kb, lang, 'send_pdf_stats', 'profile:stats:pdf');
  kb.row();
  inlineBtn(kb, lang, 'back_to_settings', 'profile:open');
  return kb;
}

export function currencyKeyboard(
  lang: Lang,
  selected: CurrencyCode,
  page = 0,
): InlineKeyboard {
  const perPage = 8;
  const totalPages = Math.max(1, Math.ceil(CURRENCIES.length / perPage));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const kb = new InlineKeyboard();
  for (const currency of CURRENCIES.slice(safePage * perPage, safePage * perPage + perPage)) {
    const marker = currency.code === selected ? '✅ ' : '';
    kb.text(`${marker}${currency.code} — ${currency.label}`, `profile:currency:set:${currency.code}:${safePage}`);
    kb.style(currency.code === selected ? 'success' : 'primary');
    kb.row();
  }
  if (totalPages > 1) {
    if (safePage > 0) inlineBtn(kb, lang, 'prev', `profile:currency:p:${safePage - 1}`);
    kb.text(`${safePage + 1}/${totalPages}`, 'noop:currency-page');
    if (safePage + 1 < totalPages) inlineBtn(kb, lang, 'next', `profile:currency:p:${safePage + 1}`);
    kb.row();
  }
  inlineBtn(kb, lang, 'back_to_settings', 'profile:open');
  return kb;
}

/** Stand-alone Send-PDF row used at the bottom of My Deposits. */
export function depositsActionsKeyboard(lang: Lang): InlineKeyboard {
  const kb = new InlineKeyboard();
  inlineBtn(kb, lang, 'send_pdf_deposits', 'profile:deposits:pdf');
  kb.row();
  inlineBtn(kb, lang, 'back_to_settings', 'profile:open');
  return kb;
}

/**
 * Notifications submenu — three independent toggles (Stock / Info /
 * Wallet) each on their own full-width row (like the Top-Up Wallet
 * layout) so the long ON/OFF labels fit, with a Back row below.
 */
export function notificationsKeyboard(
  lang: Lang,
  state: {
    stock_alert: boolean;
    announcements: boolean;
    wallet_alert: boolean;
    email_reports: boolean;
  },
): InlineKeyboard {
  const stockKey = state.stock_alert ? 'notify_stock_on' : 'notify_stock_off';
  const annKey = state.announcements ? 'notify_ann_on' : 'notify_ann_off';
  const walletKey = state.wallet_alert ? 'notify_wallet_on' : 'notify_wallet_off';
  const emailKey = state.email_reports ? 'notify_email_on' : 'notify_email_off';
  const kb = new InlineKeyboard();
  inlineBtn(kb, lang, stockKey, 'profile:toggle_stock');
  kb.row();
  inlineBtn(kb, lang, annKey, 'profile:toggle_ann');
  kb.row();
  inlineBtn(kb, lang, walletKey, 'profile:toggle_wallet');
  kb.row();
  // Email Reports controls both the 12h "add your email" nag AND
  // the Send-PDF-to-mail buttons (those throw a popup error when
  // this toggle is OFF).
  inlineBtn(kb, lang, emailKey, 'profile:toggle_email_reports');
  kb.row();
  inlineBtn(kb, lang, 'back_to_settings', 'profile:open');
  return kb;
}

/**
 * Language picker — each language on its own full-width row (mirrors
 * Top-Up Wallet layout), with a Back to Settings row at the bottom.
 */
export function languageKeyboard(lang: Lang): InlineKeyboard {
  const kb = new InlineKeyboard();
  inlineBtn(kb, lang, 'language_en', 'lang:en');
  kb.row();
  inlineBtn(kb, lang, 'language_ar', 'lang:ar');
  kb.row();
  inlineBtn(kb, lang, 'language_vi', 'lang:vi');
  kb.row();
  inlineBtn(kb, lang, 'back_to_settings', 'profile:open');
  return kb;
}

/** Plain "Back to Settings" only — used for refer / sub-screens. */
export function backToSettingsKeyboard(lang: Lang): InlineKeyboard {
  return inlineBtn(new InlineKeyboard(), lang, 'back_to_settings', 'profile:open');
}

/** "Back to Main Menu" only — used for the Refer screen. */
export function backToMainKeyboard(lang: Lang): InlineKeyboard {
  return inlineBtn(new InlineKeyboard(), lang, 'back', 'main:open');
}

/**
 * Refer & Earn screen keyboard — Copy Link button (using Telegram's
 * `copy_text` button so tapping it copies the referral link to the
 * user's clipboard) followed by a Back row.
 */
export function referKeyboard(
  lang: Lang,
  link: string,
  options: { refreshCallback?: string; backCallback?: string; canConvert?: boolean } = {},
): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (options.canConvert) {
    inlineBtn(kb, lang, 'refer_convert', 'profile:refer:convert');
    kb.row();
  }
  inlineCopyText(kb, lang, 'copy_link', link);
  kb.row();
  inlineUrl(kb, lang, 'live_refers', 'https://t.me/TigerStockChat');
  kb.row();
  inlineBtn(kb, lang, 'refresh', options.refreshCallback ?? 'profile:refer');
  kb.row();
  inlineBtn(kb, lang, 'back', options.backCallback ?? 'main:open');
  return kb;
}
