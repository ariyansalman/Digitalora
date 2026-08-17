/**
 * 📦 My Orders — one shared card renderer for every order surface.
 *
 * The same field order and emoji vocabulary is used by the buyer list,
 * the buyer detail screen and the admin order panel, so an order looks
 * identical wherever it is shown:
 *
 *   🧾 Order ID
 *   📦 Product
 *   🔢 Quantity
 *   💰 Amount
 *   💳 Payment
 *   📅 Date
 *   ⚡ Status
 *
 * The detail card adds the three lifecycle facets (payment /
 * fulfilment / delivery) and, for supplier-backed orders, a coarse and
 * credential-free supplier state.
 */
import type { DBOrder } from '../types.js';
import {
  DELIVERY_STATUS_LABELS,
  FULFILLMENT_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  orderStatusLabel,
  resolveOrderLifecycle,
  sanitizeSupplierStatus,
  type OrderLifecycleView,
} from '../core/orderLifecycle.js';

export type OrderCardOptions = {
  /** Public, shareable order id (e.g. `DG-8F2K`). */
  publicId: string;
  /** Human payment label — "Wallet balance", "USDT BEP20", … */
  paymentLabel: string;
  /** Absolute UTC timestamp string. */
  when: string;
};

function amount(order: DBOrder): string {
  const total = Number(order.total);
  return `${total.toFixed(2)} USDT`;
}

/** The seven summary rows every order surface shares. */
export function orderSummaryLines(order: DBOrder, opts: OrderCardOptions): string[] {
  const life = resolveOrderLifecycle(order);
  return [
    `🧾 *Order ID:* \`${opts.publicId}\``,
    `📦 *Product:* ${order.product_name}`,
    `🔢 *Quantity:* ${order.qty}`,
    `💰 *Amount:* ${amount(order)}`,
    `💳 *Payment:* ${opts.paymentLabel}`,
    `📅 *Date:* ${opts.when}`,
    `⚡ *Status:* ${orderStatusLabel(life.status)}`,
  ];
}

/** Payment / Fulfilment / Delivery block for the detail screen. */
export function orderLifecycleLines(life: OrderLifecycleView, supplierStatus?: string | null): string[] {
  const lines = [
    `💳 *Payment Status:* ${PAYMENT_STATUS_LABELS[life.payment]}`,
    `🛠️ *Fulfilment Status:* ${FULFILLMENT_STATUS_LABELS[life.fulfillment]}`,
    `📬 *Delivery Status:* ${DELIVERY_STATUS_LABELS[life.delivery]}`,
  ];
  const supplier = sanitizeSupplierStatus(supplierStatus ?? null);
  if (supplier) {
    // Coarse state only — supplier names, endpoints, keys and raw
    // responses are never rendered to a buyer.
    lines.push(`🛰️ *Supplier Status:* ${supplier}`);
  }
  return lines;
}

/**
 * Full buyer-facing detail card, minus the delivered-items block which
 * the caller appends (it needs the attachment-aware renderer).
 *
 * `showDeliveredItems` on the returned lifecycle tells the caller
 * whether the items may be shown at all: for digital products nothing
 * is revealed until fulfilment actually succeeded.
 */
export function renderOrderDetailCard(
  order: DBOrder,
  opts: OrderCardOptions,
): { lines: string[]; lifecycle: OrderLifecycleView } {
  const lifecycle = resolveOrderLifecycle(order);
  const lines = [
    '📦 *Order Details*',
    '',
    ...orderSummaryLines(order, opts),
    '',
    ...orderLifecycleLines(lifecycle, order.supplier_status ?? null),
  ];
  if (!lifecycle.showDeliveredItems) {
    lines.push('', pendingDeliveryNote(lifecycle));
  }
  return { lines, lifecycle };
}

/** One-line explanation shown while items are still withheld. */
export function pendingDeliveryNote(life: OrderLifecycleView): string {
  switch (life.fulfillment) {
    case 'in_progress':
      return '⏳ _Your items are being prepared. You will get them here automatically._';
    case 'failed':
      return '⚠️ _Fulfilment failed. Support has been notified — no items were released._';
    case 'cancelled':
      return '✖️ _This order was cancelled, so no items were released._';
    default:
      return life.payment === 'paid'
        ? '⏳ _Payment confirmed. Items are released as soon as fulfilment completes._'
        : '⏳ _Waiting for payment confirmation._';
  }
}

/** Compact single-line row for lists / feeds. */
export function orderListLine(order: DBOrder, opts: OrderCardOptions): string {
  const life = resolveOrderLifecycle(order);
  return [
    `🧾 \`${opts.publicId}\``,
    `📦 ${order.product_name} 🔢 ×${order.qty}`,
    `💰 ${amount(order)} • 💳 ${opts.paymentLabel}`,
    `📅 ${opts.when} • ⚡ ${orderStatusLabel(life.status)}`,
  ].join('\n');
}
