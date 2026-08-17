import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { AppCtx } from '../middleware/user.js';
import { listActiveProducts } from '../db/queries.js';
import {
  publicFeedBotUrl,
  publicSalesFeedChatId,
} from '../services/publicFeed.js';
import { escapeAttr, stripCustomEmojiTags } from '../services/premium.js';
import { logger } from '../logger.js';

const BUY_BUTTON_ICON_ID = '5440841102871517055';
const TAP_TO_BUY_ICON_ID = '6181460307001481584';
const PRODUCT_FALLBACK = '\u{1F4E6}';

function normalized(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isConfiguredFeedChat(ctx: AppCtx): boolean {
  const chat = ctx.chat;
  if (!chat) return false;
  const configured = publicSalesFeedChatId();
  if (!configured) return false;
  const username = 'username' in chat ? chat.username?.toLowerCase() : undefined;
  if (typeof configured === 'number') return chat.id === configured;
  const wanted = String(configured).replace(/^@/, '').toLowerCase();
  return username === wanted;
}

function productIconHtml(product: { emoji?: string | null; emoji_id?: string | null }): string {
  const glyph = product.emoji?.trim() ?? '';
  if (product.emoji_id) {
    const fallback = glyph || PRODUCT_FALLBACK;
    return `<tg-emoji emoji-id="${escapeAttr(product.emoji_id)}">${escapeAttr(fallback)}</tg-emoji>`;
  }
  if (!glyph || glyph === '\u{1F6D2}') return PRODUCT_FALLBACK;
  return escapeAttr(glyph);
}

export function registerPublicGroup(bot: Bot<AppCtx>): void {
  bot.on('message:text', async (ctx, next) => {
    const chatType = ctx.chat?.type;
    if (chatType !== 'group' && chatType !== 'supergroup') return next();
    if (!isConfiguredFeedChat(ctx)) return next();

    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return next();
    if (text.length < 3 || text.length > 80) return next();

    const needle = normalized(text);
    if (!needle) return next();
    const terms = needle.split(' ').filter((term) => term.length >= 2);
    if (terms.length === 0) return next();

    try {
      const { rows } = await listActiveProducts(0, 500);
      const matches = rows
        .filter((product) => product.unlimited_stock || product.stock > 0)
        .map((product) => {
          const hay = normalized(`${product.name} ${product.emoji ?? ''}`);
          const score = terms.reduce(
            (sum, term) => sum + (hay.includes(term) ? 1 : 0),
            0,
          );
          return { product, score };
        })
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
        .slice(0, 5);

      if (matches.length === 0) return next();

      const kb = new InlineKeyboard();
      for (const { product } of matches) {
        kb.url(
          `Buy ${product.name}`.replace(/\s+/g, ' ').slice(0, 64),
          publicFeedBotUrl(`prod_${product.id}`),
        );
        kb.icon(BUY_BUTTON_ICON_ID);
        kb.style('primary').row();
      }

      const productsText = matches.map(({ product }, index) => {
        const icon = productIconHtml(product);
        const name = `${icon} ${escapeAttr(product.name)}`;
        const end = index === matches.length - 1 ? '!' : ',';
        return `<b>${name} available now${end}</b>`;
      }).join(' ');
      const html = `${productsText} <tg-emoji emoji-id="${TAP_TO_BUY_ICON_ID}">\u{1F6CD}\u{FE0F}</tg-emoji> <b>Tap below to buy:</b>`;

      try {
        await ctx.reply(html, {
          parse_mode: 'HTML',
          reply_markup: kb,
          link_preview_options: { is_disabled: true },
        });
      } catch (err) {
        logger.warn({ err, chatId: ctx.chat.id }, 'premium product search reply failed');
        await ctx.reply(stripCustomEmojiTags(html), {
          parse_mode: 'HTML',
          reply_markup: kb,
          link_preview_options: { is_disabled: true },
        });
      }
      return;
    } catch (err) {
      logger.warn({ err, chatId: ctx.chat.id }, 'public group product search failed');
      return next();
    }
  });
}
