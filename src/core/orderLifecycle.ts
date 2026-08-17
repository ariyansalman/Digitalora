/**
 * 📦 Order lifecycle — the single source of truth for order status.
 *
 * Dependency-free on purpose: `tests/order-lifecycle.test.mjs` imports
 * this module directly through Node's type stripping, so every state
 * transition can be exercised without a database or a bot instance.
 *
 * Backward compatibility is a hard requirement. The legacy `orders`
 * table only allowed `paid | refunded | cancelled`; those three values
 * remain first-class members of the new lifecycle and keep their exact
 * meaning. The new statuses are added around them:
 *
 *   pending → payment_processing → paid → processing → delivered → completed
 *                                    ↘ cancelled / failed / refunded
 */

export const ORDER_STATUSES = [
  'pending',
  'payment_processing',
  'paid',
  'processing',
  'delivered',
  'completed',
  'cancelled',
  'failed',
  'refunded',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Values that already existed in the database before this lifecycle. */
export const LEGACY_ORDER_STATUSES = ['paid', 'refunded', 'cancelled'] as const;
export type LegacyOrderStatus = (typeof LEGACY_ORDER_STATUSES)[number];

export type PaymentStatus =
  | 'unpaid'
  | 'processing'
  | 'paid'
  | 'refunded'
  | 'failed'
  | 'cancelled';

export type FulfillmentStatus =
  | 'not_started'
  | 'in_progress'
  | 'fulfilled'
  | 'failed'
  | 'cancelled';

export type DeliveryStatus =
  | 'pending'
  | 'processing'
  | 'delivered'
  | 'failed'
  | 'cancelled';

export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'unpaid',
  'processing',
  'paid',
  'refunded',
  'failed',
  'cancelled',
];

export const FULFILLMENT_STATUSES: readonly FulfillmentStatus[] = [
  'not_started',
  'in_progress',
  'fulfilled',
  'failed',
  'cancelled',
];

export const DELIVERY_STATUSES: readonly DeliveryStatus[] = [
  'pending',
  'processing',
  'delivered',
  'failed',
  'cancelled',
];

/**
 * Allowed transitions. Terminal states have an empty list. Every entry
 * is intentionally conservative — money-moving states (`refunded`)
 * can be reached from anything that was, or could have been, paid, but
 * nothing can walk back out of `refunded`.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending: ['payment_processing', 'paid', 'cancelled', 'failed'],
  payment_processing: ['paid', 'failed', 'cancelled'],
  paid: ['processing', 'delivered', 'completed', 'failed', 'cancelled', 'refunded'],
  processing: ['delivered', 'completed', 'failed', 'refunded'],
  delivered: ['completed', 'refunded'],
  completed: ['refunded'],
  cancelled: ['refunded'],
  failed: ['processing', 'cancelled', 'refunded'],
  refunded: [],
};

/** States that no longer move on their own. */
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ['refunded'];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

/**
 * Coerce whatever the database returned into a known status. Unknown /
 * null values fall back to `paid`, which is what the legacy table
 * defaulted to, so an un-migrated row never renders as broken.
 */
export function normalizeOrderStatus(value: unknown): OrderStatus {
  if (isOrderStatus(value)) return value;
  return 'paid';
}

export function canTransition(from: unknown, to: unknown): boolean {
  if (!isOrderStatus(to)) return false;
  const source = normalizeOrderStatus(from);
  if (source === to) return true; // idempotent re-apply is always safe
  return ORDER_TRANSITIONS[source].includes(to);
}

export function nextStatuses(from: unknown): readonly OrderStatus[] {
  return ORDER_TRANSITIONS[normalizeOrderStatus(from)];
}

export function isTerminalStatus(status: unknown): boolean {
  return TERMINAL_ORDER_STATUSES.includes(normalizeOrderStatus(status));
}

// ---------------------------------------------------------------------
// Derived facets
// ---------------------------------------------------------------------

const DERIVED: Readonly<
  Record<OrderStatus, { payment: PaymentStatus; fulfillment: FulfillmentStatus; delivery: DeliveryStatus }>
> = {
  pending: { payment: 'unpaid', fulfillment: 'not_started', delivery: 'pending' },
  payment_processing: { payment: 'processing', fulfillment: 'not_started', delivery: 'pending' },
  paid: { payment: 'paid', fulfillment: 'not_started', delivery: 'pending' },
  processing: { payment: 'paid', fulfillment: 'in_progress', delivery: 'processing' },
  delivered: { payment: 'paid', fulfillment: 'fulfilled', delivery: 'delivered' },
  completed: { payment: 'paid', fulfillment: 'fulfilled', delivery: 'delivered' },
  cancelled: { payment: 'cancelled', fulfillment: 'cancelled', delivery: 'cancelled' },
  failed: { payment: 'failed', fulfillment: 'failed', delivery: 'failed' },
  refunded: { payment: 'refunded', fulfillment: 'cancelled', delivery: 'cancelled' },
};

export type OrderLifecycleInput = {
  status?: unknown;
  payment_status?: unknown;
  fulfillment_status?: unknown;
  delivery_status?: unknown;
  delivered_items?: string | null;
  delivery?: string | null;
  supplier_status?: string | null;
};

export type OrderLifecycleView = {
  status: OrderStatus;
  payment: PaymentStatus;
  fulfillment: FulfillmentStatus;
  delivery: DeliveryStatus;
  /** True only when the buyer may see delivered digital items. */
  showDeliveredItems: boolean;
};

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Placeholder payloads the fulfilment pipeline writes into
 * `delivered_items` while an order is still waiting on stock, a
 * supplier, or an admin. They must never be shown as "delivered".
 */
const PENDING_ITEM_MARKERS = [
  'preorder pending',
  'preorder fulfilling',
  'delivery pending',
  'buyer details pending',
  'fulfillment failed',
  'manual delivery required',
  'pending admin',
];

export function isPendingDeliveryPayload(payload: string | null | undefined): boolean {
  if (!payload) return true;
  const text = payload.trim().toLowerCase();
  if (text.length === 0) return true;
  return PENDING_ITEM_MARKERS.some((marker) => text.startsWith(marker) || text.includes(marker));
}

/**
 * Resolve the three user-facing facets. Explicit columns win when the
 * migration has been applied; otherwise everything is derived from the
 * single `status` column so legacy rows keep rendering correctly.
 */
export function resolveOrderLifecycle(order: OrderLifecycleInput): OrderLifecycleView {
  const status = normalizeOrderStatus(order.status);
  const base = DERIVED[status];
  const payment = pick<PaymentStatus>(order.payment_status, PAYMENT_STATUSES, base.payment);
  const fulfillment = pick<FulfillmentStatus>(
    order.fulfillment_status,
    FULFILLMENT_STATUSES,
    base.fulfillment,
  );
  const delivery = pick<DeliveryStatus>(order.delivery_status, DELIVERY_STATUSES, base.delivery);

  const hasRealPayload =
    !isPendingDeliveryPayload(order.delivered_items) ||
    (typeof order.delivery === 'string' && order.delivery.trim().length > 0 && !isPendingDeliveryPayload(order.delivery));

  // Digital items are only ever exposed after a successful fulfilment.
  // Legacy rows (plain `paid`, no lifecycle columns) counted as
  // fulfilled the moment items were attached, so we keep that.
  const legacyFulfilled =
    status === 'paid' && order.fulfillment_status == null && order.delivery_status == null;
  const fulfilled = fulfillment === 'fulfilled' || delivery === 'delivered' || legacyFulfilled;

  return {
    status,
    payment,
    fulfillment,
    delivery,
    showDeliveredItems: fulfilled && hasRealPayload,
  };
}

// ---------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------

export const ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, string>> = {
  pending: '🕒 Pending',
  payment_processing: '💳 Payment Processing',
  paid: '✅ Paid',
  processing: '⚙️ Processing',
  delivered: '📬 Delivered',
  completed: '🏁 Completed',
  cancelled: '✖️ Cancelled',
  failed: '⚠️ Failed',
  refunded: '↩️ Refunded',
};

/** Short label for two-column list buttons (Telegram button width). */
export const ORDER_STATUS_SHORT_LABELS: Readonly<Record<OrderStatus, string>> = {
  pending: '🕒 Pending',
  payment_processing: '💳 Paying',
  paid: '✅ Paid',
  processing: '⚙️ Processing',
  delivered: '📬 Delivered',
  completed: '🏁 Completed',
  cancelled: '✖️ Cancelled',
  failed: '⚠️ Failed',
  refunded: '↩️ Refunded',
};

export const PAYMENT_STATUS_LABELS: Readonly<Record<PaymentStatus, string>> = {
  unpaid: '🕒 Awaiting payment',
  processing: '💳 Processing',
  paid: '✅ Paid',
  refunded: '↩️ Refunded',
  failed: '⚠️ Failed',
  cancelled: '✖️ Cancelled',
};

export const FULFILLMENT_STATUS_LABELS: Readonly<Record<FulfillmentStatus, string>> = {
  not_started: '🕒 Queued',
  in_progress: '⚙️ In progress',
  fulfilled: '✅ Fulfilled',
  failed: '⚠️ Failed',
  cancelled: '✖️ Cancelled',
};

export const DELIVERY_STATUS_LABELS: Readonly<Record<DeliveryStatus, string>> = {
  pending: '🕒 Not delivered yet',
  processing: '⚙️ Preparing',
  delivered: '📬 Delivered',
  failed: '⚠️ Failed',
  cancelled: '✖️ Cancelled',
};

export function orderStatusLabel(status: unknown): string {
  return ORDER_STATUS_LABELS[normalizeOrderStatus(status)];
}

export function orderStatusShortLabel(status: unknown): string {
  return ORDER_STATUS_SHORT_LABELS[normalizeOrderStatus(status)];
}

// ---------------------------------------------------------------------
// Supplier status — safe to show, never leaks credentials
// ---------------------------------------------------------------------

/**
 * Supplier responses can carry API keys, signed URLs, e-mails and
 * internal endpoints. Buyers (and even admins, in the order card) only
 * ever need the coarse state, so we map to a small allow-list and drop
 * everything else.
 */
const SUPPLIER_STATE_MAP: Array<[RegExp, string]> = [
  [/\b(pending|queue|queued|waiting|new)\b/i, 'Queued'],
  [/\b(processing|in[_\s-]?progress|running|started)\b/i, 'Processing'],
  [/\b(partial)\b/i, 'Partially delivered'],
  [/\b(completed|complete|success|delivered|done|ok)\b/i, 'Completed'],
  [/\b(cancel|canceled|cancelled)\b/i, 'Cancelled'],
  [/\b(refund|refunded)\b/i, 'Refunded'],
  [/\b(fail|failed|error|rejected)\b/i, 'Failed'],
];

/**
 * Returns a safe supplier state string, or `null` when nothing safe
 * can be derived. Never returns raw supplier text.
 */
export function sanitizeSupplierStatus(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = String(raw).slice(0, 200);
  for (const [re, label] of SUPPLIER_STATE_MAP) {
    if (re.test(text)) return label;
  }
  return null;
}

/** Supplier detail is only surfaced for orders that actually used one. */
export function supplierStatusLine(order: OrderLifecycleInput): string | null {
  const safe = sanitizeSupplierStatus(order.supplier_status ?? null);
  return safe ? `🛰️ Supplier: ${safe}` : null;
}

// ---------------------------------------------------------------------
// Admin transition helpers
// ---------------------------------------------------------------------

/**
 * Fulfilment states an admin is allowed to set by hand. Payment-only
 * states (`pending`, `payment_processing`, `paid`) are deliberately
 * excluded — those are owned by the payment verification pipeline and
 * must never be forced from a button.
 */
export const ADMIN_SETTABLE_STATUSES: readonly OrderStatus[] = [
  'processing',
  'delivered',
  'completed',
  'failed',
  'cancelled',
  'refunded',
];

export function adminTransitionsFor(current: unknown): OrderStatus[] {
  const from = normalizeOrderStatus(current);
  return ADMIN_SETTABLE_STATUSES.filter((to) => to !== from && canTransition(from, to));
}

export type LifecyclePatch = {
  status: OrderStatus;
  payment_status: PaymentStatus;
  fulfillment_status: FulfillmentStatus;
  delivery_status: DeliveryStatus;
};

const PAID_LIKE: readonly OrderStatus[] = [
  'paid',
  'processing',
  'delivered',
  'completed',
];

/**
 * The column set to persist when moving an order to `to`.
 *
 * `from` matters for `failed`: a payment that never succeeded is a
 * payment failure, while a fulfilment that broke after the money
 * landed must keep `payment_status = paid` so refund/accounting logic
 * still sees the captured amount.
 */
export function lifecyclePatchFor(to: OrderStatus, from?: unknown): LifecyclePatch {
  const d = DERIVED[to];
  let payment = d.payment;
  if (to === 'failed' && from != null && PAID_LIKE.includes(normalizeOrderStatus(from))) {
    payment = 'paid';
  }
  return {
    status: to,
    payment_status: payment,
    fulfillment_status: d.fulfillment,
    delivery_status: d.delivery,
  };
}
