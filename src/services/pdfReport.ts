/**
 * PDF report generator for the user-facing "Send PDF to email"
 * buttons in My Orders / My Deposits / Stats.
 *
 * One module, three reports:
 *   - buildOrdersPdf({ user, orders })
 *   - buildDepositsPdf({ user, deposits, ledger })
 *   - buildStatsPdf({ user, stats })
 *
 * Each function returns a `Buffer` so the caller can attach it
 * directly to a Resend / SMTP send. The generated PDF uses the same
 * ink + champagne-gold palette as the welcome email so the brand
 * stays consistent. Layout is intentionally letter-sized portrait
 * with generous margins — Telegram users will most often open the
 * PDF on mobile.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import type { DBOrder, DBDeposit, DBWalletLedger, DBProduct, DBPromo } from '../types.js';
import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/** Path to the Digitalora logo (same asset used in the email). */
const LOGO_PATH = path.resolve(__dirname, '../../../assets/email-logo.png');

// ---------------------------------------------------------------------------
//  Theme
// ---------------------------------------------------------------------------
const COLOR = {
  page: '#070707',
  card: '#0f0f10',
  inner: '#16151a',
  border: '#2a2722',
  borderGold: '#3a322a',
  gold: '#d4a574',
  goldHi: '#e6c08c',
  cream: '#f5f1e8',
  body: '#d8d3c8',
  muted: '#8a8378',
  mutedDim: '#5a5550',
} as const;

const PAGE_W = 612; // letter width in PDF points
const PAGE_H = 792;
const MARGIN_X = 48;

export type ReportUser = {
  telegram_id: number;
  first_name: string | null;
  username: string | null;
  email: string | null;
};

export type StatsReport = {
  orders: number;
  items: number;
  spent: number;
  lastOrderAt: string | null;
  deposits: number;
};

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------
export async function buildOrdersPdf(args: {
  user: ReportUser;
  orders: DBOrder[];
}): Promise<Buffer> {
  return renderPdf('My Orders', args.user, (doc) => {
    if (args.orders.length === 0) {
      drawEmpty(doc, 'No orders yet.');
      return;
    }
    drawSummary(doc, [
      ['Total orders', String(args.orders.length)],
      [
        'Total spent',
        `${args.orders
          .reduce((s, o) => s + Number(o.total), 0)
          .toFixed(2)} USDT`,
      ],
    ]);
    for (const o of args.orders) {
      drawOrderCard(doc, o);
    }
  });
}

export async function buildDepositsPdf(args: {
  user: ReportUser;
  deposits: DBDeposit[];
  ledger: DBWalletLedger[];
}): Promise<Buffer> {
  return renderPdf('My Deposits', args.user, (doc) => {
    if (args.deposits.length === 0 && args.ledger.length === 0) {
      drawEmpty(doc, 'No deposits or wallet activity yet.');
      return;
    }
    const approved = args.deposits.filter((d) => d.status === 'approved');
    drawSummary(doc, [
      ['Approved deposits', String(approved.length)],
      [
        'Approved total',
        `${approved.reduce((s, d) => s + Number(d.amount), 0).toFixed(2)} USDT`,
      ],
      ['Wallet ledger entries', String(args.ledger.length)],
    ]);
    if (args.deposits.length > 0) {
      drawSectionHeader(doc, 'Payment deposits');
      for (const d of args.deposits) drawDepositCard(doc, d);
    }
    if (args.ledger.length > 0) {
      drawSectionHeader(doc, 'Wallet balance history');
      for (const row of args.ledger) drawLedgerCard(doc, row);
    }
  });
}

export async function buildStatsPdf(args: {
  user: ReportUser;
  stats: StatsReport;
}): Promise<Buffer> {
  return renderPdf('My Stats', args.user, (doc) => {
    const s = args.stats;
    drawSummary(doc, [
      ['Total orders', String(s.orders)],
      ['Total items', String(s.items)],
      ['Total spent', `${s.spent.toFixed(2)} USDT`],
      ['Total deposits', `${s.deposits.toFixed(2)} USDT`],
      [
        'Last order',
        s.lastOrderAt ? formatTimestamp(s.lastOrderAt) : '—',
      ],
    ]);
    drawSectionHeader(doc, 'Account snapshot');
    drawInfoBlock(doc, [
      `These figures cover every paid order and approved deposit linked to your`,
      `Telegram account at the time this report was generated.`,
      ``,
      `For a per-order breakdown send the My Orders PDF; for a per-deposit`,
      `breakdown send the My Deposits PDF — both include the same brand header`,
      `and timestamp footer as this report.`,
    ]);
  });
}

/**
 * Live Support transcript PDF — chat-bubble style. The customer's
 * messages render as right-aligned green bubbles, admin's as
 * left-aligned card-coloured bubbles, mirroring how a regular
 * one-on-one chat looks. Sent to admin when a session ends so they
 * have a permanent record of the full conversation.
 */
export type SupportTranscriptEntry = {
  at: Date;
  side: 'user' | 'admin';
  author: string;
  text: string;
};

export async function buildSupportTranscriptPdf(args: {
  sessionStartedAt: Date;
  sessionEndedAt: Date;
  user: { telegram_id: number; first_name: string; username: string | null };
  endedBy: 'user' | 'admin';
  entries: SupportTranscriptEntry[];
}): Promise<Buffer> {
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
  return renderPdf('Live Support — Transcript', reportUser, (doc) => {
    drawSummary(doc, [
      ['Customer', `${args.user.first_name} (#${args.user.telegram_id})`],
      ['Username', args.user.username ? `@${args.user.username}` : '—'],
      ['Started', formatTimestamp(args.sessionStartedAt.toISOString())],
      ['Ended', formatTimestamp(args.sessionEndedAt.toISOString())],
      [
        'Duration',
        `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`,
      ],
      ['Ended by', args.endedBy],
      ['Total messages', String(args.entries.length)],
    ]);
    drawSectionHeader(doc, 'Conversation');
    if (args.entries.length === 0) {
      drawInfoBlock(doc, [
        'No messages were exchanged during this Live Support session.',
      ]);
      return;
    }
    for (const entry of args.entries) {
      drawChatBubble(doc, entry);
    }
  });
}

function drawChatBubble(
  doc: PDFKit.PDFDocument,
  entry: SupportTranscriptEntry,
): void {
  const isUser = entry.side === 'user';
  const maxBubbleW = (PAGE_W - MARGIN_X * 2) * 0.72;
  const padX = 14;
  const padY = 10;

  doc.font('Helvetica').fontSize(11);
  const textW = Math.min(
    maxBubbleW - padX * 2,
    Math.max(60, doc.widthOfString(entry.text)),
  );
  // Estimate height by re-running through pdfkit's measurement.
  const measuredH = doc.heightOfString(entry.text, { width: textW });
  const metaH = 14;
  const bubbleH = measuredH + padY * 2 + metaH;

  ensureRoom(doc, bubbleH + 14);

  const y = doc.y;
  const bubbleW = textW + padX * 2;
  const bubbleX = isUser
    ? PAGE_W - MARGIN_X - bubbleW
    : MARGIN_X;
  const fill = isUser ? COLOR.gold : COLOR.card;
  const textColor = isUser ? '#1a1814' : COLOR.cream;

  doc.save();
  doc.roundedRect(bubbleX, y, bubbleW, bubbleH, 12).fill(fill);
  doc.restore();

  // Author + time line
  const time = `${String(entry.at.getUTCHours()).padStart(2, '0')}:${String(
    entry.at.getUTCMinutes(),
  ).padStart(2, '0')} UTC`;
  doc
    .fillColor(isUser ? '#3a3a3a' : COLOR.muted)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text(`${entry.author} · ${time}`, bubbleX + padX, y + padY - 2, {
      width: textW,
      align: isUser ? 'right' : 'left',
    });

  // Body
  doc
    .fillColor(textColor)
    .font('Helvetica')
    .fontSize(11)
    .text(entry.text, bubbleX + padX, y + padY + metaH, {
      width: textW,
    });

  doc.y = y + bubbleH + 8;
}

// ---------------------------------------------------------------------------
//  Internals
// ---------------------------------------------------------------------------

function renderPdf(
  title: string,
  user: ReportUser,
  drawBody: (doc: PDFKit.PDFDocument) => void,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      // Bottom margin must be small enough that the footer text
      // (drawn at PAGE_H - 36 inside the chrome painter) doesn't
      // trigger pdfkit's auto-pagination — when text() lands past
      // the bottom margin pdfkit calls addPage() for us, which then
      // re-fires pageAdded → infinite chrome painting.
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 96, bottom: 0, left: MARGIN_X, right: MARGIN_X },
        info: {
          Title: `Digitalora — ${title}`,
          Author: 'Digitalora',
          Subject: `${title} report`,
          Creator: 'Digitalora Bot',
        },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Re-entrancy guard: pdfkit's `text()` can auto-paginate when
      // a string is too long for the current line, which fires the
      // `pageAdded` event and would re-enter paintPageChrome — that
      // recursion blows the stack. We never paginate from inside
      // chrome painting because the chrome is fixed-position only.
      let paintingChrome = false;
      doc.on('pageAdded', () => {
        if (paintingChrome) return;
        paintingChrome = true;
        try {
          paintPageChrome(doc, title, user);
        } finally {
          paintingChrome = false;
        }
      });
      paintingChrome = true;
      try {
        paintPageChrome(doc, title, user);
      } finally {
        paintingChrome = false;
      }

      // Reset cursor under the header band
      doc.y = 168;
      drawBody(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function paintPageChrome(
  doc: PDFKit.PDFDocument,
  title: string,
  user: ReportUser,
): void {
  // Full-page ink background
  doc.save();
  doc.rect(0, 0, PAGE_W, PAGE_H).fill(COLOR.page);
  doc.restore();

  // Header band
  const bandH = 132;
  doc.save();
  doc.rect(0, 0, PAGE_W, bandH).fill(COLOR.card);
  doc.restore();

  // Hairline gold accent at the very top
  doc.save();
  doc.rect(0, 0, PAGE_W, 1.5).fill(COLOR.gold);
  doc.restore();

  // Hairline divider under the band
  doc.save();
  doc.rect(0, bandH, PAGE_W, 0.5).fill(COLOR.borderGold);
  doc.restore();

  // Logo (circular crop)
  if (fs.existsSync(LOGO_PATH)) {
    const size = 56;
    const cx = MARGIN_X + size / 2;
    const cy = bandH / 2;
    doc.save();
    doc.circle(cx, cy, size / 2).clip();
    doc.image(LOGO_PATH, MARGIN_X, cy - size / 2, {
      width: size,
      height: size,
    });
    doc.restore();
    // Champagne ring
    doc.save();
    doc
      .lineWidth(1.5)
      .strokeColor(COLOR.gold)
      .circle(cx, cy, size / 2)
      .stroke();
    doc.restore();
  }

  // Brand block — `lineBreak: false` is critical: pdfkit's text() will
  // otherwise trigger auto-pagination if it ever overflows, which
  // calls pageAdded, which calls us again → stack overflow.
  const textX = MARGIN_X + 56 + 18;
  doc
    .fillColor(COLOR.gold)
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('DIGITALORA  SHOP', textX, 38, {
      characterSpacing: 1.6,
      lineBreak: false,
    });
  doc
    .fillColor(COLOR.cream)
    .font('Helvetica-Bold')
    .fontSize(20)
    .text(title, textX, 54, { characterSpacing: 0.2, lineBreak: false });
  doc
    .fillColor(COLOR.muted)
    .font('Helvetica')
    .fontSize(9)
    .text(
      `Generated ${formatTimestamp(new Date().toISOString())}`,
      textX,
      82,
      { characterSpacing: 0.4, lineBreak: false },
    );

  // User identity (right side)
  const idLines = [
    user.first_name ? user.first_name : 'Digitalora user',
    user.username ? `@${user.username}` : null,
    `ID: ${user.telegram_id}`,
    user.email ? user.email : null,
  ].filter(Boolean) as string[];
  const rightX = PAGE_W - MARGIN_X - 200;
  doc.font('Helvetica').fontSize(9).fillColor(COLOR.muted);
  for (let i = 0; i < idLines.length; i++) {
    doc.fillColor(i === 0 ? COLOR.cream : COLOR.muted).text(
      idLines[i] ?? '',
      rightX,
      38 + i * 14,
      { width: 200, align: 'right', lineBreak: false },
    );
  }

  // Footer (bottom of page, every page)
  doc
    .fillColor(COLOR.mutedDim)
    .font('Helvetica')
    .fontSize(8)
    .text(
      'Digitalora · @digitalorashopbot · shopbot@digitalora.com',
      MARGIN_X,
      PAGE_H - 36,
      {
        width: PAGE_W - MARGIN_X * 2,
        align: 'center',
        characterSpacing: 0.4,
        lineBreak: false,
      },
    );
}

function drawSummary(doc: PDFKit.PDFDocument, rows: Array<[string, string]>): void {
  const cardX = MARGIN_X;
  const cardW = PAGE_W - MARGIN_X * 2;
  const padX = 22;
  const rowH = 28;
  const titleH = 32;
  const cardH = titleH + rowH * rows.length + 20;

  doc.save();
  doc
    .roundedRect(cardX, doc.y, cardW, cardH, 12)
    .fillAndStroke(COLOR.inner, COLOR.borderGold);
  doc.restore();

  const top = doc.y;
  doc
    .fillColor(COLOR.gold)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text('SUMMARY', cardX + padX, top + 14, { characterSpacing: 1.8 });

  let cursor = top + titleH + 8;
  for (const [label, value] of rows) {
    doc
      .fillColor(COLOR.muted)
      .font('Helvetica')
      .fontSize(10)
      .text(label, cardX + padX, cursor + 8, {
        width: cardW - padX * 2 - 200,
      });
    doc
      .fillColor(COLOR.cream)
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(value, cardX + cardW - padX - 200, cursor + 7, {
        width: 200,
        align: 'right',
      });
    cursor += rowH;
    // hairline separator
    doc.save();
    doc
      .rect(cardX + padX, cursor - 4, cardW - padX * 2, 0.4)
      .fill(COLOR.border);
    doc.restore();
  }

  doc.y = top + cardH + 18;
}

function drawSectionHeader(doc: PDFKit.PDFDocument, label: string): void {
  ensureRoom(doc, 32);
  doc
    .fillColor(COLOR.gold)
    .font('Helvetica-Bold')
    .fontSize(9)
    .text(label.toUpperCase(), MARGIN_X, doc.y + 4, { characterSpacing: 1.6 });
  doc.y += 22;
}

function drawOrderCard(doc: PDFKit.PDFDocument, o: DBOrder): void {
  const cardW = PAGE_W - MARGIN_X * 2;
  const lines: Array<[string, string]> = [
    ['Order ID', `#${o.id}`],
    ['Product', o.product_name],
    ['Qty', String(o.qty)],
    ['Unit price', `${Number(o.unit_price).toFixed(2)} USDT`],
    ['Total', `${Number(o.total).toFixed(2)} USDT`],
    [
      'Status',
      o.status === 'paid'
        ? 'Active'
        : o.status === 'refunded'
          ? 'Refunded'
          : 'Cancelled',
    ],
    ['Placed', formatTimestamp(o.created_at)],
  ];
  if (o.delivery) {
    lines.push(['Delivery', truncate(o.delivery.replace(/\s+/g, ' '), 240)]);
  }
  drawKvCard(doc, cardW, lines, o.product_name);
}

function drawDepositCard(doc: PDFKit.PDFDocument, d: DBDeposit): void {
  const cardW = PAGE_W - MARGIN_X * 2;
  const lines: Array<[string, string]> = [
    ['Deposit ID', `#${d.id}`],
    ['Amount', `${Number(d.amount).toFixed(2)} USDT`],
    ['Method', d.method],
    [
      'Status',
      d.status === 'approved'
        ? 'Approved'
        : d.status === 'pending'
          ? 'Pending'
          : 'Rejected',
    ],
  ];
  if (d.reference) lines.push(['Reference', d.reference]);
  lines.push(['Created', formatTimestamp(d.created_at)]);
  drawKvCard(doc, cardW, lines, `Deposit #${d.id}`);
}

function drawLedgerCard(doc: PDFKit.PDFDocument, row: DBWalletLedger): void {
  const cardW = PAGE_W - MARGIN_X * 2;
  const sign = Number(row.amount) >= 0 ? '+' : '−';
  const amount = `${sign}${Math.abs(Number(row.amount)).toFixed(2)} USDT`;
  const lines: Array<[string, string]> = [
    ['Entry ID', `#${row.id}`],
    ['Type', row.type],
    ['Amount', amount],
  ];
  if (row.reference) lines.push(['Reference', row.reference]);
  lines.push(['When', formatTimestamp(row.created_at)]);
  drawKvCard(doc, cardW, lines, row.type);
}

function drawKvCard(
  doc: PDFKit.PDFDocument,
  width: number,
  lines: Array<[string, string]>,
  title: string,
): void {
  const padX = 22;
  const titleH = 28;
  const lineH = 18;
  const cardH = titleH + lines.length * lineH + 18;
  ensureRoom(doc, cardH + 12);

  const top = doc.y;
  doc.save();
  doc
    .roundedRect(MARGIN_X, top, width, cardH, 10)
    .fillAndStroke(COLOR.inner, COLOR.border);
  doc.restore();

  doc
    .fillColor(COLOR.cream)
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(truncate(title, 80), MARGIN_X + padX, top + 10, {
      width: width - padX * 2,
    });

  let cursor = top + titleH + 6;
  for (const [k, v] of lines) {
    doc
      .fillColor(COLOR.muted)
      .font('Helvetica')
      .fontSize(9)
      .text(k, MARGIN_X + padX, cursor, { width: 130 });
    doc
      .fillColor(COLOR.body)
      .font('Helvetica')
      .fontSize(9.5)
      .text(v, MARGIN_X + padX + 130, cursor, {
        width: width - padX * 2 - 130,
      });
    cursor += lineH;
  }

  doc.y = top + cardH + 12;
}

function drawEmpty(doc: PDFKit.PDFDocument, message: string): void {
  ensureRoom(doc, 80);
  doc
    .fillColor(COLOR.muted)
    .font('Helvetica')
    .fontSize(13)
    .text(message, MARGIN_X, doc.y + 24, {
      width: PAGE_W - MARGIN_X * 2,
      align: 'center',
    });
}

function drawInfoBlock(doc: PDFKit.PDFDocument, lines: string[]): void {
  ensureRoom(doc, 24 + lines.length * 14);
  doc
    .fillColor(COLOR.body)
    .font('Helvetica')
    .fontSize(10);
  for (const line of lines) {
    doc.text(line || ' ', MARGIN_X, doc.y, {
      width: PAGE_W - MARGIN_X * 2,
    });
  }
  doc.y += 8;
}

function ensureRoom(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > PAGE_H - 80) {
    doc.addPage();
    doc.y = 168;
  }
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = String(d.getUTCDate()).padStart(2, '0');
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const m = months[d.getUTCMonth()];
  const y = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day} ${m} ${y}, ${hh}:${mm} UTC`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// Touch logger so it counts as used in non-debug builds.
void logger;

// ---------------------------------------------------------------------------
//  Invoice (post-purchase email attachment)
// ---------------------------------------------------------------------------
//
// Single-page receipt rendered with the same dark/champagne brand
// chrome as the orders / deposits PDFs, but with classic invoice
// layout: bill-to header, line-item table, totals block.
//
// The buyer receives this PDF by email immediately after a wallet
// purchase clears (see `mailer.ts → sendInvoiceEmail`).

export interface InvoiceLine {
  /** Free-form description shown in the Description column. */
  description: string;
  qty: number;
  /** Unit price in USDT. */
  unitPrice: number;
  /** Line total (qty * unitPrice) in USDT. */
  amount: number;
}

export async function buildInvoicePdf(args: {
  user: ReportUser;
  /** Public order id, e.g. ORD67FF2G9YG. */
  orderPublicId: string;
  /** ISO timestamp the order was placed. */
  orderDate: string;
  productName: string;
  qty: number;
  unitPrice: number;
  /** Pre-discount subtotal (qty * unitPrice). */
  subtotal: number;
  /** Discount in USDT (0 if no promo applied). */
  discount: number;
  /** Final amount paid in USDT (subtotal - discount). */
  total: number;
  /** Free-form payment-method label, e.g. "Wallet balance". */
  paidVia: string;
  /** Per-item delivery payload (links / accounts). Optional. */
  items: string[];
}): Promise<Buffer> {
  return renderPdf('Invoice', args.user, (doc) => {
    drawInvoiceMeta(doc, {
      orderPublicId: args.orderPublicId,
      orderDate: args.orderDate,
      paidVia: args.paidVia,
    });
    drawInvoiceLineItems(doc, [
      {
        description: args.productName,
        qty: args.qty,
        unitPrice: args.unitPrice,
        amount: args.unitPrice * args.qty,
      },
    ]);
    drawInvoiceTotals(doc, {
      subtotal: args.subtotal,
      discount: args.discount,
      total: args.total,
    });
    // Delivered items intentionally OMITTED from the PDF receipt
    // (mirrors the email body change). Privacy + resale-control: the
    // delivery payload (links / accounts / codes) lives only in the
    // in-chat Order Delivered card. `args.items` and the helper
    // `drawInvoiceDeliveredItems` are kept on the call signature so
    // an admin can re-enable this section later without a refactor.
    drawSectionHeader(doc, 'Notes');
    drawInfoBlock(doc, [
      'Thanks for purchasing from Digitalora. This invoice is your',
      'permanent receipt — keep it for your records.',
      '',
      'Need help with this order? Reply to this email or message',
      '@digitalorashopbot on Telegram with your Order ID above.',
    ]);
  });
}

function drawInvoiceMeta(
  doc: PDFKit.PDFDocument,
  args: { orderPublicId: string; orderDate: string; paidVia: string },
): void {
  const cardW = PAGE_W - MARGIN_X * 2;
  drawKvCard(
    doc,
    cardW,
    [
      ['Order ID', args.orderPublicId],
      ['Issued', formatTimestamp(args.orderDate)],
      ['Status', 'Paid in full'],
      ['Method', args.paidVia],
    ],
    'Invoice details',
  );
}

function drawInvoiceLineItems(
  doc: PDFKit.PDFDocument,
  rows: InvoiceLine[],
): void {
  const cardW = PAGE_W - MARGIN_X * 2;
  const padX = 22;
  const headerH = 30;
  const rowH = 30;
  const cardH = headerH + rows.length * rowH + 18;
  ensureRoom(doc, cardH + 12);

  const top = doc.y;
  doc.save();
  doc
    .roundedRect(MARGIN_X, top, cardW, cardH, 10)
    .fillAndStroke(COLOR.inner, COLOR.border);
  doc.restore();

  // Column geometry (description / qty / unit / amount).
  const colDesc = MARGIN_X + padX;
  const colQty = MARGIN_X + cardW - padX - 270;
  const colUnit = MARGIN_X + cardW - padX - 180;
  const colAmt = MARGIN_X + cardW - padX - 90;
  const rightEdge = MARGIN_X + cardW - padX;

  doc
    .fillColor(COLOR.gold)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text('DESCRIPTION', colDesc, top + 12, { characterSpacing: 1.6 });
  doc.text('QTY', colQty, top + 12, {
    width: 60,
    align: 'right',
    characterSpacing: 1.6,
  });
  doc.text('UNIT', colUnit, top + 12, {
    width: 80,
    align: 'right',
    characterSpacing: 1.6,
  });
  doc.text('AMOUNT', colAmt, top + 12, {
    width: rightEdge - colAmt,
    align: 'right',
    characterSpacing: 1.6,
  });

  // Hairline separator below the header row
  doc.save();
  doc.rect(MARGIN_X + padX, top + headerH - 4, cardW - padX * 2, 0.5).fill(COLOR.border);
  doc.restore();

  let cursor = top + headerH + 4;
  for (const row of rows) {
    doc
      .fillColor(COLOR.cream)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(truncate(row.description, 60), colDesc, cursor + 6, {
        width: colQty - colDesc - 12,
        lineBreak: false,
      });
    doc
      .fillColor(COLOR.body)
      .font('Helvetica')
      .fontSize(10)
      .text(String(row.qty), colQty, cursor + 6, {
        width: 60,
        align: 'right',
        lineBreak: false,
      });
    doc.text(`${row.unitPrice.toFixed(2)}`, colUnit, cursor + 6, {
      width: 80,
      align: 'right',
      lineBreak: false,
    });
    doc
      .fillColor(COLOR.cream)
      .font('Helvetica-Bold')
      .text(`${row.amount.toFixed(2)} USDT`, colAmt, cursor + 6, {
        width: rightEdge - colAmt,
        align: 'right',
        lineBreak: false,
      });
    cursor += rowH;
  }

  doc.y = top + cardH + 12;
}

function drawInvoiceTotals(
  doc: PDFKit.PDFDocument,
  args: { subtotal: number; discount: number; total: number },
): void {
  const cardW = PAGE_W - MARGIN_X * 2;
  const padX = 22;
  const rowH = 22;
  const rows: Array<[string, string, boolean]> = [
    ['Subtotal', `${args.subtotal.toFixed(2)} USDT`, false],
  ];
  if (args.discount > 0) {
    rows.push(['Discount', `−${args.discount.toFixed(2)} USDT`, false]);
  }
  rows.push(['Total paid', `${args.total.toFixed(2)} USDT`, true]);
  const cardH = rows.length * rowH + 24;
  ensureRoom(doc, cardH + 12);

  const top = doc.y;
  doc.save();
  doc
    .roundedRect(MARGIN_X, top, cardW, cardH, 10)
    .fillAndStroke(COLOR.inner, COLOR.borderGold);
  doc.restore();

  let cursor = top + 14;
  for (const [label, value, accent] of rows) {
    doc
      .fillColor(accent ? COLOR.gold : COLOR.muted)
      .font(accent ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(accent ? 11 : 10)
      .text(label, MARGIN_X + padX, cursor, {
        width: cardW - padX * 2 - 200,
      });
    doc
      .fillColor(accent ? COLOR.goldHi : COLOR.cream)
      .font('Helvetica-Bold')
      .fontSize(accent ? 14 : 11)
      .text(value, MARGIN_X + cardW - padX - 200, cursor - (accent ? 2 : 0), {
        width: 200,
        align: 'right',
        lineBreak: false,
      });
    cursor += rowH;
  }
  doc.y = top + cardH + 18;
}

// Kept for forward compat — see the buildInvoicePdf comment above.
// Renamed with a leading underscore so eslint's unused-var rule
// (varsIgnorePattern: '^_') treats it as intentionally inert.
function _drawInvoiceDeliveredItems(
  doc: PDFKit.PDFDocument,
  items: string[],
): void {
  const cardW = PAGE_W - MARGIN_X * 2;
  const padX = 22;
  const lineH = 18;
  const cardH = items.length * lineH + 24;
  ensureRoom(doc, cardH + 12);

  const top = doc.y;
  doc.save();
  doc
    .roundedRect(MARGIN_X, top, cardW, cardH, 10)
    .fillAndStroke(COLOR.inner, COLOR.border);
  doc.restore();

  let cursor = top + 14;
  for (const it of items) {
    doc
      .fillColor(COLOR.body)
      .font('Helvetica')
      .fontSize(10)
      .text(truncate(it, 200), MARGIN_X + padX, cursor, {
        width: cardW - padX * 2,
        lineBreak: false,
      });
    cursor += lineH;
  }
  doc.y = top + cardH + 12;
}

// ---------------------------------------------------------------------------
//  Price list (Send Price List → Mail)
// ---------------------------------------------------------------------------
//
// The price list is a catalog-wide PDF — there is no per-user header
// because it's the same data for everyone. We reuse the same brand
// chrome by passing a synthetic "Catalog" ReportUser so the PDF
// doesn't need its own header painter.
export interface PriceListPdfLabels {
  /** Sub-title for the report (eg. "Live Price List"). */
  reportTitle: string;
  /** Section header rendered above the product cards. */
  sectionTitle: string;
  /** "In stock" / "Out of stock" / "Upcoming" labels. */
  status_in_stock: string;
  status_out_of_stock: string;
  status_upcoming: string;
  /** Cell label when stock is unlimited. */
  unlimited: string;
  /** "—" when no promo applies. */
  promo_none: string;
  /** Builds the promo cell text from min_qty + discount. */
  promo_format: (min_qty: number, discount: string) => string;
  promo_tier_format: (min_qty: number, unit_price: string) => string;
  /** Footer line printed once at the bottom. */
  promo_footer: string;
}

export async function buildPriceListPdf(args: {
  products: DBProduct[];
  promos: DBPromo[];
  labels: PriceListPdfLabels;
}): Promise<Buffer> {
  const reportUser: ReportUser = {
    telegram_id: 0,
    first_name: 'Digitalora',
    username: null,
    email: null,
  };
  const { products, promos, labels } = args;
  const promoByProduct = new Map<number, DBPromo[]>();
  const globalPromos: DBPromo[] = [];
  for (const p of promos) {
    if (p.product_id == null) globalPromos.push(p);
    else {
      const arr = promoByProduct.get(p.product_id) ?? [];
      arr.push(p);
      promoByProduct.set(p.product_id, arr);
    }
  }
  return renderPdf(labels.reportTitle, reportUser, (doc) => {
    if (products.length === 0) {
      drawEmpty(doc, 'Catalog is empty.');
      return;
    }
    const inStock = products.filter(
      (p) => p.active && (p.unlimited_stock || p.stock > 0),
    ).length;
    const outOfStock = products.filter(
      (p) => p.active && !p.unlimited_stock && p.stock <= 0,
    ).length;
    const upcoming = products.filter((p) => !p.active).length;
    drawSummary(doc, [
      ['Total products', String(products.length)],
      ['In stock', String(inStock)],
      ['Out of stock', String(outOfStock)],
      ['Upcoming', String(upcoming)],
    ]);
    drawSectionHeader(doc, labels.sectionTitle);
    for (const product of products) {
      let status = labels.status_in_stock;
      if (!product.active) status = labels.status_upcoming;
      else if (!product.unlimited_stock && product.stock <= 0) {
        status = labels.status_out_of_stock;
      }
      const stockCell = product.unlimited_stock
        ? labels.unlimited
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
          ? labels.promo_tier_format(
              cheapest.tiers.reduce((a, b) =>
                Number(a.unit_price) <= Number(b.unit_price) ? a : b,
              ).min_qty,
              Math.min(...cheapest.tiers.map((t) => Number(t.unit_price))).toFixed(2),
            )
          : labels.promo_format(
              cheapest.min_qty,
              Number(cheapest.discount_amount).toFixed(2),
            )
        : labels.promo_none;
      const cardW = PAGE_W - MARGIN_X * 2;
      drawKvCard(
        doc,
        cardW,
        [
          ['Status', status],
          ['Stock', stockCell],
          ['Price', `${Number(product.price).toFixed(2)} USDT`],
          ['Promo', promoCell],
        ],
        product.name,
      );
    }
    drawSectionHeader(doc, 'Promo notes');
    drawInfoBlock(doc, [labels.promo_footer]);
  });
}
