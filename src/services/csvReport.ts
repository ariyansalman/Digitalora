/**
 * CSV builders that mirror every PDF emailed to users so the admin
 * (or the user themselves) can open the same data in Excel /
 * Google Sheets for sorting, filtering, charting.
 *
 * One builder per ReportKind:
 *   buildOrdersCsv   ← My Orders   (mirrors buildOrdersPdf)
 *   buildDepositsCsv ← My Deposits (mirrors buildDepositsPdf, payments + ledger)
 *   buildStatsCsv    ← My Stats    (mirrors buildStatsPdf)
 *   buildSupportTranscriptCsv ← Live Support / Kiwi Ai chat transcript
 *
 * All values are RFC-4180 quoted (commas, quotes, and newlines
 * inside text get escaped properly so a multi-line message body
 * stays in a single CSV cell).
 */
import type {
  DBOrder,
  DBDeposit,
  DBWalletLedger,
  DBProduct,
  DBPromo,
} from '../types.js';
import type { ReportUser, StatsReport } from './pdfReport.js';
import type { SupportTranscriptEntry } from './pdfReport.js';

function csvEscape(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRows(rows: Array<Array<string | number | null | undefined>>): Buffer {
  return Buffer.from(
    rows.map((r) => r.map(csvEscape).join(',')).join('\n') + '\n',
    'utf8',
  );
}

/** Header rows that prefix every CSV so the recipient can see who
 *  the file is for + when it was generated, without having to open
 *  the matching PDF. Two-column key/value pairs, then a blank row,
 *  then the table header in the next builder. */
function preludeRows(
  user: ReportUser,
  title: string,
): Array<Array<string | number | null>> {
  return [
    ['Report', title],
    ['Generated at', new Date().toISOString()],
    ['Telegram ID', user.telegram_id],
    ['Username', user.username ?? ''],
    ['First name', user.first_name ?? ''],
    ['Email', user.email ?? ''],
    [],
  ];
}

// ---------------------------------------------------------------------------
//  My Orders
// ---------------------------------------------------------------------------
export function buildOrdersCsv(args: {
  user: ReportUser;
  orders: DBOrder[];
}): Buffer {
  const rows: Array<Array<string | number | null | undefined>> = [
    ...preludeRows(args.user, 'My Orders'),
    [
      'order_id',
      'product_id',
      'product_name',
      'quantity',
      'unit_price_usdt',
      'total_usdt',
      'status',
      'delivery',
      'created_at',
    ],
  ];
  for (const o of args.orders) {
    rows.push([
      o.id,
      o.product_id ?? '',
      o.product_name,
      o.qty,
      Number(o.unit_price).toFixed(2),
      Number(o.total).toFixed(2),
      o.status,
      o.delivery ?? '',
      o.created_at,
    ]);
  }
  return csvRows(rows);
}

// ---------------------------------------------------------------------------
//  My Deposits — emits both payment deposits AND the wallet ledger
//  in the same CSV, distinguished by the first `kind` column.
// ---------------------------------------------------------------------------
export function buildDepositsCsv(args: {
  user: ReportUser;
  deposits: DBDeposit[];
  ledger: DBWalletLedger[];
}): Buffer {
  const rows: Array<Array<string | number | null | undefined>> = [
    ...preludeRows(args.user, 'My Deposits'),
    [
      'kind',
      'id',
      'method_or_type',
      'amount_usdt',
      'status',
      'reference',
      'note',
      'created_at',
      'updated_at',
    ],
  ];
  for (const d of args.deposits) {
    rows.push([
      'payment_deposit',
      d.id,
      d.method,
      Number(d.amount).toFixed(2),
      d.status,
      d.reference ?? '',
      d.note ?? '',
      d.created_at,
      d.updated_at,
    ]);
  }
  for (const l of args.ledger) {
    rows.push([
      'wallet_ledger',
      l.id,
      l.type,
      Number(l.amount).toFixed(2),
      '',
      l.reference ?? '',
      '',
      l.created_at,
      '',
    ]);
  }
  return csvRows(rows);
}

// ---------------------------------------------------------------------------
//  My Stats — single-row aggregate.
// ---------------------------------------------------------------------------
export function buildStatsCsv(args: {
  user: ReportUser;
  stats: StatsReport;
}): Buffer {
  const rows: Array<Array<string | number | null | undefined>> = [
    ...preludeRows(args.user, 'My Stats'),
    [
      'total_orders',
      'total_items',
      'total_spent_usdt',
      'total_deposits_usdt',
      'last_order_at',
    ],
    [
      args.stats.orders,
      args.stats.items,
      args.stats.spent.toFixed(2),
      args.stats.deposits.toFixed(2),
      args.stats.lastOrderAt ?? '',
    ],
  ];
  return csvRows(rows);
}

// ---------------------------------------------------------------------------
//  Live Support / Kiwi Ai transcript — one row per message.
// ---------------------------------------------------------------------------
export function buildSupportTranscriptCsv(args: {
  sessionStartedAt: Date;
  sessionEndedAt: Date;
  user: { telegram_id: number; first_name: string; username: string | null };
  endedBy: 'user' | 'admin';
  entries: SupportTranscriptEntry[];
}): Buffer {
  const reportUser: ReportUser = {
    telegram_id: args.user.telegram_id,
    first_name: args.user.first_name,
    username: args.user.username,
    email: null,
  };
  const durationSec = Math.max(
    0,
    Math.floor(
      (args.sessionEndedAt.getTime() - args.sessionStartedAt.getTime()) / 1000,
    ),
  );
  const rows: Array<Array<string | number | null | undefined>> = [
    ...preludeRows(reportUser, 'Support Transcript'),
    ['Session started at', args.sessionStartedAt.toISOString()],
    ['Session ended at', args.sessionEndedAt.toISOString()],
    ['Duration (seconds)', durationSec],
    ['Messages', args.entries.length],
    ['Ended by', args.endedBy],
    [],
    ['index', 'at', 'side', 'author', 'text'],
  ];
  args.entries.forEach((e, i) => {
    rows.push([i + 1, e.at.toISOString(), e.side, e.author, e.text]);
  });
  return csvRows(rows);
}

// ---------------------------------------------------------------------------
//  Send Price List — emitted by Settings → Send Price List.
//  Columns mirror what the bot owner sketched in the spec:
//    Product | Status | Stock | Price (USDT) | Promo
//
//  Status is one of "In Stock" / "Out of Stock" / "Upcoming"
//  (`active=false` rows are surfaced as Upcoming so the user knows
//  about the product roadmap). `Promo` lists the lowest-qty active
//  promo for that product, or "—" when none.
// ---------------------------------------------------------------------------
export interface PriceListLabels {
  col_name: string;
  col_status: string;
  col_stock: string;
  col_price: string;
  col_promo: string;
  status_in_stock: string;
  status_out_of_stock: string;
  status_upcoming: string;
  promo_none: string;
  promo_format: (min_qty: number, discount: string) => string;
  promo_tier_format: (min_qty: number, unit_price: string) => string;
  unlimited: string;
  promo_footer: string;
}

export function buildPriceListCsv(args: {
  products: DBProduct[];
  promos: DBPromo[];
  labels: PriceListLabels;
}): Buffer {
  const rows: Array<Array<string | number | null | undefined>> = [
    [args.labels.col_name, args.labels.col_status, args.labels.col_stock, args.labels.col_price, args.labels.col_promo],
  ];
  // Group promos by product_id so we can pick the smallest min_qty
  // (= "first reachable") promo per product. `null` product_id =
  // global / catalog-wide promo and applies to every row.
  const promoByProduct = new Map<number, DBPromo[]>();
  const globalPromos: DBPromo[] = [];
  for (const p of args.promos) {
    if (p.product_id == null) {
      globalPromos.push(p);
    } else {
      const arr = promoByProduct.get(p.product_id) ?? [];
      arr.push(p);
      promoByProduct.set(p.product_id, arr);
    }
  }
  for (const product of args.products) {
    let status = args.labels.status_in_stock;
    if (!product.active) status = args.labels.status_upcoming;
    else if (!product.unlimited_stock && product.stock <= 0) {
      status = args.labels.status_out_of_stock;
    }
    const stockCell = product.unlimited_stock
      ? args.labels.unlimited
      : String(product.stock);
    const productPromos = [
      ...(promoByProduct.get(product.id) ?? []),
      ...globalPromos,
    ];
    const cheapest = productPromos
      .slice()
      .sort((a, b) => a.min_qty - b.min_qty)[0];
    const promoCell = cheapest
      ? cheapest.tiers && cheapest.tiers.length > 0
        ? args.labels.promo_tier_format(
            cheapest.tiers.reduce((a, b) =>
              Number(a.unit_price) <= Number(b.unit_price) ? a : b,
            ).min_qty,
            Math.min(...cheapest.tiers.map((t) => Number(t.unit_price))).toFixed(2),
          )
        : args.labels.promo_format(cheapest.min_qty, Number(cheapest.discount_amount).toFixed(2))
      : args.labels.promo_none;
    rows.push([
      product.name,
      status,
      stockCell,
      Number(product.price).toFixed(2),
      promoCell,
    ]);
  }
  rows.push([]);
  rows.push([args.labels.promo_footer]);
  return csvRows(rows);
}
