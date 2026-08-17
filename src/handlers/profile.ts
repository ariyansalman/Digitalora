import type { Composer } from 'grammy';
import { getCurrency, normalizeCurrency } from '../../config/currencies.js';
import { type Lang } from '../../config/index.js';
import { POPULAR_REGIONS, formatLocalTime, getRegion } from '../../config/regions.js';
import {
  adjustBalance,
  countGiftCodeRedemptions,
  countGiftCodeRedemptionsByUser,
  findUserByEmail,
  getGiftCode,
  getOrder,
  getOrderPaymentLabel,
  getReferralBalance,
  convertReferralBalance,
  InsufficientReferralBalanceError,
  getUserStats,
  listAllProducts,
  listActivePromos,
  listDeposits,
  listOrders,
  listOrdersPaginated,
  listWalletLedger,
  recordGiftCodeRedemption,
  setUserEmail,
  setUserCurrency,
  getUserShopGroupMode,
  getUserShopListMode,
  setUserShopGroupMode,
  setUserShopListMode,
  setUserLanguage,
  setUserRegion,
  toggleEmailReports,
  toggleNotification,
} from '../db/queries.js';
import {
  profileKeyboard,
  notificationsKeyboard,
  languageKeyboard,
  statsKeyboard,
  backToSettingsKeyboard,
  botTutorialKeyboard,
  depositsActionsKeyboard,
  emailDeleteConfirmKeyboard,
  emailHubKeyboard,
  emailScreenKeyboard,
  priceListKeyboard,
  referKeyboard,
  whyEmailKeyboard,
  currencyKeyboard,
  shopGroupModeKeyboard,
  shopListModeKeyboard,
} from '../keyboards/profile.js';
import { regionPickerKeyboard } from '../keyboards/region.js';
import { ordersListKeyboard, orderDetailKeyboard, ORDERS_PER_PAGE } from '../keyboards/orders.js';
import { redeemKeyboard } from '../keyboards/redeem.js';
import { publicOrderId, parsePublicOrderId } from '../services/orderId.js';
import { orderListLine } from '../ui/orderCard.js';
import { buildOrderDetailReceivedBlock } from '../services/orderRender.js';
import { renderOrderDetailCard } from '../ui/orderCard.js';
import type { AppCtx } from '../middleware/user.js';
import { env } from '../env.js';
import {
  clampForTelegram,
  escapeAttr,
  htmlToPlain,
  renderMdHtml,
  renderPremium,
  sanitizeButtonUrl,
} from '../services/premium.js';
import {
  sendPriceListEmail,
  sendWelcomeEmail,
  sendReportEmail,
  sendInvoiceEmail,
  type ReportKind,
} from '../services/mailer.js';

import {
  buildOrdersPdf,
  buildDepositsPdf,
  buildStatsPdf,
  buildPriceListPdf,
} from '../services/pdfReport.js';
import {
  buildOrdersCsv,
  buildDepositsCsv,
  buildPriceListCsv,
  buildStatsCsv,
} from '../services/csvReport.js';
import { logger } from '../logger.js';
import {
  getEmailPdfUrl,
  getAdminContactUrlWithPrefill,
  getBotTutorial,
} from '../services/settings.js';
import * as adminLog from '../services/adminLog.js';
import { InputFile } from 'grammy';
import { fileURLToPath } from 'url';
import { dirname, resolve as pathResolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/** Path to the explanatory PDF shipped under `assets/`. */
const EMAIL_PDF_PATH = pathResolve(__dirname, '../../../assets/email-explanation.pdf');

const MONTHS_SHORT = [
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

/** "25 Apr 2026"-style short date in the user's timezone (UTC fallback). */
function formatShortDate(iso: string, timezone: string | null): string {
  const d = new Date(iso);
  if (timezone) {
    try {
      const fmt = new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: timezone,
      });
      return fmt.format(d);
    } catch {
      // fall through to UTC
    }
  }
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${day} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Schedule deletion of a chat message after `EMAIL_AUTODELETE_MS`
 * has elapsed. Used for "✅ Sent to your email" / mail-sent
 * confirmations the bot owner asked us to auto-clean from chat
 * history. Deletion errors are swallowed because Telegram throws
 * "message can't be deleted" for messages older than 48h or already
 * removed by the user.
 */
const EMAIL_AUTODELETE_MS = 5_000;
const REFERRAL_USDT_PER_REF = 0.02;
const REFERRAL_MIN_CONVERT_USDT = 0.5;
function autoDeleteMessage(ctx: AppCtx, message_id: number): void {
  setTimeout(() => {
    void ctx.api.deleteMessage(ctx.chat!.id, message_id).catch(() => {
      // Silent — user may have closed the chat or the message is gone
    });
  }, EMAIL_AUTODELETE_MS);
}

/**
 * Build the line-by-line settings/profile screen as a Markdown string.
 * Each line is prefixed with a `{key}` token that maps to a premium
 * emoji (see config/index.ts EMOJI map). `renderMdHtml` later expands
 * these tokens and converts Markdown to HTML.
 */
function profileText(ctx: AppCtx): string {
  const u = ctx.user;
  const joined = formatShortDate(u.joined_at, u.timezone);
  const userLink = u.username ? `https://t.me/${u.username}` : `tg://user?id=${u.telegram_id}`;
  const status = u.status ?? ctx.t('profile.status.default');

  const lines: string[] = [];
  lines.push(`{profile_header} ${ctx.t('profile.title')}`);
  lines.push('');
  lines.push(`{profile_id} ${ctx.t('profile.row.id', { id: u.telegram_id })}`);
  lines.push(
    u.first_name
      ? `{profile_first_name} ${ctx.t('profile.row.first_name', { name: u.first_name })}`
      : `{profile_first_name} ${ctx.t('profile.row.first_name_empty')}`,
  );
  lines.push(
    u.username
      ? `{profile_username} ${ctx.t('profile.row.username', { username: u.username })}`
      : `{profile_username} ${ctx.t('profile.row.username_empty')}`,
  );
  lines.push(`{profile_link} ${ctx.t('profile.row.link', { link: userLink })}`);
  lines.push(`{profile_status} ${ctx.t('profile.row.status', { status })}`);
  // Email row: when set, also stamp "Has been Saved!" + the saved-check
  // premium emoji at the end.
  if (u.email) {
    lines.push(`{profile_email} ${ctx.t('profile.row.email', { email: u.email })}`);
  } else {
    lines.push(`{profile_email} ${ctx.t('profile.row.email_empty')}`);
  }
  lines.push(
    `{profile_balance} ${ctx.t('profile.row.balance', { balance: Number(u.balance).toFixed(3) })}`,
  );
  lines.push(
    `{refer_coin} ${ctx.t('profile.row.currency', {
      currency: getCurrency(u.currency).code,
    })}`,
  );
  lines.push(`{profile_language} ${ctx.t('profile.row.language', { language: ctx.lang.toUpperCase() })}`);
  if (u.region && u.timezone) {
    const tz = u.timezone;
    const reg = getRegion(u.region);
    const label = reg ? `${reg.flag} ${reg.name}` : u.region;
    lines.push(
      `{profile_region} ${ctx.t('profile.row.region', { region: label, time: formatLocalTime(tz) })}`,
    );
  } else {
    lines.push(`{profile_region} ${ctx.t('profile.row.region_empty')}`);
  }
  lines.push(`{profile_joined} ${ctx.t('profile.row.joined', { joined })}`);

  return lines.join('\n');
}

export async function showProfile(ctx: AppCtx, opts: { forceReply?: boolean } = {}) {
  // HTML render path: keeps Markdown styling AND auto-wraps any unicode
  // emoji whose key has a configured premium custom_emoji_id.
  const html = renderMdHtml(profileText(ctx));
  const reply_markup = profileKeyboard(ctx.lang);
  // `forceReply` is used after saving an email — we want to send a
  // FRESH settings message (not edit the pre-edit prompt) so the user
  // immediately sees the saved value.
  if (ctx.callbackQuery && !opts.forceReply) {
    await ctx.editMessageText(html, {
      parse_mode: 'HTML',
      reply_markup,
      link_preview_options: { is_disabled: true },
    });
  } else {
    await ctx.reply(html, {
      parse_mode: 'HTML',
      reply_markup,
      link_preview_options: { is_disabled: true },
    });
  }
}

async function showEmailHub(ctx: AppCtx) {
  const current = ctx.user.email
    ? `\`${ctx.user.email}\``
    : '_not set_';
  // Compact two-line layout: title + "Email: <current>".
  const text = [
    ctx.t('profile.email.hub.title'),
    ctx.t('profile.email.hub.body', { current }),
  ].join('\n');
  await ctx.editMessageText(renderMdHtml(text), {
    parse_mode: 'HTML',
    reply_markup: emailHubKeyboard(ctx.lang),
  });
}

function notificationsText(ctx: AppCtx): string {
  return [ctx.t('profile.notifications.title'), '', ctx.t('profile.notifications.body')].join('\n');
}

async function showNotifications(ctx: AppCtx) {
  await ctx.editMessageText(renderMdHtml(notificationsText(ctx)), {
    parse_mode: 'HTML',
    reply_markup: notificationsKeyboard(ctx.lang, {
      stock_alert: ctx.user.stock_alert,
      announcements: ctx.user.announcements,
      wallet_alert: ctx.user.wallet_alert ?? true,
      // Email Reports is stored as the inverse of `email_nag_disabled`
      // so the rest of the toggle UX (false = OFF, true = ON) matches.
      email_reports: !(ctx.user.email_nag_disabled ?? false),
    }),
  });
}

/** Format an ISO timestamp as e.g. "30 Apr 2026, 01:29 UTC". */
function formatAbsoluteUtc(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const mon = MONTHS_SHORT[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day} ${mon} ${year}, ${hh}:${mm} UTC`;
}

/** "just now" / "5m ago" / "2h ago" / "3d ago" relative to now. */
function formatRelative(ctx: AppCtx, iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return ctx.t('profile.stats.rel.now');
  if (min < 60) return ctx.t('profile.stats.rel.minutes', { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return ctx.t('profile.stats.rel.hours', { n: hr });
  const days = Math.floor(hr / 24);
  return ctx.t('profile.stats.rel.days', { n: days });
}

async function showStats(ctx: AppCtx): Promise<void> {
  const s = await getUserStats(ctx.user.telegram_id);
  const orders = s.orders;
  const items = s.items;
  const spent = s.spent.toFixed(2);
  const deposits = s.deposits.toFixed(2);

  const lastLine =
    s.lastOrderAt === null
      ? ctx.t('profile.stats.last_none')
      : ctx.t('profile.stats.last', {
          rel: formatRelative(ctx, s.lastOrderAt),
          abs: formatAbsoluteUtc(s.lastOrderAt),
        });

  const template = [
    `{stats} ${ctx.t('profile.stats.title')}`,
    '',
    `{stats_orders} ${ctx.t('profile.stats.orders', { count: orders })}`,
    `{stats_items} ${ctx.t('profile.stats.items', { count: items })}`,
    `{stats_spent} ${ctx.t('profile.stats.spent', { amount: spent })}`,
    `{stats_last} ${lastLine}`,
    `{stats_deposits} ${ctx.t('profile.stats.deposits', { amount: deposits })}`,
  ].join('\n');

  const { text, entities } = renderPremium(template);
  await ctx.editMessageText(text, {
    entities,
    parse_mode: entities.length ? undefined : 'Markdown',
    reply_markup: statsKeyboard(ctx.lang),
  });
}

/** Show the region picker (page-N). */
async function showRegionPicker(ctx: AppCtx, page: number) {
  const text = [ctx.t('profile.region.title'), '', ctx.t('profile.region.body')].join('\n');
  await ctx.editMessageText(renderMdHtml(text), {
    parse_mode: 'HTML',
    reply_markup: regionPickerKeyboard(ctx.lang, page),
  });
}

async function showCurrencyPicker(ctx: AppCtx, page = 0) {
  const selected = normalizeCurrency(ctx.user.currency);
  const text = [
    ctx.t('profile.currency.title'),
    '',
    ctx.t('profile.currency.body'),
    '',
    `Current: *${selected}*`,
  ].join('\n');
  await ctx.editMessageText(renderMdHtml(text), {
    parse_mode: 'HTML',
    reply_markup: currencyKeyboard(ctx.lang, selected, page),
  });
}

async function showShopListMode(ctx: AppCtx) {
  const selected = await getUserShopListMode(ctx.user.telegram_id);
  const modeLabel = selected === 'all' ? 'All products list' : '10 per page';
  const text = [
    ctx.t('profile.shop_view.title'),
    '',
    ctx.t('profile.shop_view.body'),
    '',
    ctx.t('profile.shop_view.paged'),
    ctx.t('profile.shop_view.all'),
    '',
    ctx.t('profile.shop_view.current', { mode: modeLabel }),
  ].join('\n');
  await ctx.editMessageText(renderMdHtml(text), {
    parse_mode: 'HTML',
    reply_markup: shopListModeKeyboard(ctx.lang, selected),
  });
}

async function showShopGroupMode(ctx: AppCtx) {
  const groupMode = await getUserShopGroupMode(ctx.user.telegram_id);
  const groupLabel = groupMode === 'grouped' ? 'Grouped plans' : 'Ungrouped products';
  const text = [
    ctx.t('profile.shop_group.title'),
    '',
    ctx.t('profile.shop_group.body'),
    '',
    ctx.t('profile.shop_view.grouped'),
    ctx.t('profile.shop_view.ungrouped'),
    '',
    ctx.t('profile.shop_view.group_current', { mode: groupLabel }),
  ].join('\n');
  await ctx.editMessageText(renderMdHtml(text), {
    parse_mode: 'HTML',
    reply_markup: shopGroupModeKeyboard(ctx.lang, groupMode),
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Shared body for the three "Send PDF to Email" callbacks. We answer
 * the callback query twice: once with a "sending..." toast (so the
 * user sees feedback while we render the PDF + hit Resend) and once
 * with the final success / failure popup. The screen the user
 * triggered the action from is never edited — they remain on the
 * same orders / deposits / stats list.
 */
async function sendReportPdfFromCallback(
  ctx: AppCtx,
  kind: ReportKind,
): Promise<void> {
  // Email Reports OFF blocks every Send-PDF button so we don't keep
  // firing emails the user explicitly muted (per the bot-owner spec).
  if (ctx.user.email_nag_disabled) {
    await ctx.answerCallbackQuery({
      text: ctx.t('profile.email.reports_off_popup'),
      show_alert: true,
    });
    return;
  }
  const email = ctx.user.email;
  if (!email) {
    await ctx.answerCallbackQuery({
      text: ctx.t('pdf.no_email_popup'),
      show_alert: true,
    });
    return;
  }
  await ctx.answerCallbackQuery({
    text: ctx.t('pdf.sending_popup', { email }),
    show_alert: false,
  });
  try {
    const reportUser = {
      telegram_id: ctx.user.telegram_id,
      first_name: ctx.user.first_name ?? null,
      username: ctx.user.username ?? null,
      email,
    };
    let pdf: Buffer;
    // Spreadsheet companion built from the same source data so a
    // recipient can sort / filter / chart in Excel without retyping
    // anything from the PDF.
    let csv: Buffer;
    let rowCount = 0;
    if (kind === 'orders') {
      const orders = await listOrders(ctx.user.telegram_id, 500);
      rowCount = orders.length;
      pdf = await buildOrdersPdf({ user: reportUser, orders });
      csv = buildOrdersCsv({ user: reportUser, orders });
    } else if (kind === 'deposits') {
      const [deposits, ledger] = await Promise.all([
        listDeposits(ctx.user.telegram_id, 500),
        listWalletLedger(ctx.user.telegram_id, 500).catch(() => []),
      ]);
      rowCount = deposits.length + ledger.length;
      pdf = await buildDepositsPdf({ user: reportUser, deposits, ledger });
      csv = buildDepositsCsv({ user: reportUser, deposits, ledger });
    } else {
      const stats = await getUserStats(ctx.user.telegram_id);
      rowCount = stats.orders;
      pdf = await buildStatsPdf({ user: reportUser, stats });
      csv = buildStatsCsv({ user: reportUser, stats });
    }
    const ok = await sendReportEmail({
      email,
      kind,
      pdf,
      csv,
      firstName: ctx.user.first_name ?? null,
      username: ctx.user.username ?? null,
    });
    if (ok) {
      void adminLog.logPdfSent(ctx.api, {
        user: {
          telegram_id: ctx.user.telegram_id,
          username: ctx.user.username ?? null,
          first_name: ctx.user.first_name ?? null,
          email,
        },
        kind,
        destinationEmail: email,
        rowCount,
      });
      // Surface success as a real chat message so the premium 📬
      // custom emoji renders as a `<tg-emoji>` entity rather than a
      // plain toast (Telegram strips custom_emoji from popup text).
      // Auto-deleted 5 s later so the chat doesn't fill up with
      // confirmations after multiple Send-PDF taps.
      const sent = await ctx.reply(renderMdHtml(ctx.t('pdf.sent_message')), {
        parse_mode: 'HTML',
      });
      const chatId = sent.chat.id;
      const messageId = sent.message_id;
      setTimeout(() => {
        ctx.api.deleteMessage(chatId, messageId).catch((err) => {
          logger.warn({ err, chatId, messageId }, 'pdf.sent_message auto-delete failed');
        });
      }, 5_000);
    } else {
      await ctx.answerCallbackQuery({
        text: ctx.t('pdf.failed_popup', { email }),
        show_alert: true,
      });
    }
  } catch (err) {
    logger.error({ err, kind, telegram_id: ctx.user.telegram_id }, 'send-pdf flow failed');
    await ctx.answerCallbackQuery({
      text: ctx.t('pdf.failed_popup', { email }),
      show_alert: true,
    });
  }
}

/**
 * Send a backfilled invoice email for an order that was placed
 * before the buyer had an email address on file. Triggered from the
 * post-purchase Set-Email flow (`profile:email:set:post:<orderId>`)
 * once the user finishes typing their address.
 *
 * Failure modes (order missing, product gone, transport down, bad
 * address) are logged at `info` level and swallowed — the buyer
 * already has the delivery card with the items in chat, and the
 * confirmation message ("Email has been setuped") is what they're
 * expecting to see; surfacing a transport error here would confuse
 * the UX.
 */
async function sendRetroactiveInvoiceForOrder(args: {
  telegramId: number;
  orderId: number;
  email: string;
  firstName: string | null;
  username: string | null;
}): Promise<void> {
  try {
    const order = await getOrder(args.orderId);
    if (!order) {
      logger.info(
        { orderId: args.orderId },
        'retroactive invoice: order not found, skipping',
      );
      return;
    }
    if (order.user_id !== args.telegramId) {
      logger.info(
        { orderId: args.orderId, expectedUser: args.telegramId, actualUser: order.user_id },
        'retroactive invoice: order belongs to another user, skipping',
      );
      return;
    }
    if (order.status !== 'paid') {
      logger.info(
        { orderId: args.orderId, status: order.status },
        'retroactive invoice: order not paid, skipping',
      );
      return;
    }
    const items =
      order.delivered_items && order.delivered_items.trim().length > 0
        ? order.delivered_items
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : [];
    const invoiceLink = env.BOT_USERNAME
      ? `https://t.me/${env.BOT_USERNAME}?start=ord_${publicOrderId(order)}`
      : '';
    await sendInvoiceEmail({
      email: args.email,
      firstName: args.firstName,
      username: args.username,
      orderPublicId: publicOrderId(order),
      orderDate: order.created_at,
      productName: order.product_name,
      qty: order.qty,
      unitPrice: Number(order.unit_price),
      total: Number(order.total),
      discount: Number(order.discount ?? 0),
      paidVia: 'Wallet balance',
      items,
      invoiceLink,
    });
    logger.info(
      { orderId: args.orderId, telegramId: args.telegramId },
      'retroactive invoice email queued',
    );
  } catch (err) {
    logger.warn(
      { err, orderId: args.orderId, telegramId: args.telegramId },
      'retroactive invoice email failed',
    );
  }
}

export async function showReferScreen(
  ctx: AppCtx,
  options: { refreshCallback?: string; backCallback?: string; forceReply?: boolean } = {},
): Promise<void> {
  const code = ctx.user.ref_code ?? `R${ctx.user.telegram_id.toString(36).toUpperCase()}`;
  const link = `https://t.me/${env.BOT_USERNAME}?start=${code}`;
  const refBalance = await getReferralBalance(ctx.user.telegram_id);
  const total = refBalance.total;
  const available = refBalance.available;
  const converted = refBalance.converted;
  const active = total;
  const left = 5 - (active % 5);
  const earnedTotal = (total * REFERRAL_USDT_PER_REF).toFixed(2);
  const withdrawn = (converted * REFERRAL_USDT_PER_REF).toFixed(2);
  const availableEarnings = available * REFERRAL_USDT_PER_REF;
  const body = ctx.t('profile.refer.body', {
    link,
    clicks: 0,
    pending: 0,
    active,
    left,
    refTotal: total,
    earnedTotal,
    withdrawn,
    refAvailable: available,
    converted,
  });
  const referText = `${ctx.t('profile.refer.title')}\n\n${body}`;
  const html = renderMdHtml(referText);
  const reply_markup = referKeyboard(ctx.lang, link, {
    ...options,
    canConvert: availableEarnings >= REFERRAL_MIN_CONVERT_USDT,
  });
  if (ctx.callbackQuery && !options.forceReply) {
    await ctx.editMessageText(renderMdHtml(referText), {
      parse_mode: 'HTML',
      reply_markup,
      link_preview_options: { is_disabled: true },
    });
  } else {
    await ctx.reply(html, {
      parse_mode: 'HTML',
      reply_markup,
      link_preview_options: { is_disabled: true },
    });
  }
}

export function registerProfile(bot: Composer<AppCtx>): void {
  bot.callbackQuery('profile:open', async (ctx) => {
    await ctx.answerCallbackQuery();
    // Drop any in-flight user flow (e.g. set_email) so subsequent
    // text messages aren't intercepted by a stale flow handler.
    ctx.session.userFlow = undefined;
    await showProfile(ctx);
  });

  // ---- Stats ----
  bot.callbackQuery('profile:stats', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showStats(ctx);
  });

  bot.callbackQuery('profile:stats:refresh', async (ctx) => {
    await ctx.answerCallbackQuery({ text: '🔄' });
    await showStats(ctx);
  });

  bot.callbackQuery('profile:currency', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showCurrencyPicker(ctx);
  });

  bot.callbackQuery('profile:shopview', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showShopListMode(ctx);
  });

  bot.callbackQuery('profile:shopgroup', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showShopGroupMode(ctx);
  });

  bot.callbackQuery(/^profile:shopgroup:set:(grouped|ungrouped)$/, async (ctx) => {
    const mode = ctx.match[1] as 'grouped' | 'ungrouped';
    await setUserShopGroupMode(ctx.user.telegram_id, mode);
    await ctx.answerCallbackQuery({
      text: ctx.t(mode === 'grouped' ? 'profile.shop_view.saved.grouped' : 'profile.shop_view.saved.ungrouped'),
    });
    await showShopGroupMode(ctx);
  });

  bot.callbackQuery(/^profile:shopview:set:(paged|all)$/, async (ctx) => {
    const mode = ctx.match[1] as 'paged' | 'all';
    await setUserShopListMode(ctx.user.telegram_id, mode);
    await ctx.answerCallbackQuery({
      text: ctx.t(mode === 'all' ? 'profile.shop_view.saved.all' : 'profile.shop_view.saved.paged'),
    });
    await showShopListMode(ctx);
  });

  bot.callbackQuery(/^profile:currency:p:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await showCurrencyPicker(ctx, Number(ctx.match[1]));
  });

  bot.callbackQuery(/^profile:currency:set:([A-Z]{3,4}):(\d+)$/, async (ctx) => {
    const code = normalizeCurrency(ctx.match[1]);
    const page = Number(ctx.match[2] ?? 0);
    try {
      await setUserCurrency(ctx.user.telegram_id, code);
      ctx.user.currency = code;
      await ctx.answerCallbackQuery({
        text: ctx.t('profile.currency.saved', { currency: code }),
      });
      await showCurrencyPicker(ctx, page);
    } catch {
      await ctx.answerCallbackQuery({
        text: ctx.t('profile.currency.error'),
        show_alert: true,
      });
    }
  });

  // ---- Send-PDF buttons (My Orders / Deposits / Stats screens) ----
  // Each callback re-uses the same flow:
  //   1. Bail with a popup if the user hasn't set their email yet.
  //   2. Show a "sending" popup, generate the PDF, hand it to the
  //      mailer, then update the popup with success / failure text.
  // The list / detail message is not touched so the user can keep
  // scrolling while the email is on its way.
  bot.callbackQuery('profile:orders:pdf', async (ctx) => {
    await sendReportPdfFromCallback(ctx, 'orders');
  });
  bot.callbackQuery('profile:deposits:pdf', async (ctx) => {
    await sendReportPdfFromCallback(ctx, 'deposits');
  });
  bot.callbackQuery('profile:stats:pdf', async (ctx) => {
    await sendReportPdfFromCallback(ctx, 'stats');
  });

  // ---- My Orders (list) ----
  // Paginated 2-column grid: each row is [Product Name] [Active status]
  // and tapping anywhere opens that order's detail screen.
  async function showOrdersPage(ctx: AppCtx, page: number): Promise<void> {
    const { rows, total } = await listOrdersPaginated(
      ctx.user.telegram_id,
      page,
      ORDERS_PER_PAGE,
    );
    if (total === 0) {
      await ctx.editMessageText(renderMdHtml(ctx.t('orders.empty')), {
        parse_mode: 'HTML',
        reply_markup: backToSettingsKeyboard(ctx.lang),
      });
      return;
    }
    const totalPages = Math.max(1, Math.ceil(total / ORDERS_PER_PAGE));
    // Compact lifecycle summary per order (ID / product / qty / amount /
    // payment / date / status) above the tap-to-open grid.
    const summaries = await Promise.all(
      rows.map(async (row) =>
        orderListLine(row, {
          publicId: publicOrderId(row),
          paymentLabel: await getOrderPaymentLabel(row.id),
          when: new Date(row.created_at).toISOString().slice(0, 10),
        }),
      ),
    );
    const text = [
      ctx.t('orders.title'),
      '',
      ctx.t('orders.body'),
      '',
      summaries.join('\n\n'),
    ].join('\n');
    await ctx.editMessageText(renderMdHtml(text), {
      parse_mode: 'HTML',
      reply_markup: ordersListKeyboard(ctx.lang, rows, page, totalPages),
    });
  }

  bot.callbackQuery('profile:orders', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.userFlow = { type: 'orders_lookup', step: 'value', data: {} };
    await showOrdersPage(ctx, 0);
  });

  bot.callbackQuery(/^orders:p:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await showOrdersPage(ctx, Number(ctx.match[1]));
  });

  // Find by Order ID — surface the typed-input flow that was
  // previously only documented inline. Tapping the button arms the
  // `orders_lookup` flow and posts a prompt so the next plain text
  // message the user sends is parsed as a public Order ID.
  bot.callbackQuery('profile:orders:find', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.userFlow = { type: 'orders_lookup', step: 'value', data: {} };
    await ctx.reply(renderMdHtml(ctx.t('orders.lookup.prompt')), {
      parse_mode: 'HTML',
    });
  });

  // ---- Order detail ----
  async function renderOrderDetail(ctx: AppCtx, orderId: number, asReply = false): Promise<void> {
    const order = await getOrder(orderId);
    if (!order || order.user_id !== ctx.user.telegram_id) {
      const msg = '⚠️ Order not found.';
      if (asReply) await ctx.reply(msg);
      else await ctx.editMessageText(msg, { reply_markup: backToSettingsKeyboard(ctx.lang) });
      return;
    }
    const pubId = publicOrderId(order);
    const when = formatAbsoluteUtc(order.created_at);
    // One shared renderer for every payment rail and product type, so
    // the card looks identical wherever an order shows up.
    const paymentLabel = await getOrderPaymentLabel(order.id);
    const { lines, lifecycle } = renderOrderDetailCard(order, {
      publicId: pubId,
      paymentLabel,
      when,
    });
    // Prefer the actual claimed delivered_items pool (one per line)
    // so each entry renders as its own quoted pill ("> #N\n> Open
    // Link #N"). Falls back to the legacy single-line `delivery`
    // text for orders predating the per-item pool.
    //
    // For bulk orders the renderer truncates the inline preview at a
    // safe Telegram-message budget and surfaces an `attach` payload
    // we ship as a `.txt` document right after the edited card, so
    // tapping a 37-link order in /myorders never fails on the 4096-
    // char limit.
    // Format: (quantity)x (product name) (buying time)
    const safeName = (order.product_name ?? 'Unknown')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const d = new Date(order.created_at);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const timeStr = `${hh}:${mm}Utc`;
    const txtFilename = `${order.qty}x ${safeName} ${timeStr}.txt`;
    // Digital goods are only revealed after fulfilment actually
    // succeeded — a pending / failed / cancelled order never leaks the
    // pool it would have received.
    const itemsRender = lifecycle.showDeliveredItems
      ? buildOrderDetailReceivedBlock(order.delivered_items, {
          filename: txtFilename,
        })
      : { inlineBlock: '', attach: null };
    if (itemsRender.inlineBlock) {
      lines.push(
        '',
        ctx.t('orders.detail.received', { received: itemsRender.inlineBlock }),
      );
    } else if (lifecycle.showDeliveredItems && order.delivery) {
      const urlMatch = order.delivery.match(/https?:\/\/\S+/);
      const deliveryText = urlMatch ? urlMatch[0] : order.delivery;
      lines.push('', ctx.t('orders.detail.received', { received: deliveryText }));
    }
    const html = clampForTelegram(renderMdHtml(lines.join('\n')));
    const openUrl = lifecycle.showDeliveredItems
      ? (order.delivery?.match(/https?:\/\/\S+/)?.[0] ?? null)
      : null;
    const reply_markup = orderDetailKeyboard(ctx.lang, openUrl);
    try {
      if (asReply) {
        await ctx.reply(html, {
          parse_mode: 'HTML',
          reply_markup,
          link_preview_options: { is_disabled: true },
        });
      } else {
        await ctx.editMessageText(html, {
          parse_mode: 'HTML',
          reply_markup,
          link_preview_options: { is_disabled: true },
        });
      }
    } catch (err) {
      // Belt-and-suspenders: if the rendered HTML still trips
      // Telegram (malformed entity, message_id stale, etc.), drop
      // the formatting and re-send so the user always sees their
      // order instead of a broken edit.
      logger.warn(
        { err, orderId, htmlLen: html.length },
        'profile: order detail render failed — falling back to plain reply',
      );
      try {
        await ctx.reply(htmlToPlain(html), {
          reply_markup,
          link_preview_options: { is_disabled: true },
        });
      } catch (fallbackErr) {
        logger.warn(
          { err: fallbackErr, orderId },
          'profile: order detail plain-text fallback also failed',
        );
      }
    }
    if (itemsRender.attach) {
      try {
        await ctx.replyWithDocument(
          new InputFile(
            Buffer.from(itemsRender.attach.contents, 'utf8'),
            itemsRender.attach.filename,
          ),
          { caption: `📎 Order #${pubId} — full items list` },
        );
      } catch (err) {
        logger.warn(
          { err, orderId },
          'profile: order detail .txt attachment failed',
        );
      }
    }
  }

  bot.callbackQuery(/^orders:open:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderOrderDetail(ctx, Number(ctx.match[1]));
  });

  // Allow users to type a public Order ID to open it (works while
  // the My Orders flow is active).
  bot.on('message:text', async (ctx, next) => {
    const flow = ctx.session.userFlow;
    if (!flow || flow.type !== 'orders_lookup') return next();
    const text = ctx.message.text.trim();
    if (text === '/cancel' || text.startsWith('/')) {
      ctx.session.userFlow = undefined;
      return next();
    }
    const id = parsePublicOrderId(text);
    if (!id) {
      await ctx.reply(renderMdHtml(ctx.t('orders.lookup.invalid')), {
        parse_mode: 'HTML',
      });
      return;
    }
    await renderOrderDetail(ctx, id, true);
  });

  // ---- Redeem Gift Code ----
  async function showRedeemScreen(ctx: AppCtx): Promise<void> {
    const balance = Number(ctx.user.balance).toFixed(
      ctx.user.balance % 1 === 0 ? 0 : 2,
    );
    const text = [
      ctx.t('gift.title'),
      '',
      ctx.t('gift.body', { balance }),
    ].join('\n');
    await ctx.editMessageText(renderMdHtml(text), {
      parse_mode: 'HTML',
      reply_markup: redeemKeyboard(
        ctx.lang,
        getAdminContactUrlWithPrefill(
          'Hi sir i wanna buy gift coupon code money: ',
        ),
      ),
    });
  }

  bot.callbackQuery('profile:redeem', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.userFlow = { type: 'redeem_gift', step: 'value', data: {} };
    await showRedeemScreen(ctx);
  });

  // Capture the next plain-text message as the gift code.
  bot.on('message:text', async (ctx, next) => {
    const flow = ctx.session.userFlow;
    if (!flow || flow.type !== 'redeem_gift') return next();
    const code = ctx.message.text.trim().toUpperCase();
    if (code === '/CANCEL' || code.startsWith('/')) {
      ctx.session.userFlow = undefined;
      return next();
    }
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) {
      await ctx.reply(renderMdHtml(ctx.t('gift.invalid')), { parse_mode: 'HTML' });
      return;
    }
    const gift = await getGiftCode(code);
    if (!gift) {
      await ctx.reply(renderMdHtml(ctx.t('gift.invalid')), { parse_mode: 'HTML' });
      return;
    }
    if (gift.expires_at && new Date(gift.expires_at).getTime() < Date.now()) {
      await ctx.reply(renderMdHtml(ctx.t('gift.expired')), { parse_mode: 'HTML' });
      return;
    }
    const usedByUser = await countGiftCodeRedemptionsByUser(code, ctx.user.telegram_id);
    if (usedByUser >= gift.per_user_limit) {
      await ctx.reply(renderMdHtml(ctx.t('gift.already_used')), { parse_mode: 'HTML' });
      return;
    }
    if (gift.max_redemptions != null) {
      const totalUsed = await countGiftCodeRedemptions(code);
      if (totalUsed >= gift.max_redemptions) {
        await ctx.reply(renderMdHtml(ctx.t('gift.exhausted')), { parse_mode: 'HTML' });
        return;
      }
    }
    // The atomic wallet primitive also writes the ledger entry.
    const amount = Number(gift.amount);
    const newBalance = await adjustBalance(ctx.user.telegram_id, amount);
    await recordGiftCodeRedemption({
      code,
      user_id: ctx.user.telegram_id,
      amount,
    });
    ctx.user.balance = newBalance;
    ctx.session.userFlow = undefined;
    const formatted = amount.toFixed(amount % 1 === 0 ? 0 : 2);
    await ctx.reply(
      renderMdHtml(ctx.t('gift.redeemed', { amount: formatted })),
      { parse_mode: 'HTML' },
    );
    void adminLog.logGiftRedeem(ctx.api, {
      user: {
        telegram_id: ctx.user.telegram_id,
        username: ctx.user.username ?? null,
        first_name: ctx.user.first_name ?? null,
        email: ctx.user.email ?? null,
      },
      code,
      amount,
      balanceAfter: Number(newBalance.toFixed(3)),
    });
  });

  // ---- Refer ----
  // Reached from the main menu. Renders the user's referral stats
  // (24-hour, 7-day, lifetime), referral-earning balances, the rules
  // blockquote, and a Copy Link button + Back row.
  bot.callbackQuery('profile:refer', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showReferScreen(ctx);
  });

  bot.callbackQuery(/^profile:refer:buy:(\d+)$/, async (ctx) => {
    const productId = Number(ctx.match[1]);
    await ctx.answerCallbackQuery({ text: '🔄' });
    await showReferScreen(ctx, {
      refreshCallback: `profile:refer:buy:${productId}`,
      backCallback: `buy:${productId}`,
    });
  });

  bot.callbackQuery('profile:refer:convert', async (ctx) => {
    const balance = await getReferralBalance(ctx.user.telegram_id);
    const available = balance.available;
    const earnings = available * REFERRAL_USDT_PER_REF;
    if (earnings < REFERRAL_MIN_CONVERT_USDT) {
      await ctx.answerCallbackQuery({
        text: ctx.t('profile.refer.convert_low', {
          min: REFERRAL_MIN_CONVERT_USDT.toFixed(2),
          available,
          earned: earnings.toFixed(2),
        }),
        show_alert: true,
      });
      return;
    }
    const amount = Number((available * REFERRAL_USDT_PER_REF).toFixed(2));
    try {
      const res = await convertReferralBalance({
        user_id: ctx.user.telegram_id,
        referral_cost: available,
        amount,
      });
      await ctx.answerCallbackQuery({
        text: ctx.t('profile.refer.convert_success', {
          refs: available,
          amount: amount.toFixed(2),
          balance: res.newBalance.toFixed(2),
        }),
        show_alert: true,
      });
      await showReferScreen(ctx);
    } catch (err) {
      if (!(err instanceof InsufficientReferralBalanceError)) {
        logger.warn({ err, telegram_id: ctx.user.telegram_id }, 'referral conversion failed');
      }
      await ctx.answerCallbackQuery({
        text: ctx.t('profile.refer.convert_error'),
        show_alert: true,
      });
    }
  });

  // ---- Notifications submenu ----
  bot.callbackQuery('profile:notifications', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showNotifications(ctx);
  });

  bot.callbackQuery('profile:toggle_stock', async (ctx) => {
    try {
      const next = await toggleNotification(ctx.user.telegram_id, 'stock_alert');
      ctx.user.stock_alert = next;
      await ctx.answerCallbackQuery({
        text: next ? ctx.t('profile.notify.stock_on') : ctx.t('profile.notify.stock_off'),
      });
      await showNotifications(ctx);
      void adminLog.logNotificationToggle(ctx.api, {
        user: {
          telegram_id: ctx.user.telegram_id,
          username: ctx.user.username ?? null,
          first_name: ctx.user.first_name ?? null,
          email: ctx.user.email ?? null,
        },
        channel: 'stock',
        enabled: next,
      });
    } catch {
      await ctx.answerCallbackQuery({
        text: ctx.t('profile.notify.error'),
        show_alert: true,
      });
    }
  });

  bot.callbackQuery('profile:toggle_ann', async (ctx) => {
    try {
      const next = await toggleNotification(ctx.user.telegram_id, 'announcements');
      ctx.user.announcements = next;
      await ctx.answerCallbackQuery({
        text: next ? ctx.t('profile.notify.ann_on') : ctx.t('profile.notify.ann_off'),
      });
      await showNotifications(ctx);
      void adminLog.logNotificationToggle(ctx.api, {
        user: {
          telegram_id: ctx.user.telegram_id,
          username: ctx.user.username ?? null,
          first_name: ctx.user.first_name ?? null,
          email: ctx.user.email ?? null,
        },
        channel: 'announcements',
        enabled: next,
      });
    } catch {
      await ctx.answerCallbackQuery({
        text: ctx.t('profile.notify.error'),
        show_alert: true,
      });
    }
  });

  bot.callbackQuery('profile:toggle_wallet', async (ctx) => {
    try {
      const next = await toggleNotification(ctx.user.telegram_id, 'wallet_alert');
      ctx.user.wallet_alert = next;
      await ctx.answerCallbackQuery({
        text: next ? ctx.t('profile.notify.wallet_on') : ctx.t('profile.notify.wallet_off'),
      });
      await showNotifications(ctx);
      void adminLog.logNotificationToggle(ctx.api, {
        user: {
          telegram_id: ctx.user.telegram_id,
          username: ctx.user.username ?? null,
          first_name: ctx.user.first_name ?? null,
          email: ctx.user.email ?? null,
        },
        channel: 'wallet',
        enabled: next,
      });
    } catch {
      await ctx.answerCallbackQuery({
        text: ctx.t('profile.notify.error'),
        show_alert: true,
      });
    }
  });

  // Email Reports toggle. Stored under `email_nag_disabled` (true =
  // OFF). When OFF, the 12-hour email-add nag is muted AND the
  // Send-PDF buttons short-circuit with a popup error.
  bot.callbackQuery('profile:toggle_email_reports', async (ctx) => {
    try {
      const enabled = await toggleEmailReports(ctx.user.telegram_id);
      ctx.user.email_nag_disabled = !enabled;
      await ctx.answerCallbackQuery({
        text: enabled
          ? ctx.t('profile.notify.email_on')
          : ctx.t('profile.notify.email_off'),
      });
      await showNotifications(ctx);
      void adminLog.logNotificationToggle(ctx.api, {
        user: {
          telegram_id: ctx.user.telegram_id,
          username: ctx.user.username ?? null,
          first_name: ctx.user.first_name ?? null,
          email: ctx.user.email ?? null,
        },
        channel: 'email_reports',
        enabled,
      });
    } catch {
      await ctx.answerCallbackQuery({
        text: ctx.t('profile.notify.error'),
        show_alert: true,
      });
    }
  });

  // ---------------------------------------------------------------
  //  Bot Tutorial (Settings → Bot Tutorial)
  //  Renders the admin-editable tutorial page (text + optional
  //  photo / video / document attachment + optional URL button).
  // ---------------------------------------------------------------
  bot.callbackQuery('profile:tutorial', async (ctx) => {
    // Always ack first so Telegram never shows a perpetual spinner
    // even if the body below throws.
    await ctx.answerCallbackQuery();
    let stage = 'load_settings';
    try {
      const tut = getBotTutorial();
      stage = 'compose_body';
      const text = (tut.text ?? '').trim();
      const titleLine = ctx.t('profile.bot_tutorial.title');
      const body =
        text.length > 0
          ? `${titleLine}\n\n${ctx.t('profile.bot_tutorial.body', { body: text })}`
          : `${titleLine}\n\n${ctx.t('profile.bot_tutorial.empty')}`;
      stage = 'build_keyboard';
      const safeUrl = sanitizeButtonUrl(tut.url);
      const kb = botTutorialKeyboard(ctx.lang, safeUrl);
      stage = 'render_html';
      const html = renderMdHtml(body);
      const safeHtml = clampForTelegram(html);
      logger.info(
        {
          hasText: text.length > 0,
          hasFile: Boolean(tut.file_id && tut.file_type),
          fileType: tut.file_type ?? null,
          hasUrl: Boolean(safeUrl),
          rejectedUrl: tut.url && !safeUrl ? tut.url : null,
          htmlLen: safeHtml.length,
        },
        'profile:tutorial — rendering Bot Tutorial',
      );
      // Bot-owner spec: the tutorial should NOT arrive as a fresh
      // message below Settings — it should *replace* the Settings
      // page in-place, so tapping Bot Tutorial converts the open
      // Settings card into the tutorial card without cluttering
      // the chat. The Back button on the tutorial keyboard already
      // routes back to `profile:open`, which itself uses
      // `editMessageText`, so the round-trip stays on a single
      // message bubble.
      //
      // Telegram doesn't let us turn a text-only message into a
      // media one, so when the admin has uploaded a tutorial
      // photo / video / document we still send the *file* as a
      // follow-up — but the actual instruction card is edited in
      // place, removing the duplicate text page the bot owner
      // flagged.
      stage = 'edit_html';
      try {
        await ctx.editMessageText(safeHtml, {
          parse_mode: 'HTML',
          reply_markup: kb,
          link_preview_options: { is_disabled: true },
        });
      } catch (htmlErr) {
        logger.warn(
          { err: htmlErr },
          'profile:tutorial: HTML edit failed, retrying as plain text edit',
        );
        stage = 'edit_plain';
        try {
          await ctx.editMessageText(htmlToPlain(safeHtml), {
            reply_markup: kb,
            link_preview_options: { is_disabled: true },
          });
        } catch (plainErr) {
          // Edit can hard-fail on some clients (e.g. message too
          // old, or the previous Settings render was actually a
          // media message that can't accept `editMessageText`).
          // Fall back to sending a fresh card so the user still
          // gets the tutorial — a one-off duplicate is always
          // better than a broken button.
          logger.warn(
            { err: plainErr },
            'profile:tutorial: edit failed entirely, falling back to reply',
          );
          stage = 'send_html_fallback';
          await ctx.reply(safeHtml, {
            parse_mode: 'HTML',
            reply_markup: kb,
            link_preview_options: { is_disabled: true },
          });
        }
      }
      if (tut.file_id && tut.file_type) {
        try {
          stage = 'send_file';
          if (tut.file_type === 'photo') {
            await ctx.replyWithPhoto(tut.file_id);
          } else if (tut.file_type === 'video') {
            await ctx.replyWithVideo(tut.file_id);
          } else {
            await ctx.replyWithDocument(tut.file_id);
          }
        } catch (err) {
          logger.warn({ err }, 'bot_tutorial file send failed');
        }
      }
    } catch (err) {
      logger.error({ err, stage }, 'profile:tutorial — failed to render');
      const reason = (err as Error)?.message ?? String(err);
      try {
        await ctx.reply(
          `⚠️ <b>Couldn't load the Bot Tutorial.</b>\n\n` +
            `Stage: <code>${escapeAttr(stage)}</code>\n` +
            `Reason: <code>${escapeAttr(reason).slice(0, 200)}</code>\n\n` +
            `Admin: open <code>/admin</code> → <i>Bot Tutorial → Set Text / Set File / Set URL</i> and double-check the URL (must start with <code>https://</code> and contain no spaces or newlines).`,
          { parse_mode: 'HTML' },
        );
      } catch {
        // Last-ditch: nothing else to do.
      }
    }
  });

  // ---------------------------------------------------------------
  //  Send Price List (Settings → Send Price List)
  //  Two delivery options: mail or chat.
  // ---------------------------------------------------------------
  bot.callbackQuery('profile:pricelist', async (ctx) => {
    await ctx.answerCallbackQuery();
    const text = [
      ctx.t('profile.pricelist.title'),
      '',
      ctx.t('profile.pricelist.body'),
    ].join('\n');
    await ctx.editMessageText(renderMdHtml(text), {
      parse_mode: 'HTML',
      reply_markup: priceListKeyboard(ctx.lang),
    });
  });

  // The chat path keeps the CSV (lightweight, easy to inspect on
  // mobile in any spreadsheet app); the email path now ships a PDF
  // because the bot owner explicitly asked for it.
  async function buildPriceListChatCsv(ctx: AppCtx): Promise<Buffer | null> {
    // Pull EVERY product (active + upcoming) so the user gets a real
    // catalog snapshot, not just the in-stock subset.
    const { rows } = await listAllProducts(0, 1000);
    if (rows.length === 0) return null;
    const promos = await listActivePromos();
    const promoFooter = ctx.t('profile.pricelist.promo_footer');
    return buildPriceListCsv({
      products: rows,
      promos,
      labels: {
        col_name: ctx.t('profile.pricelist.csv.col.name'),
        col_status: ctx.t('profile.pricelist.csv.col.status'),
        col_stock: ctx.t('profile.pricelist.csv.col.stock'),
        col_price: ctx.t('profile.pricelist.csv.col.price'),
        col_promo: ctx.t('profile.pricelist.csv.col.promo'),
        status_in_stock: ctx.t('profile.pricelist.csv.status.in_stock'),
        status_out_of_stock: ctx.t('profile.pricelist.csv.status.out_of_stock'),
        status_upcoming: ctx.t('profile.pricelist.csv.status.upcoming'),
        promo_none: ctx.t('profile.pricelist.csv.promo_none'),
        promo_format: (min_qty: number, discount: string) =>
          ctx.t('profile.pricelist.csv.promo_format', {
            min_qty,
            discount,
          }),
        promo_tier_format: (min_qty: number, unit_price: string) =>
          ctx.t('profile.pricelist.csv.promo_tier_format', { min_qty, unit_price }),
        unlimited: ctx.t('profile.pricelist.csv.unlimited'),
        promo_footer: promoFooter,
      },
    });
  }

  async function buildPriceListMailPdf(ctx: AppCtx): Promise<Buffer | null> {
    const { rows } = await listAllProducts(0, 1000);
    if (rows.length === 0) return null;
    const promos = await listActivePromos();
    const promoFooter = ctx.t('profile.pricelist.promo_footer');
    return buildPriceListPdf({
      products: rows,
      promos,
      labels: {
        reportTitle: ctx.t('profile.pricelist.pdf.title'),
        sectionTitle: ctx.t('profile.pricelist.pdf.section'),
        status_in_stock: ctx.t('profile.pricelist.csv.status.in_stock'),
        status_out_of_stock: ctx.t('profile.pricelist.csv.status.out_of_stock'),
        status_upcoming: ctx.t('profile.pricelist.csv.status.upcoming'),
        unlimited: ctx.t('profile.pricelist.csv.unlimited'),
        promo_none: ctx.t('profile.pricelist.csv.promo_none'),
        promo_format: (min_qty: number, discount: string) =>
          ctx.t('profile.pricelist.csv.promo_format', {
            min_qty,
            discount,
          }),
        promo_tier_format: (min_qty: number, unit_price: string) =>
          ctx.t('profile.pricelist.csv.promo_tier_format', { min_qty, unit_price }),
        promo_footer: promoFooter,
      },
    });
  }

  bot.callbackQuery('profile:pricelist:mail', async (ctx) => {
    if (ctx.user.email_nag_disabled) {
      await ctx.answerCallbackQuery({
        text: ctx.t('profile.email.reports_off_popup'),
        show_alert: true,
      });
      return;
    }
    if (!ctx.user.email) {
      await ctx.answerCallbackQuery({
        text: ctx.t('profile.pricelist.no_email_popup'),
        show_alert: true,
      });
      return;
    }
    await ctx.answerCallbackQuery({
      text: ctx.t('profile.pricelist.sending'),
      show_alert: false,
    });
    const pdf = await buildPriceListMailPdf(ctx);
    if (!pdf) {
      await ctx.reply(renderMdHtml(ctx.t('profile.pricelist.empty')), {
        parse_mode: 'HTML',
      });
      return;
    }
    const ok = await sendPriceListEmail({
      email: ctx.user.email,
      pdf,
      firstName: ctx.user.first_name ?? null,
      username: ctx.user.username ?? null,
      promoFooter: ctx.t('profile.pricelist.promo_footer'),
    });
    const sent = await ctx.reply(
      renderMdHtml(
        ok
          ? ctx.t('profile.pricelist.mail_sent', { email: ctx.user.email })
          : ctx.t('profile.pricelist.mail_failed'),
      ),
      { parse_mode: 'HTML' },
    );
    if (ok) autoDeleteMessage(ctx, sent.message_id);
  });

  bot.callbackQuery('profile:pricelist:chat', async (ctx) => {
    await ctx.answerCallbackQuery({
      text: ctx.t('profile.pricelist.sending'),
      show_alert: false,
    });
    const csv = await buildPriceListChatCsv(ctx);
    if (!csv) {
      await ctx.reply(renderMdHtml(ctx.t('profile.pricelist.empty')), {
        parse_mode: 'HTML',
      });
      return;
    }
    const filename = `Digitalora-Shop-PriceList-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    await ctx.replyWithDocument(new InputFile(csv, filename));
    await ctx.reply(renderMdHtml(ctx.t('profile.pricelist.chat_sent')), {
      parse_mode: 'HTML',
    });
  });

  // ---- Language ----
  // The picker title is rendered through `renderMdHtml` so the
  // wrapping premium emojis (`{lang_left}` / `{lang_right}`) and
  // the bold "Select Language" mid-text all show up correctly.
  bot.callbackQuery('profile:lang', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(renderMdHtml(ctx.t('profile.language.title')), {
      parse_mode: 'HTML',
      reply_markup: languageKeyboard(ctx.lang),
    });
  });

  bot.callbackQuery(/^lang:(en|ar|vi)$/, async (ctx) => {
    const next = ctx.match[1] as Lang;
    const prev = ctx.user.language;
    await setUserLanguage(ctx.user.telegram_id, next);
    ctx.user.language = next;
    ctx.lang = next;
    await ctx.answerCallbackQuery();
    await showProfile(ctx);
    if (prev !== next) {
      void adminLog.logLanguageChange(ctx.api, {
        user: {
          telegram_id: ctx.user.telegram_id,
          username: ctx.user.username ?? null,
          first_name: ctx.user.first_name ?? null,
          email: ctx.user.email ?? null,
        },
        oldLang: prev,
        newLang: next,
      });
    }
  });

  // ---- Region picker ----
  bot.callbackQuery('profile:region', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showRegionPicker(ctx, 0);
  });

  bot.callbackQuery(/^profile:region:p:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await showRegionPicker(ctx, Number(ctx.match[1]));
  });

  bot.callbackQuery(/^profile:region:set:([A-Z]{2})$/, async (ctx) => {
    const code = ctx.match[1];
    const reg = POPULAR_REGIONS.find((r) => r.code === code);
    if (!reg) {
      await ctx.answerCallbackQuery({ text: 'Unknown region' });
      return;
    }
    try {
      await setUserRegion(ctx.user.telegram_id, reg.code, reg.timezone);
    } catch (err) {
      logger.error({ err }, 'setUserRegion failed');
      await ctx.answerCallbackQuery({
        text: 'Could not save region — admin must apply migration 0005.',
        show_alert: true,
      });
      return;
    }
    ctx.user.region = reg.code;
    ctx.user.timezone = reg.timezone;
    await ctx.answerCallbackQuery({
      text: `${reg.flag} ${reg.name}`,
    });
    await showProfile(ctx);
    void adminLog.logRegion(ctx.api, {
      user: {
        telegram_id: ctx.user.telegram_id,
        username: ctx.user.username ?? null,
        first_name: ctx.user.first_name ?? null,
        email: ctx.user.email ?? null,
      },
      mode: 'set',
      region: reg.code,
      timezone: reg.timezone,
    });
  });

  bot.callbackQuery('profile:region:clear', async (ctx) => {
    try {
      await setUserRegion(ctx.user.telegram_id, null, null);
    } catch (err) {
      logger.error({ err }, 'setUserRegion(null) failed');
      await ctx.answerCallbackQuery({
        text: 'Could not clear region — admin must apply migration 0005.',
        show_alert: true,
      });
      return;
    }
    ctx.user.region = null;
    ctx.user.timezone = null;
    await ctx.answerCallbackQuery({ text: '🚫 Cleared' });
    await showProfile(ctx);
    void adminLog.logRegion(ctx.api, {
      user: {
        telegram_id: ctx.user.telegram_id,
        username: ctx.user.username ?? null,
        first_name: ctx.user.first_name ?? null,
        email: ctx.user.email ?? null,
      },
      mode: 'clear',
      region: null,
      timezone: null,
    });
  });

  // ---- Email Settings hub (3-button submenu) ----
  bot.callbackQuery('profile:email', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.userFlow = undefined;
    await showEmailHub(ctx);
  });

  // Set Email screen.
  bot.callbackQuery('profile:email:set', async (ctx) => {
    // If the user already has an email on file, "Set Email" doesn't
    // make sense — bounce them with a mobile popup pointing at
    // Change / Delete instead so we never silently overwrite a saved
    // address.
    if (ctx.user.email) {
      await ctx.answerCallbackQuery({
        text: ctx.t('profile.email.set.already_set_popup', { current: ctx.user.email }),
        show_alert: true,
      });
      return;
    }
    await ctx.answerCallbackQuery();
    ctx.session.userFlow = { type: 'set_email', step: 'value', data: { mode: 'set' } };
    const text = [
      ctx.t('profile.email.set.title'),
      '',
      ctx.t('profile.email.set.body'),
    ].join('\n');
    await ctx.editMessageText(renderMdHtml(text), {
      parse_mode: 'HTML',
      reply_markup: emailScreenKeyboard(ctx.lang),
    });
  });

  // Post-purchase variant of Set Email — fired from the `Add Verified
  // Email` CTA shown under Order Delivered when the buyer has no
  // email on file. Carries the originating order id in the callback
  // (`profile:email:set:post:<orderId>`) so the message handler can:
  //   1. send a retroactive invoice email for that order once the
  //      address lands;
  //   2. auto-delete the typed-email message + the saved-confirmation
  //      card and replace them with a single bold "Email has been
  //      setuped" line — matching the bot owner's spec.
  bot.callbackQuery(/^profile:email:set:post:(\d+)$/, async (ctx) => {
    if (ctx.user.email) {
      await ctx.answerCallbackQuery({
        text: ctx.t('profile.email.set.already_set_popup', { current: ctx.user.email }),
        show_alert: true,
      });
      return;
    }
    const orderId = Number(ctx.match[1]);
    const promptMsg = ctx.callbackQuery.message;
    await ctx.answerCallbackQuery();
    ctx.session.userFlow = {
      type: 'set_email',
      step: 'value',
      data: {
        mode: 'set',
        postPurchase: true,
        pendingInvoiceOrderId: Number.isFinite(orderId) ? orderId : undefined,
        promptChatId: promptMsg?.chat?.id,
        promptMessageId: promptMsg?.message_id,
      },
    };
    const text = [
      ctx.t('profile.email.set.title'),
      '',
      ctx.t('profile.email.set.body'),
    ].join('\n');
    await ctx.editMessageText(renderMdHtml(text), {
      parse_mode: 'HTML',
      reply_markup: emailScreenKeyboard(ctx.lang),
    });
  });

  // Change Email screen — always shown in the hub, but if the user
  // doesn't have an email yet we abort with a mobile popup instead
  // of opening the screen.
  bot.callbackQuery('profile:email:change', async (ctx) => {
    if (!ctx.user.email) {
      await ctx.answerCallbackQuery({
        text: ctx.t('profile.email.change.no_email_popup'),
        show_alert: true,
      });
      return;
    }
    await ctx.answerCallbackQuery();
    ctx.session.userFlow = { type: 'set_email', step: 'value', data: { mode: 'change' } };
    const text = [
      ctx.t('profile.email.change.title'),
      '',
      ctx.t('profile.email.change.body', { current: ctx.user.email }),
    ].join('\n');
    await ctx.editMessageText(renderMdHtml(text), {
      parse_mode: 'HTML',
      reply_markup: emailScreenKeyboard(ctx.lang),
    });
  });

  // Delete Email confirmation screen — only reachable when an email
  // is on file. Hitting Confirm Delete clears the row; Cancel
  // bounces back to the Email Settings hub.
  bot.callbackQuery('profile:email:delete', async (ctx) => {
    if (!ctx.user.email) {
      await ctx.answerCallbackQuery({
        text: ctx.t('profile.email.delete.no_email_popup'),
        show_alert: true,
      });
      return;
    }
    await ctx.answerCallbackQuery();
    ctx.session.userFlow = undefined;
    const text = [
      ctx.t('profile.email.delete.title'),
      '',
      ctx.t('profile.email.delete.body', { current: ctx.user.email }),
    ].join('\n');
    await ctx.editMessageText(renderMdHtml(text), {
      parse_mode: 'HTML',
      reply_markup: emailDeleteConfirmKeyboard(ctx.lang),
    });
  });

  // Confirmed delete — null out the column, refresh the in-memory
  // user, and drop the user back on the Email Settings hub so they
  // immediately see "Current email: _not set_".
  bot.callbackQuery('profile:email:delete:confirm', async (ctx) => {
    if (!ctx.user.email) {
      await ctx.answerCallbackQuery({
        text: ctx.t('profile.email.delete.no_email_popup'),
        show_alert: true,
      });
      await showEmailHub(ctx);
      return;
    }
    const oldEmail = ctx.user.email;
    try {
      await setUserEmail(ctx.user.telegram_id, null);
    } catch (err) {
      logger.error({ err }, 'setUserEmail(null) failed');
      await ctx.answerCallbackQuery({
        text: ctx.t('err.generic'),
        show_alert: true,
      });
      return;
    }
    ctx.user.email = null;
    // Fire-and-forget the deletion confirmation email to the address
    // we just removed so the (human) owner sees evidence of the
    // change — important for the "I never deleted this" recovery
    // path. No PDF attachment for this mode.
    void sendWelcomeEmail({
      email: oldEmail,
      previousEmail: oldEmail,
      firstName: ctx.user.first_name ?? null,
      username: ctx.user.username ?? null,
      mode: 'delete',
    });
    await ctx.answerCallbackQuery({
      text: ctx.t('profile.email.delete.success'),
    });
    await showEmailHub(ctx);
    void adminLog.logEmail(ctx.api, {
      user: {
        telegram_id: ctx.user.telegram_id,
        username: ctx.user.username ?? null,
        first_name: ctx.user.first_name ?? null,
        email: null,
      },
      mode: 'delete',
      oldEmail,
      newEmail: null,
    });
  });

  // Why Email — explanatory screen with a "Know More" PDF button.
  bot.callbackQuery('profile:email:why', async (ctx) => {
    await ctx.answerCallbackQuery();
    // Drop any in-flight email flow so a stray text after reading
    // "Why?" isn't misinterpreted as the new email value.
    ctx.session.userFlow = undefined;
    const text = [
      ctx.t('profile.email.why.title'),
      '',
      ctx.t('profile.email.why.body'),
    ].join('\n');
    const pdfUrl = getEmailPdfUrl();
    await ctx.editMessageText(renderMdHtml(text), {
      parse_mode: 'HTML',
      reply_markup: whyEmailKeyboard(ctx.lang, pdfUrl),
      link_preview_options: { is_disabled: true },
    });
  });

  // Fallback: send the bundled PDF as a chat document (no caption,
  // per user request — "don't add texts under file"). Only fires when
  // `email.pdf_url` setting is unset and the keyboard renders this as
  // a callback button instead of a URL button.
  bot.callbackQuery('profile:email:why:more', async (ctx) => {
    await ctx.answerCallbackQuery();
    try {
      await ctx.replyWithDocument(new InputFile(EMAIL_PDF_PATH));
    } catch (err) {
      logger.error({ err }, 'failed to send email-explanation PDF');
      await ctx.reply(ctx.t('err.generic'));
    }
  });

  // Capture the next text message as the email value.
  bot.on('message:text', async (ctx, next) => {
    const flow = ctx.session.userFlow;
    if (!flow || flow.type !== 'set_email') return next();
    const text = ctx.message.text.trim();
    if (text === '/cancel' || text.startsWith('/')) {
      ctx.session.userFlow = undefined;
      return next();
    }
    if (!EMAIL_RE.test(text)) {
      await ctx.reply(renderMdHtml(ctx.t('profile.email.bad')), { parse_mode: 'HTML' });
      return;
    }
    // Reject any email already saved against a *different* telegram
    // user. A user re-saving their own address still passes — that
    // path is exercised by `mode='change'` and idempotent re-saves.
    const existingOwner = await findUserByEmail(text);
    if (existingOwner && existingOwner !== ctx.user.telegram_id) {
      await ctx.reply(renderMdHtml(ctx.t('profile.email.in_use')), {
        parse_mode: 'HTML',
      });
      return;
    }
    try {
      await setUserEmail(ctx.user.telegram_id, text);
    } catch (err) {
      logger.error({ err }, 'setUserEmail failed');
      // Most common causes:
      //   1. Migration 0005 was never applied (`email` column missing).
      //   2. Migration ran, but PostgREST's schema cache is stale — it
      //      will return PGRST204 ("Could not find the 'email' column
      //      … in the schema cache") until the API is reloaded:
      //        select pg_notify('pgrst', 'reload schema');
      //      or Supabase Dashboard → Project Settings → API → Restart.
      const e = err as { code?: string; message?: string } | undefined;
      const escape = (s: string): string =>
        s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
      const detail = e?.message
        ? ` <i>(${escape(e.code ?? 'err')}: ${escape(e.message)})</i>`
        : '';
      await ctx.reply(
        '⚠️ Could not save your email — the bot operator must apply ' +
          'migration <code>0005_user_profile_fields.sql</code>. If it is ' +
          'already applied, reload the API schema in Supabase ' +
          '(Project Settings → API → Restart server, or run ' +
          "<code>select pg_notify('pgrst', 'reload schema');</code> once)." +
          detail,
        { parse_mode: 'HTML' },
      );
      return;
    }
    const previousEmail = ctx.user.email ?? null;
    const mode: 'set' | 'change' =
      flow.data && (flow.data as { mode?: 'set' | 'change' }).mode === 'change'
        ? 'change'
        : 'set';
    const flowData = flow.data as {
      postPurchase?: boolean;
      pendingInvoiceOrderId?: number;
      promptChatId?: number;
      promptMessageId?: number;
    };
    const postPurchase = Boolean(flowData.postPurchase);
    ctx.user.email = text;
    ctx.session.userFlow = undefined;
    // Fire-and-forget: send the user a polished welcome / confirmation
    // email with the "Why we need your email" PDF attached. We
    // deliberately do NOT await this — saving the address must always
    // feel instant even if the SMTP relay is slow or unreachable.
    void sendWelcomeEmail({
      email: text,
      previousEmail,
      firstName: ctx.user.first_name ?? null,
      username: ctx.user.username ?? null,
      mode,
    });
    // Notify admin (deep-detail) so they have a record of the new
    // contact email — old + new both included for set/change.
    void adminLog.logEmail(ctx.api, {
      user: {
        telegram_id: ctx.user.telegram_id,
        username: ctx.user.username ?? null,
        first_name: ctx.user.first_name ?? null,
        email: text,
      },
      mode,
      oldEmail: previousEmail,
      newEmail: text,
    });
    if (postPurchase) {
      // ---- Post-purchase email setup (pic-1 spec) -------------
      // The bot owner asked for a clean exit:
      //   - delete the user's typed-email message
      //   - delete the open Set Email screen (the original prompt,
      //     edited in place by `profile:email:set:post:<id>`)
      //   - drop ONE bold confirmation line "Email has been setuped"
      //   - and retroactively send the invoice email for the order
      //     they bought BEFORE saving their address.
      const userMsgChatId = ctx.chat?.id;
      const userMsgId = ctx.message.message_id;
      if (userMsgChatId !== undefined) {
        await ctx.api.deleteMessage(userMsgChatId, userMsgId).catch((err) => {
          logger.debug(
            { err, chatId: userMsgChatId, messageId: userMsgId },
            'auto-delete of typed-email message failed',
          );
        });
      }
      if (flowData.promptChatId && flowData.promptMessageId) {
        await ctx.api
          .deleteMessage(flowData.promptChatId, flowData.promptMessageId)
          .catch((err) => {
            logger.debug(
              {
                err,
                chatId: flowData.promptChatId,
                messageId: flowData.promptMessageId,
              },
              'auto-delete of Set-Email prompt failed',
            );
          });
      }
      await ctx.reply(
        renderMdHtml(ctx.t('shop.buy.email_setup_done')),
        { parse_mode: 'HTML' },
      );
      // Retroactive invoice — fire one email for the order that
      // triggered this whole flow. We deliberately don't iterate
      // every prior order without an invoice flag (no schema
      // support) so the implementation stays bounded; the buyer's
      // most recent purchase is the one they care about.
      if (flowData.pendingInvoiceOrderId) {
        void sendRetroactiveInvoiceForOrder({
          telegramId: ctx.user.telegram_id,
          orderId: flowData.pendingInvoiceOrderId,
          email: text,
          firstName: ctx.user.first_name ?? null,
          username: ctx.user.username ?? null,
        });
      }
      return;
    }
    // Bug fix: re-render the FULL settings screen as a fresh message
    // so the user immediately sees the saved email and the row of
    // buttons under it updates.
    await showProfile(ctx, { forceReply: true });
  });

  // ---- My Deposits ----
  // Two-section screen:
  //   1. Payment Deposits (rows from `deposits` table)
  //   2. Wallet Balance History (rows from `wallet_ledger` table)
  // Each entry is rendered inside a Markdown blockquote so it visually
  // stands apart from the section header.
  bot.callbackQuery('profile:deposits', async (ctx) => {
    await ctx.answerCallbackQuery();
    const [deposits, ledger] = await Promise.all([
      listDeposits(ctx.user.telegram_id),
      listWalletLedger(ctx.user.telegram_id).catch(() => []),
    ]);

    if (deposits.length === 0 && ledger.length === 0) {
      await ctx.editMessageText(renderMdHtml(ctx.t('profile.deposits.empty')), {
        parse_mode: 'HTML',
        reply_markup: backToSettingsKeyboard(ctx.lang),
      });
      return;
    }

    const lines: string[] = [ctx.t('profile.deposits.title'), ''];

    if (deposits.length > 0) {
      lines.push(ctx.t('profile.deposits.payments_header'));
      deposits.forEach((d, i) => {
        const statusKey =
          `profile.deposits.status.${d.status}` as const;
        const status = ctx.t(statusKey);
        const block = [
          ctx.t('profile.deposits.line.id', { n: i + 1 }),
          ctx.t('profile.deposits.line.amount', { amount: Number(d.amount) }),
          ctx.t('profile.deposits.line.method', { method: d.method }),
          ctx.t('profile.deposits.line.status', { status }),
          d.reference
            ? ctx.t('profile.deposits.line.reference', { reference: d.reference })
            : '',
          ctx.t('profile.deposits.line.when', {
            when: formatRelative(ctx, d.created_at),
          }),
        ].filter(Boolean);
        // Markdown-style blockquote — one '>' per line, blank '>' between blocks.
        lines.push(...block.map((l) => `> ${l}`));
        if (i < deposits.length - 1) lines.push('>');
      });
      lines.push('');
    }

    if (ledger.length > 0) {
      lines.push(ctx.t('profile.deposits.wallet_header'));
      ledger.forEach((row, i) => {
        const typeKey =
          `profile.deposits.wallet.type.${row.type}` as const;
        const typeLabel = ctx.t(typeKey, {});
        // Fallback when the type isn't in our locale map.
        const displayType = typeLabel === typeKey ? row.type : typeLabel;
        const amount = Math.abs(Number(row.amount));
        const sign = Number(row.amount) >= 0 ? '+' : '-';
        const block = [
          ctx.t('profile.deposits.line.id', { n: i + 1 }),
          ctx.t('profile.deposits.wallet.line.type', { type: displayType }),
          ctx.t('profile.deposits.wallet.line.amount', { sign, amount }),
          row.reference
            ? ctx.t('profile.deposits.wallet.line.reference', {
                reference: row.reference,
              })
            : '',
          ctx.t('profile.deposits.wallet.line.when', {
            when: formatRelative(ctx, row.created_at),
          }),
        ].filter(Boolean);
        lines.push(...block.map((l) => `> ${l}`));
        if (i < ledger.length - 1) lines.push('>');
      });
    }

    await ctx.editMessageText(renderMdHtml(lines.join('\n')), {
      parse_mode: 'HTML',
      reply_markup: depositsActionsKeyboard(ctx.lang),
    });
  });
}
