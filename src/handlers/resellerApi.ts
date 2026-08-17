import type { Composer } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { EMOJI } from '../../config/index.js';
import type { AppCtx } from '../middleware/user.js';
import {
  apiBaseUrl,
  disableApiKey,
  generateApiKey,
  getApiStatus,
  type ApiStatus,
} from '../services/resellerApi.js';
import { renderMdHtml } from '../services/premium.js';
import { logger } from '../logger.js';
import { money } from '../ui/format.js';

function mask(prefix: string | null): string {
  return prefix ? `${prefix}••••••••` : '—';
}

function premiumIconId(key: string): string | undefined {
  const spec = EMOJI[key];
  return typeof spec === 'object' ? spec.custom_emoji_id : undefined;
}

function premiumButton(
  kb: InlineKeyboard,
  emojiKey: string,
  style: 'primary' | 'success' | 'danger' = 'primary',
): void {
  const iconId = premiumIconId(emojiKey);
  if (iconId) kb.icon(iconId);
  kb.style(style);
}

const API_BUTTON_ICON_IDS = {
  // Owner-provided premium emoji ids for the reseller API panel buttons.
  key: '5375338737028841420',
  disable: '5040042498634810056',
  docs: '5042306247047513767',
  refresh: '5980787993139481991',
} as const;

function premiumButtonId(
  kb: InlineKeyboard,
  iconId: string,
  style: 'primary' | 'success' | 'danger' = 'primary',
): void {
  kb.icon(iconId);
  kb.style(style);
}

function panelKeyboard(status: ApiStatus): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (status.active) {
    kb.text('Regenerate Key', 'api:generate');
    premiumButtonId(kb, API_BUTTON_ICON_IDS.key, 'primary');
    kb.row();
    kb.text('Disable API', 'api:disable');
    premiumButtonId(kb, API_BUTTON_ICON_IDS.disable, 'danger');
  } else {
    kb.text('Generate New API Key', 'api:generate');
    premiumButtonId(kb, API_BUTTON_ICON_IDS.key, 'success');
  }
  kb.row();
  kb.text('View API Documentation', 'api:docs');
  premiumButtonId(kb, API_BUTTON_ICON_IDS.docs, 'primary');
  kb.row();
  kb.text('Refresh', 'api:open');
  premiumButtonId(kb, API_BUTTON_ICON_IDS.refresh, 'primary');
  kb.row();
  kb.text('Back to Settings', 'profile:open');
  premiumButton(kb, 'profile_header', 'primary');
  return kb;
}

function apiErrorKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.url(
    'Open Migration File',
    'https://github.com/safwandeveloper/DigitaloraBot/blob/main/supabase/migrations/0036_reseller_api.sql',
  );
  premiumButton(kb, 'orders_note', 'primary');
  kb.row();
  kb.text('Back to Settings', 'profile:open');
  premiumButton(kb, 'profile_header', 'primary');
  return kb;
}

function looksLikeMissingMigration(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  const body = [e?.code, e?.message, e?.details, e?.hint].map(String).join(' ');
  return (
    body.includes('42P01') ||
    body.includes('42703') ||
    /reseller_api_(keys|orders)/i.test(body) ||
    /relation .* does not exist/i.test(body) ||
    /schema cache/i.test(body)
  );
}

async function showApiError(ctx: AppCtx, err: unknown): Promise<void> {
  logger.error({ err }, 'reseller API panel failed');
  const migrationHint = looksLikeMissingMigration(err);
  const text = migrationHint
    ? [
        '{api_key} *API Dashboard Not Ready*',
        '',
        'Run this Supabase migration first:',
        '`supabase/migrations/0036_reseller_api.sql`',
        '',
        '*Important:* open that file and paste the SQL contents in Supabase SQL Editor. Do not paste only the file path.',
      ].join('\n')
    : [
        '{api_key} *API panel failed to load*',
        '',
        'Tap Refresh once. If it still fails, check Railway logs for the exact API error.',
      ].join('\n');
  const html = renderMdHtml(text);
  const reply_markup = migrationHint
    ? apiErrorKeyboard()
    : panelKeyboard({
        active: false,
        keyPrefix: null,
        createdAt: null,
        lastUsedAt: null,
        balance: Number(ctx.user.balance ?? 0),
        orders: 0,
        totalSpent: 0,
        recentSpent: 0,
      });
  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(html, {
        parse_mode: 'HTML',
        reply_markup,
        link_preview_options: { is_disabled: true },
      });
      return;
    } catch {
      // If Telegram refuses to edit the old message, send a fresh one
      // so the user is never left with a spinning button.
    }
  }
  await ctx.reply(html, {
    parse_mode: 'HTML',
    reply_markup,
    link_preview_options: { is_disabled: true },
  });
}

function apiPanelText(status: ApiStatus, newKey?: string): string {
  const endpoint = apiBaseUrl();
  const lines = [
    '{api_key} *Reseller Product API*',
    '',
    'Connect your own bot, website, or reseller panel to this shop. Orders are delivered from live stock and paid from your wallet balance.',
    '',
    `${status.active ? '{notify_on}' : '{notify_off}'} *Status:* ${status.active ? 'Connected' : 'No active key'}`,
    `{profile_balance} *API Balance:* ${money(status.balance)} USDT`,
    `{stats_orders} *Total API Orders:* ${status.orders}`,
    `{stats_spent} *Recent Spend:* ${money(status.recentSpent)} USDT`,
    `{api_key} *Current Key:* \`${mask(status.keyPrefix)}\``,
    '',
    '*Available actions*',
    '{orders_title} Product list: `GET /api/products`',
    '{profile_balance} Balance check: `GET /api/balance`',
    '{deposits_wallet} Place order: `POST /api/order`',
    '',
    '*Endpoint URL*',
    `\`${endpoint}\``,
  ];
  if (newKey) {
    lines.push(
      '',
      '{api_key} *Your new API key*',
      `> ${newKey}`,
      '',
      '_Copy it now. For safety, the full key is shown only once._',
    );
  }
  return lines.join('\n');
}

function docsText(): string {
  const endpoint = apiBaseUrl();
  return [
    '{api_key} *API Documentation*',
    '',
    '*Authentication*',
    'Send your key in one of these ways:',
    '{api_key} `Authorization: Bearer YOUR_KEY`',
    '{api_key} `x-api-key: YOUR_KEY`',
    '{api_key} Query-string API keys are disabled by default for security.',
    '',
    '{orders_title} *Product List*',
    `GET \`${endpoint}/products\``,
    '',
    '{profile_balance} *Balance*',
    `GET \`${endpoint}/balance\``,
    '',
    '{deposits_wallet} *Place Order*',
    `POST \`${endpoint}/order\``,
    '',
    '*JSON body:*',
    '`{ "product_id": 123, "quantity": 1, "request_id": "my-order-001" }`',
    '',
    'The API returns delivered items in JSON. Wallet balance is deducted only when the order is completed.',
  ].join('\n');
}

async function showApiPanel(ctx: AppCtx, newKey?: string): Promise<void> {
  try {
    const status = await getApiStatus(ctx.user.telegram_id);
    const html = renderMdHtml(apiPanelText(status, newKey));
    const reply_markup = panelKeyboard(status);
    if (ctx.callbackQuery) {
      await ctx.editMessageText(html, {
        parse_mode: 'HTML',
        reply_markup,
        link_preview_options: { is_disabled: true },
      });
      return;
    }
    await ctx.reply(html, {
      parse_mode: 'HTML',
      reply_markup,
      link_preview_options: { is_disabled: true },
    });
  } catch (err) {
    await showApiError(ctx, err);
  }
}

export function registerResellerApi(bot: Composer<AppCtx>): void {
  bot.command(['api', 'apikey'], async (ctx) => {
    await showApiPanel(ctx);
  });

  bot.callbackQuery('api:open', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showApiPanel(ctx);
  });

  bot.callbackQuery('api:generate', async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Generating API key...' });
    try {
      const generated = await generateApiKey(ctx.user.telegram_id);
      await showApiPanel(ctx, generated.key);
    } catch (err) {
      await showApiError(ctx, err);
    }
  });

  bot.callbackQuery('api:disable', async (ctx) => {
    try {
      await disableApiKey(ctx.user.telegram_id);
      await ctx.answerCallbackQuery({ text: 'API key disabled.' });
      await showApiPanel(ctx);
    } catch (err) {
      await ctx.answerCallbackQuery({ text: 'API action failed.' });
      await showApiError(ctx, err);
    }
  });

  bot.callbackQuery('api:docs', async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard();
    kb.text('API Panel', 'api:open');
    premiumButtonId(kb, API_BUTTON_ICON_IDS.key, 'primary');
    kb.row();
    kb.text('Back to Settings', 'profile:open');
    premiumButton(kb, 'profile_header', 'primary');
    await ctx.editMessageText(renderMdHtml(docsText()), {
      parse_mode: 'HTML',
      reply_markup: kb,
      link_preview_options: { is_disabled: true },
    });
  });
}
