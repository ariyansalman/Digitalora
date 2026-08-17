/**
 * Provider-specific invoice specifications.
 *
 * One function per payment family turns a `DBPaymentMethod` (plus the
 * optional amount / deposit reference of the current flow) into the
 * shared `PaymentInvoiceSpec` consumed by `renderPaymentInvoice()`.
 *
 * Isolation rule (bot-owner spec): a spec may only ever read the
 * credentials of the method it was given. Mobile-wallet brands
 * (bKash / Nagad / Rocket) are additionally scrubbed out of the
 * admin-written free-text instructions so a bKash invoice can never
 * leak a Nagad or Rocket number, and vice-versa.
 */
import type { DBPaymentMethod, PaymentProvider } from '../types.js';
import { PE } from '../handlers/paymentInstructionEmojis.js';
import {
  depositRef,
  expiryText,
  invoiceAmount,
  type InvoiceCopy,
  type InvoiceField,
  type PaymentInvoiceSpec,
} from './paymentInvoice.js';

export type InvoiceContext = {
  /** Exact amount due, when the flow knows it (direct pay / quotes). */
  amount?: number | null;
  /** Currency of `amount`. Defaults to USDT. */
  currency?: string;
  /** Deposit row id, when one already exists. */
  depositId?: number | null;
  /** Payment window in minutes. */
  expiryMinutes?: number;
  /** Product line shown on direct-pay invoices. */
  subtitle?: string;
};

const NOT_SET = '(not configured)';

/** Header glyph + label per crypto provider. */
const CHAIN_META: Partial<
  Record<PaymentProvider, { emoji: string; title: string; warning: string }>
> = {
  usdt_bep20: {
    emoji: PE.usdt_title,
    title: 'USDT BEP20',
    warning: 'Send only via BEP20.',
  },
  usdt_trc20: {
    emoji: PE.usdt_title,
    title: 'USDT TRC20',
    warning: 'Send only via TRC20.',
  },
  usdt_ton: {
    emoji: PE.ton_title,
    title: 'USDT TON',
    warning: 'Send only via the TON network.',
  },
  ltc: {
    emoji: '⚪',
    title: 'Litecoin (LTC)',
    warning: 'Send only Litecoin on the LTC network.',
  },
};

function baseFields(ctx: InvoiceContext): InvoiceField[] {
  const rows: InvoiceField[] = [];
  if (ctx.amount !== undefined && ctx.amount !== null) {
    rows.push({
      emoji: '💰',
      label: 'Amount',
      value: invoiceAmount(ctx.amount, ctx.currency ?? 'USDT'),
    });
  }
  return rows;
}

function tailFields(ctx: InvoiceContext): InvoiceField[] {
  const rows: InvoiceField[] = [];
  const ref = depositRef(ctx.depositId ?? null);
  if (ref) rows.push({ emoji: '🧾', label: 'Deposit ID', value: ref });
  rows.push({
    emoji: '⏳',
    label: 'Expires',
    value: expiryText(ctx.expiryMinutes ?? 30),
  });
  return rows;
}

function amountCopy(ctx: InvoiceContext): InvoiceCopy[] {
  // "Copy Amount" must yield a payment-compatible value: the bare
  // number the wallet app expects, never the currency suffix.
  if (ctx.amount === undefined || ctx.amount === null) return [];
  return [{ label: '💰 Copy Amount', value: Number(ctx.amount).toFixed(2) }];
}

/** On-chain crypto invoice (BEP20 / TRC20 / TON / LTC). */
export function chainInvoiceSpec(
  m: DBPaymentMethod,
  ctx: InvoiceContext = {},
): PaymentInvoiceSpec {
  const meta = CHAIN_META[m.provider] ?? {
    emoji: PE.usdt_title,
    title: m.name,
    warning: 'Send only on the network shown above.',
  };
  const address = m.address ?? NOT_SET;
  return {
    titleEmoji: meta.emoji,
    title: meta.title,
    subtitle: ctx.subtitle,
    fields: [
      ...baseFields(ctx),
      { emoji: '📥', label: 'Address', value: address },
      ...tailFields(ctx),
    ],
    warning: meta.warning,
    cta: 'Send your TXID below.',
    copies: [
      { label: '📋 Copy Address', value: m.address ?? '' },
      ...amountCopy(ctx),
    ],
  };
}

/** Binance Pay / Bybit Pay invoice — Pay ID only, never an address. */
export function exchangeInvoiceSpec(
  m: DBPaymentMethod,
  ctx: InvoiceContext = {},
): PaymentInvoiceSpec {
  const isBinance = m.provider === 'binance_pay';
  const title = isBinance ? 'Binance Pay' : 'Bybit Pay';
  const idLabel = isBinance ? 'Pay ID' : 'Bybit UID';
  const payId = m.address ?? NOT_SET;
  const fields: InvoiceField[] = [
    ...baseFields(ctx),
    { emoji: '🆔', label: idLabel, value: payId },
  ];
  if (m.pay_name) {
    fields.push({ emoji: '👤', label: 'Account Name', value: m.pay_name });
  }
  fields.push(...tailFields(ctx));
  return {
    titleEmoji: isBinance ? PE.binance_title : '⚫',
    title,
    subtitle: ctx.subtitle,
    fields,
    warning: isBinance
      ? 'Pay only via Binance Pay to the Pay ID above.'
      : 'Pay only via a Bybit internal transfer to the UID above.',
    cta: isBinance ? 'Send your Order ID below.' : 'Send your TXID below.',
    copies: [
      { label: `📋 Copy ${isBinance ? 'Pay ID' : 'UID'}`, value: m.address ?? '' },
      ...amountCopy(ctx),
    ],
  };
}

/** Mobile-wallet brands handled by the manual provider. */
type WalletBrand = { key: 'bkash' | 'nagad' | 'rocket'; title: string; emoji: string };

const WALLET_BRANDS: WalletBrand[] = [
  { key: 'bkash', title: 'bKash', emoji: '🩷' },
  { key: 'nagad', title: 'Nagad', emoji: '🧡' },
  { key: 'rocket', title: 'Rocket', emoji: '🚀' },
];

/** Detect which mobile wallet a manual method represents, if any. */
export function detectWalletBrand(m: DBPaymentMethod): WalletBrand | null {
  const haystack = `${m.name} ${m.pay_name ?? ''}`.toLowerCase();
  return WALLET_BRANDS.find((b) => haystack.includes(b.key)) ?? null;
}

/**
 * Strip every line that mentions a *different* wallet brand from the
 * admin-written instructions, so a provider-specific invoice can never
 * display a competing brand's number.
 */
export function scrubForeignBrands(
  instructions: string,
  keep: WalletBrand | null,
): string {
  const foreign = WALLET_BRANDS.filter((b) => b.key !== keep?.key);
  return instructions
    .split('\n')
    .filter((line) => {
      const l = line.toLowerCase();
      return !foreign.some((b) => l.includes(b.key));
    })
    .join('\n')
    .trim();
}

/** Manual mobile-wallet invoice (bKash / Nagad / Rocket). */
export function manualInvoiceSpec(
  m: DBPaymentMethod,
  ctx: InvoiceContext = {},
): PaymentInvoiceSpec {
  const brand = detectWalletBrand(m);
  const title = brand?.title ?? m.name;
  const number = m.address ?? NOT_SET;
  const fields: InvoiceField[] = [
    ...baseFields(ctx),
    { emoji: '📱', label: 'Number', value: number },
  ];
  if (m.pay_name) {
    fields.push({ emoji: '👤', label: 'Account Name', value: m.pay_name });
  }
  fields.push(...tailFields({ ...ctx, expiryMinutes: ctx.expiryMinutes ?? 60 }));

  const extra = scrubForeignBrands(m.instructions ?? '', brand);
  return {
    titleEmoji: brand?.emoji ?? '💳',
    title,
    subtitle: ctx.subtitle,
    fields,
    warning: `Send only via ${title} to the number above.`,
    notes: extra ? ['', `_${extra}_`] : undefined,
    cta: 'Send your TrxID below.',
    copies: [
      { label: '📋 Copy Number', value: m.address ?? '' },
      ...amountCopy(ctx),
    ],
  };
}

/** Route any payment method to its provider-specific invoice spec. */
export function invoiceSpecFor(
  m: DBPaymentMethod,
  ctx: InvoiceContext = {},
): PaymentInvoiceSpec {
  switch (m.provider) {
    case 'binance_pay':
    case 'bybit_pay':
      return exchangeInvoiceSpec(m, ctx);
    case 'usdt_bep20':
    case 'usdt_trc20':
    case 'usdt_ton':
    case 'ltc':
      return chainInvoiceSpec(m, ctx);
    default:
      return manualInvoiceSpec(m, ctx);
  }
}
