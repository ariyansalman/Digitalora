import type { Api } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { env } from '../env.js';
import { logger } from '../logger.js';
import { getProduct } from '../db/queries.js';
import {
  escapeAttr,
  renderHtmlTemplate,
  renderMdHtml,
  stripCustomEmojiTags,
} from './premium.js';
import { getEmoji } from './settings.js';
import { compactMoney } from '../ui/format.js';

type FeedButton = {
  text: string;
  url: string;
  iconKey: string;
};

const CART_FALLBACK = '\u{1F6D2}';
const PRODUCT_FALLBACK = '\u{1F4E6}';
const DIGITALORA_STOCK_CHAT = '@TigerStockChat';
let resolvedDigitaloraStockChatId: number | undefined;

export function publicFeedBotUrl(payload: string): string {
  const username = env.BOT_USERNAME.replace(/^@+/, '').trim();
  const start = encodeURIComponent(payload);
  return username ? `https://t.me/${username}?start=${start}` : `https://t.me/?start=${start}`;
}

export function publicFeedChatId(): string {
  return DIGITALORA_STOCK_CHAT;
}

export function publicSalesFeedChatId(): number | string | undefined {
  return env.PUBLIC_SALES_CHAT_ID;
}

async function resolveDigitaloraStockChat(api: Api): Promise<string | number> {
  if (resolvedDigitaloraStockChatId !== undefined) return resolvedDigitaloraStockChatId;
  try {
    const chat = await api.getChat(DIGITALORA_STOCK_CHAT);
    resolvedDigitaloraStockChatId = chat.id;
    return chat.id;
  } catch (err) {
    logger.warn({ err, chat: DIGITALORA_STOCK_CHAT }, 'publicFeed getChat failed; using username');
    return DIGITALORA_STOCK_CHAT;
  }
}

async function resolvePublicSalesChat(api: Api): Promise<string | number | undefined> {
  const configured = publicSalesFeedChatId();
  if (!configured) return undefined;
  if (typeof configured === 'number') return configured;
  try {
    const chat = await api.getChat(configured);
    return chat.id;
  } catch (err) {
    logger.warn({ err, chat: configured }, 'public sales feed getChat failed; using configured value');
    return configured;
  }
}

function maskId(id: number): string {
  const s = String(id);
  if (s.length <= 5) return s;
  return `${s.slice(0, 3)}***${s.slice(-2)}`;
}

/** Feed-specific compact money format (whole numbers drop the decimals). */
const money = compactMoney;

function premiumIconId(key: string): string | undefined {
  const spec = getEmoji(key);
  return typeof spec === 'object' && spec.custom_emoji_id ? spec.custom_emoji_id : undefined;
}

function feedKeyboard(button?: FeedButton): InlineKeyboard | undefined {
  if (!button) return undefined;
  const kb = new InlineKeyboard().url(button.text, button.url);
  const iconId = premiumIconId(button.iconKey);
  if (iconId) kb.icon(iconId);
  kb.style('primary');
  return kb;
}

function plainFeedKeyboard(button?: FeedButton): InlineKeyboard | undefined {
  return button ? new InlineKeyboard().url(button.text, button.url) : undefined;
}

async function sendRenderedHtml(api: Api, html: string, button?: FeedButton): Promise<void> {
  const chat = await resolveDigitaloraStockChat(api);
  await sendRenderedHtmlTo(api, chat, 'Digitalora Stock', html, button);
}

async function sendRenderedHtmlTo(
  api: Api,
  chat: string | number,
  label: string,
  html: string,
  button?: FeedButton,
): Promise<void> {
  const premiumKeyboard = feedKeyboard(button);
  const plainKeyboard = plainFeedKeyboard(button);
  const plainHtml = stripCustomEmojiTags(html);
  try {
    await api.sendMessage(chat, html, {
      parse_mode: 'HTML',
      ...(premiumKeyboard ? { reply_markup: premiumKeyboard } : {}),
      link_preview_options: { is_disabled: true },
    });
    return;
  } catch (err) {
    logger.warn(
      { err, chat },
      'publicFeed premium send failed; retrying with plain URL button',
    );
  }
  try {
    await api.sendMessage(chat, plainHtml, {
      parse_mode: 'HTML',
      ...(plainKeyboard ? { reply_markup: plainKeyboard } : {}),
      link_preview_options: { is_disabled: true },
    });
    return;
  } catch (retryErr) {
    logger.warn(
      { err: retryErr, chat },
      'publicFeed plain-button send failed; retrying without keyboard',
    );
  }
  try {
    await api.sendMessage(chat, plainHtml, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  } catch (finalErr) {
    logger.error({ err: finalErr, chat }, 'publicFeed delivery failed completely');
    try {
      await api.sendMessage(env.ADMIN_USER_ID, [
        `<b>${escapeAttr(label)} feed failed</b>`,
        '',
        `Destination: <code>${escapeAttr(String(chat))}</code>`,
        'Please confirm the bot is a member/admin and can post messages in that group.',
      ].join('\n'), {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
    } catch {
      // Never let a feed notification failure break the user action.
    }
  }
}

async function sendSalesHtml(api: Api, html: string, button?: FeedButton): Promise<void> {
  const chat = await resolvePublicSalesChat(api);
  if (!chat) return;
  await sendRenderedHtmlTo(api, chat, 'Public sales group', html, button);
}

function productIconHtml(product: { emoji?: string | null; emoji_id?: string | null } | null): string {
  const glyph = product?.emoji?.trim() ?? '';
  if (product?.emoji_id) {
    return `<tg-emoji emoji-id="${escapeAttr(product.emoji_id)}">${escapeAttr(glyph || PRODUCT_FALLBACK)}</tg-emoji>`;
  }
  if (glyph && glyph !== CART_FALLBACK) return escapeAttr(glyph);
  return PRODUCT_FALLBACK;
}

export async function notifyActiveReferral(api: Api, _args: {
  referrerName: string;
  totalReferrals: number;
  activeReferrals?: number;
  totalEarned: number;
}): Promise<void> {
  const active = Math.max(0, _args.activeReferrals ?? _args.totalReferrals);
  const html = renderHtmlTemplate(
    [
      '<blockquote>',
      '{feed_title} <b>New Active Referral!</b>',
      '',
      `{refer_user} <b>Referrer:</b> <b>${escapeAttr(_args.referrerName)}</b>`,
      `{refer_active} <b>Active Referrals:</b> <b>${active}</b>`,
      '</blockquote>',
    ].join('\n'),
  );
  await sendRenderedHtml(api, html, {
    text: 'Refer & Earn',
    iconKey: 'refer_title',
    url: publicFeedBotUrl('refer'),
  });
}

export async function notifyReferralAchievement(api: Api, args: {
  userId: number;
  amount: number;
}): Promise<void> {
  const body = [
    '<blockquote>',
    '{feed_title} <b>New Achievement!</b>',
    '',
    `{refer_user} <b>User:</b> <b>${maskId(args.userId)}</b>`,
    `{refer_coin} <b>Unlock:</b> <b>$${money(args.amount)}</b>`,
    '{refer_title} <b>Keep Inviting More To Earn More!</b>',
    '</blockquote>',
  ].join('\n');
  await sendRenderedHtml(api, renderHtmlTemplate(body), {
    text: 'Refer & Earn',
    iconKey: 'refer_title',
    url: publicFeedBotUrl('refer'),
  });
}

export async function notifyPurchase(api: Api, args: {
  buyerId: number;
  productId: number;
  productName: string;
  orderPublicId: string;
  qty: number;
  total: number;
  paidVia: string;
}): Promise<void> {
  const product = await getProduct(args.productId).catch(() => null);
  const glyph = product?.emoji?.trim() ?? '';
  const productIcon =
    product?.emoji_id
      ? `<tg-emoji emoji-id="${escapeAttr(product.emoji_id)}">${escapeAttr(glyph || CART_FALLBACK)}</tg-emoji> `
      : '{orders_product} ';
  const name = escapeAttr(args.productName);
  const html = renderHtmlTemplate(
    [
      '<blockquote>',
      '{feed_title} <b>New Purchase!</b>',
      '',
      `${productIcon}<b>Service:</b> <b>${name}</b>`,
      `{refer_user} <b>By:</b> <b>${maskId(args.buyerId)}</b>`,
      `{orders_product} <b>Plan:</b> <b>${name} [${escapeAttr(args.paidVia)}]</b>`,
      `{orders_id} <b>Order No.:</b> <b>${escapeAttr(args.orderPublicId)}</b>`,
      `{orders_qty} <b>QTY:</b> <b>${args.qty}</b>`,
      `{orders_total} <b>Total Purchase:</b> <b>${money(args.total)} USDT</b>`,
      '</blockquote>',
    ].join('\n'),
  );
  await sendRenderedHtml(api, html, {
    text: 'View Product',
    iconKey: 'feed_buy_button',
    url: publicFeedBotUrl(`prod_${args.productId}`),
  });
  await notifySalesPurchase(api, {
    productId: args.productId,
    productName: args.productName,
    qty: args.qty,
  });
}

export async function notifySalesPurchase(api: Api, args: {
  productId: number;
  productName: string;
  qty: number;
}): Promise<void> {
  const product = await getProduct(args.productId).catch(() => null);
  const productIcon = productIconHtml(product);
  const html = renderHtmlTemplate(
    `{broadcast_shop_now} Someone just bought <b>${args.qty}x</b> ${productIcon} <b>${escapeAttr(args.productName)}!</b>`,
  );
  await sendSalesHtml(api, html);
}

export async function notifyTopup(api: Api, args: {
  userId: number;
  amount: number;
  method: string;
}): Promise<void> {
  const html = renderHtmlTemplate([
    '<blockquote>',
    '{feed_title} <b>New Topup!</b>',
    '',
    `{refer_user} <b>User:</b> <b>${maskId(args.userId)}</b>`,
    `{gift_usdt} <b>Amount:</b> <b>${money(args.amount)} USDT</b>`,
    `{paymethod_others} <b>Method:</b> <b>${escapeAttr(args.method)}</b>`,
    '</blockquote>',
  ].join('\n'));
  await sendRenderedHtml(api, html, {
    text: 'Top-Up Wallet',
    iconKey: 'deposits_wallet',
    url: publicFeedBotUrl('topup'),
  });
}

export async function notifyWalletCredit(api: Api, args: {
  userId: number;
  amount: number;
  balanceAfter: number;
  reason: string;
}): Promise<void> {
  const html = renderHtmlTemplate([
    '<blockquote>',
    '{feed_title} <b>New Admin Wallet Credit!</b>',
    '',
    `{refer_user} <b>User:</b> <b>${maskId(args.userId)}</b>`,
    `{gift_usdt} <b>Amount:</b> <b>+${money(args.amount)} USDT</b>`,
    `{prod_wallet} <b>Wallet Balance:</b> <b>${money(args.balanceAfter)} USDT</b>`,
    `{orders_note} <b>Reason:</b> <b>${escapeAttr(args.reason)}</b>`,
    '</blockquote>',
  ].join('\n'));
  await sendRenderedHtml(api, html, {
    text: 'Open Wallet',
    iconKey: 'profile_header',
    url: publicFeedBotUrl('settings'),
  });
}

export async function notifyAnnouncement(api: Api, args: {
  text: string;
  format: 'md' | 'html';
  button?: { text: string; productId: number; iconKey?: string };
}): Promise<void> {
  const html =
    args.format === 'html'
      ? renderHtmlTemplate(args.text)
      : renderMdHtml(args.text);
  await sendRenderedHtml(
    api,
    html,
    args.button
      ? {
          text: args.button.text.slice(0, 64),
          iconKey: args.button.iconKey ?? 'broadcast_shop_now',
          url: publicFeedBotUrl(`prod_${args.button.productId}`),
        }
      : undefined,
  );
}

export async function notifySalesAnnouncement(api: Api, args: {
  text: string;
  format: 'md' | 'html';
  button?: { text: string; productId: number; iconKey?: string };
}): Promise<void> {
  const html =
    args.format === 'html'
      ? renderHtmlTemplate(args.text)
      : renderMdHtml(args.text);
  await sendSalesHtml(
    api,
    html,
    args.button
      ? {
          text: args.button.text.slice(0, 64),
          iconKey: args.button.iconKey ?? 'broadcast_shop_now',
          url: publicFeedBotUrl(`prod_${args.button.productId}`),
        }
      : undefined,
  );
}

export async function notifyStockAdded(api: Api, args: {
  productId: number;
  productName: string;
  productEmoji?: string | null;
  productEmojiId?: string | null;
  qtyAdded: number;
  available: number;
  price: number;
}): Promise<void> {
  const glyph = args.productEmoji?.trim() ?? '';
  const productIcon =
    glyph && args.productEmojiId
      ? `<tg-emoji emoji-id="${escapeAttr(args.productEmojiId)}">${escapeAttr(glyph)}</tg-emoji> `
      : glyph && glyph !== CART_FALLBACK
        ? `${escapeAttr(glyph)} `
        : '';
  const name = `${productIcon}${escapeAttr(args.productName)}`;
  const html = renderHtmlTemplate(
    [
      `<blockquote>{feed_title} <b>${args.qtyAdded} new stock added for ${name}!</b>`,
      '',
      `{refer_active} <b>Available:</b> ${args.available} items`,
      `{prod_price_base} <b>Price:</b> ${money(args.price)} USDT`,
      '</blockquote>',
    ].join('\n'),
  );
  await sendRenderedHtml(api, html, {
    text: `Buy ${args.productName}`.slice(0, 64),
    iconKey: 'feed_buy_button',
    url: publicFeedBotUrl(`prod_${args.productId}`),
  });
}
