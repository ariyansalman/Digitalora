/**
 * Keyboards for the redesigned My Orders screen.
 */
import { InlineKeyboard } from 'grammy';
import type { DBOrder } from '../types.js';
import { type Lang } from '../../config/index.js';
import { inlineBtn, inlineUrl } from './helpers.js';
import { t } from '../i18n/index.js';
import {
  normalizeOrderStatus,
  orderStatusShortLabel,
} from '../core/orderLifecycle.js';

export const ORDERS_PER_PAGE = 6;

/**
 * Two-column paginated orders list — left button is the product
 * name, right button is the live status. Both go to the same
 * detail screen so a tap anywhere on the row works.
 */
export function ordersListKeyboard(
  lang: Lang,
  rows: DBOrder[],
  page: number,
  totalPages: number,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const row of rows) {
    const name = row.product_name.length > 22
      ? row.product_name.slice(0, 21) + '…'
      : row.product_name;
    // Full lifecycle label (Pending / Processing / Delivered / …).
    // Legacy `paid | refunded | cancelled` rows keep their old wording.
    const status = normalizeOrderStatus(row.status);
    kb.text(name, `orders:open:${row.id}`);
    kb.text(orderStatusShortLabel(status), `orders:open:${row.id}`);
    if (status === 'paid' || status === 'delivered' || status === 'completed') kb.success();
    else if (status === 'refunded' || status === 'failed' || status === 'cancelled') kb.danger();
    kb.row();
  }
  // Pagination row: `Page X/Y` is purely informational; we put it on
  // the same callback as the current page so taps are cheap no-ops.
  const navRow: Array<[string, string]> = [];
  if (totalPages > 1) {
    if (page > 0) navRow.push([t(lang, 'btn.prev'), `orders:p:${page - 1}`]);
    navRow.push([
      t(lang, 'orders.page', { page: page + 1, pages: totalPages }),
      `orders:p:${page}`,
    ]);
    if (page < totalPages - 1) navRow.push([t(lang, 'btn.next'), `orders:p:${page + 1}`]);
    for (const [label, cb] of navRow) kb.text(label, cb);
    kb.row();
  }
  inlineBtn(kb, lang, 'find_order_by_id', 'profile:orders:find');
  kb.row();
  inlineBtn(kb, lang, 'send_pdf_orders', 'profile:orders:pdf');
  kb.row();
  inlineBtn(kb, lang, 'back_to_settings', 'profile:open');
  return kb;
}

/** Order-detail keyboard — `Open Link` (when delivery contains a URL) + Back. */
export function orderDetailKeyboard(lang: Lang, openUrl: string | null): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (openUrl) {
    inlineUrl(kb, lang, 'orders_open_link', openUrl);
    kb.row();
  }
  inlineBtn(kb, lang, 'orders_back_list', 'profile:orders');
  return kb;
}
