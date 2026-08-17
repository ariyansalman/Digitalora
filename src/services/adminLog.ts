/**
 * Central "everything the admin needs to know" notification service.
 *
 * Every customer-facing action (orders, top-ups, email/region
 * changes, referrals, gift redemptions, language switches, support
 * sessions, PDF sends, etc.) routes through this module so admin
 * gets a single, consistent, parseable log feed in their DM.
 *
 * Format mirrors the deep-detail style requested by the shop owner:
 *
 *   [TAG] Event Title
 *
 *   📅 Logged At: 03 May 2026, 14:59 GMT+5:30
 *   🆔 <Resource> ID# :: ORDP8EQGT6AY
 *   Internal DB ID: 56
 *
 *   👤 User
 *   🆔 Telegram ID: 8004955979
 *   👤 User link: tg://user?id=8004955979
 *   🏷 Username: @Digitalora
 *
 *   <event-specific section>
 *
 * All sends are best-effort. A failed admin notification must NEVER
 * break a user-facing flow — every public function wraps its body in
 * try/catch and only logs at `warn` on failure.
 */
import type { Api, InputFile } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { env } from '../env.js';
import { logger } from '../logger.js';
import * as publicFeed from './publicFeed.js';
import { readSetting, setSetting } from '../db/queries.js';

/**
 * Shared user shape every event payload includes. Keep this small
 * so call sites never have to know about more than the basics.
 */
export type LogUser = {
  telegram_id: number;
  username: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

/**
 * Wall-clock formatter — IST (GMT+5:30) is the shop's home tz, so
 * matches the example log the user pasted (`03 May 2026, 14:59
 * GMT+5:30`). Kept as a constant here rather than reading env so
 * the log feed never silently shifts.
 */
const ADMIN_LOG_TZ = 'Asia/Kolkata';
const ADMIN_LOG_TZ_LABEL = 'GMT+5:30';

function formatLoggedAt(date: Date = new Date()): string {
  // 03 May 2026, 14:59
  const dt = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: ADMIN_LOG_TZ,
  })
    .format(date)
    // Intl uses ", " between date and time which is what we want.
    .replace(/,\s*/, ', ');
  return `${dt} ${ADMIN_LOG_TZ_LABEL}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function userBlock(u: LogUser): string[] {
  const lines: string[] = [];
  lines.push('👤 <b>User</b>');
  lines.push(`🆔 Telegram ID: <code>${u.telegram_id}</code>`);
  // Safer than tg://user — opens reliably in Telegram apps.
  lines.push(
    `👤 User link: <a href="tg://user?id=${u.telegram_id}">open profile</a>`,
  );
  lines.push(`🏷 Username: @${escapeHtml(u.username ?? '—')}`);
  if (u.first_name)
    lines.push(`📛 Name: ${escapeHtml(`${u.first_name}${u.last_name ? ' ' + u.last_name : ''}`)}`);
  if (u.email) lines.push(`📧 Email: <code>${escapeHtml(u.email)}</code>`);
  return lines;
}

/**
 * Compose the canonical [TAG]-prefixed admin log block. `headerLines`
 * is the per-event block above the user section (Tag, ID, Internal
 * DB ID, etc.); `bodyLines` is the per-event block below it.
 *
 * Every log block carries a tamper-evident `Source: bot` integrity
 * stamp wrapped in zero-width markers (`<i>`) so the admin can spot
 * a forwarded / spoofed message that didn't actually come from this
 * bot's process. The bot username is read from `BOT_USERNAME` env so
 * a hostile actor would have to also impersonate the username
 * registered with @BotFather — a strong signal the feed is genuine.
 */
function compose(args: {
  tag: string;
  title: string;
  headerLines?: string[];
  user: LogUser;
  bodyLines?: string[];
}): string {
  const { tag, title, headerLines = [], user, bodyLines = [] } = args;
  const out: string[] = [];
  out.push(`<b>[${tag}]</b> ${escapeHtml(title)}`);
  out.push('');
  out.push(`Tag: <code>${tag}</code>`);
  out.push(`📅 Logged At: ${formatLoggedAt()}`);
  for (const l of headerLines) out.push(l);
  out.push('');
  out.push(...userBlock(user));
  if (bodyLines.length > 0) {
    out.push('');
    out.push(...bodyLines);
  }
  out.push('');
  // Integrity / provenance stamp — every notification ends with this
  // line so the admin can quickly spot a forwarded or spoofed message.
  // The bot username comes from `BOT_USERNAME` (set in env); when
  // unset the line still carries the "Source: bot" anchor so the
  // shape stays stable.
  out.push(
    `<i>Source: bot • @${escapeHtml(env.BOT_USERNAME ?? '—')} • ${ADMIN_LOG_TZ_LABEL}</i>`,
  );
  return out.join('\n');
}

/**
 * Routing channels for the deep-detail log feed.
 *
 * - `main`   → `LOG_CHAT_ID`        (everything except orders)
 * - `orders` → `ORDER_LOG_CHAT_ID`  (only `logOrderCreated`)
 *
 * Either env var may be opt-out (resolved to `undefined` by the env
 * schema), in which case we walk the fallback chain in
 * `chatChain()` to pick the next-best destination — orders fall
 * through to the main channel, and the main channel falls through
 * to the admin DM. That ensures deep-detail notifications never
 * silently disappear even if a channel is mis-configured.
 */
type LogChannel = 'main' | 'orders';

type ChatId = number | string;

type NotificationMode = 'admin_only' | 'log_only' | 'admin_and_log';
export type AdminNotificationCategory =
  | 'orders' | 'payments' | 'users' | 'coupons_referrals' | 'inventory' | 'support' | 'system';

const NOTIFICATION_MODE_KEY = 'admin.notifications.mode';
const NOTIFICATION_EVENTS_KEY = 'admin.notifications.events';
const DEFAULT_NOTIFICATION_EVENTS: Record<AdminNotificationCategory, boolean> = {
  orders: true, payments: true, users: true, coupons_referrals: true,
  inventory: true, support: true, system: true,
};
let notificationCache: { mode: NotificationMode; events: Record<AdminNotificationCategory, boolean>; expiresAt: number } | undefined;

function normalizeNotificationMode(value: unknown): NotificationMode {
  return value === 'admin_only' || value === 'log_only' || value === 'admin_and_log'
    ? value : 'admin_and_log';
}
function normalizeNotificationEvents(value: unknown): Record<AdminNotificationCategory, boolean> {
  const obj = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return { ...DEFAULT_NOTIFICATION_EVENTS,
    ...Object.fromEntries((Object.keys(DEFAULT_NOTIFICATION_EVENTS) as AdminNotificationCategory[]).map(k => [k, obj[k] !== false])) };
}
async function getNotificationConfig() {
  if (notificationCache && notificationCache.expiresAt > Date.now()) return notificationCache;
  const [modeValue, eventsValue] = await Promise.all([
    readSetting(NOTIFICATION_MODE_KEY), readSetting(NOTIFICATION_EVENTS_KEY),
  ]);
  notificationCache = {
    mode: normalizeNotificationMode(modeValue),
    events: normalizeNotificationEvents(eventsValue),
    expiresAt: Date.now() + 30_000,
  };
  return notificationCache;
}
export async function getAdminNotificationSettings() {
  const c = await getNotificationConfig();
  return { mode: c.mode, events: { ...c.events } };
}
export async function setAdminNotificationMode(mode: NotificationMode, updatedBy?: number): Promise<void> {
  await setSetting(NOTIFICATION_MODE_KEY, mode, updatedBy); notificationCache = undefined;
}
export async function setAdminNotificationCategory(category: AdminNotificationCategory, enabled: boolean, updatedBy?: number): Promise<void> {
  const c = await getNotificationConfig();
  await setSetting(NOTIFICATION_EVENTS_KEY, { ...c.events, [category]: enabled }, updatedBy);
  notificationCache = undefined;
}
function categoryForTag(tag: string): AdminNotificationCategory {
  switch (tag) {
    case 'ORDER': case 'PREORDER': return 'orders';
    case 'TOPUP': case 'BALANCE': return 'payments';
    case 'START': return 'users';
    case 'REFER': case 'GIFT': return 'coupons_referrals';
    case 'SUPPLIER': return 'inventory';
    case 'SUPPORT': return 'support';
    default: return 'system';
  }
}


async function chatChain(channel: LogChannel, mode: NotificationMode): Promise<ChatId[]> {
  const seen = new Set<ChatId>(); const chain: ChatId[] = [];
  const push = (chat: ChatId | undefined) => { if (chat !== undefined && !seen.has(chat)) { seen.add(chat); chain.push(chat); } };
  if (mode !== 'admin_only') {
    if (channel === 'orders') { push(env.ORDER_LOG_CHAT_ID); push(env.LOG_CHAT_ID); }
    else push(env.LOG_CHAT_ID);
  }
  if (mode !== 'log_only') push(env.ADMIN_USER_ID);
  return chain;
}

async function send(
  api: Api,
  body: string,
  channel: LogChannel = 'main',
  replyMarkup?: InlineKeyboard,
): Promise<void> {
  const config = await getNotificationConfig();
  const tag = body.match(/^\[([^\]]+)\]/)?.[1] ?? 'SYSTEM';
  if (!config.events[categoryForTag(tag)]) return;
  const chain = await chatChain(channel, config.mode);
  for (let i = 0; i < chain.length; i++) {
    const chat = chain[i]!;
    try {
      await api.sendMessage(chat, body, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
      return;
    } catch (err) {
      logger.warn(
        { err, chat, channel, attempt: i + 1, total: chain.length },
        'adminLog: sendMessage failed',
      );
    }
  }
}

async function sendDocument(
  api: Api,
  file: InputFile,
  caption: string,
  channel: LogChannel = 'main',
): Promise<void> {
  const config = await getNotificationConfig();
  const tag = caption.match(/^\[([^\]]+)\]/)?.[1] ?? 'SYSTEM';
  if (!config.events[categoryForTag(tag)]) return;
  const chain = await chatChain(channel, config.mode);
  for (let i = 0; i < chain.length; i++) {
    const chat = chain[i]!;
    try {
      await api.sendDocument(chat, file, {
        caption,
        parse_mode: 'HTML',
      });
      return;
    } catch (err) {
      logger.warn(
        { err, chat, channel, attempt: i + 1, total: chain.length },
        'adminLog: sendDocument failed',
      );
    }
  }
}

// ---------------------------------------------------------------------------
//  Public API — one function per event tag.
// ---------------------------------------------------------------------------

export async function logFirstStart(api: Api, args: {
  user: LogUser;
  referralCode: string | null;
  referredBy: number | null;
}): Promise<void> {
  const body = compose({
    tag: 'START',
    title: 'New User Joined',
    user: args.user,
    bodyLines: [
      `🔗 Their referral code: <code>${args.referralCode ?? '—'}</code>`,
      `🤝 Referred by: ${args.referredBy ? `<code>${args.referredBy}</code>` : '—'}`,
    ],
  });
  await send(api, body);
}

export async function logOrderCreated(api: Api, args: {
  user: LogUser;
  orderDbId: number;
  orderPublicId: string;
  productId: number;
  productName: string;
  qty: number;
  unitPrice: number;
  total: number;
  paidVia: string;
  balanceAfter: number;
  lifecycle?: 'delivered' | 'preorder' | 'auto_delivered' | 'manual_pending';
}): Promise<void> {
  const preorder = args.lifecycle === 'preorder';
  const autoDelivered = args.lifecycle === 'auto_delivered';
  const manualPending = args.lifecycle === 'manual_pending';
  const body = compose({
    tag: preorder || autoDelivered ? 'PREORDER' : 'ORDER',
    title: preorder
      ? 'Preorder Placed - Delivery Remain'
      : autoDelivered
        ? 'Preorder Auto Delivered'
        : manualPending
          ? 'Order Paid - Buyer Details Pending'
          : 'Order Delivered',
    user: args.user,
    headerLines: [
      `🆔 Order ID# :: <code>${args.orderPublicId}</code>`,
      `Internal DB ID: ${args.orderDbId}`,
    ],
    bodyLines: [
      '📦 <b>Order</b>',
      `🆔 Product ID: ${args.productId}`,
      `Product: ${escapeHtml(args.productName)}`,
      `🔢 Quantity: ${args.qty} unit${args.qty === 1 ? '' : 's'}`,
      `Unit Price: ${args.unitPrice} USDT`,
      `💰 Total: ${args.total} USDT`,
      `Paid Via: ${escapeHtml(args.paidVia)}`,
      preorder ? 'Status: Preorder delivery remain until restock.' : '',
      autoDelivered ? 'Status: Automatic delivery completed after restock.' : '',
      manualPending ? 'Status: Waiting for buyer details and admin fulfillment.' : '',
      '',
      '👛 <b>Wallet</b>',
      `💳 Balance After: ${args.balanceAfter} USDT`,
    ],
  });
  // Orders go to the dedicated orders channel (`ORDER_LOG_CHAT_ID`),
  // falling back to `LOG_CHAT_ID` and finally the admin DM. Every
  // other event still goes straight to `LOG_CHAT_ID`.
  void publicFeed.notifyPurchase(api, {
    buyerId: args.user.telegram_id,
    productId: args.productId,
    productName: args.productName,
    orderPublicId: args.orderPublicId,
    qty: args.qty,
    total: args.total,
    paidVia: args.paidVia,
  });
  await send(api, body, 'orders');
}

export async function logSupplierOrderFailed(api: Api, args: {
  user: LogUser;
  orderDbId: number;
  orderPublicId: string;
  productId: number;
  productName: string;
  qty: number;
  total: number;
  paidVia: string;
  balanceAfter: number;
  supplierName: string;
  supplierProductId: string;
  reason: string;
  lowBalance: boolean;
}): Promise<void> {
  const body = compose({
    tag: 'SUPPLIER',
    title: args.lowBalance
      ? 'Supplier Balance Low - Send Manual'
      : 'Supplier Auto Delivery Failed - Send Manual',
    user: args.user,
    headerLines: [
      `🆔 Order ID# :: <code>${args.orderPublicId}</code>`,
      `Internal DB ID: ${args.orderDbId}`,
    ],
    bodyLines: [
      '🚨 <b>Supplier Auto Delivery Alert</b>',
      args.lowBalance
        ? '<b>Reason: supplier balance is low.</b>'
        : '<b>Reason: supplier API did not deliver.</b>',
      '',
      '📦 <b>Order</b>',
      `Product ID: ${args.productId}`,
      `Product: ${escapeHtml(args.productName)}`,
      `Quantity: ${args.qty} unit${args.qty === 1 ? '' : 's'}`,
      `Total: ${args.total} USDT`,
      `Paid Via: ${escapeHtml(args.paidVia)}`,
      '',
      '🔌 <b>Supplier</b>',
      `Name: ${escapeHtml(args.supplierName)}`,
      `Supplier Product ID: <code>${escapeHtml(args.supplierProductId)}</code>`,
      `Error: ${escapeHtml(clampForLog(args.reason, 700))}`,
      '',
      '🛠 <b>Action Needed:</b> send manual delivery to the buyer.',
      '',
      '👛 <b>Wallet</b>',
      `💳 Balance After: ${args.balanceAfter} USDT`,
    ],
  });
  const kb = new InlineKeyboard()
    .text('📦 Open Product', `adm:prod:edit:${args.productId}:0`)
    .row()
    .text('👤 Open User', `adm:usr:v:${args.user.telegram_id}`);
  await send(api, body, 'orders', kb);
}



/**
 * Hard cap user-pasted strings rendered into the admin feed so a
 * malicious paste (10k chars of HTML / control bytes) can't blow up
 * the message size or push past Telegram's 4096-char body limit. We
 * also strip control chars (`\u0000-\u001F` minus tab/CR/LF) and any
 * stray `<`/`>` survives through `escapeHtml()` so it can't smuggle
 * markup into the rendered card.
 */
function clampForLog(s: string, max = 256): string {
  // Strip control bytes other than \t \n \r — Telegram renders them
  // as garbage and they can be used to obfuscate copy-pasted refs.
  const cleaned = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  return cleaned.length > max ? cleaned.slice(0, max) + '…' : cleaned;
}

export async function logTopupSubmitted(api: Api, args: {
  user: LogUser;
  depositDbId: number;
  method: string;
  /** Auto-verify reference (on-chain tx hash). */
  reference: string;
  /** Optional reason auto-verify deferred to manual (verifier message). */
  reason?: string;
}): Promise<void> {
  // Defensive: even though `topup.ts` / `directPay.ts` cap and
  // sanitize their inputs before calling us, anyone calling this
  // helper from another path (or future code) inherits the same
  // protection here. `escapeHtml()` already neutralises markup; we
  // also strip control bytes and trim to 256 chars so a 10k paste
  // can't blow up the Telegram message body.
  const safeRef = escapeHtml(clampForLog(args.reference));
  const safeReason = args.reason ? escapeHtml(clampForLog(args.reason, 512)) : null;
  const body = compose({
    tag: 'TOPUP',
    // Make the auto-verify status front-and-centre so the admin can
    // tell at a glance whether they need to manually approve. The
    // [PRELIM] stamp goes right next to [TOPUP] in the title row so
    // it's never confused with an auto-verified entry.
    title: '[PRELIM ⚠️] Top-up Submitted — manual review required',
    user: args.user,
    headerLines: [`🆔 Deposit DB ID: ${args.depositDbId}`],
    bodyLines: [
      '💸 <b>Top-up</b>',
      `Method: ${escapeHtml(args.method)}`,
      `Reference: <code>${safeRef}</code>`,
      ...(safeReason ? [`Auto-verify deferred: ${safeReason}`] : []),
      '',
      '<b>⚠️ Status: NOT VERIFIED on-chain.</b> User-pasted reference only — confirm before approving.',
      '',
      '<i>Tap a button below to set the verified amount, then approve / reject without leaving this notification.</i>',
    ],
  });
  // One-tap approve / reject keyboard so the admin doesn't have to
  // open the full deposit list to action a manual-review entry.
  // Mirrors the per-row keyboard in `showDepositList()` (admin/index.ts):
  //   adm:dep:amt:N → set verified amount (required before Approve)
  //   adm:dep:ok:N  → approve + credit
  //   adm:dep:no:N  → reject
  const kb = new InlineKeyboard()
    .text(`💲 Set Amount #${args.depositDbId}`, `adm:dep:amt:${args.depositDbId}`)
    .row()
    .text(`✅ Approve #${args.depositDbId}`, `adm:dep:ok:${args.depositDbId}`)
    .text(`❌ Reject #${args.depositDbId}`, `adm:dep:no:${args.depositDbId}`);
  await send(api, body, 'main', kb);
}

export async function logTopupResolved(api: Api, args: {
  user: LogUser;
  depositDbId: number;
  method: string;
  amount: number;
  status: 'approved' | 'rejected';
  balanceAfter: number | null;
  /**
   * Telegram ID of the admin who resolved the deposit, or `0` for an
   * automated on-chain auto-verify resolution. The `0` sentinel is
   * also what flips the title prefix to `[VERIFIED ✅]`.
   */
  resolvedBy: number;
  /**
   * Optional on-chain reference (TXID / Order ID) the verifier
   * matched against. Surfaced to the admin so they can audit which
   * specific transaction was credited.
   */
  reference?: string | null;
  /**
   * Optional sender address pulled from the on-chain receipt
   * (`from` field of the chain TX). Surfaced so the admin can spot
   * unusual senders / cross-check a flagged customer.
   */
  sender?: string | null;
  /**
   * Optional on-chain block / receipt timestamp (ms since epoch)
   * pulled from the verifier. Distinct from `Logged At` (= now).
   */
  onChainTimestampMs?: number | null;
}): Promise<void> {
  // `resolvedBy === 0` is the agreed sentinel for "auto-verified by
  // the bot" (see `services/depositVerify.ts`). We translate that to
  // a [VERIFIED ✅] prefix on the title row so the admin can tell at
  // a glance whether they're looking at a chain-confirmed credit or
  // a manual approval. Anything else gets the [MANUAL] stamp.
  const isAuto = args.resolvedBy === 0;
  const stampedTitle =
    args.status === 'approved'
      ? `${isAuto ? '[VERIFIED ✅]' : '[MANUAL]'} Top-up Approved`
      : `${isAuto ? '[VERIFIED ✅]' : '[MANUAL]'} Top-up Rejected`;
  const safeRef = args.reference
    ? escapeHtml(clampForLog(args.reference))
    : null;
  const safeSender = args.sender ? escapeHtml(clampForLog(args.sender)) : null;
  const onChainAt =
    typeof args.onChainTimestampMs === 'number' &&
    Number.isFinite(args.onChainTimestampMs)
      ? formatLoggedAt(new Date(args.onChainTimestampMs))
      : null;
  const body = compose({
    tag: 'TOPUP',
    title: stampedTitle,
    user: args.user,
    headerLines: [
      `🆔 Deposit DB ID: ${args.depositDbId}`,
    ],
    bodyLines: [
      '💸 <b>Top-up</b>',
      `Method: ${escapeHtml(args.method)}`,
      `Amount: ${args.amount} USDT`,
      `Status: <b>${args.status}</b>`,
      // Surface the verification source explicitly (separate line —
      // some clients don't render the title prefix in
      // forwarded/quoted messages, so the body still tells the truth).
      `Verification: <b>${isAuto ? 'auto (on-chain)' : 'manual (admin)'}</b>`,
      ...(safeRef ? [`Reference: <code>${safeRef}</code>`] : []),
      ...(safeSender ? [`From sender: <code>${safeSender}</code>`] : []),
      ...(onChainAt ? [`On-chain time: ${onChainAt}`] : []),
      ...(args.balanceAfter !== null
        ? ['', '👛 <b>Wallet</b>', `💳 Balance After: ${args.balanceAfter} USDT`]
        : []),
      `Resolved By Admin: <code>${args.resolvedBy}</code>`,
    ],
  });
  if (args.status === 'approved') {
    void publicFeed.notifyTopup(api, {
      userId: args.user.telegram_id,
      amount: args.amount,
      method: args.method,
    });
  }
  await send(api, body);
}

export async function logBalanceChange(api: Api, args: {
  user: LogUser;
  delta: number;
  balanceAfter: number;
  reason: string;
  by: 'admin' | 'gift_code' | 'order' | 'topup' | 'refund' | 'referral';
}): Promise<void> {
  const sign = args.delta >= 0 ? '+' : '';
  const body = compose({
    tag: 'BALANCE',
    title: args.delta >= 0 ? 'Wallet Credited' : 'Wallet Debited',
    user: args.user,
    bodyLines: [
      '👛 <b>Wallet</b>',
      `Δ Change: ${sign}${args.delta} USDT`,
      `💳 Balance After: ${args.balanceAfter} USDT`,
      `Source: ${args.by}`,
      `Reason: ${escapeHtml(args.reason)}`,
    ],
  });
  if (args.by === 'admin' && args.delta > 0) {
    void publicFeed.notifyWalletCredit(api, {
      userId: args.user.telegram_id,
      amount: args.delta,
      balanceAfter: args.balanceAfter,
      reason: args.reason,
    });
  }
  await send(api, body);
}

export async function logEmail(api: Api, args: {
  user: LogUser;
  mode: 'set' | 'change' | 'delete';
  oldEmail: string | null;
  newEmail: string | null;
}): Promise<void> {
  const body = compose({
    tag: 'EMAIL',
    title:
      args.mode === 'set'
        ? 'Email Set'
        : args.mode === 'change'
          ? 'Email Changed'
          : 'Email Deleted',
    user: args.user,
    bodyLines: [
      '📧 <b>Invoice Email</b>',
      `Mode: ${args.mode}`,
      `From: ${args.oldEmail ? `<code>${escapeHtml(args.oldEmail)}</code>` : '—'}`,
      `To: ${args.newEmail ? `<code>${escapeHtml(args.newEmail)}</code>` : '—'}`,
    ],
  });
  await send(api, body);
}

export async function logRegion(api: Api, args: {
  user: LogUser;
  mode: 'set' | 'clear';
  region: string | null;
  timezone: string | null;
}): Promise<void> {
  const body = compose({
    tag: 'REGION',
    title: args.mode === 'set' ? 'Region Set' : 'Region Cleared',
    user: args.user,
    bodyLines: [
      '🗺 <b>Region</b>',
      `Region: ${args.region ? escapeHtml(args.region) : '—'}`,
      `Timezone: ${args.timezone ? escapeHtml(args.timezone) : '—'}`,
    ],
  });
  await send(api, body);
}

export async function logRefer(api: Api, args: {
  user: LogUser;
  refCode: string;
  referralLink: string;
  totalReferrals: number;
}): Promise<void> {
  const body = compose({
    tag: 'REFER',
    title: 'Referral Link Copied / Shared',
    user: args.user,
    bodyLines: [
      '🎁 <b>Referral</b>',
      `Code: <code>${escapeHtml(args.refCode)}</code>`,
      `Link: ${escapeHtml(args.referralLink)}`,
      `Total referrals so far: ${args.totalReferrals}`,
    ],
  });
  await send(api, body);
}

export async function logGiftRedeem(api: Api, args: {
  user: LogUser;
  code: string;
  amount: number;
  balanceAfter: number;
}): Promise<void> {
  const body = compose({
    tag: 'GIFT',
    title: 'Gift Code Redeemed',
    user: args.user,
    bodyLines: [
      '🎟 <b>Gift Code</b>',
      `Code: <code>${escapeHtml(args.code)}</code>`,
      `Amount: ${args.amount} USDT`,
      '',
      '👛 <b>Wallet</b>',
      `💳 Balance After: ${args.balanceAfter} USDT`,
    ],
  });
  await send(api, body);
}

export async function logLanguageChange(api: Api, args: {
  user: LogUser;
  oldLang: string | null;
  newLang: string;
}): Promise<void> {
  const body = compose({
    tag: 'LANG',
    title: 'Language Changed',
    user: args.user,
    bodyLines: [
      `From: ${args.oldLang ?? '—'}`,
      `To: ${args.newLang}`,
    ],
  });
  await send(api, body);
}

export async function logNotificationToggle(api: Api, args: {
  user: LogUser;
  channel: 'stock' | 'announcements' | 'wallet' | 'email_reports';
  enabled: boolean;
}): Promise<void> {
  const body = compose({
    tag: 'NOTIF',
    title: `${args.enabled ? 'Enabled' : 'Disabled'} ${args.channel} notifications`,
    user: args.user,
    bodyLines: [
      `Channel: <b>${args.channel}</b>`,
      `New state: <b>${args.enabled ? 'ON' : 'OFF'}</b>`,
    ],
  });
  await send(api, body);
}

export async function logSupportStart(api: Api, args: {
  user: LogUser;
  userTopicId: number | undefined;
  adminTopicId: number | undefined;
}): Promise<void> {
  const body = compose({
    tag: 'SUPPORT',
    title: 'Live Support Started',
    user: args.user,
    bodyLines: [
      '🆘 <b>Live Support</b>',
      `User-side topic id: ${args.userTopicId ?? '—'}`,
      `Admin-side topic id: ${args.adminTopicId ?? '—'}`,
    ],
  });
  await send(api, body);
}

export async function logSupportEnd(api: Api, args: {
  user: LogUser;
  endedBy: 'user' | 'admin';
  durationSeconds: number;
  messageCount: number;
}): Promise<void> {
  const body = compose({
    tag: 'SUPPORT',
    title: `Live Support Ended (by ${args.endedBy})`,
    user: args.user,
    bodyLines: [
      '🆘 <b>Live Support</b>',
      `Duration: ${Math.floor(args.durationSeconds / 60)}m ${args.durationSeconds % 60}s`,
      `Total messages exchanged: ${args.messageCount}`,
    ],
  });
  await send(api, body);
}

export async function logPdfSent(api: Api, args: {
  user: LogUser;
  kind: 'orders' | 'deposits' | 'stats' | 'support';
  destinationEmail: string;
  rowCount: number;
}): Promise<void> {
  const body = compose({
    tag: 'PDF',
    title: `${args.kind} PDF generated & emailed`,
    user: args.user,
    bodyLines: [
      '📄 <b>PDF Report</b>',
      `Kind: <b>${args.kind}</b>`,
      `📧 Destination email: <code>${escapeHtml(args.destinationEmail)}</code>`,
      `Rows in report: ${args.rowCount}`,
    ],
  });
  await send(api, body);
}

/**
 * Notify the admin every time the Kiwi AI provider call fails so
 * the operator can spot a misconfigured key, wrong model id, hit
 * quota, etc. without needing access to Render / Railway logs. The
 * user only ever sees the short retry message — the full upstream
 * error body and provider identity stays in the admin feed.
 */
export async function logAiError(api: Api, args: {
  user: LogUser;
  provider: string;
  model: string;
  status?: number | string;
  errorMessage: string;
  question: string;
}): Promise<void> {
  const status = args.status === undefined ? '—' : String(args.status);
  const trimmedQ = args.question.length > 200
    ? args.question.slice(0, 200) + '…'
    : args.question;
  const trimmedErr = args.errorMessage.length > 800
    ? args.errorMessage.slice(0, 800) + '…'
    : args.errorMessage;
  const body = compose({
    tag: 'AI',
    title: 'Kiwi AI provider call failed',
    user: args.user,
    bodyLines: [
      '🤖 <b>AI Failure</b>',
      `Provider: <code>${escapeHtml(args.provider)}</code>`,
      `Model: <code>${escapeHtml(args.model)}</code>`,
      `Status: <code>${escapeHtml(status)}</code>`,
      `Question: ${escapeHtml(trimmedQ)}`,
      `Error: <code>${escapeHtml(trimmedErr)}</code>`,
    ],
  });
  await send(api, body);
}

export async function logSupportTranscript(api: Api, args: {
  user: LogUser;
  durationSeconds: number;
  messageCount: number;
  pdf: InputFile;
}): Promise<void> {
  const caption = compose({
    tag: 'SUPPORT',
    title: 'Live Support — Full Transcript (PDF)',
    user: args.user,
    bodyLines: [
      '📄 <b>Transcript</b>',
      `Duration: ${Math.floor(args.durationSeconds / 60)}m ${args.durationSeconds % 60}s`,
      `Total messages: ${args.messageCount}`,
    ],
  });
  await sendDocument(api, args.pdf, caption);
}
