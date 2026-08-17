/**
 * ONE reusable payment-invoice renderer.
 *
 * Every payment screen in the bot (top-up + direct-pay, crypto,
 * exchange transfer and manual mobile-wallet methods) is rendered
 * through `renderPaymentInvoice()` so the layout, spacing, emoji
 * language and copy-button behaviour are identical everywhere.
 *
 * Hard rules encoded here (bot-owner spec):
 *   - An invoice is PROVIDER-SPECIFIC. It shows only the credentials
 *     of the selected method. A bKash invoice never mentions Nagad or
 *     Rocket; a Binance invoice never shows the Bybit Pay ID, etc.
 *   - Copy buttons copy the *raw* value only (address / number /
 *     Pay ID / amount) — no labels, no emoji, no surrounding text.
 *   - Compact: one line per field, no filler paragraphs.
 *
 * This module is presentation-only. It never verifies, credits or
 * mutates anything.
 */
import { InlineKeyboard } from 'grammy';

/** A single "emoji + label + value" row of the invoice body. */
export type InvoiceField = {
  emoji: string;
  label: string;
  /** Rendered inside a monospace/tap-to-copy span by default. */
  value: string;
  /** Set false for prose values (e.g. a payee name). */
  mono?: boolean;
};

/** What a copy button should place on the user's clipboard. */
export type InvoiceCopy = {
  /** Button label, e.g. `📋 Copy Address`. */
  label: string;
  /** The RAW value — address only / number only / id only / amount only. */
  value: string;
};

export type PaymentInvoiceSpec = {
  /** Leading glyph of the header line, e.g. `🪙`. */
  titleEmoji: string;
  /** Header text, e.g. `USDT BEP20` or `bKash`. */
  title: string;
  /** Optional sub-header line (product × qty on direct-pay). */
  subtitle?: string;
  fields: InvoiceField[];
  /** Single short warning line, rendered with ⚠️. */
  warning?: string;
  /** Optional extra advisory lines (already emoji-prefixed). */
  notes?: string[];
  /** Closing call-to-action, e.g. `Send your TXID below.` */
  cta?: string;
  /** Copy buttons rendered above the action row. */
  copies?: InvoiceCopy[];
};

const DIVIDER = '━━━━━━━━━━━━━━';

/**
 * Render the unified invoice body. Output is the project's usual
 * markdown-ish string that `services/premium.ts → renderMdHtml`
 * converts to Telegram HTML.
 */
export function renderPaymentInvoice(spec: PaymentInvoiceSpec): string {
  const lines: string[] = [`${spec.titleEmoji} *${spec.title}*`];
  if (spec.subtitle) lines.push(`_${spec.subtitle}_`);
  lines.push(DIVIDER);

  for (const f of spec.fields) {
    lines.push(`${f.emoji} *${f.label}*`);
    lines.push(f.mono === false ? f.value : `\`${f.value}\``);
  }

  if (spec.warning) {
    lines.push('');
    lines.push(`⚠️ _${spec.warning}_`);
  }
  for (const n of spec.notes ?? []) lines.push(n);
  if (spec.cta) {
    lines.push('');
    lines.push(`*${spec.cta}*`);
  }
  return lines.join('\n');
}

/**
 * Build the unified action keyboard for an invoice:
 *
 *   [ 📋 Copy Address ][ 💰 Copy Amount ]
 *   [ 🧾 Submit TXID                    ]
 *   [ ❌ Cancel                          ]
 *
 * `extraRows` lets a caller inject the per-method tutorial button
 * ("📘 Where TXID?") between the copy row and the submit row.
 */
export function paymentInvoiceKeyboard(opts: {
  copies?: InvoiceCopy[];
  submit?: { label: string; callbackData: string } | null;
  cancel: { label: string; callbackData: string };
  extra?: Array<{ label: string; callbackData: string }>;
}): InlineKeyboard {
  const kb = new InlineKeyboard();
  const copies = (opts.copies ?? []).filter((c) => c.value.trim().length > 0);
  copies.forEach((c, i) => {
    kb.copyText(c.label, c.value);
    // Two copy buttons per row keeps the card compact.
    if (i % 2 === 1) kb.row();
  });
  if (copies.length > 0 && copies.length % 2 === 1) kb.row();

  for (const e of opts.extra ?? []) {
    kb.text(e.label, e.callbackData).row();
  }
  if (opts.submit) {
    kb.text(opts.submit.label, opts.submit.callbackData).row();
  }
  kb.text(opts.cancel.label, opts.cancel.callbackData);
  return kb;
}

/** Amount formatting shared by every invoice ("1.00 USDT"). */
export function invoiceAmount(amount: number, currency = 'USDT'): string {
  return `${Number(amount).toFixed(2)} ${currency}`;
}

/** `DEP-000123` style public reference for a deposit row. */
export function depositRef(id: number | null | undefined): string | null {
  if (id === undefined || id === null || !Number.isFinite(Number(id))) return null;
  return `DEP-${String(id).padStart(6, '0')}`;
}

/** `30 Minutes` / `1 Hour` style expiry text. */
export function expiryText(minutes: number): string {
  const m = Math.max(1, Math.floor(minutes));
  if (m % 60 === 0) {
    const h = m / 60;
    return `${h} ${h === 1 ? 'Hour' : 'Hours'}`;
  }
  return `${m} ${m === 1 ? 'Minute' : 'Minutes'}`;
}
