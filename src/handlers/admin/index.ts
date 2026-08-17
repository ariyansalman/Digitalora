/**
 * Admin dashboard — fully button-driven.
 *
 * Entry: /admin (admin only). Everything else happens via inline
 * buttons + multi-step text input collected through `session.adminFlow`.
 */
import { Composer, InlineKeyboard, InputFile, type MiddlewareFn } from 'grammy';
import type { MessageEntity } from 'grammy/types';
import { inlineBtn } from '../../keyboards/helpers.js';
import {
  addCategory,
  addPaymentMethod,
  addProduct,
  adjustBalance,
  deleteCategory,
  deletePaymentMethod,
  setPaymentMethodColor,
  setPaymentMethodIcon,
  deleteProduct,
  demoteAdmin,
  findAdjacentProduct,
  findUserById,
  findUserByUsername,
  getDeposit,
  getOrder,
  getCategory,
  getProductSales,
  getProductSalesSince,
  getRangeStats,
  getStats,
  getUserOrderSummary,
  getOrCreateCategory,
  isAdmin,
  listAllOrders,
  listOrderStatusEvents,
  updateOrderLifecycle,
  OrderTransitionError,
  listOrdersForProduct,
  listOrdersPaginated,
  listAllCategories,
  listAllProducts,
  listAllPendingDeposits,
  listPaymentMethods,
  listPendingDeposits,
  listRecentUsers,
  listUsersForAnnouncement,
  promoteAdmin,
  banUser,
  unbanUser,
  listUserPriceOverrides,
  listAllPriceOverrides,
  setUserProductPrice,
  clearUserProductPrice,
  clearAllUserPriceOverrides,
  countProductPriceOverrides,
  clearAllProductPriceOverrides,
  addReferralAdjustment,
  getReferralBalance,
  listReferralAdminRows,
  resetReferralUsage,
  getProduct,
  setDepositAmount,
  approveDepositAtomic,
  rejectDepositAtomic,
  setDepositStatus,
  setProductActive,
  swapProductOrder,
  setProductPinned,
  moveProductToTop,
  moveProductToBottom,
  unstashSortOrder,
  createGiftCode,
  deleteGiftCode,
  listGiftCodes,
  getGiftCode,
  countGiftCodeRedemptions,
  addPromo,
  addTieredPromo,
  listPromos,
  listAllPromos,
  getPromo,
  getPromoImpact,
  updatePromo,
  replacePromoTiers,
  deletePromo,
  addPromoExclusion,
  removePromoExclusion,
  updateProduct,
  addProductItems,
  countAvailableProductItems,
  getProductInventoryStats,
  setProductLowStockThreshold,
  listAvailableProductItems,
  clearProductItems,
  deleteProductItem,
  setOrderDeliveredItems,
  markOrderLifecycleSafe,
  syncProductStockToPool,
  setDepositNote,
  changeProductId,
  createSupplierApiSource,
  deleteSupplierApiSource,
  deleteSupplierProductLink,
  getSupplierApiSource,
  getSupplierProductLinkByProduct,
  listSupplierApiSources,
  listSupplierOrderLogs,
  listSupplierProductLinks,
  updateSupplierApiSource,
  updateSupplierProductLink,
  upsertSupplierProductLink,
} from '../../db/queries.js';
import { verifyAndCreditDeposit } from '../../services/depositVerify.js';
import {
  isValidTronAddress,
  isValidBscAddress,
  isValidTonAddress,
  isValidLtcAddress,
} from '../../services/chainVerify.js';
import * as cache from '../../services/cache.js';
import {
  setColor,
  setEmoji,
  setText,
  refreshSettings,
  setChannelUrl,
  clearChannelUrl,
  getChannelUrl,
  getForceJoinEnabled,
  setForceJoinEnabled,
  getApiPriceAlertsEnabled,
  setApiPriceAlertsEnabled,
  getEmoji,
  getButtonColor,
  getButtonIcon,
  setButtonIcon,
  clearButtonIcon,
  setBotTutorialField,
  getBotTutorial,
  type BotTutorial,
  getPaymentMethodTutorial,
  setPaymentMethodTutorialField,
  clearPaymentMethodTutorial,
  getColorPrefix,
  setColorPrefix,
  clearColorPrefix,
  getCategoryColor,
  setCategoryColor,
  getCategoryDefaultColor,
  setCategoryDefaultColor,
  getProductColor,
  setProductColor,
  clearProductColor,
} from '../../services/settings.js';
import {
  FORMAT_ENTITY_TYPES,
  entitiesToHtml,
  injectCustomEmojiMarkers,
  renderHtmlTemplate,
  renderMdHtml,
  stripCustomEmojiTags,
} from '../../services/premium.js';
import { t as translate } from '../../i18n/index.js';
import {
  ADMIN_SETTABLE_STATUSES,
  DELIVERY_STATUS_LABELS,
  FULFILLMENT_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  adminTransitionsFor,
  normalizeOrderStatus,
  orderStatusLabel,
  resolveOrderLifecycle,
  sanitizeSupplierStatus,
  type OrderStatus,
} from '../../core/orderLifecycle.js';
import * as adminLog from '../../services/adminLog.js';
import { getAdminNotificationSettings, setAdminNotificationCategory, setAdminNotificationMode, type AdminNotificationCategory } from '../../services/adminLog.js';
import { fulfilOrderForDeposit } from '../../services/orderFulfill.js';
import * as publicFeed from '../../services/publicFeed.js';
import { notifyApiPriceChange } from '../../services/priceAlert.js';
import { describeMailerStatus, sendWelcomeEmail } from '../../services/mailer.js';
import { fulfillPendingPreordersForProduct } from '../../services/preorder.js';
import { buildOrderDeliveredChunks } from '../../services/orderRender.js';
import { publicOrderId } from '../../services/orderId.js';
import {
  completeManualDelivery,
  maybeStartDeliveryFormFromApi,
  sendManualDeliveryMessage,
} from '../../services/postPurchaseDelivery.js';
import {
  apiBaseUrl,
  disableApiKey,
  getAdminApiOverview,
  getAdminApiUser,
  listAdminApiOrders,
  listAdminApiUsers,
} from '../../services/resellerApi.js';
import {
  isSupplierMigrationError,
  canbosoSupplierConfig,
  fetchSupplierProducts,
  importSupplierProduct,
  parseSupplierLinkConfig,
  parseSupplierSourceConfig,
  supabaseResellerSupplierConfig,
  supplierSellPrice,
  syncSupplierProductLink,
  testSupplierConnection,
  vexResellerSupplierConfig,
  type SupplierCatalogProduct,
} from '../../services/supplierApi.js';
import type { ColorMode } from '../../../config/index.js';
import { BUTTON_KEYS, COLOR_PREFIX, EMOJI, colorModeToStyle } from '../../../config/index.js';
import type { AppCtx } from '../../middleware/user.js';
import { ADMIN_NAV, addAdminBackRow, buildAdminRootMenu } from './navigation.js';
import { logger } from '../../logger.js';
import {
  apiMoney,
  apiDate,
  apiUserLabel,
  buyerHandle,
  isPendingPreorderOrder,
  supplierProductFilter,
  supplierStockLabel,
  supplierImportActive,
  supplierImportCategory,
  supplierImportUsesGroupCategory,
  supplierGroupCategoryName,
} from './helpers.js';
import { env } from '../../env.js';
import type { DBOrder, DBUser, DBPromo, DBProduct, DBSupplierApiSource, DBSupplierProductLink } from '../../types.js';
import { getAdminAnalytics } from '../../services/analytics.js';
import {
  inventoryLine,
  lowStockBadge,
  listLowStockProducts,
  DEFAULT_LOW_STOCK_THRESHOLD,
} from '../../services/inventory.js';

export const adminBot = new Composer<AppCtx>();

async function autoFulfillPreordersAfterRestock(
  ctx: AppCtx,
  productId: number,
): Promise<void> {
  try {
    const result = await fulfillPendingPreordersForProduct(ctx.api, productId);
    if (result.fulfilled > 0) {
      await ctx.reply(
        `✅ Auto-delivered ${result.fulfilled} pending preorder(s) for product #${productId}.`,
      );
    }
  } catch (err) {
    logger.warn({ err, productId }, 'autoFulfillPreordersAfterRestock failed');
  }
}

async function notifyPublicStockAdded(
  ctx: AppCtx,
  productId: number,
  qtyAdded: number,
): Promise<void> {
  if (qtyAdded <= 0) return;
  const product = await getProduct(productId);
  if (!product) return;
  await publicFeed.notifyStockAdded(ctx.api, {
    productId,
    productName: product.name,
    productEmoji: product.emoji,
    productEmojiId: product.emoji_id,
    qtyAdded,
    available: product.stock,
    price: product.price,
  });
}

/**
 * Gate that ONLY blocks explicit admin invocations (commands and
 * `adm:` callback queries) for non-admins. Other updates pass through
 * untouched so non-admin users never see the "⛔ Admin only" reply
 * for ordinary chat messages.
 */
const requireAdmin: MiddlewareFn<AppCtx> = async (ctx, next) => {
  if (!ctx.from || !(await isAdmin(ctx.from.id))) {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: '⛔ Admin only.', show_alert: true });
    } else {
      await ctx.reply('⛔ Admin only.');
    }
    return;
  }
  return next();
};

// Apply requireAdmin only to admin entry points.
adminBot.callbackQuery(/^adm:/, requireAdmin, async (_ctx, next) => next());
adminBot.command(
  ['admin', 'settext', 'setcolor', 'setemoji', 'clearcache', 'reload', 'mailerstatus', 'testemail', 'promo'],
  requireAdmin,
  async (_ctx, next) => next(),
);

const PER_PAGE = 8;
const ROOT_TEXT = ADMIN_NAV.root;
const rootMenu = buildAdminRootMenu;
const backRow = addAdminBackRow;

/** Tiny HTML-entity escape for use inside `parse_mode: 'HTML'` strings. */
function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
}

async function showRoot(ctx: AppCtx, asReply = false): Promise<void> {
  ctx.session.adminFlow = undefined;
  if (asReply || !ctx.callbackQuery) {
    await ctx.reply(ROOT_TEXT, { parse_mode: 'Markdown', reply_markup: rootMenu() });
  } else {
    await ctx.editMessageText(ROOT_TEXT, { parse_mode: 'Markdown', reply_markup: rootMenu() });
  }
}

adminBot.command('admin', (ctx) => showRoot(ctx, true));

adminBot.callbackQuery('adm:root', async (ctx) => {
  await ctx.answerCallbackQuery();
  await showRoot(ctx);
});

// ---------- Dashboard ----------
// The dashboard is intentionally a short operational snapshot. Detailed
// time-range analytics remain under Reports, while all-time totals come from
// the same source used by the existing Stats screen.
async function showAdminDashboard(ctx: AppCtx): Promise<void> {
  const [allTime, today] = await Promise.all([getStats(), getAdminAnalytics(1)]);
  const lines = [
    '📊 *Dashboard*',
    '',
    '*Business overview*',
    `👥 Users: *${allTime.users}*`,
    `📦 Orders: *${allTime.orders}*`,
    `💰 Revenue: *$${allTime.revenue.toFixed(2)}*`,
    '',
    '*Today & attention*',
    `⏳ Pending Payments: *${allTime.pending_deposits}*`,
    `🟠 Low Stock: *${today.lowStock}*`,
    `❌ Failed Payments: *${today.failedPayments}*`,
    `🛒 Today's Sales: *$${today.revenue.toFixed(2)}*`,
    '',
    '_Tap Reports for trends and product-level performance._',
  ];
  const kb = new InlineKeyboard()
    .text('📈 Reports', 'adm:analytics')
    .text('🔄 Refresh', 'adm:dashboard')
    .row()
    .text('⬅️ Back', 'adm:root');
  await ctx.editMessageText(lines.join('\n'), {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
}

adminBot.callbackQuery('adm:dashboard', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = undefined;
  await showAdminDashboard(ctx);
});

// ---------- Inventory ----------
async function showInventoryOverview(ctx: AppCtx): Promise<void> {
  const [analytics, lowStockRows] = await Promise.all([
    getAdminAnalytics(1),
    listLowStockProducts(12).catch(() => []),
  ]);
  const lines = [
    '📦 *Inventory*',
    '',
    `🟠 Low stock: *${analytics.lowStock}*`,
    `🔴 Out of stock: *${analytics.outOfStock}*`,
    '',
    ...(lowStockRows.length > 0
      ? lowStockRows.map(
          (row) =>
            `• #${row.product_id} ${escapeMd(row.name)} — *${row.available}* available · alert ≤ *${row.low_stock_threshold}*`,
        )
      : ['_No low-stock products right now._']),
    '',
    '_Use Products → List & Manage to edit stock, item pools, and thresholds._',
  ];
  const kb = new InlineKeyboard()
    .text('🛍️ Manage Products', 'adm:prod')
    .text('🔄 Refresh', 'adm:inventory')
    .row()
    .text('⬅️ Back', 'adm:root');
  await ctx.editMessageText(lines.join('\n'), {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
}

adminBot.callbackQuery('adm:inventory', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = undefined;
  await showInventoryOverview(ctx);
});

// ---------- System Health ----------
async function showSystemHealth(ctx: AppCtx): Promise<void> {
  const check = (ready: boolean): string => (ready ? '🟢 Configured' : '⚪ Not configured');
  const lines = [
    '🩺 *System Health*',
    '',
    `🤖 Bot runtime: *🟢 Online*`,
    `🗄 Supabase connection: *${check(Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY))}*`,
    `🌐 HTTP mode: *${env.BOT_MODE}*`,
    `🔗 Public base URL: *${check(Boolean(env.PUBLIC_BASE_URL))}*`,
    `🪝 Telegram webhook: *${check(env.BOT_MODE === 'webhook' && Boolean(env.WEBHOOK_URL))}*`,
    `💳 Crypto Pay webhook: *${check(Boolean(env.PUBLIC_BASE_URL && env.CRYPTOBOT_API_TOKEN))}*`,
    `📧 Email delivery: *${check(Boolean(env.SMTP_HOST || env.RESEND_API_KEY))}*`,
    '',
    '_Only configuration status is shown here. Secrets and credential values are never displayed._',
  ];
  const kb = new InlineKeyboard()
    .text('💳 Payment Management', 'adm:payments')
    .text('🔄 Refresh', 'adm:health')
    .row()
    .text('⬅️ Back', 'adm:root');
  await ctx.editMessageText(lines.join('\n'), {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
}

adminBot.callbackQuery('adm:health', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = undefined;
  await showSystemHealth(ctx);
});

// ---------- Settings ----------
async function showSettingsHub(ctx: AppCtx): Promise<void> {
  const kb = new InlineKeyboard()
    .text('⚙️ Bot Settings', 'adm:bot')
    .text('🎨 Customize', 'adm:cust')
    .row()
    .text('🤖 AI Setup', 'adm:ai')
    .text('🔌 API & Suppliers', 'adm:api')
    .row()
    .text('💎 Custom Prices', 'adm:price')
    .text('🧹 Clear Cache', 'adm:clr')
    .row();
  backRow(kb);
  await ctx.editMessageText(
    [
      '⚙️ *Settings*',
      '',
      'Manage the bot experience, integrations, pricing overrides, and operational controls.',
      '',
      '_Existing settings flows remain unchanged and are grouped here to keep the main admin menu focused._',
    ].join('\n'),
    { parse_mode: 'Markdown', reply_markup: kb },
  );
}

adminBot.callbackQuery('adm:settings', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = undefined;
  await showSettingsHub(ctx);
});


// ---------- Notification Settings ----------
const NOTIFICATION_CATEGORY_LABELS: Record<AdminNotificationCategory, string> = {
  orders: '📦 Orders', payments: '💳 Payments', users: '👥 Users',
  coupons_referrals: '🎁 Coupons & Referrals', inventory: '📦 Inventory',
  support: '💬 Support', system: '⚙️ System',
};
function notificationModeLabel(mode: string): string {
  if (mode === 'admin_only') return '👤 Admin Only';
  if (mode === 'log_only') return '📣 Log Channel Only';
  return '👤 Admin + 📣 Log Channel';
}
async function showNotificationSettings(ctx: AppCtx): Promise<void> {
  const s = await getAdminNotificationSettings();
  const kb = new InlineKeyboard()
    .text(s.mode === 'admin_only' ? '✅ Admin Only' : '👤 Admin Only', 'adm:notifications:mode:admin_only').row()
    .text(s.mode === 'log_only' ? '✅ Log Channel Only' : '📣 Log Channel Only', 'adm:notifications:mode:log_only').row()
    .text(s.mode === 'admin_and_log' ? '✅ Admin + Log Channel' : '👤 + 📣 Admin + Log Channel', 'adm:notifications:mode:admin_and_log').row();
  (Object.keys(NOTIFICATION_CATEGORY_LABELS) as AdminNotificationCategory[]).forEach(category => {
    kb.text(`${s.events[category] ? '🟢' : '🔕'} ${NOTIFICATION_CATEGORY_LABELS[category]}`, `adm:notifications:event:${category}`).row();
  });
  kb.text('📣 Broadcast', 'adm:ann')
    .text('🔄 Refresh', 'adm:notifications')
    .row();
  backRow(kb);
  await ctx.editMessageText([
    '🔔 *Notification Settings*','',
    `*Delivery:* ${notificationModeLabel(s.mode)}`,
    `*Log Channel:* ${env.LOG_CHAT_ID || env.ORDER_LOG_CHAT_ID ? 'Configured' : 'Not configured'}`,'',
    '*Event Categories*',
    ...(Object.keys(NOTIFICATION_CATEGORY_LABELS) as AdminNotificationCategory[]).map(c => `${s.events[c] ? '🟢' : '🔕'} ${NOTIFICATION_CATEGORY_LABELS[c]}`),
    '', '_Changes are saved immediately. Log channel IDs remain server-side configuration._',
  ].join('\\n'), { parse_mode: 'Markdown', reply_markup: kb });
}
adminBot.callbackQuery('adm:notifications', async ctx => {
  await ctx.answerCallbackQuery(); ctx.session.adminFlow = undefined; await showNotificationSettings(ctx);
});
adminBot.callbackQuery(/^adm:notifications:mode:(admin_only|log_only|admin_and_log)$/, async ctx => {
  const mode = ctx.match[1] as 'admin_only' | 'log_only' | 'admin_and_log';
  await setAdminNotificationMode(mode, ctx.from!.id);
  await ctx.answerCallbackQuery({ text: `Notifications: ${notificationModeLabel(mode)}` });
  await showNotificationSettings(ctx);
});
adminBot.callbackQuery(/^adm:notifications:event:(orders|payments|users|coupons_referrals|inventory|support|system)$/, async ctx => {
  const category = ctx.match[1] as AdminNotificationCategory;
  const s = await getAdminNotificationSettings();
  await setAdminNotificationCategory(category, !s.events[category], ctx.from!.id);
  await ctx.answerCallbackQuery({ text: `${NOTIFICATION_CATEGORY_LABELS[category]} ${s.events[category] ? 'disabled' : 'enabled'}.` });
  await showNotificationSettings(ctx);
});

adminBot.callbackQuery('adm:close', async (ctx) => {
  await ctx.answerCallbackQuery();
  try {
    await ctx.deleteMessage();
  } catch {
    /* ignore */
  }
  // Re-fire /start so the admin lands on the regular Main Menu — that's
  // the expected behaviour of the new "🏠 Main Menu" button on the
  // panel root, replacing the old "❌ Close".
  await ctx.api.sendMessage(ctx.chat?.id ?? ctx.from!.id, '/start');
});

// ---------- Bot Settings ----------
// One-stop hub for bot-wide toggles + URLs the admin can edit at
// runtime: email PDF URL, admin contact link, plus the reload settings
// shortcut. We deliberately keep this lean for now — each item edits
// a single key in the `settings` table.
async function showBotSettings(ctx: AppCtx): Promise<void> {
  const forceJoin = getForceJoinEnabled();
  const apiPriceAlerts = getApiPriceAlertsEnabled();
  const channelUrl = getChannelUrl();
  const kb = new InlineKeyboard()
    .text(forceJoin ? '🔒 Force Join: ON' : '🔓 Force Join: OFF', 'adm:bot:forcejoin:toggle')
    .row()
    .text(
      apiPriceAlerts ? '💰 API Price Alerts: ON' : '🔕 API Price Alerts: OFF',
      'adm:bot:api_price_alerts:toggle',
    )
    .row()
    .text('📣 Set Join Channel', 'adm:bot:forcejoin:channel')
    .text('🗑 Clear Join Channel', 'adm:bot:forcejoin:clear')
    .row()
    .text('📄 Set Email PDF URL', 'adm:bot:emailpdf')
    .row()
    .text('💬 Set Admin Contact URL', 'adm:bot:contact')
    .row()
    .text('📘 Edit Bot Tutorial', 'adm:bot:tut')
    .row()
    .text('🔁 Reload Settings', 'adm:reload');
  backRow(kb);
  const forceJoinLine = forceJoin ? '*ON*' : '*OFF*';
  const channelLine = channelUrl ? `\`${channelUrl}\`` : '_not set_';
  await ctx.editMessageText(
    [
      '⚙️ *Bot Settings*',
      '',
      `*Force Join:* ${forceJoinLine}`,
      `*API Price Alerts:* ${apiPriceAlerts ? '*ON*' : '*OFF*'}`,
      `*Join Channel:* ${channelLine}`,
      '',
      '_When Force Join is ON, users must join the configured channel before the main menu unlocks._',
    ].join('\n'),
    {
    parse_mode: 'Markdown',
    reply_markup: kb,
    },
  );
}

adminBot.callbackQuery('adm:bot', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = undefined;
  await showBotSettings(ctx);
});

adminBot.callbackQuery('adm:bot:forcejoin:toggle', async (ctx) => {
  const next = !getForceJoinEnabled();
  await setForceJoinEnabled(next, ctx.from!.id);
  await ctx.answerCallbackQuery({ text: `Force Join ${next ? 'enabled' : 'disabled'}.` });
  ctx.session.adminFlow = undefined;
  await showBotSettings(ctx);
});

adminBot.callbackQuery('adm:bot:api_price_alerts:toggle', async (ctx) => {
  const next = !getApiPriceAlertsEnabled();
  await setApiPriceAlertsEnabled(next, ctx.from!.id);
  await ctx.answerCallbackQuery({
    text: `API price alerts ${next ? 'enabled' : 'disabled'}.`,
  });
  ctx.session.adminFlow = undefined;
  await showBotSettings(ctx);
});

adminBot.callbackQuery('adm:bot:forcejoin:channel', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = { type: 'set_force_join_channel', step: 'value', data: {} };
  const kb = new InlineKeyboard().text('⬅️ Back', 'adm:bot');
  await ctx.editMessageText(
    [
      '📣 *Set Join Channel*',
      '',
      'Send public channel username or link:',
      '`@yourchannel`',
      '`https://t.me/yourchannel`',
      '',
      'Important: add this bot as admin in that channel, otherwise Telegram cannot verify members.',
      '',
      'Send /cancel to abort.',
    ].join('\n'),
    { parse_mode: 'Markdown', reply_markup: kb },
  );
});

adminBot.callbackQuery('adm:bot:forcejoin:clear', async (ctx) => {
  await clearChannelUrl(ctx.from!.id);
  await setForceJoinEnabled(false, ctx.from!.id);
  ctx.session.adminFlow = undefined;
  await ctx.answerCallbackQuery({ text: 'Force Join channel cleared and disabled.' });
  await showBotSettings(ctx);
});

// Bot Tutorial editor — surfaces the same fields as the legacy
// `/setbottutorial` slash command, but as one-tap buttons that arm
// adminFlow capture for the next message.
async function showBotTutorialEditor(ctx: AppCtx): Promise<void> {
  const t = await getBotTutorial();
  const lines = [
    '📘 *Bot Tutorial*',
    '',
    `*Text:* ${t.text ? '`set`' : '_unset_'}`,
    `*File:* ${t.file_id ? '`' + (t.file_type ?? 'file') + '`' : '_unset_'}`,
    `*URL:* ${t.url ? '`' + t.url + '`' : '_unset_'}`,
    '',
    '_Tap a button to edit. The bot will capture your next message of the appropriate kind._',
  ];
  const kb = new InlineKeyboard()
    .text('📝 Set Text', 'adm:bot:tut:settxt')
    .text('🧹 Clear Text', 'adm:bot:tut:clrtxt')
    .row()
    .text('🎞 Set File', 'adm:bot:tut:setfile')
    .text('🧹 Clear File', 'adm:bot:tut:clrfile')
    .row()
    .text('🔗 Set URL', 'adm:bot:tut:seturl')
    .text('🧹 Clear URL', 'adm:bot:tut:clrurl')
    .row();
  backRow(kb);
  await ctx.editMessageText(lines.join('\n'), {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
}

adminBot.callbackQuery('adm:bot:tut', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = undefined;
  await showBotTutorialEditor(ctx);
});

adminBot.callbackQuery('adm:bot:tut:settxt', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = { type: 'edit_bot_tutorial_text', step: 'text', data: {} };
  await ctx.reply('📝 Send the *Bot Tutorial* text now.', { parse_mode: 'Markdown' });
});

adminBot.callbackQuery('adm:bot:tut:setfile', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = { type: 'edit_bot_tutorial_file', step: 'file', data: {} };
  await ctx.reply(
    '🎞 Send a photo, video, or document — it will be re-sent inside the Bot Tutorial.',
    { parse_mode: 'Markdown' },
  );
});

adminBot.callbackQuery('adm:bot:tut:seturl', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = { type: 'edit_bot_tutorial_url', step: 'url', data: {} };
  await ctx.reply('🔗 Send the tutorial *URL* (`http://` or `https://`).', {
    parse_mode: 'Markdown',
  });
});

adminBot.callbackQuery('adm:bot:tut:clrtxt', async (ctx) => {
  await setBotTutorialField('text', null, ctx.from!.id);
  await ctx.answerCallbackQuery({ text: 'Cleared' });
  await showBotTutorialEditor(ctx);
});

adminBot.callbackQuery('adm:bot:tut:clrfile', async (ctx) => {
  await setBotTutorialField('file_id', null, ctx.from!.id);
  await setBotTutorialField('file_type', null, ctx.from!.id);
  await ctx.answerCallbackQuery({ text: 'Cleared' });
  await showBotTutorialEditor(ctx);
});

adminBot.callbackQuery('adm:bot:tut:clrurl', async (ctx) => {
  await setBotTutorialField('url', null, ctx.from!.id);
  await ctx.answerCallbackQuery({ text: 'Cleared' });
  await showBotTutorialEditor(ctx);
});

adminBot.callbackQuery('adm:bot:emailpdf', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = { type: 'set_text', step: 'value', data: { key: 'email.pdf_url' } };
  await ctx.editMessageText(
    '📄 *Set Email PDF URL*\n\nSend a public URL to a PDF (or `-` to clear). The Why Email "Know More" button becomes a URL button when this is set.',
    { parse_mode: 'Markdown', reply_markup: backRow(new InlineKeyboard()) },
  );
});

adminBot.callbackQuery('adm:bot:contact', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = { type: 'set_text', step: 'value', data: { key: 'admin.contact_url' } };
  await ctx.editMessageText(
    '💬 *Set Admin Contact URL*\n\nSend a t.me URL the "Buy Code" / contact-admin buttons should open.',
    { parse_mode: 'Markdown', reply_markup: backRow(new InlineKeyboard()) },
  );
});

// ---------- AI Setup ----------
adminBot.callbackQuery('adm:ai', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = undefined;
  const kb = new InlineKeyboard()
    .text('🔑 Set AI API Key', 'adm:ai:key')
    .row()
    .text('💬 Set AI Prompt', 'adm:ai:prompt');
  backRow(kb);
  await ctx.editMessageText(
    [
      '🤖 *AI Setup*',
      '',
      'Configure *Kiwi*, the assistant used by the AI Support flow.',
      'Kiwi answers store Q&A automatically with no API key required.',
      'The built-in responder is trained on your live products, prices,',
      'stock and payment methods.',
      '',
      '✨ Add a free Gemini key as an optional upgrade for smarter,',
      'more natural replies.',
      'Get a free key at https://aistudio.google.com/apikey — no billing',
      'required — then tap 🔑 Set AI API Key and paste it.',
      '',
      'Provider is auto-detected from the API-key shape:',
      '• `AIza…` → Google AI Studio (Gemini) — *free tier*',
      '• `sk-…`  → OpenAI Chat Completions — *paid*',
      '',
      '_The key you paste here overrides `OPENAI_API_KEY` from the deployment env._',
    ].join('\n'),
    { parse_mode: 'Markdown', reply_markup: kb },
  );
});

adminBot.callbackQuery('adm:ai:key', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = { type: 'set_text', step: 'value', data: { key: 'ai.api_key' } };
  await ctx.editMessageText('🔑 *Set AI API Key*\n\nSend the key (or `-` to clear).', {
    parse_mode: 'Markdown',
    reply_markup: backRow(new InlineKeyboard()),
  });
});

adminBot.callbackQuery('adm:ai:prompt', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = { type: 'set_text', step: 'value', data: { key: 'ai.system_prompt' } };
  await ctx.editMessageText(
    '💬 *Set AI Prompt*\n\nSend the system prompt (or `-` to clear).',
    { parse_mode: 'Markdown', reply_markup: backRow(new InlineKeyboard()) },
  );
});

// ---------- Gift Codes ----------
adminBot.callbackQuery('adm:gift', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = undefined;
  const kb = new InlineKeyboard()
    .text('➕ Create Code', 'adm:gift:add')
    .text('📋 List & Manage', 'adm:gift:list');
  backRow(kb);
  await ctx.editMessageText(
    '🎁 *Gift Codes*\n\nIssue or manage one-time/limited gift codes that users can redeem from Settings → Redeem Gift Code.',
    { parse_mode: 'Markdown', reply_markup: kb },
  );
});

adminBot.callbackQuery('adm:gift:add', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = { type: 'add_gift', step: 'code', data: {} };
  // Use HTML so the (3–40 chars, A–Z 0–9 _ -) hint renders verbatim —
  // an unmatched `_` under Markdown V1 used to make Telegram reject
  // editMessageText, leaving the screen stuck on the previous menu.
  await ctx.editMessageText(
    '🎁 <b>Create Gift Code</b>\n\nSend the code — 3 to 40 chars (letters, digits, <code>_</code> or <code>-</code>). Or <code>/cancel</code>.',
    { parse_mode: 'HTML', reply_markup: backRow(new InlineKeyboard()) },
  );
});

adminBot.callbackQuery('adm:gift:list', async (ctx) => {
  await ctx.answerCallbackQuery();
  await showGiftCodeList(ctx);
});

async function showGiftCodeList(ctx: AppCtx): Promise<void> {
  const codes = await listGiftCodes();
  if (codes.length === 0) {
    await ctx.editMessageText('No gift codes yet.', {
      reply_markup: backRow(new InlineKeyboard()),
    });
    return;
  }
  const lines = ['🎁 *Gift Codes*', ''];
  const kb = new InlineKeyboard();
  for (const c of codes) {
    const used = await countGiftCodeRedemptions(c.code);
    const cap = c.max_redemptions != null ? `/${c.max_redemptions}` : '';
    const exp = c.expires_at
      ? ` · exp ${new Date(c.expires_at).toISOString().slice(0, 10)}`
      : '';
    lines.push(`\`${c.code}\` · ${c.amount} USDT · used ${used}${cap}${exp}`);
    kb.text(`🗑 ${c.code}`.slice(0, 60), `adm:gift:del:${c.code}`).row();
  }
  backRow(kb);
  await ctx.editMessageText(lines.join('\n'), {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
}

adminBot.callbackQuery(/^adm:gift:del:(.+)$/, async (ctx) => {
  const code = ctx.match[1] ?? '';
  if (code) await deleteGiftCode(code);
  await ctx.answerCallbackQuery({ text: `Deleted ${code}` });
  await showGiftCodeList(ctx);
});

// ---------- Stats ----------
//
// Renders the deep stats dashboard:
//   1. Top-line counters (users, products, orders, revenue, ...)
//   2. Top 5 sellers by revenue
//   3. Per-product breakdown (units, revenue, stock left, last sale)
//   4. Daily revenue trend for the last 7 days (incl. zero-rev days)
//
// Telegram caps message text at 4096 chars; very large catalogs
// would otherwise truncate mid-row, so we cap the per-product list
// at the first ~30 products and truncate the entire body to 3950
// chars as a final guard.
function escapeMd(s: string): string {
  // Markdown v1 treats backslash plus `_*\`[` as special.
  // Keep the escape set minimal to match the rest of the admin UI.
  return s.replace(/([_*`[\]\\])/g, '\\$1');
}

function statsRangeKeyboard(days?: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.text(days === 1 ? '✅ 24h' : '24h', 'adm:stats:r:1')
    .text(days === 7 ? '✅ 7d' : '7d', 'adm:stats:r:7')
    .text(days === 30 ? '✅ 30d' : '30d', 'adm:stats:r:30')
    .row()
    .text('🕒 Custom', 'adm:stats:custom')
    .text('🔄 Refresh', days ? `adm:stats:r:${days}` : 'adm:stats')
    .row()
    .text('⬅️ Back', 'adm:back');
  return kb;
}

async function showAdminStats(ctx: AppCtx, days?: number): Promise<void> {
  const [allTime, range, productSales] = await Promise.all([
    getStats(),
    days ? getRangeStats(days) : Promise.resolve(null),
    days ? getProductSalesSince(days, 50) : getProductSales(50),
  ]);
  const lines: string[] = [];
  lines.push('📊 *Bot Stats*');
  lines.push('');
  lines.push('🌐 *All-Time Overview*');
  lines.push(`👥 Users: *${allTime.users}*`);
  lines.push(`📦 Active products: *${allTime.active_products}*`);
  lines.push(`🗂 Active categories: *${allTime.active_categories}*`);
  lines.push(`🧾 Total orders: *${allTime.orders}*`);
  lines.push(`💰 Total revenue: *$${allTime.revenue.toFixed(2)}*`);
  lines.push(`💳 Pending deposits: *${allTime.pending_deposits}*`);

  if (range) {
    const label = range.days === 1 ? 'Last 24 Hours' : `Last ${range.days} Days`;
    lines.push('');
    lines.push(`⏱ *${label}*`);
    lines.push(`🧾 Orders: *${range.orders}*`);
    lines.push(`📦 Units sold: *${range.units}*`);
    lines.push(`👤 Buyers: *${range.unique_buyers}*`);
    lines.push(`💰 Revenue: *$${range.revenue.toFixed(2)}*`);
    lines.push(`💵 Approved topups: *${range.approved_deposits}* / *$${range.deposit_amount.toFixed(2)}*`);
    lines.push(`🆕 New users: *${range.new_users}*`);
  }

  if (productSales.length > 0) {
    lines.push('');
    lines.push(days === 1 ? '🏆 *24h Top Sellers*' : '🏆 *Top Sellers*');
    productSales.slice(0, 5).forEach((row, i) => {
      const medal = ['🥇', '🥈', '🥉', '4.', '5.'][i] ?? `${i + 1}.`;
      lines.push(`${medal} ${escapeMd(row.product_name)} — *${row.units_sold}*u · *$${row.revenue.toFixed(2)}*`);
    });
    lines.push('');
    lines.push(days === 1 ? '📈 *24h Products Breakdown*' : '📈 *Products Breakdown*');
    productSales.slice(0, 30).forEach((row) => {
      const stock = row.stock_left !== null ? `stock *${row.stock_left}*` : '_deleted_';
      const last = row.last_sold_at ? ` · last *${row.last_sold_at.slice(0, 10)}*` : '';
      lines.push(`• ${escapeMd(row.product_name)}: *${row.units_sold}*u · *$${row.revenue.toFixed(2)}* · ${stock}${last}`);
    });
    if (productSales.length > 30) lines.push(`_…and ${productSales.length - 30} more products_`);
  } else if (days) {
    lines.push('', '_No paid orders in this range yet._');
  }

  let text = lines.join('\n');
  if (text.length > 3950) text = `${text.slice(0, 3900)}\n\n_…(truncated)_`;
  const opts = {
    parse_mode: 'Markdown' as const,
    reply_markup: statsRangeKeyboard(days),
  };
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, opts);
  } else {
    await ctx.reply(text, opts);
  }
}


async function showAdminAnalytics(ctx: AppCtx, days = 7): Promise<void> {
  const a = await getAdminAnalytics(days);
  // Per-product low-stock thresholds (products.low_stock_threshold,
  // falling back to the global inventory.low_stock_threshold setting).
  const lowStockRows = await listLowStockProducts(10).catch(() => []);
  const label = a.days === 1 ? 'Last 24 Hours' : `Last ${a.days} Days`;
  const lines = [
    '📈 *Digitalora Analytics*',
    '',
    `⏱ *${label}*`,
    '',
    '💰 *Sales Performance*',
    `🧾 Orders: *${a.orders}*`,
    `📦 Units sold: *${a.units}*`,
    `👥 Buyers: *${a.buyers}*`,
    `💵 Revenue: *$${a.revenue.toFixed(2)}*`,
    `🧮 Average order: *$${a.aov.toFixed(2)}*`,
    '',
    '💳 *Payments*',
    `✅ Approved deposits: *${a.approvedDeposits}* · *$${a.approvedDepositAmount.toFixed(2)}*`,
    `⏳ Pending deposits: *${a.pendingDeposits}*`,
    '',
    '📦 *Inventory*',
    `🟠 Low stock (≤5): *${a.lowStock}*`,
    `🔴 Out of stock: *${a.outOfStock}*`,
    ...(lowStockRows.length > 0
      ? lowStockRows.map(
          (row) =>
            `   • #${row.product_id} ${escapeMd(row.name)} — 📦 *${row.available}* · 🔒 *${row.reserved}* (alert ≤ ${row.low_stock_threshold})`,
        )
      : []),
    '',
    '👤 *Customer Insights*',
    `🆕 New users: *${a.newUsers}*`,
    a.topCustomer
      ? `🏆 Top customer: \`${a.topCustomer.userId}\` · ${a.topCustomer.orders} orders · *$${a.topCustomer.spend.toFixed(2)}*`
      : '🏆 Top customer: _No paid orders yet_',
  ];

  const kb = new InlineKeyboard()
    .text(a.days === 1 ? '✅ 24h' : '24h', 'adm:analytics:r:1')
    .text(a.days === 7 ? '✅ 7d' : '7d', 'adm:analytics:r:7')
    .text(a.days === 30 ? '✅ 30d' : '30d', 'adm:analytics:r:30')
    .row()
    .text('🔄 Refresh', `adm:analytics:r:${a.days}`)
    .text('📊 Detailed Stats', 'adm:stats')
    .row()
    .text('⬅️ Back', 'adm:root');

  const text = lines.join('\n');
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: kb });
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: kb });
  }
}

adminBot.callbackQuery('adm:analytics', async (ctx) => {
  await ctx.answerCallbackQuery();
  await showAdminAnalytics(ctx, 7);
});

adminBot.callbackQuery(/^adm:analytics:r:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const days = Math.max(1, Math.min(365, Number(ctx.match[1])));
  await showAdminAnalytics(ctx, days);
});

adminBot.callbackQuery('adm:stats', async (ctx) => {
  await ctx.answerCallbackQuery();
  await showAdminStats(ctx);
  return;
  const [s, productSales] = await Promise.all([
    getStats(),
    getProductSales(50),
  ]);
  const lines: string[] = [];
  lines.push('📊 *Stats*');
  lines.push('');
  lines.push(`👥 Users: *${s.users}*`);
  lines.push(`📦 Active products: *${s.active_products}*`);
  lines.push(`🗂 Active categories: *${s.active_categories}*`);
  lines.push(`🧾 Total orders: *${s.orders}*`);
  lines.push(`💰 Total revenue: *$${s.revenue.toFixed(2)}*`);
  lines.push(`💳 Pending deposits: *${s.pending_deposits}*`);

  const visibleProductSales = productSales;

  if (visibleProductSales.length > 0) {
    lines.push('');
    lines.push('🏆 *Top Sellers (by revenue)*');
    visibleProductSales.slice(0, 5).forEach((r, i) => {
      const medal = ['🥇', '🥈', '🥉', '4.', '5.'][i] ?? `${i + 1}.`;
      lines.push(
        `${medal} ${escapeMd(r.product_name)} — *${r.units_sold}* units · *$${r.revenue.toFixed(
          2,
        )}*`,
      );
    });
  }

  if (visibleProductSales.length > 0) {
    lines.push('');
    lines.push('📈 *All Products — Sales Breakdown*');
    const cap = 30;
    visibleProductSales.slice(0, cap).forEach((r) => {
      const stockStr =
        r.stock_left !== null ? `stock *${r.stock_left}*` : '_deleted_';
      const lastStr = r.last_sold_at
        ? ` · last *${r.last_sold_at.slice(0, 10)}*`
        : '';
      lines.push(
        `• ${escapeMd(r.product_name)}: *${r.units_sold}*u · *$${r.revenue.toFixed(
          2,
        )}* · ${stockStr}${lastStr}`,
      );
    });
    if (visibleProductSales.length > cap) {
      lines.push(
        `_…and ${visibleProductSales.length - cap} more (download PDF for full list)_`,
      );
    }
  }

  let text = lines.join('\n');
  if (text.length > 3950) text = text.slice(0, 3900) + '\n\n_…(truncated)_';
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: backRow(new InlineKeyboard()),
  });
});

adminBot.callbackQuery(/^adm:stats:r:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showAdminStats(ctx, Number(ctx.match[1]));
});

adminBot.callbackQuery('adm:stats:custom', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = { type: 'stats_custom_days', step: 'days', data: {} };
  await ctx.editMessageText(
    '🕒 *Custom Stats Range*\n\nSend number of days, e.g. `3`, `14`, `90`.\n\nOr `/cancel`.',
    { parse_mode: 'Markdown', reply_markup: backRow(new InlineKeyboard()) },
  );
});

// ---------- Reseller Product API ----------
//
// Admin-side control center for the public reseller API:
// overview, active keys, API spend, top reseller users, recent API
// orders, and one-tap key disable.
function apiPremiumButton(
  kb: InlineKeyboard,
  emojiKey: string,
  style: 'primary' | 'success' | 'danger' = 'primary',
): void {
  const spec = EMOJI[emojiKey];
  if (typeof spec === 'object' && spec.custom_emoji_id) kb.icon(spec.custom_emoji_id);
  kb.style(style);
}

function adminApiKeyboardPremium(): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.text('API Users', 'adm:api:users:0');
  apiPremiumButton(kb, 'profile_username', 'primary');
  kb.text('API Orders', 'adm:api:orders:0');
  apiPremiumButton(kb, 'orders_title', 'primary');
  kb.row();
  kb.copyText('Copy Endpoint', apiBaseUrl());
  apiPremiumButton(kb, 'profile_link', 'primary');
  kb.row();
  kb.text('Supplier APIs', 'adm:api:suppliers:0');
  apiPremiumButton(kb, 'api_key', 'primary');
  kb.row();
  kb.url('Open API Docs', apiBaseUrl());
  apiPremiumButton(kb, 'orders_note', 'primary');
  kb.row();
  kb.text('Refresh', 'adm:api');
  apiPremiumButton(kb, 'stats_refresh', 'primary');
  backRow(kb);
  return kb;
}

async function showAdminApiError(ctx: AppCtx, err: unknown): Promise<void> {
  logger.error({ err }, 'admin API dashboard failed');
  const text = [
    '⚠️ *API Dashboard Not Ready*',
    '',
    'Run this Supabase migration first:',
    '`supabase/migrations/0036_reseller_api.sql`',
    '',
    '_Paste the SQL file contents in Supabase SQL Editor, not the file path._',
  ].join('\n');
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: backRow(new InlineKeyboard()),
  });
}

async function showAdminApiOverview(ctx: AppCtx): Promise<void> {
  try {
    const s = await getAdminApiOverview();
    const lines: string[] = [
      '🔌 *Reseller API Control Panel*',
      '',
      `🟢 Active keys: *${s.activeKeys}* / ${s.totalKeys}`,
      `👥 API users: *${s.totalUsers}*`,
      `🧾 API orders: *${s.totalOrders}*`,
      `💰 API spend: *${apiMoney(s.totalSpent)} USDT*`,
      '',
      '⏱ *Live Usage*',
      `24h: *${s.orders24h}* orders · *${apiMoney(s.spend24h)} USDT*`,
      `7d: *${s.orders7d}* orders · *${apiMoney(s.spend7d)} USDT*`,
      `30d: *${s.orders30d}* orders · *${apiMoney(s.spend30d)} USDT*`,
      '',
      '*Endpoint*',
      `\`${s.endpoint}\``,
    ];

    if (s.topUsers.length > 0) {
      lines.push('', '🏆 *Top API Users*');
      s.topUsers.forEach((u, i) => {
        const marker = u.active ? '🟢' : '🔴';
        lines.push(
          `${i + 1}. ${marker} ${escapeMd(apiUserLabel(u))} — *${u.orders}* orders · *${apiMoney(u.totalSpent)}*`,
        );
      });
    }

    if (s.recentOrders.length > 0) {
      lines.push('', '🧾 *Recent API Orders*');
      s.recentOrders.forEach((o) => {
        const id = o.orderPublicId ?? `#${o.orderDbId}`;
        lines.push(
          `• \`${id}\` · ${escapeMd(o.productName)} ×${o.qty} · *${apiMoney(o.total)}*`,
        );
      });
    }

    await ctx.editMessageText(lines.join('\n').slice(0, 3900), {
      parse_mode: 'Markdown',
      reply_markup: adminApiKeyboardPremium(),
      link_preview_options: { is_disabled: true },
    });
  } catch (err) {
    await showAdminApiError(ctx, err);
  }
}

adminBot.callbackQuery('adm:api', async (ctx) => {
  await ctx.answerCallbackQuery();
  await showAdminApiOverview(ctx);
});

function apiUsersKeyboard(page: number, pages: number, rows: Array<{ userId: number; active: boolean }>): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const row of rows) {
    kb.text(`${row.active ? '🟢' : '🔴'} ${row.userId}`, `adm:api:user:${row.userId}`);
    kb.row();
  }
  if (pages > 1) {
    if (page > 0) kb.text('◀️ Prev', `adm:api:users:${page - 1}`);
    kb.text(`${page + 1}/${pages}`, 'noop:api-users-page');
    if (page + 1 < pages) kb.text('Next ▶️', `adm:api:users:${page + 1}`);
    kb.row();
  }
  kb.text('🔄 Refresh', `adm:api:users:${page}`).text('🔌 API Home', 'adm:api');
  backRow(kb);
  return kb;
}

async function showAdminApiUsers(ctx: AppCtx, page: number): Promise<void> {
  try {
    const data = await listAdminApiUsers({ page, perPage: 8 });
    const lines = [
      '👥 *API Users*',
      '',
      `Total: *${data.total}*`,
      '',
    ];
    if (data.rows.length === 0) {
      lines.push('_No API users yet._');
    } else {
      data.rows.forEach((u, i) => {
        const n = data.page * 8 + i + 1;
        const status = u.active ? '🟢 Active' : '🔴 Disabled';
        lines.push(
          `${n}. *${escapeMd(apiUserLabel(u))}*`,
          `   ${status} · orders *${u.orders}* · spent *${apiMoney(u.totalSpent)} USDT*`,
          `   balance *${apiMoney(u.balance)} USDT* · last ${escapeMd(apiDate(u.lastUsedAt ?? u.lastOrderAt))}`,
        );
      });
    }
    await ctx.editMessageText(lines.join('\n').slice(0, 3900), {
      parse_mode: 'Markdown',
      reply_markup: apiUsersKeyboard(data.page, data.pages, data.rows),
    });
  } catch (err) {
    await showAdminApiError(ctx, err);
  }
}

adminBot.callbackQuery(/^adm:api:users:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showAdminApiUsers(ctx, Number(ctx.match[1]));
});

function apiOrdersKeyboard(page: number, pages: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (pages > 1) {
    if (page > 0) kb.text('◀️ Prev', `adm:api:orders:${page - 1}`);
    kb.text(`${page + 1}/${pages}`, 'noop:api-orders-page');
    if (page + 1 < pages) kb.text('Next ▶️', `adm:api:orders:${page + 1}`);
    kb.row();
  }
  kb.text('🔄 Refresh', `adm:api:orders:${page}`).text('🔌 API Home', 'adm:api');
  backRow(kb);
  return kb;
}

async function showAdminApiOrders(ctx: AppCtx, page: number): Promise<void> {
  try {
    const data = await listAdminApiOrders({ page, perPage: 8 });
    const lines = ['🧾 *Recent API Orders*', '', `Total: *${data.total}*`, ''];
    if (data.rows.length === 0) {
      lines.push('_No API orders yet._');
    } else {
      data.rows.forEach((o, i) => {
        const n = data.page * 8 + i + 1;
        const id = o.orderPublicId ?? `#${o.orderDbId}`;
        lines.push(
          `${n}. \`${id}\` — *${escapeMd(o.productName)}*`,
          `   User: ${escapeMd(apiUserLabel(o))} · qty *${o.qty}* · *${apiMoney(o.total)} USDT*`,
          `   ${escapeMd(apiDate(o.createdAt))}${o.requestId ? ` · req \`${escapeMd(o.requestId.slice(0, 32))}\`` : ''}`,
        );
      });
    }
    await ctx.editMessageText(lines.join('\n').slice(0, 3900), {
      parse_mode: 'Markdown',
      reply_markup: apiOrdersKeyboard(data.page, data.pages),
    });
  } catch (err) {
    await showAdminApiError(ctx, err);
  }
}

adminBot.callbackQuery(/^adm:api:orders:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showAdminApiOrders(ctx, Number(ctx.match[1]));
});

function apiUserDetailKeyboard(userId: number, active: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (active) {
    kb.text('❌ Disable API Key', `adm:api:disable:${userId}`).row();
  }
  kb.text('👥 API Users', 'adm:api:users:0').text('🔄 Refresh', `adm:api:user:${userId}`).row();
  kb.text('🔌 API Home', 'adm:api');
  backRow(kb);
  return kb;
}

async function showAdminApiUser(ctx: AppCtx, userId: number): Promise<void> {
  try {
    const data = await getAdminApiUser(userId);
    if (!data.user) {
      await ctx.editMessageText('❌ API user not found.', {
        reply_markup: backRow(new InlineKeyboard()),
      });
      return;
    }
    const u = data.user;
    const lines = [
      '👤 *API User Detail*',
      '',
      `User: *${escapeMd(apiUserLabel(u))}*`,
      `Telegram ID: \`${u.userId}\``,
      `Status: *${u.active ? '🟢 Active' : '🔴 Disabled'}*`,
      `Key: \`${u.keyPrefix ? `${u.keyPrefix}••••••••` : '—'}\``,
      `Created: ${escapeMd(apiDate(u.keyCreatedAt))}`,
      `Last used: ${escapeMd(apiDate(u.lastUsedAt))}`,
      '',
      `Wallet/API balance: *${apiMoney(u.balance)} USDT*`,
      `Orders: *${u.orders}*`,
      `Total spend: *${apiMoney(u.totalSpent)} USDT*`,
      `24h / 7d / 30d: *${apiMoney(u.spend24h)}* / *${apiMoney(u.spend7d)}* / *${apiMoney(u.spend30d)}*`,
    ];
    if (data.recentOrders.length > 0) {
      lines.push('', '🧾 *Last Orders*');
      data.recentOrders.forEach((o) => {
        const id = o.orderPublicId ?? `#${o.orderDbId}`;
        lines.push(`• \`${id}\` · ${escapeMd(o.productName)} ×${o.qty} · *${apiMoney(o.total)}*`);
      });
    }
    await ctx.editMessageText(lines.join('\n').slice(0, 3900), {
      parse_mode: 'Markdown',
      reply_markup: apiUserDetailKeyboard(userId, u.active),
    });
  } catch (err) {
    await showAdminApiError(ctx, err);
  }
}

adminBot.callbackQuery(/^adm:api:user:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showAdminApiUser(ctx, Number(ctx.match[1]));
});

adminBot.callbackQuery(/^adm:api:disable:(\d+)$/, async (ctx) => {
  const userId = Number(ctx.match[1]);
  await disableApiKey(userId);
  await ctx.answerCallbackQuery({ text: 'API key disabled.' });
  await showAdminApiUser(ctx, userId);
});

// ---------- Supplier APIs ----------
//
// This is the owner's upstream side: connect supplier/reseller APIs
// from other bots, map selected local products to supplier product
// ids, test/sync them, and let checkout auto-order where possible.

const SUPPLIERS_PER_PAGE = 8;
const SUPPLIER_PRODUCTS_PER_PAGE = 6;
type SupplierCatalogMode = 'all' | 'stock';

async function supplierProductAt(
  source: DBSupplierApiSource,
  mode: SupplierCatalogMode,
  index: number,
): Promise<{ products: SupplierCatalogProduct[]; product: SupplierCatalogProduct | null }> {
  const products = supplierProductFilter(await fetchSupplierProducts(source), mode);
  return { products, product: products[index] ?? null };
}

async function supplierSendOrEdit(
  ctx: AppCtx,
  text: string,
  opts: Parameters<AppCtx['editMessageText']>[1],
): Promise<void> {
  if (ctx.callbackQuery?.message) {
    await ctx.editMessageText(text, opts);
    return;
  }
  await ctx.reply(text, opts);
}

function supplierSetupExample(): string {
  return JSON.stringify(
    {
      name: 'Supplier Bot Name',
      base_url: 'https://supplier.example.com/api',
      api_key: 'PASTE_API_KEY_HERE',
      auth_mode: 'x-api-key',
      key_header: 'x-api-key',
      products_path: '/products',
      balance_path: '/balance',
      order_path: '/order',
      products_json_path: 'products',
      balance_json_path: 'balance',
      product_id_json_path: 'id',
      product_name_json_path: 'name',
      product_price_json_path: 'price',
      product_stock_json_path: 'stock',
      order_items_json_path: 'items',
      order_request_template: {
        product_id: '{{supplier_product_id}}',
        quantity: '{{qty}}',
        request_id: '{{request_id}}',
      },
      auto_import_new_products: false,
      auto_import_active: false,
      import_category_name: 'Supplier Products',
      markup_percent: 25,
    },
    null,
    2,
  );
}

function supplierMapExample(supplierId?: number): string {
  return JSON.stringify(
    {
      supplier_id: supplierId ?? 1,
      local_product_id: 12,
      supplier_product_id: 'SUPPLIER_PRODUCT_ID',
      supplier_product_name: 'Supplier product name',
      auto_order: true,
      auto_sync_stock: true,
      fallback_manual: true,
    },
    null,
    2,
  );
}

async function showSupplierError(ctx: AppCtx, err: unknown): Promise<void> {
  logger.error({ err }, 'supplier API admin screen failed');
  const detail = err instanceof Error ? err.message : String(err);
  const text = isSupplierMigrationError(err)
    ? [
        '⚠️ *Supplier APIs Not Ready*',
        '',
        'Run these Supabase migrations first:',
        '`supabase/migrations/0037_supplier_apis.sql`',
        '`supabase/migrations/0038_supplier_easy_import.sql`',
        '',
        '_Paste the SQL file contents in Supabase SQL Editor, not the file path._',
      ].join('\n')
    : [
        '⚠️ *Supplier API Error*',
        '',
        `\`${escapeMd(detail.slice(0, 700))}\``,
      ].join('\n');
  await supplierSendOrEdit(ctx, text, {
    parse_mode: 'Markdown',
    reply_markup: backRow(new InlineKeyboard()),
  });
}

function supplierListKeyboard(
  rows: Array<{ id: number; name: string; enabled: boolean }>,
  page: number,
  pages: number,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.text('Add Reseller API', 'adm:api:supplier:add:reseller');
  apiPremiumButton(kb, 'api_key', 'primary');
  kb.text('Add VEX Reseller', 'adm:api:supplier:add:vex');
  apiPremiumButton(kb, 'api_key', 'primary');
  kb.row();
  kb.text('Add Canboso', 'adm:api:supplier:add:canboso');
  apiPremiumButton(kb, 'api_key', 'primary');
  kb.row();
  kb.text('Advanced JSON', 'adm:api:supplier:add');
  apiPremiumButton(kb, 'orders_note', 'primary');
  kb.text('Map Product', 'adm:api:supplier:map');
  apiPremiumButton(kb, 'orders_product', 'primary');
  kb.row();
  for (const row of rows) {
    kb.text(`${row.enabled ? 'ON' : 'OFF'} ${row.name}`.slice(0, 56), `adm:api:supplier:${row.id}`);
    apiPremiumButton(kb, row.enabled ? 'stats_refresh' : 'orders_note', row.enabled ? 'success' : 'danger');
    kb.row();
  }
  if (pages > 1) {
    if (page > 0) kb.text('Prev', `adm:api:suppliers:${page - 1}`);
    kb.text(`${page + 1}/${pages}`, 'noop:supplier-page');
    if (page + 1 < pages) kb.text('Next', `adm:api:suppliers:${page + 1}`);
    kb.row();
  }
  kb.text('Refresh', `adm:api:suppliers:${page}`);
  apiPremiumButton(kb, 'stats_refresh', 'primary');
  kb.text('API Home', 'adm:api');
  apiPremiumButton(kb, 'api_key', 'primary');
  backRow(kb);
  return kb;
}

async function showSupplierApis(ctx: AppCtx, page = 0): Promise<void> {
  try {
    const data = await listSupplierApiSources(page, SUPPLIERS_PER_PAGE);
    const pages = Math.max(1, Math.ceil(data.total / SUPPLIERS_PER_PAGE));
    const links = await listSupplierProductLinks().catch(() => []);
    const logs = await listSupplierOrderLogs(undefined, 5).catch(() => []);
    const successLogs = logs.filter((l) => l.status === 'success').length;
    const failedLogs = logs.filter((l) => l.status === 'failed').length;
    const lines = [
      '🔌 *Supplier API Hub*',
      '',
      'Connect outside reseller bots/APIs and sell selected supplier products inside your shop.',
      '',
      `Suppliers: *${data.total}*`,
      `Mapped products: *${links.length}*`,
      `Recent auto orders: *${successLogs}* success / *${failedLogs}* failed`,
      '',
      '*Flow*',
      '1. Tap *Add Reseller API* / *Add Canboso* and paste the API key.',
      '2. Open the supplier and tap *Browse Products*.',
      '3. Import selected products or all in-stock products.',
      '4. Toggle visibility, stock sync, and auto-order by button.',
    ];
    if (data.rows.length === 0) {
      lines.push('', '_No suppliers connected yet._');
    } else {
      lines.push('', '*Connected Suppliers*');
      data.rows.forEach((s, i) => {
        const n = page * SUPPLIERS_PER_PAGE + i + 1;
        const status = s.enabled ? 'ON' : 'OFF';
        lines.push(
          `${n}. *${escapeMd(s.name)}* (#${s.id})`,
          `   ${status} · balance ${s.last_balance === null ? '—' : `*${apiMoney(Number(s.last_balance))}*`} · last ${escapeMd(apiDate(s.last_sync_at))}`,
          s.last_error ? `   error: \`${escapeMd(s.last_error.slice(0, 120))}\`` : '',
        );
      });
    }
    await supplierSendOrEdit(ctx, lines.filter(Boolean).join('\n').slice(0, 3900), {
      parse_mode: 'Markdown',
      reply_markup: supplierListKeyboard(data.rows, page, pages),
      link_preview_options: { is_disabled: true },
    });
  } catch (err) {
    await showSupplierError(ctx, err);
  }
}

function supplierDetailKeyboard(source: DBSupplierApiSource): InlineKeyboard {
  const id = source.id;
  const kb = new InlineKeyboard();
  kb.text('Browse Products', `adm:api:supplier:catalog:${id}:0:all`);
  apiPremiumButton(kb, 'orders_product', 'primary');
  kb.text('In Stock Only', `adm:api:supplier:catalog:${id}:0:stock`);
  apiPremiumButton(kb, 'stats_refresh', 'success');
  kb.row();
  kb.text('Import In Stock', `adm:api:supplier:importall:${id}:stock`);
  apiPremiumButton(kb, 'orders_product', 'success');
  kb.text('Import All', `adm:api:supplier:importall:${id}:all`);
  apiPremiumButton(kb, 'orders_note', 'primary');
  kb.row();
  kb.text(source.auto_import_new_products ? 'Auto New: ON' : 'Auto New: OFF', `adm:api:supplier:autoimport:${id}`);
  apiPremiumButton(kb, source.auto_import_new_products ? 'stats_refresh' : 'orders_note', source.auto_import_new_products ? 'success' : 'danger');
  kb.text(source.auto_import_active ? 'New Visible: ON' : 'New Visible: OFF', `adm:api:supplier:autoactive:${id}`);
  apiPremiumButton(kb, source.auto_import_active ? 'api_key' : 'orders_note', source.auto_import_active ? 'success' : 'danger');
  kb.row();
  kb.text(supplierImportUsesGroupCategory(source) ? 'Group Category: ON' : 'Group Category: OFF', `adm:api:supplier:groupcat:${id}`);
  apiPremiumButton(kb, supplierImportUsesGroupCategory(source) ? 'api_key' : 'orders_note', supplierImportUsesGroupCategory(source) ? 'success' : 'primary');
  kb.row();
  kb.text('Test Connection', `adm:api:supplier:test:${id}`);
  apiPremiumButton(kb, 'stats_refresh', 'primary');
  kb.text(source.enabled ? 'Disable' : 'Enable', `adm:api:supplier:toggle:${id}`);
  apiPremiumButton(kb, source.enabled ? 'orders_note' : 'api_key', source.enabled ? 'danger' : 'success');
  kb.row();
  kb.text('Sync Links', `adm:api:supplier:sync:${id}`);
  apiPremiumButton(kb, 'orders_product', 'success');
  kb.text('Advanced Map', `adm:api:supplier:map:${id}`);
  apiPremiumButton(kb, 'profile_link', 'primary');
  kb.row();
  kb.text('Recent Logs', `adm:api:supplier:logs:${id}`);
  apiPremiumButton(kb, 'orders_title', 'primary');
  kb.text('Delete', `adm:api:supplier:delask:${id}`);
  apiPremiumButton(kb, 'orders_note', 'danger');
  kb.row();
  kb.text('Supplier List', 'adm:api:suppliers:0');
  apiPremiumButton(kb, 'api_key', 'primary');
  kb.text('API Home', 'adm:api');
  apiPremiumButton(kb, 'api_key', 'primary');
  backRow(kb);
  return kb;
}

async function showSupplierDetail(ctx: AppCtx, id: number): Promise<void> {
  try {
    const source = await getSupplierApiSource(id);
    if (!source) {
      await supplierSendOrEdit(ctx, '❌ Supplier not found.', {
        reply_markup: backRow(new InlineKeyboard()),
      });
      return;
    }
    const links = await listSupplierProductLinks(source.id);
    const logs = await listSupplierOrderLogs(source.id, 5).catch(() => []);
    const lines = [
      '🔌 *Supplier Detail*',
      '',
      `Name: *${escapeMd(source.name)}*`,
      `ID: \`${source.id}\``,
      `Status: *${source.enabled ? 'ON' : 'OFF'}*`,
      `Auth: \`${escapeMd(source.auth_mode)}\``,
      `Base URL: \`${escapeMd(source.base_url.slice(0, 120))}\``,
      `Balance: ${source.last_balance === null ? '—' : `*${apiMoney(Number(source.last_balance))}*`}`,
      `Markup: *${apiMoney(Number(source.markup_percent))}%* + *${apiMoney(Number(source.fixed_markup))} USDT*`,
      `Import category: *${escapeMd(supplierImportCategory(source))}*`,
      `Auto new products: *${source.auto_import_new_products ? 'ON' : 'OFF'}*`,
      `New imported products: *${source.auto_import_active ? 'visible' : 'hidden until you enable'}*`,
      `Last test: ${escapeMd(apiDate(source.last_sync_at))}`,
      source.last_error ? `Last error: \`${escapeMd(source.last_error.slice(0, 300))}\`` : '',
      '',
      `Mapped products: *${links.length}*`,
    ];
    if (links.length > 0) {
      for (const link of links.slice(0, 8)) {
        const product = await getProduct(link.local_product_id).catch(() => null);
        lines.push(
          `• #${link.local_product_id} ${escapeMd(product?.name ?? 'unknown')} -> \`${escapeMd(link.supplier_product_id)}\``,
          `  auto ${link.auto_order ? 'ON' : 'OFF'} · sync ${link.auto_sync_stock ? 'ON' : 'OFF'} · stock ${link.supplier_stock ?? '—'} · cost ${link.supplier_cost ?? '—'}`,
        );
      }
    }
    if (logs.length > 0) {
      lines.push('', '*Recent Supplier Orders*');
      logs.forEach((l) => {
        lines.push(
          `• ${escapeMd(apiDate(l.created_at))} · ${escapeMd(l.status)} · product #${l.local_product_id ?? '—'}`,
        );
      });
    }
    await supplierSendOrEdit(ctx, lines.filter(Boolean).join('\n').slice(0, 3900), {
      parse_mode: 'Markdown',
      reply_markup: supplierDetailKeyboard(source),
      link_preview_options: { is_disabled: true },
    });
  } catch (err) {
    await showSupplierError(ctx, err);
  }
}

async function supplierCatalogRows(
  source: DBSupplierApiSource,
  mode: SupplierCatalogMode,
  page: number,
): Promise<{
  products: SupplierCatalogProduct[];
  rows: Array<{
    product: SupplierCatalogProduct;
    index: number;
    link: DBSupplierProductLink | null;
    local: Awaited<ReturnType<typeof getProduct>>;
  }>;
  totalPages: number;
}> {
  const products = supplierProductFilter(await fetchSupplierProducts(source), mode);
  const totalPages = Math.max(1, Math.ceil(products.length / SUPPLIER_PRODUCTS_PER_PAGE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const from = safePage * SUPPLIER_PRODUCTS_PER_PAGE;
  const pageProducts = products.slice(from, from + SUPPLIER_PRODUCTS_PER_PAGE);
  const links = await listSupplierProductLinks(source.id);
  const linkBySupplierProduct = new Map(links.map((l) => [l.supplier_product_id, l]));
  const rows = await Promise.all(
    pageProducts.map(async (product, offset) => {
      const link = linkBySupplierProduct.get(product.id) ?? null;
      const local = link ? await getProduct(link.local_product_id).catch(() => null) : null;
      return { product, index: from + offset, link, local };
    }),
  );
  return { products, rows, totalPages };
}

async function showSupplierCatalog(
  ctx: AppCtx,
  supplierId: number,
  page: number,
  mode: SupplierCatalogMode,
): Promise<void> {
  try {
    const source = await getSupplierApiSource(supplierId);
    if (!source) {
      await supplierSendOrEdit(ctx, '❌ Supplier not found.', {
        reply_markup: backRow(new InlineKeyboard()),
      });
      return;
    }
    const { products, rows, totalPages } = await supplierCatalogRows(source, mode, page);
    const safePage = Math.min(Math.max(0, page), totalPages - 1);
    const lines = [
      '🔌 *Supplier Products*',
      '',
      `Supplier: *${escapeMd(source.name)}* (#${source.id})`,
      `Filter: *${mode === 'stock' ? 'in stock only' : 'all products'}*`,
      `Products seen: *${products.length}*`,
      `Markup: *${apiMoney(Number(source.markup_percent))}%* + *${apiMoney(Number(source.fixed_markup))} USDT*`,
      '',
      rows.length === 0
        ? '_No products found from this supplier._'
        : '_Tap a product to import/toggle it._',
    ];
    const kb = new InlineKeyboard();
    for (const row of rows) {
      const status = row.link
        ? row.local?.active
          ? 'ON'
          : 'HIDDEN'
        : 'IMPORT';
      const cost = row.product.price === null ? '?' : apiMoney(row.product.price);
      const sell = apiMoney(supplierSellPrice(source, row.product));
      const label = `${status} ${row.product.name} · ${cost}->${sell} · ${supplierStockLabel(row.product)}`.slice(0, 60);
      kb.text(label, `adm:api:supplier:p:${source.id}:${safePage}:${mode}:${row.index}`);
      apiPremiumButton(kb, row.link ? (row.local?.active ? 'api_key' : 'orders_note') : 'orders_product', row.link && row.local?.active ? 'success' : 'primary');
      kb.row();
    }
    if (safePage > 0) kb.text('Prev', `adm:api:supplier:catalog:${source.id}:${safePage - 1}:${mode}`);
    kb.text(`${safePage + 1}/${totalPages}`, 'noop:supplier-catalog-page');
    if (safePage + 1 < totalPages) kb.text('Next', `adm:api:supplier:catalog:${source.id}:${safePage + 1}:${mode}`);
    kb.row();
    kb.text(mode === 'stock' ? 'Show All' : 'In Stock Only', `adm:api:supplier:catalog:${source.id}:0:${mode === 'stock' ? 'all' : 'stock'}`);
    apiPremiumButton(kb, 'stats_refresh', 'primary');
    kb.text('Supplier Detail', `adm:api:supplier:${source.id}`);
    apiPremiumButton(kb, 'api_key', 'primary');
    backRow(kb);
    await supplierSendOrEdit(ctx, lines.join('\n').slice(0, 3900), {
      parse_mode: 'Markdown',
      reply_markup: kb,
      link_preview_options: { is_disabled: true },
    });
  } catch (err) {
    await showSupplierError(ctx, err);
  }
}

async function showSupplierCatalogProduct(
  ctx: AppCtx,
  supplierId: number,
  page: number,
  mode: SupplierCatalogMode,
  index: number,
): Promise<void> {
  try {
    const source = await getSupplierApiSource(supplierId);
    if (!source) {
      await supplierSendOrEdit(ctx, '❌ Supplier not found.', {
        reply_markup: backRow(new InlineKeyboard()),
      });
      return;
    }
    const { products, product } = await supplierProductAt(source, mode, index);
    if (!product) {
      await supplierSendOrEdit(ctx, '❌ Supplier product not found. Refresh the supplier catalog.', {
        reply_markup: backRow(new InlineKeyboard()),
      });
      return;
    }
    const links = await listSupplierProductLinks(source.id);
    const link = links.find((l) => l.supplier_product_id === product.id) ?? null;
    const local = link ? await getProduct(link.local_product_id).catch(() => null) : null;
    const cost = product.price === null ? 'unknown' : `${apiMoney(product.price)} USDT`;
    const sell = `${apiMoney(supplierSellPrice(source, product))} USDT`;
    const lines = [
      '🛒 *Supplier Product*',
      '',
      `Supplier: *${escapeMd(source.name)}* (#${source.id})`,
      `Product: *${escapeMd(product.name)}*`,
      `Supplier ID: \`${escapeMd(product.id)}\``,
      `Cost: *${escapeMd(cost)}*`,
      `Your sell price: *${escapeMd(sell)}*`,
      `Stock: *${escapeMd(supplierStockLabel(product))}*`,
      '',
      link
        ? `Imported: *YES* -> local product #${link.local_product_id}`
        : 'Imported: *NO*',
      local ? `Local status: *${local.active ? 'visible' : 'hidden'}*` : '',
      link ? `Auto order: *${link.auto_order ? 'ON' : 'OFF'}*` : '',
      link ? `Auto stock sync: *${link.auto_sync_stock ? 'ON' : 'OFF'}*` : '',
      '',
      `Catalog position: ${index + 1}/${products.length}`,
    ];
    const kb = new InlineKeyboard();
    if (!link || !local) {
      kb.text('Import Visible', `adm:api:supplier:import:${source.id}:${page}:${mode}:${index}:1`);
      apiPremiumButton(kb, 'orders_product', 'success');
      kb.text('Import Hidden', `adm:api:supplier:import:${source.id}:${page}:${mode}:${index}:0`);
      apiPremiumButton(kb, 'orders_note', 'primary');
      kb.row();
      if (link && !local) {
        kb.text('Remove Broken Link', `adm:api:supplier:unlink2:${source.id}:${page}:${mode}:${index}:${link.id}`);
        apiPremiumButton(kb, 'gift_invalid', 'danger');
        kb.row();
      }
    } else {
      kb.text('Open Local Product', `adm:prod:edit:${link.local_product_id}:0`);
      apiPremiumButton(kb, 'orders_product', 'primary');
      kb.text(local.active ? 'Hide Product' : 'Show Product', `adm:api:supplier:link:visible:${source.id}:${page}:${mode}:${index}:${link.id}`);
      apiPremiumButton(kb, local.active ? 'orders_note' : 'api_key', local.active ? 'danger' : 'success');
      kb.row();
      kb.text('Edit Price', `adm:prod:price:set:${link.local_product_id}:0`);
      apiPremiumButton(kb, 'deposits_wallet', 'primary');
      kb.text('Edit Name', `adm:prod:name:set:${link.local_product_id}:0`);
      apiPremiumButton(kb, 'orders_product', 'primary');
      kb.row();
      kb.text('Premium Emoji', `adm:prod:emoji:set:${link.local_product_id}:0`);
      apiPremiumButton(kb, 'api_key', 'primary');
      kb.text('Referral Pay', `adm:prod:ref:set:${link.local_product_id}:0`);
      apiPremiumButton(kb, 'orders_product', 'primary');
      kb.row();
      kb.text('View Note', `adm:prod:note:settxt:${link.local_product_id}:0`);
      apiPremiumButton(kb, 'orders_note', 'primary');
      kb.text('Description', `adm:prod:desc:set:${link.local_product_id}:0`);
      apiPremiumButton(kb, 'orders_note', 'primary');
      kb.row();
      kb.text('Warranty', `adm:prod:war:set:${link.local_product_id}:0`);
      apiPremiumButton(kb, 'stats_refresh', 'primary');
      kb.text('Tutorial', `adm:prod:tut:settxt:${link.local_product_id}:0`);
      apiPremiumButton(kb, 'profile_link', 'primary');
      kb.row();
      kb.text(link.auto_order ? 'Auto Order: ON' : 'Auto Order: OFF', `adm:api:supplier:link:auto:${source.id}:${page}:${mode}:${index}:${link.id}`);
      apiPremiumButton(kb, link.auto_order ? 'api_key' : 'orders_note', link.auto_order ? 'success' : 'danger');
      kb.text(link.auto_sync_stock ? 'Sync Stock: ON' : 'Sync Stock: OFF', `adm:api:supplier:link:sync:${source.id}:${page}:${mode}:${index}:${link.id}`);
      apiPremiumButton(kb, link.auto_sync_stock ? 'stats_refresh' : 'orders_note', link.auto_sync_stock ? 'success' : 'danger');
      kb.row();
      kb.text('Unlink', `adm:api:supplier:unlink2:${source.id}:${page}:${mode}:${index}:${link.id}`);
      apiPremiumButton(kb, 'gift_invalid', 'danger');
      kb.row();
    }
    kb.text('Back to Products', `adm:api:supplier:catalog:${source.id}:${page}:${mode}`);
    apiPremiumButton(kb, 'orders_product', 'primary');
    kb.text('Supplier Detail', `adm:api:supplier:${source.id}`);
    apiPremiumButton(kb, 'api_key', 'primary');
    backRow(kb);
    await supplierSendOrEdit(ctx, lines.filter(Boolean).join('\n').slice(0, 3900), {
      parse_mode: 'Markdown',
      reply_markup: kb,
      link_preview_options: { is_disabled: true },
    });
  } catch (err) {
    await showSupplierError(ctx, err);
  }
}

adminBot.callbackQuery(/^adm:api:suppliers:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showSupplierApis(ctx, Number(ctx.match[1]));
});

adminBot.callbackQuery('adm:api:supplier:add', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = { type: 'supplier_api_add', step: 'json', data: {} };
  await ctx.editMessageText(
    [
      '🔌 *Add Supplier API*',
      '',
      'Paste one JSON config. You can connect most supplier bots by changing paths/field names.',
      '',
      'Example:',
      '```json',
      supplierSetupExample(),
      '```',
      '',
      'Send `/cancel` to abort.',
    ].join('\n'),
    {
      parse_mode: 'Markdown',
      reply_markup: backRow(new InlineKeyboard()),
      link_preview_options: { is_disabled: true },
    },
  );
});

adminBot.callbackQuery('adm:api:supplier:add:canboso', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = { type: 'supplier_canboso_add', step: 'key', data: {} };
  await ctx.editMessageText(
    [
      '🔑 *Add Canboso Supplier*',
      '',
      'This preset uses the live Canboso v2 telegram-buyer API:',
      'GET `/api/v2/telegram-buyer/products`',
      'GET `/api/v2/telegram-buyer/balance`',
      'POST `/api/v2/telegram-buyer/purchase`',
      'Your key is sent as `?key=` for GET and as `key` in the purchase body.',
      '',
      'Example:',
      '`tgb_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`',
      '',
      'After saving, open *Browse Products* and import by button.',
      '',
      'Send `/cancel` to abort.',
    ].join('\n'),
    {
      parse_mode: 'Markdown',
      reply_markup: backRow(new InlineKeyboard()),
      link_preview_options: { is_disabled: true },
    },
  );
});

adminBot.callbackQuery('adm:api:supplier:add:reseller', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = { type: 'supplier_reseller_add', step: 'key', data: {} };
  await ctx.editMessageText(
    [
      '*Add Reseller API Supplier*',
      '',
      'Send the reseller API key only. This preset already knows:',
      '`https://eygkdpfjrjwwbiackfpr.supabase.co/functions/v1/reseller-api`',
      '',
      'Auth: `Authorization: Bearer YOUR_API_KEY`',
      'Products: `?action=products`',
      'Balance: `?action=balance`',
      'Order: `?action=order`',
      '',
      'Example:',
      '`rsk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`',
      '',
      'After saving, open *Browse Products* and import products by button.',
      '',
      'Send `/cancel` to abort.',
    ].join('\n'),
    {
      parse_mode: 'Markdown',
      reply_markup: backRow(new InlineKeyboard()),
      link_preview_options: { is_disabled: true },
    },
  );
});

adminBot.callbackQuery('adm:api:supplier:add:vex', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = { type: 'supplier_vex_add', step: 'key', data: {} };
  await ctx.editMessageText(
    [
      '*Add VEX Reseller API Supplier*',
      '',
      'Send the VEX reseller API key only. This preset already knows:',
      '`https://eismrrkygprctnwxmkbw.supabase.co/functions/v1/reseller-api`',
      '',
      'Auth: `Authorization: Bearer YOUR_API_KEY`',
      'Products: `?action=products`',
      'Balance: `?action=balance`',
      'Order: `?action=order`',
      '',
      'Example:',
      '`vex_sk_e44171d3e4501be3dc1d1270ac72b0e8a9086037...`',
      '',
      'After saving, open *Browse Products* and import products by button.',
      '',
      'Send `/cancel` to abort.',
    ].join('\n'),
    {
      parse_mode: 'Markdown',
      reply_markup: backRow(new InlineKeyboard()),
      link_preview_options: { is_disabled: true },
    },
  );
});

adminBot.callbackQuery(/^adm:api:supplier:map(?::(\d+))?$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const supplierId = ctx.match[1] ? Number(ctx.match[1]) : undefined;
  ctx.session.adminFlow = {
    type: 'supplier_product_link_add',
    step: 'json',
    data: supplierId ? { supplier_id: supplierId } : {},
  };
  await ctx.editMessageText(
    [
      '🔗 *Map Supplier Product*',
      '',
      'Paste one JSON mapping. This chooses which supplier product is sold as which local product.',
      '',
      'Example:',
      '```json',
      supplierMapExample(supplierId),
      '```',
      '',
      'Send `/cancel` to abort.',
    ].join('\n'),
    {
      parse_mode: 'Markdown',
      reply_markup: backRow(new InlineKeyboard()),
      link_preview_options: { is_disabled: true },
    },
  );
});

adminBot.callbackQuery(/^adm:api:supplier:test:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await ctx.answerCallbackQuery({ text: 'Testing supplier...' });
  try {
    const source = await getSupplierApiSource(id);
    if (!source) {
      await ctx.answerCallbackQuery({ text: 'Supplier not found.', show_alert: true });
      return;
    }
    const result = await testSupplierConnection(source);
    const sample = result.sampleProducts
      .map((p) => `• \`${escapeMd(p.id)}\` ${escapeMd(p.name)} · ${p.price ?? '—'} · stock ${p.stock ?? '—'}`)
      .join('\n');
    await ctx.reply(
      [
        result.ok ? '✅ *Supplier Test OK*' : '⚠️ *Supplier Test Partial/Failed*',
        '',
        `Balance: ${result.balance === null ? '—' : `*${apiMoney(result.balance)}*`}`,
        `Products seen: *${result.productsSeen}*`,
        result.error ? `Error: \`${escapeMd(result.error.slice(0, 600))}\`` : '',
        sample ? ['', '*Sample Products*', sample].join('\n') : '',
      ].filter(Boolean).join('\n'),
      { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } },
    );
    await showSupplierDetail(ctx, id);
  } catch (err) {
    await showSupplierError(ctx, err);
  }
});

adminBot.callbackQuery(/^adm:api:supplier:toggle:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await ctx.answerCallbackQuery();
  try {
    const source = await getSupplierApiSource(id);
    if (!source) {
      await ctx.answerCallbackQuery({ text: 'Supplier not found.', show_alert: true });
      return;
    }
    await updateSupplierApiSource(id, { enabled: !source.enabled });
    await showSupplierDetail(ctx, id);
  } catch (err) {
    await showSupplierError(ctx, err);
  }
});

adminBot.callbackQuery(/^adm:api:supplier:sync:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await ctx.answerCallbackQuery({ text: 'Syncing mapped products...' });
  try {
    const source = await getSupplierApiSource(id);
    if (!source) {
      await ctx.answerCallbackQuery({ text: 'Supplier not found.', show_alert: true });
      return;
    }
    const links = await listSupplierProductLinks(id);
    let matched = 0;
    let updated = 0;
    let failed = 0;
    for (const link of links) {
      try {
        const result = await syncSupplierProductLink(link);
        if (result.matched) matched += 1;
        if (result.updatedLocal) updated += 1;
      } catch (err) {
        failed += 1;
        logger.warn({ err, linkId: link.id }, 'supplier link sync failed');
      }
    }
    let imported = 0;
    let skipped = 0;
    if (source.auto_import_new_products) {
      const seenLinks = new Set((await listSupplierProductLinks(id)).map((l) => l.supplier_product_id));
      const products = await fetchSupplierProducts(source);
      for (const product of products) {
        if (seenLinks.has(product.id)) {
          skipped += 1;
          continue;
        }
        try {
          const result = await importSupplierProduct({
            source,
            product,
            active: supplierImportActive(source),
            categoryName: supplierImportCategory(source),
          });
          if (result.created) imported += 1;
          else skipped += 1;
        } catch (err) {
          failed += 1;
          logger.warn({ err, supplierId: id, supplierProductId: product.id }, 'supplier auto import failed');
        }
      }
    }
    await ctx.reply(
      `✅ Supplier sync finished.\n\nMatched: *${matched}*\nUpdated local products: *${updated}*\nAuto-imported: *${imported}*\nSkipped: *${skipped}*\nFailed: *${failed}*`,
      { parse_mode: 'Markdown' },
    );
    await showSupplierDetail(ctx, id);
  } catch (err) {
    await showSupplierError(ctx, err);
  }
});

adminBot.callbackQuery(/^adm:api:supplier:catalog:(\d+):(\d+):(all|stock)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showSupplierCatalog(
    ctx,
    Number(ctx.match[1]),
    Number(ctx.match[2]),
    ctx.match[3] as SupplierCatalogMode,
  );
});

adminBot.callbackQuery(/^adm:api:supplier:p:(\d+):(\d+):(all|stock):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showSupplierCatalogProduct(
    ctx,
    Number(ctx.match[1]),
    Number(ctx.match[2]),
    ctx.match[3] as SupplierCatalogMode,
    Number(ctx.match[4]),
  );
});

adminBot.callbackQuery(/^adm:api:supplier:import:(\d+):(\d+):(all|stock):(\d+):(0|1)$/, async (ctx) => {
  const supplierId = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  const mode = ctx.match[3] as SupplierCatalogMode;
  const index = Number(ctx.match[4]);
  const active = ctx.match[5] === '1';
  await ctx.answerCallbackQuery({ text: active ? 'Importing visible product...' : 'Importing hidden product...' });
  try {
    const source = await getSupplierApiSource(supplierId);
    if (!source) {
      await ctx.answerCallbackQuery({ text: 'Supplier not found.', show_alert: true });
      return;
    }
    const { product } = await supplierProductAt(source, mode, index);
    if (!product) {
      await ctx.answerCallbackQuery({ text: 'Product not found. Refresh.', show_alert: true });
      return;
    }
    const result = await importSupplierProduct({
      source,
      product,
      active,
      categoryName: supplierImportCategory(source),
    });
    await ctx.answerCallbackQuery({
      text: result.created ? 'Imported.' : 'Already imported.',
      show_alert: false,
    });
    await showSupplierCatalogProduct(ctx, supplierId, page, mode, index);
  } catch (err) {
    await showSupplierError(ctx, err);
  }
});

adminBot.callbackQuery(/^adm:api:supplier:importall:(\d+):(all|stock)$/, async (ctx) => {
  const supplierId = Number(ctx.match[1]);
  const mode = ctx.match[2] as SupplierCatalogMode;
  await ctx.answerCallbackQuery({ text: 'Importing supplier products...' });
  try {
    const source = await getSupplierApiSource(supplierId);
    if (!source) {
      await ctx.answerCallbackQuery({ text: 'Supplier not found.', show_alert: true });
      return;
    }
    const products = supplierProductFilter(await fetchSupplierProducts(source), mode);
    const links = await listSupplierProductLinks(source.id);
    const linkedIds = new Set(links.map((l) => l.supplier_product_id));
    let created = 0;
    let existing = 0;
    let failed = 0;
    for (const product of products) {
      if (linkedIds.has(product.id)) {
        existing += 1;
        continue;
      }
      try {
        const result = await importSupplierProduct({
          source,
          product,
          active: supplierImportActive(source),
          categoryName: supplierImportCategory(source),
        });
        if (result.created) created += 1;
        else existing += 1;
      } catch (err) {
        failed += 1;
        logger.warn({ err, supplierId, supplierProductId: product.id }, 'supplier bulk import failed');
      }
    }
    await ctx.reply(
      [
        '✅ Supplier import finished.',
        '',
        `Created local products: *${created}*`,
        `Already imported: *${existing}*`,
        `Failed: *${failed}*`,
        `Visibility default: *${supplierImportActive(source) ? 'visible' : 'hidden'}*`,
      ].join('\n'),
      { parse_mode: 'Markdown' },
    );
    await showSupplierDetail(ctx, supplierId);
  } catch (err) {
    await showSupplierError(ctx, err);
  }
});

adminBot.callbackQuery(/^adm:api:supplier:autoimport:(\d+)$/, async (ctx) => {
  const supplierId = Number(ctx.match[1]);
  await ctx.answerCallbackQuery();
  try {
    const source = await getSupplierApiSource(supplierId);
    if (!source) return;
    await updateSupplierApiSource(supplierId, {
      auto_import_new_products: !source.auto_import_new_products,
    });
    await showSupplierDetail(ctx, supplierId);
  } catch (err) {
    await showSupplierError(ctx, err);
  }
});

adminBot.callbackQuery(/^adm:api:supplier:autoactive:(\d+)$/, async (ctx) => {
  const supplierId = Number(ctx.match[1]);
  await ctx.answerCallbackQuery();
  try {
    const source = await getSupplierApiSource(supplierId);
    if (!source) return;
    await updateSupplierApiSource(supplierId, {
      auto_import_active: !source.auto_import_active,
    });
    await showSupplierDetail(ctx, supplierId);
  } catch (err) {
    await showSupplierError(ctx, err);
  }
});

adminBot.callbackQuery(/^adm:api:supplier:groupcat:(\d+)$/, async (ctx) => {
  const supplierId = Number(ctx.match[1]);
  await ctx.answerCallbackQuery({ text: 'Updating import category...' });
  try {
    const source = await getSupplierApiSource(supplierId);
    if (!source) return;
    const nextName = supplierImportUsesGroupCategory(source)
      ? `Supplier - ${source.name}`
      : supplierGroupCategoryName(source);
    const category = await getOrCreateCategory(nextName);
    const links = await listSupplierProductLinks(source.id);
    await updateSupplierApiSource(supplierId, { import_category_name: nextName });
    for (const link of links) {
      await updateProduct(link.local_product_id, { category_id: category.id });
    }
    await ctx.reply(
      [
        '✅ Supplier group category updated.',
        '',
        `Category: *${nextName}*`,
        `Moved linked products: *${links.length}*`,
      ].join('\n'),
      { parse_mode: 'Markdown' },
    );
    await showSupplierDetail(ctx, supplierId);
  } catch (err) {
    await showSupplierError(ctx, err);
  }
});

adminBot.callbackQuery(/^adm:api:supplier:link:visible:(\d+):(\d+):(all|stock):(\d+):(\d+)$/, async (ctx) => {
  const supplierId = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  const mode = ctx.match[3] as SupplierCatalogMode;
  const index = Number(ctx.match[4]);
  const linkId = Number(ctx.match[5]);
  await ctx.answerCallbackQuery();
  try {
    const link = (await listSupplierProductLinks(supplierId)).find((l) => l.id === linkId);
    if (!link) {
      await ctx.answerCallbackQuery({ text: 'Link not found.', show_alert: true });
      return;
    }
    const product = await getProduct(link.local_product_id);
    if (!product) {
      await ctx.answerCallbackQuery({ text: 'Local product missing.', show_alert: true });
      return;
    }
    await setProductActive(product.id, !product.active);
    await showSupplierCatalogProduct(ctx, supplierId, page, mode, index);
  } catch (err) {
    await showSupplierError(ctx, err);
  }
});

adminBot.callbackQuery(/^adm:api:supplier:link:auto:(\d+):(\d+):(all|stock):(\d+):(\d+)$/, async (ctx) => {
  const supplierId = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  const mode = ctx.match[3] as SupplierCatalogMode;
  const index = Number(ctx.match[4]);
  const linkId = Number(ctx.match[5]);
  await ctx.answerCallbackQuery();
  try {
    const link = (await listSupplierProductLinks(supplierId)).find((l) => l.id === linkId);
    if (!link) return;
    await updateSupplierProductLink(linkId, { auto_order: !link.auto_order });
    await showSupplierCatalogProduct(ctx, supplierId, page, mode, index);
  } catch (err) {
    await showSupplierError(ctx, err);
  }
});

adminBot.callbackQuery(/^adm:api:supplier:link:sync:(\d+):(\d+):(all|stock):(\d+):(\d+)$/, async (ctx) => {
  const supplierId = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  const mode = ctx.match[3] as SupplierCatalogMode;
  const index = Number(ctx.match[4]);
  const linkId = Number(ctx.match[5]);
  await ctx.answerCallbackQuery();
  try {
    const link = (await listSupplierProductLinks(supplierId)).find((l) => l.id === linkId);
    if (!link) return;
    await updateSupplierProductLink(linkId, { auto_sync_stock: !link.auto_sync_stock });
    await showSupplierCatalogProduct(ctx, supplierId, page, mode, index);
  } catch (err) {
    await showSupplierError(ctx, err);
  }
});

adminBot.callbackQuery(/^adm:api:supplier:unlink2:(\d+):(\d+):(all|stock):(\d+):(\d+)$/, async (ctx) => {
  const supplierId = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  const mode = ctx.match[3] as SupplierCatalogMode;
  const index = Number(ctx.match[4]);
  const linkId = Number(ctx.match[5]);
  await ctx.answerCallbackQuery();
  try {
    await deleteSupplierProductLink(linkId);
    await showSupplierCatalogProduct(ctx, supplierId, page, mode, index);
  } catch (err) {
    await showSupplierError(ctx, err);
  }
});

adminBot.callbackQuery(/^adm:api:supplier:logs:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await ctx.answerCallbackQuery();
  try {
    const logs = await listSupplierOrderLogs(id, 12);
    const lines = ['🧾 *Supplier Order Logs*', '', `Supplier ID: \`${id}\``, ''];
    if (logs.length === 0) {
      lines.push('_No supplier order attempts yet._');
    } else {
      logs.forEach((l, i) => {
        lines.push(
          `${i + 1}. *${escapeMd(l.status)}* · ${escapeMd(apiDate(l.created_at))}`,
          `   Local order: \`${l.local_order_id ?? '—'}\` · product: \`${l.local_product_id ?? '—'}\``,
          l.error ? `   Error: \`${escapeMd(l.error.slice(0, 180))}\`` : '',
        );
      });
    }
    const kb = new InlineKeyboard();
    kb.text('Supplier Detail', `adm:api:supplier:${id}`);
    apiPremiumButton(kb, 'api_key', 'primary');
    kb.text('Refresh', `adm:api:supplier:logs:${id}`);
    apiPremiumButton(kb, 'stats_refresh', 'primary');
    backRow(kb);
    await supplierSendOrEdit(ctx, lines.filter(Boolean).join('\n').slice(0, 3900), {
      parse_mode: 'Markdown',
      reply_markup: kb,
    });
  } catch (err) {
    await showSupplierError(ctx, err);
  }
});

adminBot.callbackQuery(/^adm:api:supplier:delask:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await ctx.answerCallbackQuery();
  const kb = new InlineKeyboard();
  kb.text('Yes Delete Supplier', `adm:api:supplier:delete:${id}`);
  apiPremiumButton(kb, 'orders_note', 'danger');
  kb.row();
  kb.text('Cancel', `adm:api:supplier:${id}`);
  apiPremiumButton(kb, 'stats_refresh', 'primary');
  await ctx.editMessageText(
    `⚠️ *Delete supplier #${id}?*\n\nThis removes its product mappings too. Local products stay in your shop.`,
    { parse_mode: 'Markdown', reply_markup: kb },
  );
});

adminBot.callbackQuery(/^adm:api:supplier:delete:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await ctx.answerCallbackQuery();
  try {
    await deleteSupplierApiSource(id);
    await ctx.reply(`✅ Supplier #${id} deleted.`);
    await showSupplierApis(ctx, 0);
  } catch (err) {
    await showSupplierError(ctx, err);
  }
});

adminBot.callbackQuery(/^adm:api:supplier:unlink:(\d+):(\d+)$/, async (ctx) => {
  const supplierId = Number(ctx.match[1]);
  const linkId = Number(ctx.match[2]);
  await ctx.answerCallbackQuery();
  try {
    await deleteSupplierProductLink(linkId);
    await showSupplierDetail(ctx, supplierId);
  } catch (err) {
    await showSupplierError(ctx, err);
  }
});

adminBot.callbackQuery(/^adm:api:supplier:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showSupplierDetail(ctx, Number(ctx.match[1]));
});

// ---------- Orders ----------
//
// Three views, all rendered in HTML so user-supplied strings
// (`product_name`, `username`, `delivered_items`) splice in safely
// after `escapeHtml`:
//
//   1. Global feed             — `adm:ord:<page>`
//      Newest paid orders across the whole shop. Each row exposes a
//      "View" button that opens the per-order detail screen.
//   2. Per-user orders         — `adm:ord:u:<telegram_id>:<page>`
//      Reached from the user card "🧾 View Orders" button. Same row
//      layout as the global feed, scoped to one buyer.
//   3. Per-product orders      — `adm:ord:p:<product_id>:<page>`
//      Reached from the product editor "🧾 View Buyers" button. Same
//      row layout, scoped to one product.
//
//   4. Per-order detail        — `adm:ord:v:<id>`
//      Full order card: product, qty, totals, discount/promo, status,
//      buyer (clickable through to the user card), and the actual
//      delivered codes/links (preformatted block) so the admin can
//      see exactly what was shipped.

const ORDERS_PER_PAGE = 8;

/**
 * Render a paginated orders list. `scope` controls the header label
 * and the callback-data prefix used by the pagination + row buttons
 * so the same renderer can power the global feed, the per-user list
 * and the per-product list without duplicating code.
 */
async function showOrdersList(
  ctx: AppCtx,
  scope:
    | { kind: 'all'; page: number }
    | { kind: 'user'; telegram_id: number; page: number }
    | { kind: 'product'; product_id: number; page: number },
): Promise<void> {
  ctx.session.adminFlow = undefined;
  const perPage = ORDERS_PER_PAGE;
  let rows: DBOrder[] = [];
  let total = 0;
  let header = '';
  let pagePrefix = '';
  let backCb = 'adm:root';
  if (scope.kind === 'all') {
    const r = await listAllOrders(scope.page, perPage);
    rows = r.rows;
    total = r.total;
    header = '🧾 <b>All Orders</b>';
    pagePrefix = 'adm:ord';
  } else if (scope.kind === 'user') {
    const r = await listOrdersPaginated(scope.telegram_id, scope.page, perPage);
    rows = r.rows;
    total = r.total;
    header = `🧾 <b>Orders for</b> <code>${scope.telegram_id}</code>`;
    pagePrefix = `adm:ord:u:${scope.telegram_id}`;
    backCb = `adm:usr:v:${scope.telegram_id}`;
  } else {
    const r = await listOrdersForProduct(scope.product_id, scope.page, perPage);
    rows = r.rows;
    total = r.total;
    header = `🧾 <b>Buyers of product #${scope.product_id}</b>`;
    pagePrefix = `adm:ord:p:${scope.product_id}`;
  }
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const page = scope.kind === 'all' ? scope.page : scope.page;
  if (rows.length === 0) {
    const kb = new InlineKeyboard().text('⬅️ Back', backCb);
    await ctx.editMessageText(`${header}\n\n<i>No orders yet.</i>`, {
      parse_mode: 'HTML',
      reply_markup: kb,
    });
    return;
  }
  // Resolve buyer handles in one round-trip per page so the list can
  // show "@username" instead of just the numeric telegram_id. We
  // tolerate missing rows (deleted users) and fall back to "id N".
  const buyerIds = Array.from(new Set(rows.map((o) => o.user_id)));
  const buyers = new Map<number, DBUser>();
  await Promise.all(
    buyerIds.map(async (id) => {
      const u = await findUserById(id);
      if (u) buyers.set(id, u);
    }),
  );
  const lines = [`${header} — page ${page + 1}/${totalPages}  (total ${total})`, ''];
  const kb = new InlineKeyboard();
  for (const o of rows) {
    const buyer = buyers.get(o.user_id) ?? null;
    const handle = buyerHandle(buyer, o.user_id);
    const safeName = escapeHtml(o.product_name);
    const safeHandle = escapeHtml(handle);
    const date = o.created_at.slice(0, 10);
    const statusEmoji =
      o.status === 'paid' ? '✅' : o.status === 'refunded' ? '↩️' : '✖️';
    lines.push(
      `${statusEmoji} <code>#${o.id}</code> ${safeName} × ${o.qty} — ` +
        `<b>$${Number(o.total).toFixed(2)}</b> · ${safeHandle} · ${date}`,
    );
    // Compact one-tap row: jump straight into the order detail.
    kb.text(
      `🔎 #${o.id} ${o.product_name} × ${o.qty}`.slice(0, 60),
      `adm:ord:v:${o.id}`,
    ).row();
  }
  if (page > 0) kb.text('◀️ Prev', `${pagePrefix}:${page - 1}`);
  if (page + 1 < totalPages) kb.text('Next ▶️', `${pagePrefix}:${page + 1}`);
  kb.row().text('⬅️ Back', backCb);
  await ctx.editMessageText(lines.join('\n'), {
    parse_mode: 'HTML',
    reply_markup: kb,
  });
}

adminBot.callbackQuery(/^adm:ord:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showOrdersList(ctx, { kind: 'all', page: Number(ctx.match[1]) });
});

adminBot.callbackQuery(/^adm:ord:u:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showOrdersList(ctx, {
    kind: 'user',
    telegram_id: Number(ctx.match[1]),
    page: Number(ctx.match[2]),
  });
});

adminBot.callbackQuery(/^adm:ord:p:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showOrdersList(ctx, {
    kind: 'product',
    product_id: Number(ctx.match[1]),
    page: Number(ctx.match[2]),
  });
});

/**
 * Per-order detail card. Shows everything an admin needs to answer
 * "what did this user buy and what did we ship?" in one screen.
 */
async function renderAdminOrderDetail(ctx: AppCtx, id: number): Promise<void> {
  const order = await getOrder(id);
  if (!order) {
    await ctx.editMessageText('⚠️ Order not found.', {
      reply_markup: backRow(new InlineKeyboard()),
    });
    return;
  }
  const buyer = await findUserById(order.user_id);
  const handle = buyerHandle(buyer, order.user_id);
  const safeName = escapeHtml(order.product_name);
  const safeHandle = escapeHtml(handle);
  const created = new Date(order.created_at);
  const lifecycle = resolveOrderLifecycle(order);
  const statusLabel = orderStatusLabel(lifecycle.status);
  const lines = [
    `🧾 <b>Order #${order.id}</b>`,
    '',
    `<b>Product:</b> ${safeName}` +
      (order.product_id !== null ? ` <code>(#${order.product_id})</code>` : ''),
    `<b>Quantity:</b> ${order.qty}`,
    `<b>Unit Price:</b> $${Number(order.unit_price).toFixed(2)}`,
    Number(order.discount) > 0
      ? `<b>Discount:</b> −$${Number(order.discount).toFixed(2)}` +
        (order.promo_id !== null ? ` (promo #${order.promo_id})` : '')
      : null,
    `<b>Total:</b> $${Number(order.total).toFixed(2)}`,
    `<b>Status:</b> ${statusLabel}`,
    `<b>Payment:</b> ${PAYMENT_STATUS_LABELS[lifecycle.payment]}`,
    `<b>Fulfilment:</b> ${FULFILLMENT_STATUS_LABELS[lifecycle.fulfillment]}`,
    `<b>Delivery:</b> ${DELIVERY_STATUS_LABELS[lifecycle.delivery]}`,
    // Coarse supplier state only — credentials, endpoints and raw
    // supplier payloads are never rendered.
    sanitizeSupplierStatus(order.supplier_status ?? null)
      ? `<b>Supplier:</b> ${escapeHtml(sanitizeSupplierStatus(order.supplier_status ?? null) as string)}`
      : null,
    '',
    `<b>Buyer:</b> ${safeHandle}  <code>${order.user_id}</code>`,
    `<b>When:</b> ${created.toISOString().replace('T', ' ').slice(0, 19)} UTC`,
  ].filter((x): x is string => x !== null);
  // The actual codes / links delivered to the buyer. Preserved verbatim
  // inside <pre> so newlines + special chars survive.
  const delivered = order.delivered_items ?? order.delivery ?? null;
  if (delivered && delivered.trim().length > 0) {
    lines.push('');
    lines.push('<b>Delivered Items:</b>');
    // Cap at ~3000 chars so we stay safely under Telegram's 4096
    // message-text limit even with the rest of the card included.
    let body = delivered;
    if (body.length > 3000) body = body.slice(0, 2950) + '\n…(truncated)';
    lines.push(`<pre>${escapeHtml(body)}</pre>`);
  }
  const kb = new InlineKeyboard();
  if (buyer) {
    kb.text('👤 Open Buyer', `adm:usr:v:${order.user_id}`).row();
  }
  if (isPendingPreorderOrder(order)) {
    kb.text('🛑 Cancel Auto Send', `adm:ord:precancel:${order.id}`)
      .text('⚡ Auto Send Now', `adm:ord:presend:${order.id}`)
      .row();
  }
  // Legitimate fulfilment transitions only. The lifecycle decides what
  // is offered, so an admin can never force an illegal jump (e.g.
  // re-delivering a refunded order or marking an unpaid one complete).
  const transitions = adminTransitionsFor(order.status);
  if (transitions.length > 0) {
    let inRow = 0;
    for (const to of transitions) {
      kb.text(ORDER_STATUS_LABELS[to], `adm:ord:st:${order.id}:${to}`);
      inRow += 1;
      if (inRow % 2 === 0) kb.row();
    }
    if (inRow % 2 !== 0) kb.row();
  }
  if (order.product_id !== null) {
    kb.text('🧾 More buyers of this product', `adm:ord:p:${order.product_id}:0`).row();
  }
  kb.text('🕘 Lifecycle', `adm:ord:hist:${order.id}`).row();
  kb.text('⬅️ Back to orders', 'adm:ord:0').text('🏠 Main', 'adm:root');
  await ctx.editMessageText(lines.join('\n'), {
    parse_mode: 'HTML',
    reply_markup: kb,
  });
}

adminBot.callbackQuery(/^adm:ord:v:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await renderAdminOrderDetail(ctx, Number(ctx.match[1]));
});

// ---- Admin fulfilment state updates -------------------------------
// Every write goes through `updateOrderLifecycle`, which validates the
// transition locally AND inside `set_order_lifecycle()` before writing
// the payment / fulfilment / delivery facets and an audit event.
adminBot.callbackQuery(/^adm:ord:st:(\d+):([a-z_]+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const to = ctx.match[2] as OrderStatus;
  if (!ADMIN_SETTABLE_STATUSES.includes(to)) {
    await ctx.answerCallbackQuery({ text: 'That state cannot be set by hand.', show_alert: true });
    return;
  }
  try {
    const updated = await updateOrderLifecycle({
      order_id: id,
      to,
      actor: 'admin',
      actor_id: ctx.from?.id ?? null,
      note: `Set from admin panel by ${ctx.from?.id ?? 'unknown'}`,
    });
    await ctx.answerCallbackQuery({
      text: `Order #${id} → ${ORDER_STATUS_LABELS[normalizeOrderStatus(updated.status)]}`,
      show_alert: true,
    });
  } catch (err) {
    const msg =
      err instanceof OrderTransitionError
        ? `Not allowed: ${err.from} → ${err.to}`
        : 'Could not update this order.';
    await ctx.answerCallbackQuery({ text: msg, show_alert: true });
    return;
  }
  await renderAdminOrderDetail(ctx, id);
});

// ---- Order lifecycle history --------------------------------------
adminBot.callbackQuery(/^adm:ord:hist:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = Number(ctx.match[1]);
  const events = await listOrderStatusEvents(id, 20);
  const body =
    events.length === 0
      ? 'No lifecycle events recorded for this order yet.'
      : events
          .map(
            (e) =>
              `• <code>${new Date(e.created_at).toISOString().replace('T', ' ').slice(0, 19)}</code> ` +
              `${escapeHtml(e.from_status ?? '—')} → <b>${escapeHtml(e.to_status)}</b> (${escapeHtml(e.actor)})`,
          )
          .join('\n');
  await ctx.editMessageText(`🕘 <b>Order #${id} — Lifecycle</b>\n\n${body}`, {
    parse_mode: 'HTML',
    reply_markup: new InlineKeyboard()
      .text('🔎 View Order', `adm:ord:v:${id}`)
      .row()
      .text('⬅️ Back to orders', 'adm:ord:0'),
  });
});

adminBot.callbackQuery(/^adm:ord:precancel:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const order = await getOrder(id);
  if (!order || !isPendingPreorderOrder(order)) {
    await ctx.answerCallbackQuery({ text: 'This preorder is not pending anymore.', show_alert: true });
    return;
  }
  await setOrderDeliveredItems(
    id,
    'Preorder auto-send cancelled by admin. Manual delivery required.',
  );
  await ctx.answerCallbackQuery({ text: 'Auto-send cancelled for this preorder.', show_alert: true });
  const kb = new InlineKeyboard()
    .text('🔎 View Order', `adm:ord:v:${id}`)
    .row()
    .text('⬅️ Back to orders', 'adm:ord:0');
  await ctx.editMessageText(
    `🛑 <b>Preorder Auto-Send Cancelled</b>\n\nOrder <code>#${id}</code> will no longer auto-deliver after restock. Deliver it manually when ready.`,
    { parse_mode: 'HTML', reply_markup: kb },
  );
});

adminBot.callbackQuery(/^adm:ord:presend:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const order = await getOrder(id);
  if (!order || !isPendingPreorderOrder(order) || order.product_id === null) {
    await ctx.answerCallbackQuery({ text: 'This preorder cannot auto-send now.', show_alert: true });
    return;
  }
  ctx.session.adminFlow = { type: 'preorder_manual_send', step: 'items', data: { order_id: id } };
  await ctx.answerCallbackQuery({ text: 'Send the product details now.', show_alert: true });
  const kb = new InlineKeyboard()
    .text('🔎 View Order', `adm:ord:v:${id}`)
    .row()
    .text('⬅️ Back to orders', 'adm:ord:0');
  await ctx.editMessageText(
    [
      '⚡ <b>Auto Send Now</b>',
      '',
      `Order <code>#${id}</code> is ready for manual auto-send.`,
      'Send the product details/items now.',
      '',
      'One account/link/code per line is best.',
      'Send /cancel to abort.',
    ].join('\n'),
    { parse_mode: 'HTML', reply_markup: kb },
  );
});

// ---------- Reload / Clear cache ----------
adminBot.callbackQuery('adm:reload', async (ctx) => {
  await refreshSettings();
  cache.clearAll();
  await ctx.answerCallbackQuery({ text: '🔁 Settings reloaded.' });
  await showRoot(ctx);
});

adminBot.callbackQuery('adm:clr', async (ctx) => {
  cache.clearAll();
  await ctx.answerCallbackQuery({ text: '🧹 Cache cleared.' });
  await showRoot(ctx);
});

// ---------- Categories ----------
adminBot.callbackQuery('adm:cat', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = undefined;
  const kb = new InlineKeyboard()
    .text('➕ Add Category', 'adm:cat:add')
    .text('📋 List & Manage', 'adm:cat:list');
  backRow(kb);
  await ctx.editMessageText('🗂 *Categories*', { parse_mode: 'Markdown', reply_markup: kb });
});

adminBot.callbackQuery('adm:cat:add', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = { type: 'add_category', step: 'name', data: {} };
  await ctx.editMessageText(
    '🗂 *Add Category*\n\nSend the category *name* (or `/cancel`).',
    { parse_mode: 'Markdown', reply_markup: backRow(new InlineKeyboard()) },
  );
});

adminBot.callbackQuery('adm:cat:list', async (ctx) => {
  await ctx.answerCallbackQuery();
  await showCategoryList(ctx);
});

async function showCategoryList(ctx: AppCtx): Promise<void> {
  const cats = await listAllCategories();
  if (cats.length === 0) {
    await ctx.editMessageText('No categories yet.', {
      reply_markup: backRow(new InlineKeyboard()),
    });
    return;
  }
  const lines = ['🗂 *Categories*', ''];
  const kb = new InlineKeyboard();
  for (const c of cats) {
    lines.push(`#${c.id}  ${c.emoji ?? '📁'} ${c.name}${c.active ? '' : '  _(hidden)_'}`);
    kb.text(`🗑 #${c.id} ${c.name}`.slice(0, 60), `adm:cat:del:${c.id}`);
    const style = colorModeToStyle(getCategoryColor(c.id));
    if (style !== undefined) kb.style(style);
    kb.row();
  }
  backRow(kb);
  await ctx.editMessageText(lines.join('\n'), { parse_mode: 'Markdown', reply_markup: kb });
}

adminBot.callbackQuery(/^adm:cat:del:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await deleteCategory(id);
  cache.del('cats');
  await ctx.answerCallbackQuery({ text: `Deleted #${id}` });
  await showCategoryList(ctx);
});

// ---------- Products ----------
adminBot.callbackQuery('adm:prod', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = undefined;
  const kb = new InlineKeyboard()
    .text('➕ Add Product', 'adm:prod:add')
    .text('📋 List & Manage', 'adm:prod:list:0');
  kb.row().text('🗂 Categories', 'adm:cat');
  backRow(kb);
  await ctx.editMessageText('📦 *Products*', { parse_mode: 'Markdown', reply_markup: kb });
});

adminBot.callbackQuery('adm:prod:add', async (ctx) => {
  await ctx.answerCallbackQuery();
  const cats = await listAllCategories();
  if (cats.length === 0) {
    await ctx.editMessageText('⚠️ No categories yet. Add a category first.', {
      reply_markup: backRow(new InlineKeyboard()),
    });
    return;
  }
  const kb = new InlineKeyboard();
  cats.forEach((c, i) => {
    kb.text(`${c.emoji ?? '📁'} ${c.name}`, `adm:prod:add:cat:${c.id}`);
    // Apply the per-category Bot API 9.4 button style configured via
    // /admin → Customize → Set Color → 📂 Product Categories. Falls
    // back to the category-default color, then to undefined ('none')
    // so the button stays unstyled when nothing has been picked.
    const style = colorModeToStyle(getCategoryColor(c.id));
    if (style !== undefined) kb.style(style);
    if (i % 2 === 1) kb.row();
  });
  backRow(kb);
  await ctx.editMessageText('📦 *Add Product*\n\nPick a category:', {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
});

adminBot.callbackQuery(/^adm:prod:add:cat:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const category_id = Number(ctx.match[1]);
  ctx.session.adminFlow = { type: 'add_product', step: 'name', data: { category_id } };
  await ctx.editMessageText(
    `📦 *Add Product* (cat #${category_id})\n\nSend the product *name* (or \`/cancel\`).`,
    { parse_mode: 'Markdown', reply_markup: backRow(new InlineKeyboard()) },
  );
});

adminBot.callbackQuery(/^adm:prod:list:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showProductList(ctx, Number(ctx.match[1]));
});

async function showProductList(ctx: AppCtx, page: number): Promise<void> {
  const { rows, total } = await listAllProducts(page, PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  if (rows.length === 0) {
    await ctx.editMessageText('No products yet.', {
      reply_markup: backRow(new InlineKeyboard()),
    });
    return;
  }
  const lines = [
    `📦 *Products* — page ${page + 1}/${totalPages}`,
    '',
    '_Tap ↑ / ↓ to nudge one slot, ⏫ / ⏬ to jump straight to the top / bottom._',
    '_📌 = pinned (stays put even when out of stock). 💤 = auto-moved here because it ran out of stock; will pop back to its old spot on restock._',
    '',
  ];
  const kb = new InlineKeyboard();
  for (const p of rows) {
    const flag = p.active ? '🟢' : '⚪️';
    const pinTag = p.is_pinned ? ' 📌' : '';
    const oosTag = p.stashed_sort_order !== null ? ' 💤' : '';
    lines.push(
      `${flag} #${p.id}${pinTag}${oosTag}  ${p.name} — $${p.price}  (stock ${p.stock})`,
    );
    kb.text(`↑ #${p.id}`, `adm:prod:up:${p.id}:${page}`)
      .text(`↓ #${p.id}`, `adm:prod:dn:${p.id}:${page}`)
      .text(`✏️ Edit #${p.id}`, `adm:prod:edit:${p.id}:${page}`)
      .row();
    // One-tap jump-to-end buttons — the bot-owner asked for an
    // easier reorder UX than "tap ↑ thirty times" so each row gets
    // ⏫ Top / ⏬ Bottom alongside the nudge buttons. The pin toggle
    // sits next to them since pin status is the other thing that
    // affects ordering at a glance.
    kb.text(`⏫ Top #${p.id}`, `adm:prod:top:${p.id}:${page}`)
      .text(`⏬ Bottom #${p.id}`, `adm:prod:bot:${p.id}:${page}`)
      .text(
        p.is_pinned ? `📌 Pinned #${p.id}` : `📌 Pin #${p.id}`,
        `adm:prod:pin:${p.id}:${page}`,
      )
      .row();
    kb.text(p.active ? `👁 Hide #${p.id}` : `👁 Show #${p.id}`, `adm:prod:tog:${p.id}:${page}`)
      .text(`🆔 ID #${p.id}`, `adm:prod:id:set:${p.id}:${page}`)
      .text(`🗑 #${p.id}`, `adm:prod:del:${p.id}:${page}`)
      .row();
    // Per-product Add Items / Edit Pool shortcuts. Both reuse the
    // existing handlers — `📦 Add Items #N` arms the bulk-paste flow
    // for that product, `🔎 Edit Pool #N` opens the Stock Items
    // inspector (page 0). Saves the admin a hop through the per-
    // product editor card when they just want to top up or audit
    // the items pool for one product among several on a page.
    kb.text(`📦 Add Items #${p.id}`, `adm:prod:items:add:${p.id}:${page}`)
      .text(`🔎 Edit Pool #${p.id}`, `adm:prod:items:view:${p.id}:${page}:0`)
      .row();
  }
  if (page > 0) kb.text('◀️ Prev', `adm:prod:list:${page - 1}`);
  if (page + 1 < totalPages) kb.text('Next ▶️', `adm:prod:list:${page + 1}`);
  backRow(kb);
  await ctx.editMessageText(lines.join('\n'), { parse_mode: 'Markdown', reply_markup: kb });
}

adminBot.callbackQuery(/^adm:prod:del:(\d+):(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await deleteProduct(id);
  cache.del('cats');
  await ctx.answerCallbackQuery({ text: `Deleted product #${id}` });
  await showProductList(ctx, Number(ctx.match[2]));
});

adminBot.callbackQuery(/^adm:prod:tog:(\d+):(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const { rows } = await listAllProducts(0, 1000);
  const p = rows.find((x) => x.id === id);
  if (p) await setProductActive(id, !p.active);
  await ctx.answerCallbackQuery({ text: 'Visibility toggled' });
  await showProductList(ctx, Number(ctx.match[2]));
});

// Move a product up / down in the admin sort order. Works across
// page boundaries — swapping with a row on a different page just
// changes the (sort_order, id) tuple so the affected rows shift
// when the list is re-rendered. The swap is silently a no-op when
// the product is already at the boundary (top of page 0 going up,
// or last row of the last page going down).
adminBot.callbackQuery(/^adm:prod:(up|dn):(\d+):(\d+)$/, async (ctx) => {
  const direction: 'up' | 'down' = ctx.match[1] === 'up' ? 'up' : 'down';
  const id = Number(ctx.match[2]);
  const page = Number(ctx.match[3]);
  // If the row is currently auto-OOS-stashed (sort_order slammed to
  // the sentinel value), restore its admin-placed sort_order first
  // so the swap operates on a real catalog position rather than the
  // OOS bottom-of-the-list value. Otherwise an ↑ nudge would swap
  // sort_orders with the row immediately above and corrupt THAT
  // row's position to the OOS sentinel.
  await unstashSortOrder(id).catch((err) => {
    logger.warn({ err, id }, 'unstashSortOrder before reorder swap failed');
  });
  const cur = await listAllProducts(0, 1000).then(({ rows }) =>
    rows.find((r) => r.id === id),
  );
  if (!cur) {
    await ctx.answerCallbackQuery({ text: 'Product no longer exists' });
    await showProductList(ctx, page);
    return;
  }
  const neighbour = await findAdjacentProduct(id, direction);
  if (!neighbour) {
    await ctx.answerCallbackQuery({
      text: direction === 'up' ? 'Already at top' : 'Already at bottom',
    });
    return;
  }
  await swapProductOrder(
    { id: cur.id, sort_order: cur.sort_order },
    { id: neighbour.id, sort_order: neighbour.sort_order },
  );
  cache.del('cats');
  await ctx.answerCallbackQuery({
    text: direction === 'up' ? '↑ Moved up' : '↓ Moved down',
  });
  await showProductList(ctx, page);
});

// One-tap jump-to-the-top / jump-to-the-bottom for the bot-owner's
// "make reorder easier" request. Both clear `stashed_sort_order` —
// the admin is taking an explicit position decision; we don't want
// a later restock to overwrite their choice with the old slot.
adminBot.callbackQuery(/^adm:prod:top:(\d+):(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  try {
    await moveProductToTop(id);
    cache.del('cats');
    await ctx.answerCallbackQuery({ text: '⏫ Moved to top' });
  } catch (err) {
    logger.error({ err, id }, 'moveProductToTop failed');
    await ctx.answerCallbackQuery({
      text: 'Move-to-top failed. See server logs.',
      show_alert: true,
    });
  }
  await showProductList(ctx, page);
});

adminBot.callbackQuery(/^adm:prod:bot:(\d+):(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  try {
    await moveProductToBottom(id);
    cache.del('cats');
    await ctx.answerCallbackQuery({ text: '⏬ Moved to bottom' });
  } catch (err) {
    logger.error({ err, id }, 'moveProductToBottom failed');
    await ctx.answerCallbackQuery({
      text: 'Move-to-bottom failed. See server logs.',
      show_alert: true,
    });
  }
  await showProductList(ctx, page);
});

// Pinning a product makes it exempt from the auto-OOS-to-end move
// so it stays exactly where the admin placed it even when stock
// drops to 0. Tapping a pinned product unpins it (and if it's
// currently out of stock, immediately slides it to the catalog
// bottom so the list looks consistent with the new state).
adminBot.callbackQuery(/^adm:prod:pin:(\d+):(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  try {
    const cur = await getProduct(id);
    if (!cur) {
      await ctx.answerCallbackQuery({ text: 'Product not found' });
      await showProductList(ctx, page);
      return;
    }
    const nowPinned = !cur.is_pinned;
    await setProductPinned(id, nowPinned);
    cache.del('cats');
    await ctx.answerCallbackQuery({
      text: nowPinned ? '📌 Pinned in place' : '🔓 Unpinned',
    });
  } catch (err) {
    logger.error({ err, id }, 'setProductPinned failed');
    await ctx.answerCallbackQuery({
      text:
        'Pin toggle failed. If the error mentions a missing column, apply Supabase migration 0025.',
      show_alert: true,
    });
  }
  await showProductList(ctx, page);
});

// ---------- Per-product inline editor ----------
//
// Surfaced from the product list as `✏️ Edit #N`. Renders a card
// with every per-product asset (premium emoji, note, view-note file,
// tutorial, items pool, unlimited-stock toggle, base price/stock/name)
// as a button so the admin never has to copy slash commands.
//
// Each button either mutates the row directly (toggles, clears) or
// arms a one-shot adminFlow that captures the next message and
// applies the patch — e.g. tap "Set Premium Emoji", send a 🎬 premium
// emoji message in chat, the bot reads `custom_emoji_id` and saves it.
async function showProductEditor(
  ctx: AppCtx,
  product_id: number,
  page: number,
): Promise<void> {
  const supplierLink = await getSupplierProductLinkByProduct(product_id).catch((err) => {
    if (isSupplierMigrationError(err)) return null;
    logger.warn({ err, product_id }, 'showProductEditor supplier link lookup failed');
    return null;
  });
  // Re-align `products.stock` with the live pool count before reading
  // the product so the editor card always reflects reality.
  // `addProductItems()` already calls `syncProductStockToPool` after a
  // successful insert, but the call is wrapped in a `.catch()` and
  // swallowed there — if Supabase rejected the update for any reason
  // (transient network blip, rare RLS hiccup, etc.) the products row
  // would drift below the real pool size and buyers would hit
  // "out of stock" even though there are unconsumed items waiting.
  // Doing the sync here is idempotent and cheap (two indexed queries),
  // and guarantees the admin-facing card and the buyer-facing stock
  // gate stay consistent after every bulk-add Confirm.
  if (!supplierLink) {
    await syncProductStockToPool(product_id).catch((err) => {
      logger.error(
        { err, product_id },
        'showProductEditor: syncProductStockToPool failed',
      );
    });
  }
  const p = await getProduct(product_id);
  if (!p) {
    const opts = { reply_markup: backRow(new InlineKeyboard()) };
    if (ctx.callbackQuery?.message) {
      await ctx.editMessageText('⚠️ Product not found.', opts);
    } else {
      await ctx.reply('⚠️ Product not found.', opts);
    }
    return;
  }
  const itemsCount = await countAvailableProductItems(product_id);
  // Inventory states (0061): 📦 Available · 🔒 Reserved · ✅ Delivered.
  // Reserved = units held by an in-flight paid order; those are already
  // deducted from the sellable count, so the admin can see at a glance
  // why the catalog number moved before anything was delivered.
  const inventoryStats = await getProductInventoryStats(product_id);
  // Source the visible "Stock" cell from the live pool count when the
  // product isn't unlimited — the products.stock column is just a
  // denormalised mirror, the truth is `countAvailableProductItems()`.
  // This keeps the card honest even if a sync ever misses.
  const stockCell = p.unlimited_stock ? '∞' : supplierLink ? String(p.stock) : String(itemsCount);
  // Per-product custom-price override count — surfaced inline + drives
  // the "Clear all custom prices" button label. Cheap (one head-count
  // query) and lets the admin see at a glance whether any user has a
  // non-default price on this product.
  const overrideCount = await countProductPriceOverrides(product_id);
  // Post-purchase delivery form summary line. We show a one-liner
  // with the toggle state + the number of fields configured so the
  // admin can tell at a glance whether THIS product asks the buyer
  // for extra details after payment, without expanding into the
  // sub-editor.
  const deliveryFieldsCount = Array.isArray(p.delivery_fields)
    ? p.delivery_fields.length
    : 0;
  // When the form is ON but no fields are configured the buyer flow
  // now falls back to a single default `Details` prompt — surface
  // that here so the admin understands what their toggle is actually
  // sending the buyer ("ON (using default Details prompt)") and can
  // tap 🗂 Fields to override with a typed multi-field spec.
  const deliveryStateLabel = p.delivery_form_enabled
    ? deliveryFieldsCount > 0
      ? `*ON* (${deliveryFieldsCount} field${deliveryFieldsCount === 1 ? '' : 's'})`
      : '*ON* (using default `Details` prompt — tap 🗂 Fields to customise)'
    : '_OFF_';
  const deliveryVendorLabel = p.delivery_vendor_chat_id
    ? '`' + (p.delivery_vendor_label || p.delivery_vendor_chat_id) + '`'
    : '_unset_';
  const referralLabel =
    p.referral_required_count > 0
      ? `*${p.referral_required_count} referral${p.referral_required_count === 1 ? '' : 's'}*`
      : '_OFF_';
  const productColor = getProductColor(p.id);
  const lines = [
    `✏️ *Edit Product #${p.id}*`,
    '',
    `*Name:* ${p.name}`,
    `*Price:* ${Number(p.price).toFixed(2)} USDT`,
    `*Stock:* ${stockCell}`,
    `*Inventory:* ${inventoryLine(inventoryStats)}`,
    lowStockBadge(inventoryStats) || null,
    supplierLink
      ? `*Supplier link:* \`${supplierLink.supplier_product_id}\` · stock sync *${supplierLink.auto_sync_stock ? 'ON' : 'OFF'}*`
      : null,
    `*Referral Pay:* ${referralLabel}`,
    `*Select Button Color:* ${productColor ? `*${productColor}*` : '_Default / inherited_'}`,
    `*Warranty:* ${p.warranty ? '`set`' : '_unset_'}`,
    `*Premium Emoji:* ${p.emoji_id ? '`set`' : '_unset_'}`,
    `*Description:* ${p.description ? '`set`' : '_unset_'}`,
    `*Note Text:* ${p.note ? '`set`' : '_unset_'}`,
    `*Tutorial Text:* ${p.tutorial_text ? '`set`' : '_unset_'}`,
    `*Tutorial File:* ${p.tutorial_file_id ? '`' + p.tutorial_file_type + '`' : '_unset_'}`,
    `*Tutorial URL:* ${p.tutorial_url ? '`' + p.tutorial_url + '`' : '_unset_'}`,
    `*Items pool:* ${itemsCount} unconsumed`,
    `*Custom prices:* ${overrideCount} user override${overrideCount === 1 ? '' : 's'}`,
    `*Delivery form:* ${deliveryStateLabel}`,
    `*Delivery vendor:* ${deliveryVendorLabel}`,
    '',
    '_Tap a button to edit. For "Set Premium Emoji" / "Set Tutorial File", the bot will capture your next message of the appropriate kind._',
  ].filter((x): x is string => x !== null);
  const kb = new InlineKeyboard();
  kb.text('🎬 Set Premium Emoji', `adm:prod:emoji:set:${p.id}:${page}`)
    .text('🧹 Clear Emoji', `adm:prod:emoji:clr:${p.id}:${page}`)
    .row();
  kb.text('📝 Set Note Text', `adm:prod:note:settxt:${p.id}:${page}`)
    .text('🧹 Clear Note', `adm:prod:note:clr:${p.id}:${page}`)
    .row();
  kb.text('📄 Edit Description', `adm:prod:desc:set:${p.id}:${page}`)
    .text('🧹 Clear Desc', `adm:prod:desc:clr:${p.id}:${page}`)
    .row();
  kb.text('⭐ Edit Warranty', `adm:prod:war:set:${p.id}:${page}`)
    .text('🧹 Clear Warranty', `adm:prod:war:clr:${p.id}:${page}`)
    .row();
  kb.text('📘 Tutorial Text', `adm:prod:tut:settxt:${p.id}:${page}`)
    .text('🎞 Tutorial File', `adm:prod:tut:setfile:${p.id}:${page}`)
    .row();
  // Per-field clear row matches the Bot Tutorial editor: bot-owner
  // explicitly asked for a "Clear File" alongside "Set File" so the
  // attachment can be removed without nuking the rest of the
  // tutorial. `Clear Tutorial` (everything) stays as a separate row
  // for the all-at-once nuke path.
  kb.text('🧹 Clear File', `adm:prod:tut:clrfile:${p.id}:${page}`)
    .text('🔗 Tutorial URL', `adm:prod:tut:seturl:${p.id}:${page}`)
    .row();
  kb.text('🧹 Clear Tutorial', `adm:prod:tut:clr:${p.id}:${page}`).row();
  kb.text(`📦 Add Items (pool: ${itemsCount})`, `adm:prod:items:add:${p.id}:${page}`)
    .text('🧹 Clear Pool', `adm:prod:items:clr:${p.id}:${page}`)
    .row();
  // Stock Inspection — bot-owner asked for a way to audit remaining
  // accounts / links / codes per product. Disabled when the pool is
  // empty so the admin doesn't tap into a dead end (we still ack the
  // tap with a popup explaining the empty state).
  kb.text(
    `🔎 View Stock Items (${itemsCount})`,
    `adm:prod:items:view:${p.id}:${page}:0`,
  ).row();
  kb.text(
    p.unlimited_stock ? '♾ Unlimited: ON' : '♾ Unlimited: OFF',
    `adm:prod:unl:tog:${p.id}:${page}`,
  )
    .text(
      p.is_pinned ? '📌 Pinned: ON' : '📌 Pinned: OFF',
      `adm:prod:pin:${p.id}:${page}`,
    )
    .row();
  kb.text(
    `🎨 Select Button Color: ${productColor ?? 'Default'}`,
    `adm:prod:color:${p.id}:${page}`,
  ).row();
  kb.text('🗂 Group / Category', `adm:prod:cat:${p.id}:${page}`).row();
  if (p.category_id !== null && p.category_id !== undefined) {
    kb.text('⬆️ Group Up', `adm:prod:catmove:${p.id}:${page}:up`)
      .text('⬇️ Group Down', `adm:prod:catmove:${p.id}:${page}:down`)
      .row();
  }
  kb.text('💰 Edit Price', `adm:prod:price:set:${p.id}:${page}`)
    .text('🔢 Edit Stock', `adm:prod:stock:set:${p.id}:${page}`)
    .text('🅰️ Edit Name', `adm:prod:name:set:${p.id}:${page}`)
    .row();
  kb.text(
    `🟠 Low-stock alert (${inventoryStats?.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD})`,
    `adm:prod:lowstock:set:${p.id}:${page}`,
  ).row();
  kb.text('🎁 Referral Pay', `adm:prod:ref:set:${p.id}:${page}`)
    .text('🧹 Disable Referral Pay', `adm:prod:ref:clr:${p.id}:${page}`)
    .row();
  // One-click wipe of every user's custom-price override for this
  // product so they all fall back to the default Price above. Hidden
  // when nobody has an override on this product — the disabled-style
  // button would just be visual noise.
  if (overrideCount > 0) {
    kb.text(
      `🧹 Clear all custom prices (${overrideCount})`,
      `adm:prod:cpclr:${p.id}:${page}`,
    ).row();
  }
  kb.text('🆔 Edit ID', `adm:prod:id:set:${p.id}:${page}`)
    .text('🔗 Share Link', `adm:prod:share:${p.id}:${page}`)
    .row();
  // --- Post-purchase delivery form sub-editor ---
  // First row toggles the feature ON/OFF; the rest of the rows only
  // surface once it's ON so the editor stays tight for products that
  // don't need this flow.
  kb.text(
    p.delivery_form_enabled ? '📥 Delivery Form: ON' : '📥 Delivery Form: OFF',
    `adm:prod:del:tog:${p.id}:${page}`,
  ).row();
  if (p.delivery_form_enabled) {
    kb.text('✏️ Instruction', `adm:prod:del:instr:${p.id}:${page}`)
      .text('🗂 Fields', `adm:prod:del:fields:${p.id}:${page}`)
      .row();
    kb.text('✅ Success Message', `adm:prod:del:succ:${p.id}:${page}`)
      .text('🤝 Vendor Chat ID', `adm:prod:del:vendor:${p.id}:${page}`)
      .row();
    kb.text('🎉 Completed Message', `adm:prod:del:complete_msg:${p.id}:${page}`).row();
    kb.text('🏷 Vendor Label', `adm:prod:del:vlabel:${p.id}:${page}`)
      .text('🧹 Clear Delivery', `adm:prod:del:clr:${p.id}:${page}`)
      .row();
  }
  kb.text('🧾 View Buyers', `adm:ord:p:${p.id}:0`).row();
  kb.text('⬅️ Back to list', `adm:prod:list:${page}`);
  const editorOptions = {
    parse_mode: 'Markdown',
    reply_markup: kb,
  } as const;
  if (ctx.callbackQuery?.message) {
    await ctx.editMessageText(lines.join('\n'), editorOptions);
  } else {
    await ctx.reply(lines.join('\n'), editorOptions);
  }
}

adminBot.callbackQuery(/^adm:prod:edit:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showProductEditor(ctx, Number(ctx.match[1]), Number(ctx.match[2]));
});

const CATEGORY_CE_MARKER_RX = /\{\{ce:([^|}\n]+)\|([^}\n]+)\}\}/;

function cleanCategoryButtonText(text: string | null | undefined): string {
  return (text ?? '').replace(CATEGORY_CE_MARKER_RX, '$2').trim();
}

async function showProductCategoryPicker(
  ctx: AppCtx,
  productId: number,
  page: number,
): Promise<void> {
  const product = await getProduct(productId);
  if (!product) {
    await ctx.answerCallbackQuery({ text: 'Product not found.', show_alert: true });
    return;
  }
  const cats = await listAllCategories();
  const kb = new InlineKeyboard();
  for (const c of cats) {
    const emoji = cleanCategoryButtonText(c.emoji) || '🗂';
    const name = cleanCategoryButtonText(c.name) || c.name;
    const label = `${product.category_id === c.id ? '✓ ' : ''}${emoji} ${name}`.slice(0, 60);
    kb.text(label, `adm:prod:cat:set:${productId}:${page}:${c.id}`);
    const style = colorModeToStyle(getCategoryColor(c.id));
    if (style !== undefined) kb.style(style);
    kb.row();
  }
  kb.text('⬅️ Back to product', `adm:prod:edit:${productId}:${page}`);
  await ctx.editMessageText(
    [
      '🗂 <b>Move Product To Group / Category</b>',
      '',
      `<b>Product:</b> ${escapeHtml(product.name)}`,
      '',
      'Pick the custom group/category where this product should appear.',
      'Tip: category names like <b>Grok Super All Plans</b> show as one grouped button in Shop.',
    ].join('\n'),
    { parse_mode: 'HTML', reply_markup: kb },
  );
}

adminBot.callbackQuery(/^adm:prod:cat:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showProductCategoryPicker(ctx, Number(ctx.match[1]), Number(ctx.match[2]));
});

adminBot.callbackQuery(/^adm:prod:cat:set:(\d+):(\d+):(\d+)$/, async (ctx) => {
  const productId = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  const categoryId = Number(ctx.match[3]);
  const category = await getCategory(categoryId);
  if (!category) {
    await ctx.answerCallbackQuery({ text: 'Category not found.', show_alert: true });
    return;
  }
  await updateProduct(productId, { category_id: category.id });
  cache.del('cats');
  await ctx.answerCallbackQuery({
    text: `Moved to ${cleanCategoryButtonText(category.name) || category.name}.`,
  });
  await showProductEditor(ctx, productId, page);
});

type ProductOrderUnit =
  | { kind: 'group'; products: DBProduct[] }
  | { kind: 'product'; product: DBProduct };

async function moveProductCategoryBlock(
  categoryId: number,
  direction: 'up' | 'down',
): Promise<boolean> {
  const { rows } = await listAllProducts(0, 10000);
  const groupProducts = rows.filter((p) => p.category_id === categoryId);
  if (groupProducts.length === 0) return false;

  const units: ProductOrderUnit[] = [];
  let insertedGroup = false;
  for (const product of rows) {
    if (product.category_id === categoryId) {
      if (!insertedGroup) {
        units.push({ kind: 'group', products: groupProducts });
        insertedGroup = true;
      }
      continue;
    }
    units.push({ kind: 'product', product });
  }

  const from = units.findIndex((u) => u.kind === 'group');
  const to = direction === 'up' ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= units.length) return false;
  [units[from], units[to]] = [units[to]!, units[from]!];

  const flattened = units.flatMap((unit) =>
    unit.kind === 'group' ? unit.products : [unit.product],
  );
  for (let index = 0; index < flattened.length; index += 1) {
    await updateProduct(flattened[index]!.id, {
      sort_order: index,
      stashed_sort_order: null,
    });
  }
  cache.del('cats');
  return true;
}

adminBot.callbackQuery(/^adm:prod:catmove:(\d+):(\d+):(up|down)$/, async (ctx) => {
  const productId = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  const direction = ctx.match[3] as 'up' | 'down';
  const product = await getProduct(productId);
  if (!product?.category_id) {
    await ctx.answerCallbackQuery({ text: 'This product is not inside a group.', show_alert: true });
    return;
  }
  const moved = await moveProductCategoryBlock(product.category_id, direction);
  await ctx.answerCallbackQuery({
    text: moved
      ? `Group moved ${direction}.`
      : `Group is already at the ${direction === 'up' ? 'top' : 'bottom'}.`,
  });
  await showProductEditor(ctx, productId, page);
});

// --- Per-product catalog select-button color ---
adminBot.callbackQuery(/^adm:prod:color:(\d+):(\d+)$/, async (ctx) => {
  const productId = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  const product = await getProduct(productId);
  if (!product) {
    await ctx.answerCallbackQuery({ text: 'Product not found.', show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery();
  const current = getProductColor(productId);
  const kb = new InlineKeyboard();
  const modes: Array<{ mode: ColorMode; label: string }> = [
    { mode: 'blue', label: '🔵 Blue' },
    { mode: 'green', label: '🟢 Green' },
    { mode: 'red', label: '🔴 Red' },
  ];
  for (const { mode, label } of modes) {
    kb.text(`${current === mode ? '✓ ' : ''}${label}`, `adm:prod:color:set:${productId}:${page}:${mode}`);
    const style = colorModeToStyle(mode);
    if (style) kb.style(style);
  }
  kb.row()
    .text(
      `${current === undefined ? '✓ ' : ''}Default / Inherit`,
      `adm:prod:color:set:${productId}:${page}:default`,
    )
    .row()
    .text('⬅️ Back to product', `adm:prod:edit:${productId}:${page}`);
  await ctx.editMessageText(
    [
      `🎨 <b>Select Button Color</b>`,
      '',
      `<b>Product:</b> ${escapeHtml(product.name)}`,
      `<b>Current:</b> ${current ?? 'Default / inherited'}`,
      '',
      'This changes only this product button in the Available Products list.',
      'Out-of-stock products still show red.',
    ].join('\n'),
    { parse_mode: 'HTML', reply_markup: kb },
  );
});

adminBot.callbackQuery(
  /^adm:prod:color:set:(\d+):(\d+):(default|blue|green|red)$/,
  async (ctx) => {
    const productId = Number(ctx.match[1]);
    const page = Number(ctx.match[2]);
    const selected = ctx.match[3]!;
    if (selected === 'default') {
      await clearProductColor(productId);
      await ctx.answerCallbackQuery({ text: 'Product color reset to inherited default.' });
    } else {
      await setProductColor(productId, selected as ColorMode, ctx.from!.id);
      await ctx.answerCallbackQuery({ text: `Product button color set to ${selected}.` });
    }
    await showProductEditor(ctx, productId, page);
  },
);

// --- Premium emoji ---
adminBot.callbackQuery(/^adm:prod:emoji:set:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const product_id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  ctx.session.adminFlow = {
    type: 'edit_product_emoji',
    step: 'premium',
    data: { product_id, page },
  };
  await ctx.reply(
    '🎬 Send a single *premium* emoji as your next message — the bot will read its `custom_emoji_id` and save it.',
    { parse_mode: 'Markdown' },
  );
});

adminBot.callbackQuery(/^adm:prod:emoji:clr:(\d+):(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await updateProduct(id, { emoji_id: null });
  await ctx.answerCallbackQuery({ text: 'Cleared' });
  await showProductEditor(ctx, id, Number(ctx.match[2]));
});

// --- Note text ---
adminBot.callbackQuery(/^adm:prod:note:settxt:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const product_id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  ctx.session.adminFlow = {
    type: 'edit_product_note_text',
    step: 'text',
    data: { product_id, page },
  };
  await ctx.reply(
    '📝 Send the *View Note* text now (any premium emojis you include are preserved). Send `/cancel` to abort.',
    { parse_mode: 'Markdown' },
  );
});

adminBot.callbackQuery(/^adm:prod:note:clr:(\d+):(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await updateProduct(id, { note: null });
  await ctx.answerCallbackQuery({ text: 'Cleared' });
  await showProductEditor(ctx, id, Number(ctx.match[2]));
});

// --- Description ---
adminBot.callbackQuery(/^adm:prod:desc:set:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const product_id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  ctx.session.adminFlow = {
    type: 'edit_product_description',
    step: 'text',
    data: { product_id, page },
  };
  await ctx.reply(
    '📄 Send the new *description* text now. Send `/cancel` to abort.',
    { parse_mode: 'Markdown' },
  );
});

adminBot.callbackQuery(/^adm:prod:desc:clr:(\d+):(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await updateProduct(id, { description: null });
  await ctx.answerCallbackQuery({ text: 'Cleared' });
  await showProductEditor(ctx, id, Number(ctx.match[2]));
});

// --- Warranty ---
adminBot.callbackQuery(/^adm:prod:war:set:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const product_id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  ctx.session.adminFlow = {
    type: 'edit_product_warranty',
    step: 'text',
    data: { product_id, page },
  };
  await ctx.reply(
    '⭐ Send the new *warranty* text now. Send `/cancel` to abort.',
    { parse_mode: 'Markdown' },
  );
});

adminBot.callbackQuery(/^adm:prod:war:clr:(\d+):(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await updateProduct(id, { warranty: null });
  await ctx.answerCallbackQuery({ text: 'Cleared' });
  await showProductEditor(ctx, id, Number(ctx.match[2]));
});

// --- Referral Pay ---
// Per-product low-stock threshold. `default` clears the override so the
// product follows the global inventory.low_stock_threshold setting.
adminBot.callbackQuery(/^adm:prod:lowstock:set:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const product_id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  ctx.session.adminFlow = {
    type: 'edit_product_low_stock',
    step: 'threshold',
    data: { product_id, page },
  };
  await ctx.reply(
    '🟠 Send the low-stock alert threshold for this product (integer ≥ 0). Send `default` to follow the global default, or `/cancel` to abort.',
    { parse_mode: 'Markdown' },
  );
});

adminBot.callbackQuery(/^adm:prod:ref:set:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const product_id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  ctx.session.adminFlow = {
    type: 'edit_product_referral_required',
    step: 'count',
    data: { product_id, page },
  };
  await ctx.reply(
    '🎁 Send the referrals required to buy this product with Referral Pay (0 = disabled). Send `/cancel` to abort.',
    { parse_mode: 'Markdown' },
  );
});

adminBot.callbackQuery(/^adm:prod:ref:clr:(\d+):(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await updateProduct(id, { referral_required_count: 0 });
  await ctx.answerCallbackQuery({ text: 'Cleared' });
  await showProductEditor(ctx, id, Number(ctx.match[2]));
});

// --- Tutorial text/file/url ---
adminBot.callbackQuery(/^adm:prod:tut:settxt:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const product_id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  ctx.session.adminFlow = {
    type: 'edit_product_tutorial_text',
    step: 'text',
    data: { product_id, page },
  };
  await ctx.reply(
    '📘 Send the *Using Method* tutorial text. Premium emojis preserved. Send `/cancel` to abort.',
    { parse_mode: 'Markdown' },
  );
});

adminBot.callbackQuery(/^adm:prod:tut:setfile:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const product_id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  ctx.session.adminFlow = {
    type: 'edit_product_tutorial_file',
    step: 'file',
    data: { product_id, page },
  };
  await ctx.reply(
    '🎞 Send a photo, video, or document as your next message — it becomes the tutorial attachment.',
    { parse_mode: 'Markdown' },
  );
});

adminBot.callbackQuery(/^adm:prod:tut:seturl:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const product_id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  ctx.session.adminFlow = {
    type: 'edit_product_tutorial_url',
    step: 'url',
    data: { product_id, page },
  };
  await ctx.reply(
    '🔗 Send the tutorial *URL* as your next message (must start with `http://` or `https://`).',
    { parse_mode: 'Markdown' },
  );
});

adminBot.callbackQuery(/^adm:prod:tut:clr:(\d+):(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await updateProduct(id, {
    tutorial_text: null,
    tutorial_file_id: null,
    tutorial_file_type: null,
    tutorial_url: null,
  });
  await ctx.answerCallbackQuery({ text: 'Tutorial cleared' });
  await showProductEditor(ctx, id, Number(ctx.match[2]));
});

// Clear ONLY the per-product tutorial file attachment. Mirrors the
// Bot Tutorial editor's `adm:bot:tut:clrfile`. Bot-owner asked for
// this so the admin can swap the Using Method file without re-typing
// the tutorial body or re-pasting the URL.
adminBot.callbackQuery(/^adm:prod:tut:clrfile:(\d+):(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await updateProduct(id, {
    tutorial_file_id: null,
    tutorial_file_type: null,
  });
  await ctx.answerCallbackQuery({ text: 'Tutorial file cleared' });
  await showProductEditor(ctx, id, Number(ctx.match[2]));
});

// ---- Post-purchase delivery form sub-editor ----
//
// Each callback either toggles a boolean, prompts the admin for a
// single text message that the matching handler in the bot.on
// ('message:text') block applies + clears, or wipes the per-product
// delivery config in one tap.

adminBot.callbackQuery(/^adm:prod:del:tog:(\d+):(\d+)$/, async (ctx) => {
  // Ack the callback FIRST so the Telegram client clears the
  // forever-spinner immediately. If `getProduct` / `updateProduct` /
  // `showProductEditor` blow up below (most commonly: migration
  // 0024 hasn't been applied yet so the `delivery_form_enabled`
  // column doesn't exist) the admin still gets a normal-looking
  // button + a follow-up error message instead of a button that
  // appears to hang.
  await ctx.answerCallbackQuery();
  const id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  try {
    const p = await getProduct(id);
    if (!p) {
      await ctx.reply('⚠️ Product not found.');
      return;
    }
    await updateProduct(id, { delivery_form_enabled: !p.delivery_form_enabled });
    await showProductEditor(ctx, id, page);
  } catch (err) {
    logger.error({ err, id }, 'adm:prod:del:tog failed');
    const msg = (err as Error)?.message ?? 'unknown error';
    const looksLikeMissingColumn = /column .* does not exist|delivery_form_enabled|delivery_fields|delivery_instruction/i.test(
      msg,
    );
    await ctx.reply(
      [
        '⚠️ Failed to toggle the Delivery Form.',
        '',
        `Error: \`${msg}\``,
        ...(looksLikeMissingColumn
          ? [
              '',
              'This usually means Supabase migration `0024_product_delivery_form.sql` has not been applied yet. Run that migration on your database and try again.',
            ]
          : []),
      ].join('\n'),
      { parse_mode: 'Markdown' },
    );
  }
});

adminBot.callbackQuery(/^adm:prod:del:instr:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const product_id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  ctx.session.adminFlow = {
    type: 'edit_product_delivery_instruction',
    step: 'text',
    data: { product_id, page },
  };
  await ctx.reply(
    [
      '✏️ *Send the delivery-form instruction text now.*',
      '',
      'This is the message buyers see _before_ the input box (e.g. _"Please send your account email & password so the seller can deliver your order."_). Premium emojis are preserved.',
      '',
      'Send `clear` to reset to the default instruction text, or `/cancel` to abort.',
    ].join('\n'),
    { parse_mode: 'Markdown' },
  );
});

adminBot.callbackQuery(/^adm:prod:del:succ:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const product_id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  ctx.session.adminFlow = {
    type: 'edit_product_delivery_success',
    step: 'text',
    data: { product_id, page },
  };
  await ctx.reply(
    [
      '✅ *Send the success-card text now.*',
      '',
      'Shown after the buyer submits their details (e.g. _"Your details has been submitted successfully — our team will approve it shortly."_). Premium emojis preserved.',
      '',
      'Send `clear` to reset to the default success text, or `/cancel` to abort.',
    ].join('\n'),
    { parse_mode: 'Markdown' },
  );
});

adminBot.callbackQuery(/^adm:prod:del:complete_msg:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const product_id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  ctx.session.adminFlow = {
    type: 'edit_product_delivery_completion',
    step: 'text',
    data: { product_id, page },
  };
  await ctx.reply(
    [
      '🎉 *Send the completed-order message now.*',
      '',
      'The buyer receives this only after you tap *Mark Fulfilled*. Premium emojis and Telegram formatting are preserved.',
      '',
      'Available placeholders: `{product_name}` and `{order_id}`.',
      '',
      'Send `clear` for the default message, or `/cancel` to abort.',
    ].join('\n'),
    { parse_mode: 'Markdown' },
  );
});

adminBot.callbackQuery(/^adm:delivery:complete:(\d+)$/, async (ctx) => {
  const submissionId = Number(ctx.match[1]);
  await ctx.answerCallbackQuery({ text: 'Completing fulfillment...' });
  try {
    const result = await completeManualDelivery({
      api: ctx.api,
      submissionId,
      adminId: ctx.from!.id,
    });
    if (!result.ok) {
      await ctx.reply('⚠️ Submission or order not found. It may have been removed.');
      return;
    }
    if (result.alreadyCompleted) {
      await ctx.reply('✅ This fulfillment was already completed. No duplicate buyer message was sent.');
      return;
    }
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => undefined);
    await ctx.reply(
      `✅ Fulfillment completed for *${escapeMd(result.productName ?? 'product')}*. The buyer was notified automatically.`,
      { parse_mode: 'Markdown' },
    );
  } catch (err) {
    logger.error({ err, submissionId }, 'manual delivery completion failed');
    await ctx.reply(
      `⚠️ Could not complete fulfillment: \`${escapeMd((err as Error)?.message ?? String(err))}\``,
      { parse_mode: 'Markdown' },
    );
  }
});

adminBot.callbackQuery(/^adm:delivery:msg:(\d+)$/, async (ctx) => {
  const submissionId = Number(ctx.match[1]);
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = {
    type: 'delivery_manual_message',
    step: 'text',
    data: { submission_id: submissionId },
  };
  await ctx.reply(
    [
      '📝 *Send the custom buyer message now.*',
      '',
      'Premium emojis and Telegram formatting are preserved.',
      'Send `/cancel` to abort.',
    ].join('\n'),
    { parse_mode: 'Markdown' },
  );
});

adminBot.callbackQuery(/^adm:prod:del:fields:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const product_id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  ctx.session.adminFlow = {
    type: 'edit_product_delivery_fields',
    step: 'spec',
    data: { product_id, page },
  };
  await ctx.reply(
    [
      '🗂 *Send the field spec — one field per line.*',
      '',
      'Each line is `key | Label | required | options`.',
      'Options can include `email` and `per_unit`. Use `email_per_unit` to require one valid email for every purchased slot.',
      '',
      '*Examples:*',
      '```',
      'email | Email | required',
      'slot_email | Slot Email | required | email_per_unit',
      'password | Password | required',
      'recovery_code | Recovery Code | optional',
      '```',
      '',
      'Send `clear` to remove every field, or `/cancel` to abort.',
    ].join('\n'),
    { parse_mode: 'Markdown' },
  );
});

adminBot.callbackQuery(/^adm:prod:del:vendor:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const product_id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  ctx.session.adminFlow = {
    type: 'edit_product_delivery_vendor',
    step: 'chat_id',
    data: { product_id, page },
  };
  await ctx.reply(
    [
      '🤝 *Send the vendor chat ID.*',
      '',
      'This is the numeric Telegram id of the vendor (user OR group) that should receive every submitted details payload as an automated DM. The vendor must have `/start`-ed this bot (or the bot must be in the group) for the DM to land.',
      '',
      'Send `clear` to disable the vendor forward for this product, or `/cancel` to abort.',
    ].join('\n'),
    { parse_mode: 'Markdown' },
  );
});

adminBot.callbackQuery(/^adm:prod:del:vlabel:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const product_id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  ctx.session.adminFlow = {
    type: 'edit_product_delivery_vendor_label',
    step: 'text',
    data: { product_id, page },
  };
  await ctx.reply(
    [
      '🏷 *Send the vendor display label.*',
      '',
      'Optional short string shown in the admin-facing summary (e.g. `@john_vendor` or `Workspace A`). Buyer never sees this — it\'s just to help you tell vendors apart in the editor.',
      '',
      'Send `clear` to remove the label, or `/cancel` to abort.',
    ].join('\n'),
    { parse_mode: 'Markdown' },
  );
});

adminBot.callbackQuery(/^adm:prod:del:clr:(\d+):(\d+)$/, async (ctx) => {
  // Ack first — same reasoning as `adm:prod:del:tog` above.
  await ctx.answerCallbackQuery({ text: 'Delivery config cleared' });
  const id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  try {
    await updateProduct(id, {
      delivery_form_enabled: false,
      delivery_instruction: null,
      delivery_fields: [],
      delivery_success_message: null,
      delivery_completion_message: null,
      delivery_vendor_chat_id: null,
      delivery_vendor_label: null,
    });
    await showProductEditor(ctx, id, page);
  } catch (err) {
    logger.error({ err, id }, 'adm:prod:del:clr failed');
    await ctx.reply(
      `⚠️ Failed to clear delivery config: \`${(err as Error)?.message ?? 'unknown error'}\``,
      { parse_mode: 'Markdown' },
    );
  }
});

// --- Items pool (bulk-add staging flow) ---
//
// Bot-owner request: instead of typing one short batch and immediately
// committing, allow accumulating large batches across messages — paste
// 100 at once, OR forward several vendor messages one-by-one, OR drop
// a `.txt` file. Everything piles up in `flow.data.staged[]` and only
// hits the pool when **Confirm** is tapped.
//
// `parsePayloadLines()` is the shared splitter: it normalises CR/LF
// line endings, trims each row, and discards empties so a forwarded
// message with blank lines / trailing whitespace still imports
// cleanly. We do NOT deduplicate against the existing pool here —
// some products legitimately ship duplicate deliverables (e.g. the
// same upgrade link N times) and the admin can always tap Clear if
// they pasted the same block twice by accident.
function parsePayloadLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Hard cap on the staging buffer. Mostly belt-and-braces against an
// admin pasting an entire 50 MB credentials dump into the chat — at
// that size we fail fast with a friendly error rather than blowing
// past Telegram's reply length limit while echoing the count back.
const ITEMS_STAGING_CAP = 5_000;

// Maximum size of an uploaded `.txt` file we'll accept. A 1 MB file
// is ~30 k payload lines — well above the staging cap above and
// also small enough that the Bot API allows direct download via the
// 20 MB `getFile` limit.
const ITEMS_DOC_BYTE_CAP = 1_000_000;

/**
 * Renders the live "Staging" status card the admin sees while the
 * bulk-add flow is active. Called every time the buffer changes
 * (text message, .txt upload, Clear tap) so the chat stays clean —
 * we edit the existing card in-place via `promptChatId` /
 * `promptMessageId` if known, otherwise drop a fresh one and
 * remember its message id.
 */
async function renderItemsStagingCard(
  ctx: AppCtx,
  flow: Extract<NonNullable<typeof ctx.session.adminFlow>, { type: 'edit_product_items' }>,
  opts: { lastDelta?: number; note?: string } = {},
): Promise<void> {
  const { product_id, page } = flow.data;
  const staged = flow.data.staged ?? [];
  const product = await getProduct(product_id);
  const productLine = product ? `*Product:* ${escapeMd(product.name)} (#${product.id})` : '';
  const lines: string[] = [
    '📥 *Bulk-add to items pool — staging*',
    '',
    productLine,
    `*Staged:* \`${staged.length}\`${typeof opts.lastDelta === 'number' ? ` (just added \`${opts.lastDelta}\`)` : ''}`,
    '',
    '_Send more lines, forward another vendor message, or upload a `.txt`_',
    '_file — every message appends to the buffer above._',
    '',
    'Tap *✅ Confirm & Add* to flush the buffer to the pool, *🧹 Clear*',
    'to drop the staged lines and start over, or *❌ Cancel* to exit',
    'without saving anything.',
  ];
  if (opts.note) {
    lines.push('', `_${escapeMd(opts.note)}_`);
  }
  const kb = new InlineKeyboard()
    .text(`✅ Confirm & Add (${staged.length})`, `adm:prod:items:confirm:${product_id}:${page}`)
    .row()
    .text('🧹 Clear staged', `adm:prod:items:clear_stage:${product_id}:${page}`)
    .text('❌ Cancel', `adm:prod:items:cancel:${product_id}:${page}`);
  const body = lines.filter((l) => l !== null && l !== undefined).join('\n');
  // Edit the existing card if we know where it lives, otherwise post
  // a new one and remember its id. Telegram replies to a stale id
  // with a 400 — fall back to a fresh post in that case.
  if (flow.data.promptChatId && flow.data.promptMessageId) {
    try {
      await ctx.api.editMessageText(
        flow.data.promptChatId,
        flow.data.promptMessageId,
        body,
        { parse_mode: 'Markdown', reply_markup: kb },
      );
      return;
    } catch (err) {
      logger.debug({ err }, 'items staging card edit failed; reposting');
    }
  }
  const sent = await ctx.reply(body, { parse_mode: 'Markdown', reply_markup: kb });
  flow.data.promptChatId = sent.chat.id;
  flow.data.promptMessageId = sent.message_id;
}

/**
 * Downloads a Telegram document via the Bot API file endpoint.
 * Returns the raw bytes as a UTF-8 string. Used to ingest `.txt`
 * vendor dumps in the bulk-add flow.
 */
async function downloadTelegramDocumentAsText(
  ctx: AppCtx,
  file_id: string,
): Promise<string> {
  const file = await ctx.api.getFile(file_id);
  if (!file.file_path) {
    throw new Error('Telegram returned no file_path for the upload.');
  }
  const url = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Telegram file download failed: HTTP ${res.status}`);
  }
  return await res.text();
}

adminBot.callbackQuery(/^adm:prod:items:add:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const product_id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  ctx.session.adminFlow = {
    type: 'edit_product_items',
    step: 'items',
    data: { product_id, page, staged: [] },
  };
  await ctx.reply(
    [
      '📦 *Bulk-add deliverables — paste, forward, or upload.*',
      '',
      'Send the deliverables across one or more messages — *one payload per line*.',
      'You can also forward vendor messages one at a time and the bot will',
      'keep stacking the lines on top of the buffer.',
      '',
      '*Examples:*',
      '```',
      'email1@example.com|password123',
      'email2@example.com|password456',
      'https://account-link/aaa-bbb-ccc',
      '1-1-1',
      '30-20',
      '```',
      '',
      '📎 You can also upload a `.txt` file (one payload per line) and the',
      'bot will auto-parse it.',
      '',
      'Nothing is added to the pool until you tap *✅ Confirm & Add* on the',
      'staging card the bot will keep updated below.',
    ].join('\n'),
    { parse_mode: 'Markdown' },
  );
  // Drop the initial staging card so the admin sees the Confirm /
  // Clear / Cancel buttons immediately even before sending any
  // payloads. Subsequent message handlers edit this card in place.
  await renderItemsStagingCard(ctx, ctx.session.adminFlow);
});

adminBot.callbackQuery(/^adm:prod:items:confirm:(\d+):(\d+)$/, async (ctx) => {
  const product_id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  const flow = ctx.session.adminFlow;
  if (!flow || flow.type !== 'edit_product_items' || flow.data.product_id !== product_id) {
    await ctx.answerCallbackQuery({ text: 'No staging session active.', show_alert: true });
    return;
  }
  const staged = flow.data.staged ?? [];
  if (staged.length === 0) {
    await ctx.answerCallbackQuery({ text: 'Nothing staged yet.', show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery({ text: `Adding ${staged.length} item(s)…` });
  try {
    await addProductItems(product_id, staged);
    await autoFulfillPreordersAfterRestock(ctx, product_id);
    await notifyPublicStockAdded(ctx, product_id, staged.length);
  } catch (err) {
    logger.error({ err, product_id }, 'bulk addProductItems failed');
    await ctx.reply('❌ Could not save items — see logs for details.');
    return;
  }
  ctx.session.adminFlow = undefined;
  await ctx.reply(`✅ Added \`${staged.length}\` item(s) to the pool.`, {
    parse_mode: 'Markdown',
  });
  await showProductEditor(ctx, product_id, page);
});

adminBot.callbackQuery(/^adm:prod:items:clear_stage:(\d+):(\d+)$/, async (ctx) => {
  const product_id = Number(ctx.match[1]);
  const flow = ctx.session.adminFlow;
  if (!flow || flow.type !== 'edit_product_items' || flow.data.product_id !== product_id) {
    await ctx.answerCallbackQuery({ text: 'No staging session active.', show_alert: true });
    return;
  }
  flow.data.staged = [];
  await ctx.answerCallbackQuery({ text: 'Staging buffer cleared.' });
  await renderItemsStagingCard(ctx, flow, { note: 'Buffer cleared.' });
});

adminBot.callbackQuery(/^adm:prod:items:cancel:(\d+):(\d+)$/, async (ctx) => {
  const product_id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  await ctx.answerCallbackQuery({ text: 'Cancelled — nothing was added.' });
  ctx.session.adminFlow = undefined;
  await showProductEditor(ctx, product_id, page);
});

adminBot.callbackQuery(/^adm:prod:items:clr:(\d+):(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await clearProductItems(id);
  await ctx.answerCallbackQuery({ text: 'Pool cleared' });
  await showProductEditor(ctx, id, Number(ctx.match[2]));
});

// --- Clear all per-user custom prices for this product ---
// Two-step flow so a stray tap doesn't silently wipe pricing
// agreements across the whole user base:
//   adm:prod:cpclr:<pid>:<page>     → show confirm dialog
//   adm:prod:cpclr:ok:<pid>:<page>  → run the delete
adminBot.callbackQuery(/^adm:prod:cpclr:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  const [p, overrideCount] = await Promise.all([
    getProduct(id),
    countProductPriceOverrides(id),
  ]);
  if (!p) {
    await ctx.editMessageText('⚠️ Product not found.', {
      reply_markup: new InlineKeyboard().text('⬅️ Back', `adm:prod:list:${page}`),
    });
    return;
  }
  if (overrideCount === 0) {
    // Edge case — the count changed to 0 between the editor render
    // and the tap. Bounce back to the editor with a toast instead of
    // showing a confirm dialog for a no-op.
    await showProductEditor(ctx, id, page);
    return;
  }
  const kb = new InlineKeyboard()
    .text('🧹 Yes, clear all', `adm:prod:cpclr:ok:${id}:${page}`)
    .text('❌ Cancel', `adm:prod:edit:${id}:${page}`);
  await ctx.editMessageText(
    [
      `🧹 *Clear all custom prices for #${p.id} ${escapeHtml(p.name)}?*`,
      '',
      `This will remove *${overrideCount}* user override${overrideCount === 1 ? '' : 's'}.`,
      `Affected users will fall back to the default price of *$${Number(p.price).toFixed(2)}*.`,
      '',
      'This cannot be undone — re-enter each user override manually if you change your mind.',
    ].join('\n'),
    { parse_mode: 'Markdown', reply_markup: kb },
  );
});

adminBot.callbackQuery(/^adm:prod:cpclr:ok:(\d+):(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  const n = await clearAllProductPriceOverrides(id);
  await ctx.answerCallbackQuery({
    text: n === 0 ? 'No overrides to clear.' : `🧹 Cleared ${n} override${n === 1 ? '' : 's'}.`,
  });
  await showProductEditor(ctx, id, page);
});

// --- Stock Inspection screen ---
// Shows the unconsumed items in the per-product pool, paginated 20
// at a time. Each row is rendered inside a Markdown blockquote so
// long account/credential strings stay visually separated; payloads
// are escaped with backticks so a stray `*` / `_` / `[` in a
// password doesn't break parsing.
const STOCK_PAGE_SIZE = 10;
async function showStockInspectionPage(
  ctx: AppCtx,
  product_id: number,
  productPage: number,
  itemsPage: number,
): Promise<void> {
  const product = await getProduct(product_id);
  if (!product) {
    await ctx.answerCallbackQuery({ text: 'Product not found', show_alert: true });
    return;
  }
  const items = await listAvailableProductItems(product_id, 1000);
  const total = items.length;
  if (total === 0) {
    await ctx.answerCallbackQuery({ text: 'Pool is empty.', show_alert: true });
    return;
  }
  const pageCount = Math.max(1, Math.ceil(total / STOCK_PAGE_SIZE));
  const safePage = Math.max(0, Math.min(itemsPage, pageCount - 1));
  const slice = items.slice(
    safePage * STOCK_PAGE_SIZE,
    safePage * STOCK_PAGE_SIZE + STOCK_PAGE_SIZE,
  );
  const lines: string[] = [
    `🔎 *Stock Inspection — ${product.name}*`,
    '',
    `*Remaining items:* \`${total}\``,
    `*Page:* \`${safePage + 1} / ${pageCount}\``,
    '',
    'Items below are listed in the order the next purchase will pull from (top = next).',
    '',
  ];
  const kb = new InlineKeyboard();
  slice.forEach((row, idx) => {
    const globalIdx = safePage * STOCK_PAGE_SIZE + idx + 1;
    // Truncate very long payloads (e.g. wall-of-text proxy creds) so
    // the admin's screen never explodes; the full payload remains in
    // the DB and is delivered to buyers as-is.
    const trimmed =
      row.payload.length > 100
        ? `${row.payload.slice(0, 100)}…`
        : row.payload;
    // Backtick-escape any backticks inside the payload so it stays
    // inside a Markdown inline-code span.
    const safe = trimmed.replace(/`/g, "'");
    lines.push(`> *${globalIdx}.* \`${safe}\``);
    // Per-item delete button so the admin can prune a specific row
    // (e.g. a duplicate that snuck into the pool) without wiping
    // everything. The button label echoes the global index so the
    // admin can match it to the listing above. `products.stock` is
    // auto-resynced after the delete via `syncProductStockToPool`.
    kb.text(
      `🗑 #${globalIdx}`,
      `adm:prod:items:del:${product_id}:${productPage}:${safePage}:${row.id}`,
    );
    if ((idx + 1) % 4 === 0) kb.row();
  });
  if (slice.length % 4 !== 0) kb.row();
  if (pageCount > 1) {
    if (safePage > 0) {
      kb.text(
        '⬅️ Prev',
        `adm:prod:items:view:${product_id}:${productPage}:${safePage - 1}`,
      );
    }
    kb.text('🔄', `adm:prod:items:view:${product_id}:${productPage}:${safePage}`);
    if (safePage < pageCount - 1) {
      kb.text(
        'Next ➡️',
        `adm:prod:items:view:${product_id}:${productPage}:${safePage + 1}`,
      );
    }
    kb.row();
  }
  kb.text('⬅️ Back', `adm:prod:edit:${product_id}:${productPage}`);
  await ctx.editMessageText(lines.join('\n'), {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
}

adminBot.callbackQuery(
  /^adm:prod:items:view:(\d+):(\d+):(\d+)$/,
  async (ctx) => {
    await ctx.answerCallbackQuery();
    await showStockInspectionPage(
      ctx,
      Number(ctx.match[1]),
      Number(ctx.match[2]),
      Number(ctx.match[3]),
    );
  },
);

// Per-item delete from the Stock Inspection screen. After the row is
// removed from the pool, `deleteProductItem` re-syncs `products.stock`
// to the new pool size (skipped for unlimited products). The screen
// is then re-rendered so the admin sees the updated count.
adminBot.callbackQuery(
  /^adm:prod:items:del:(\d+):(\d+):(\d+):(\d+)$/,
  async (ctx) => {
    const product_id = Number(ctx.match[1]);
    const productPage = Number(ctx.match[2]);
    const itemsPage = Number(ctx.match[3]);
    const item_id = Number(ctx.match[4]);
    try {
      await deleteProductItem(item_id);
      await ctx.answerCallbackQuery({ text: 'Item removed.' });
    } catch (err) {
      logger.error({ err, item_id }, 'admin delete product item failed');
      await ctx.answerCallbackQuery({
        text: 'Could not delete that item. Try again.',
        show_alert: true,
      });
      return;
    }
    // Re-render. If the page is now empty, fall back to the editor.
    const remaining = await countAvailableProductItems(product_id);
    if (remaining === 0) {
      await showProductEditor(ctx, product_id, productPage);
      return;
    }
    await showStockInspectionPage(ctx, product_id, productPage, itemsPage);
  },
);

// --- Unlimited toggle ---
adminBot.callbackQuery(/^adm:prod:unl:tog:(\d+):(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const p = await getProduct(id);
  if (!p) {
    await ctx.answerCallbackQuery({ text: 'Not found' });
    return;
  }
  await updateProduct(id, { unlimited_stock: !p.unlimited_stock });
  await ctx.answerCallbackQuery({
    text: !p.unlimited_stock ? '♾ Unlimited ON' : 'Unlimited OFF',
  });
  await showProductEditor(ctx, id, Number(ctx.match[2]));
});

// --- Edit base name/price/stock ---
adminBot.callbackQuery(/^adm:prod:price:set:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const product_id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  ctx.session.adminFlow = {
    type: 'edit_product_price',
    step: 'price',
    data: { product_id, page },
  };
  await ctx.reply('💰 Send the new *price* (number, e.g. `9.99`).', { parse_mode: 'Markdown' });
});

adminBot.callbackQuery(/^adm:prod:stock:set:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const product_id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  ctx.session.adminFlow = {
    type: 'edit_product_stock',
    step: 'stock',
    data: { product_id, page },
  };
  await ctx.reply('🔢 Send the new *stock* (integer ≥ 0).', { parse_mode: 'Markdown' });
});

adminBot.callbackQuery(/^adm:prod:name:set:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const product_id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  ctx.session.adminFlow = {
    type: 'edit_product_name',
    step: 'name',
    data: { product_id, page },
  };
  await ctx.reply('🅰️ Send the new product *name*.', { parse_mode: 'Markdown' });
});

adminBot.callbackQuery(/^adm:prod:id:set:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const product_id = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  ctx.session.adminFlow = {
    type: 'edit_product_id',
    step: 'id',
    data: { product_id, page },
  };
  await ctx.reply(
    `🆔 Current ID: \`${product_id}\`\nSend the new *product ID* (integer). ⚠️ Make sure the new ID doesn't already exist.`,
    { parse_mode: 'Markdown' },
  );
});

adminBot.callbackQuery(/^adm:prod:share:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const product_id = Number(ctx.match[1]);
  const p = await getProduct(product_id);
  if (!p) {
    await ctx.reply('⚠️ Product not found.');
    return;
  }
  const shareUrl = `https://t.me/${env.BOT_USERNAME}?start=prod_${product_id}`;
  await ctx.reply(
    `🔗 *Share link for ${escapeMd(p.name)}*\n\n` +
      `\`${shareUrl}\`\n\n` +
      '_Copy this link and share it in any group or channel. When someone taps it they\'ll land on the product page inside the bot._',
    { parse_mode: 'Markdown' },
  );
});

// ---------- Payment management hub ----------
// Keeps payment configuration and pending top-up operations under one
// navigation entry without changing any existing callback IDs.
adminBot.callbackQuery('adm:payments', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = undefined;
  const kb = new InlineKeyboard()
    .text('⚡ Automatic Gateways', 'adm:payments:auto')
    .text('📝 Manual Methods', 'adm:payments:manual')
    .row()
    .text('⏳ Pending Deposits', 'adm:dep')
    .text('🔄 Verification', 'adm:payments:verification')
    .row()
    .text('🔗 Webhooks', 'adm:payments:webhooks')
    .text('⚙️ Payment Settings', 'adm:payments:settings')
    .row();
  backRow(kb);
  await ctx.editMessageText(
    [
      '💳 *Payment Management*',
      '',
      'Manage every payment path from one place.',
      '',
      '⚡ Automatic gateways · 📝 Manual methods · ⏳ Pending deposits',
      '🔄 Verification · 🔗 Webhooks · ⚙️ Payment settings',
      '',
      '_Existing payment flows and callback IDs are preserved._',
    ].join('\n'),
    { parse_mode: 'Markdown', reply_markup: kb },
  );
});

adminBot.callbackQuery('adm:payments:auto', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = undefined;
  const kb = new InlineKeyboard()
    .text('🟢 Add USDT (TRC20)', 'adm:pay:add:usdt_trc20')
    .text('🟡 Add USDT (BEP20)', 'adm:pay:add:usdt_bep20')
    .row()
    .text('🔵 Add USDT (TON)', 'adm:pay:add:usdt_ton')
    .text('⚪ Add LTC', 'adm:pay:add:ltc')
    .row()
    .text('🟡 Add Binance Pay', 'adm:pay:add:binance_pay')
    .text('Add Bybit Pay', 'adm:pay:add:bybit_pay')
    .row()
    .text('💳 Add CryptoBot', 'adm:pay:add:cryptobot')
    .text('📋 List & Manage', 'adm:pay:list')
    .row();
  backRow(kb);
  await ctx.editMessageText(
    [
      '⚡ *Automatic Gateways*',
      '',
      'Configure on-chain, exchange-transfer, and Crypto Pay gateways.',
      'Availability is checked from the configured payment method and server-side credentials.',
      '',
      '_Credential values are never shown in the admin panel._',
    ].join('\n'),
    { parse_mode: 'Markdown', reply_markup: kb },
  );
});

adminBot.callbackQuery('adm:payments:manual', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = undefined;
  await showManualPaymentMethods(ctx);
});

adminBot.callbackQuery('adm:payments:verification', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = undefined;
  const kb = new InlineKeyboard()
    .text('⏳ Review Pending Deposits', 'adm:dep')
    .text('⚡ Automatic Gateways', 'adm:payments:auto')
    .row();
  backRow(kb);
  await ctx.editMessageText(
    [
      '🔄 *Verification*',
      '',
      'Manual deposits are reviewed from Pending Deposits.',
      'Automatic gateways verify supported payments through their existing provider and chain services.',
      '',
      'Use Re-verify on a pending deposit when a transaction needs another check.',
    ].join('\n'),
    { parse_mode: 'Markdown', reply_markup: kb },
  );
});

adminBot.callbackQuery('adm:payments:webhooks', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = undefined;
  const publicUrl = Boolean(env.PUBLIC_BASE_URL);
  const cryptoPay = Boolean(env.CRYPTOBOT_API_TOKEN);
  const kb = new InlineKeyboard()
    .text('⚡ Automatic Gateways', 'adm:payments:auto')
    .text('🩺 System Health', 'adm:health')
    .row();
  backRow(kb);
  await ctx.editMessageText(
    [
      '🔗 *Webhooks*',
      '',
      `Crypto Pay endpoint: *${publicUrl && cryptoPay ? 'Configured' : 'Needs configuration'}*`,
      '`/cryptobot/webhook`',
      '',
      'Requests are signature-verified before an invoice can credit a wallet.',
      'The endpoint and signing secret stay server-side and are never displayed.',
    ].join('\n'),
    { parse_mode: 'Markdown', reply_markup: kb },
  );
});

adminBot.callbackQuery('adm:payments:settings', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = undefined;
  const kb = new InlineKeyboard()
    .text('📝 Manual Methods', 'adm:payments:manual')
    .text('⚡ Automatic Gateways', 'adm:payments:auto')
    .row()
    .text('🔄 Verification', 'adm:payments:verification')
    .text('🔗 Webhooks', 'adm:payments:webhooks')
    .row();
  backRow(kb);
  await ctx.editMessageText(
    [
      '⚙️ *Payment Settings*',
      '',
      'Payment method names, instructions, minimum amounts, enabled state, and provider configuration are managed through the existing payment-method controls.',
      '',
      'Verification behavior is determined by the provider implementation and validated configuration. Secrets remain in deployment variables.',
    ].join('\n'),
    { parse_mode: 'Markdown', reply_markup: kb },
  );
});

// ---------- Payment methods ----------
async function showManualPaymentMethods(ctx: AppCtx): Promise<void> {
  ctx.session.adminFlow = undefined;
  const kb = new InlineKeyboard()
    .text('➕ Manual Method', 'adm:pay:add')
    .text('📋 List & Manage', 'adm:pay:list');
  backRow(kb);
  await ctx.editMessageText(
    [
      '📝 *Manual Methods*',
      '',
      'Add a manual method with its instructions and minimum amount.',
      'Users submit a deposit request that an admin approves from Pending Deposits.',
      '',
      '_Automatic providers are managed under Automatic Gateways._',
    ].join('\n'),
    { parse_mode: 'Markdown', reply_markup: kb },
  );
}

adminBot.callbackQuery('adm:pay', async (ctx) => {
  await ctx.answerCallbackQuery();
  await showManualPaymentMethods(ctx);
});

adminBot.callbackQuery('adm:pay:add', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = { type: 'add_payment', step: 'name', data: {} };
  await ctx.editMessageText(
    '💳 *Add Payment Method*\n\nSend the method *name* (e.g. `USDT (TRC20)`) or `/cancel`.',
    { parse_mode: 'Markdown', reply_markup: backRow(new InlineKeyboard()) },
  );
});

// ---------- Auto-verify payment-method wizards ----------
const CHAIN_WIZARD_INFO: Record<
  'usdt_trc20' | 'usdt_bep20' | 'usdt_ton' | 'ltc',
  { title: string; namePlaceholder: string; addressPrompt: string }
> = {
  usdt_trc20: {
    title: '🟢 *Add USDT (TRC20)*',
    namePlaceholder: 'USDT (TRC20)',
    addressPrompt:
      'Send the *TRON wallet address* (starts with `T…`, 34 chars) that USDT TRC20 deposits should land in.',
  },
  usdt_bep20: {
    title: '🟡 *Add USDT (BEP20)*',
    namePlaceholder: 'USDT (BEP20)',
    addressPrompt:
      'Send the *BSC wallet address* (starts with `0x…`, 42 chars) that USDT BEP20 deposits should land in.',
  },
  usdt_ton: {
    title: '🔵 *Add USDT (TON)*',
    namePlaceholder: 'USDT (TON)',
    addressPrompt:
      'Send the *TON wallet address* (`EQ…` or `UQ…`, 48 chars) that USDT (TON Jetton) deposits should land in.',
  },
  ltc: {
    title: '⚪ *Add LTC (Litecoin)*',
    namePlaceholder: 'LTC',
    addressPrompt:
      'Send the *Litecoin address* (`L…` / `M…` / `ltc1…`) that LTC deposits should land in.',
  },
};

adminBot.callbackQuery(
  /^adm:pay:add:(usdt_trc20|usdt_bep20|usdt_ton|ltc)$/,
  async (ctx) => {
    const provider = ctx.match[1] as
      | 'usdt_trc20'
      | 'usdt_bep20'
      | 'usdt_ton'
      | 'ltc';
    await ctx.answerCallbackQuery();
    ctx.session.adminFlow = {
      type: 'add_chain_payment',
      step: 'name',
      data: { provider },
    };
    const info = CHAIN_WIZARD_INFO[provider];
    await ctx.editMessageText(
      [
        info.title,
        '',
        `Send the *display name* shown in the user-facing top-up menu (e.g. \`${info.namePlaceholder}\`).`,
        '',
        'Or `/cancel` to abort.',
      ].join('\n'),
      { parse_mode: 'Markdown', reply_markup: backRow(new InlineKeyboard()) },
    );
  },
);

adminBot.callbackQuery('adm:pay:add:binance_pay', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = {
    type: 'add_binance_payment',
    step: 'name',
    data: {},
  };
  await ctx.editMessageText(
    [
      '🟡 *Add Binance Pay*',
      '',
      'Send the *display name* shown in the user-facing top-up menu (e.g. `Binance Pay`).',
      '',
      'Or `/cancel` to abort.',
    ].join('\n'),
    { parse_mode: 'Markdown', reply_markup: backRow(new InlineKeyboard()) },
  );
});

adminBot.callbackQuery('adm:pay:add:bybit_pay', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = {
    type: 'add_bybit_payment',
    step: 'name',
    data: {},
  };
  await ctx.editMessageText(
    [
      '*Add Bybit Pay*',
      '',
      'Send the *display name* shown in the user-facing payment menu (e.g. `Bybit Pay`).',
      '',
      'Or `/cancel` to abort.',
    ].join('\n'),
    { parse_mode: 'Markdown', reply_markup: backRow(new InlineKeyboard()) },
  );
});

adminBot.callbackQuery('adm:pay:add:cryptobot', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = {
    type: 'add_cryptobot_payment',
    step: 'name',
    data: {},
  };
  await ctx.editMessageText(
    [
      '💳 *Add CryptoBot*',
      '',
      'Send the *display name* shown in the user-facing top-up menu (e.g. `CryptoBot USDT`).',
      '',
      'This provider accepts USDT wallet top-ups through Telegram Crypto Pay.',
      '',
      'Or `/cancel` to abort.',
    ].join('\n'),
    { parse_mode: 'Markdown', reply_markup: backRow(new InlineKeyboard()) },
  );
});

adminBot.callbackQuery('adm:pay:list', async (ctx) => {
  await ctx.answerCallbackQuery();
  await showPaymentList(ctx);
});

async function showPaymentList(ctx: AppCtx): Promise<void> {
  const methods = await listPaymentMethods();
  if (methods.length === 0) {
    await ctx.editMessageText('No payment methods yet.', {
      reply_markup: backRow(new InlineKeyboard()),
    });
    return;
  }
  const lines = ['💳 *Payment Methods*', ''];
  const kb = new InlineKeyboard();
  for (const m of methods) {
    const tag =
      m.provider === 'manual'
        ? 'manual'
        : m.provider === 'usdt_trc20'
          ? 'auto • TRC20'
          : m.provider === 'usdt_bep20'
            ? 'auto • BEP20'
            : m.provider === 'usdt_ton'
              ? 'auto • TON'
              : m.provider === 'ltc'
                ? 'auto • LTC'
                : m.provider === 'bybit_pay'
                  ? 'auto • Bybit Pay'
                  : m.provider === 'cryptobot'
                    ? 'auto • CryptoBot USDT'
                : 'auto • Binance Pay';
    lines.push(`#${m.id}  ${m.name} — _${tag}_`);
    if (m.address) {
      const addrLabel =
        m.provider === 'binance_pay'
          ? 'Pay ID'
          : m.provider === 'bybit_pay'
            ? 'Bybit UID'
            : 'addr';
      lines.push(`     ${addrLabel}: \`${m.address}\``);
    }
    if ((m.provider === 'binance_pay' || m.provider === 'bybit_pay') && m.pay_name) {
      lines.push(`     Pay Name: \`${m.pay_name}\``);
    }
    // Per-method chrome controls. The button row reads "🎨 Color"
    // (cycles through none/blue/green/red/yellow) and "🌟 Icon"
    // (waits for the admin's next emoji message — supports premium
    // custom emojis). Delete is on its own row so a stray tap can't
    // wipe the row.
    const colorTag = m.color_mode && m.color_mode !== 'none' ? m.color_mode : 'default';
    const iconTag = m.emoji_id ? '⭐' : (m.emoji_unicode ?? 'default');
    kb.text(
      `🎨 #${m.id} ${colorTag}`,
      `adm:pay:color:${m.id}`,
    ).text(
      `🌟 #${m.id} ${iconTag}`,
      `adm:pay:icon:${m.id}`,
    ).row();
    // "Where TXID? / Where Order ID?" tutorial editor — same shape
    // as the global Bot Tutorial editor but scoped to this method.
    // Marked `set` if any of text / file / url is configured.
    const tut = getPaymentMethodTutorial(m.id);
    const tutTag = tut.text || tut.file_id || tut.url ? 'set' : 'unset';
    kb.text(`📘 #${m.id} Tutorial: ${tutTag}`, `adm:pay:tut:${m.id}`).row();
    kb.text(`🗑 #${m.id} ${m.name}`.slice(0, 60), `adm:pay:del:${m.id}`).row();
  }
  backRow(kb);
  await ctx.editMessageText(lines.join('\n'), { parse_mode: 'Markdown', reply_markup: kb });
}

adminBot.callbackQuery(/^adm:pay:del:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await deletePaymentMethod(id);
  // Also drop the per-method tutorial settings so a future method
  // reusing the same id doesn't inherit stale tutorial content.
  await clearPaymentMethodTutorial(id);
  await ctx.answerCallbackQuery({ text: `Deleted #${id}` });
  await showPaymentList(ctx);
});

// ---------- Per-payment-method tutorial editor ----------
// Mirrors `showBotTutorialEditor` but scoped to a payment method id.
// Shown when the admin taps the `📘 #N Tutorial` row on the payment
// methods screen. The text/file/url buttons each arm a `adminFlow`
// of the matching kind so the next admin message captures into the
// `pay_tutorial.<method_id>.*` settings.
async function showPaymentTutorialEditor(
  ctx: AppCtx,
  methodId: number,
): Promise<void> {
  const methods = await listPaymentMethods();
  const m = methods.find((x) => x.id === methodId);
  if (!m) {
    await ctx.editMessageText('Method not found.', {
      reply_markup: backRow(new InlineKeyboard()),
    });
    return;
  }
  const t = getPaymentMethodTutorial(methodId);
  const lines = [
    `📘 *Tutorial — ${escapeMd(m.name)} (#${m.id})*`,
    '',
    `*Text:* ${t.text ? '`set`' : '_unset_'}`,
    `*File:* ${t.file_id ? '`' + (t.file_type ?? 'file') + '`' : '_unset_'}`,
    `*URL:* ${t.url ? '`' + t.url + '`' : '_unset_'}`,
    '',
    '_Tap a button to edit. The bot will capture your next message of the appropriate kind._',
  ];
  const kb = new InlineKeyboard()
    .text('📝 Set Text', `adm:pay:tut:settxt:${methodId}`)
    .text('🧹 Clear Text', `adm:pay:tut:clrtxt:${methodId}`)
    .row()
    .text('🎞 Set File', `adm:pay:tut:setfile:${methodId}`)
    .text('🧹 Clear File', `adm:pay:tut:clrfile:${methodId}`)
    .row()
    .text('🔗 Set URL', `adm:pay:tut:seturl:${methodId}`)
    .text('🧹 Clear URL', `adm:pay:tut:clrurl:${methodId}`)
    .row()
    .text('⬅️ Back to Methods', 'adm:pay');
  await ctx.editMessageText(lines.join('\n'), {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
}

adminBot.callbackQuery(/^adm:pay:tut:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = undefined;
  await showPaymentTutorialEditor(ctx, id);
});

adminBot.callbackQuery(/^adm:pay:tut:settxt:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = {
    type: 'edit_payment_tutorial_text',
    step: 'text',
    data: { method_id: id },
  };
  await ctx.reply(
    `📝 Send the *Tutorial* text for method #${id} now.`,
    { parse_mode: 'Markdown' },
  );
});

adminBot.callbackQuery(/^adm:pay:tut:setfile:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = {
    type: 'edit_payment_tutorial_file',
    step: 'file',
    data: { method_id: id },
  };
  await ctx.reply(
    `🎞 Send a photo, video, or document for method #${id}.`,
    { parse_mode: 'Markdown' },
  );
});

adminBot.callbackQuery(/^adm:pay:tut:seturl:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = {
    type: 'edit_payment_tutorial_url',
    step: 'url',
    data: { method_id: id },
  };
  await ctx.reply(
    `🔗 Send the tutorial *URL* (\`http://\` or \`https://\`) for method #${id}.`,
    { parse_mode: 'Markdown' },
  );
});

adminBot.callbackQuery(/^adm:pay:tut:clrtxt:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await setPaymentMethodTutorialField(id, 'text', null, ctx.from!.id);
  await ctx.answerCallbackQuery({ text: 'Cleared' });
  await showPaymentTutorialEditor(ctx, id);
});

adminBot.callbackQuery(/^adm:pay:tut:clrfile:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await setPaymentMethodTutorialField(id, 'file_id', null, ctx.from!.id);
  await setPaymentMethodTutorialField(id, 'file_type', null, ctx.from!.id);
  await ctx.answerCallbackQuery({ text: 'Cleared' });
  await showPaymentTutorialEditor(ctx, id);
});

adminBot.callbackQuery(/^adm:pay:tut:clrurl:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await setPaymentMethodTutorialField(id, 'url', null, ctx.from!.id);
  await ctx.answerCallbackQuery({ text: 'Cleared' });
  await showPaymentTutorialEditor(ctx, id);
});

// Cycle the per-method color through the supported modes. Matches
// the order in the keyboard helpers' `colorModeToStyle` map.
adminBot.callbackQuery(/^adm:pay:color:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const methods = await listPaymentMethods();
  const m = methods.find((x) => x.id === id);
  if (!m) {
    await ctx.answerCallbackQuery({ text: 'Method not found.', show_alert: true });
    return;
  }
  const order: Array<'none' | 'blue' | 'green' | 'red' | 'yellow'> = [
    'none',
    'blue',
    'green',
    'red',
    'yellow',
  ];
  const cur = (m.color_mode ?? 'none') as (typeof order)[number];
  const next = order[(order.indexOf(cur) + 1) % order.length]!;
  await setPaymentMethodColor(id, next);
  await ctx.answerCallbackQuery({ text: `Color → ${next}` });
  await showPaymentList(ctx);
});

// Prompt admin to send the next emoji message, which we capture via
// the text-message handler below. Sending a plain unicode emoji sets
// `emoji_unicode`; sending a premium custom emoji sets `emoji_id`
// (with a unicode fallback). Sending the literal text `clear` resets
// both fields back to the per-provider defaults.
adminBot.callbackQuery(/^adm:pay:icon:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  ctx.session.adminFlow = {
    type: 'edit_payment_icon',
    step: 'icon',
    data: { method_id: id },
  };
  await ctx.answerCallbackQuery();
  await ctx.reply(
    [
      `🌟 *Set icon for payment method #${id}*`,
      '',
      'Send the next emoji message — premium custom emojis are supported.',
      '',
      'Send `clear` to reset to the per-provider default.',
    ].join('\n'),
    { parse_mode: 'Markdown' },
  );
});

// ---------- Deposits ----------
adminBot.callbackQuery('adm:dep', async (ctx) => {
  await ctx.answerCallbackQuery();
  await showDepositList(ctx);
});

async function showDepositList(ctx: AppCtx): Promise<void> {
  const deps = await listPendingDeposits();
  if (deps.length === 0) {
    await ctx.editMessageText('No pending deposits.', {
      reply_markup: backRow(new InlineKeyboard()),
    });
    return;
  }
  const lines = ['💰 *Pending Deposits*', ''];
  const kb = new InlineKeyboard();
  for (const d of deps) {
    const amountStr =
      Number(d.amount) <= 0.01
        ? `_(amount not set)_`
        : `$${d.amount}`;
    const refLine = d.reference ? `\n     ref: \`${d.reference}\`` : '';
    const txLine = d.tx_hash && d.tx_hash !== d.reference ? `\n     tx: \`${d.tx_hash}\`` : '';
    const noteLine = d.note ? `\n     ${d.note}` : '';
    lines.push(
      `#${d.id}  user \`${d.user_id}\`  ${d.method}  ${amountStr}` +
        refLine +
        txLine +
        noteLine,
    );
    kb.text(`💲 Set Amount #${d.id}`, `adm:dep:amt:${d.id}`).row();
    kb.text(`✅ Approve #${d.id}`, `adm:dep:ok:${d.id}`)
      .text(`❌ Reject #${d.id}`, `adm:dep:no:${d.id}`)
      .row();
    if (d.tx_hash) {
      kb.text(`🔁 Re-verify #${d.id}`, `adm:dep:rv:${d.id}`).row();
    }
  }
  // Bulk-reject control: clears the entire pending queue in one tap.
  // Goes through a confirmation step (`adm:dep:nuke:confirm`) so a
  // mis-tap doesn't wipe legitimate pending deposits. Spans the full
  // queue, NOT just the 20-row dashboard window — uses
  // listAllPendingDeposits() under the hood.
  kb.text('🧹 Reject ALL Pending', 'adm:dep:nuke:confirm').row();
  backRow(kb);
  await ctx.editMessageText(lines.join('\n'), { parse_mode: 'Markdown', reply_markup: kb });
}

adminBot.callbackQuery('adm:dep:nuke:confirm', async (ctx) => {
  await ctx.answerCallbackQuery();
  const deps = await listAllPendingDeposits();
  if (deps.length === 0) {
    await ctx.editMessageText('No pending deposits to reject.', {
      reply_markup: backRow(new InlineKeyboard()),
    });
    return;
  }
  const kb = new InlineKeyboard()
    .text(`🧨 Yes — reject all ${deps.length}`, 'adm:dep:nuke:do')
    .row()
    .text('⬅️ Cancel', 'adm:dep');
  await ctx.editMessageText(
    [
      '⚠️ *Reject ALL pending deposits?*',
      '',
      `This will mark every one of the *${deps.length}* pending deposit row(s) as *rejected* and DM each user.`,
      '',
      'This is a one-tap launch-cleanup tool — there is no per-row undo. Approved / already-rejected rows are left alone.',
    ].join('\n'),
    {
      parse_mode: 'Markdown',
      reply_markup: kb,
    },
  );
});

adminBot.callbackQuery('adm:dep:nuke:do', async (ctx) => {
  await ctx.answerCallbackQuery({ text: 'Rejecting…' });
  const deps = await listAllPendingDeposits();
  let rejected = 0;
  let errors = 0;
  for (const d of deps) {
    try {
      await setDepositStatus(d.id, 'rejected');
      rejected += 1;
    } catch (err) {
      errors += 1;
      logger.error({ err, depId: d.id }, 'bulk-reject: setDepositStatus failed');
      continue;
    }
    try {
      await ctx.api.sendMessage(
        d.user_id,
        `❌ Your deposit *#${d.id}*${
          Number(d.amount) > 0.01 ? ` of *$${d.amount}*` : ''
        } was rejected. Please contact support if this was a mistake.`,
        { parse_mode: 'Markdown' },
      );
    } catch (err) {
      logger.warn({ err, depId: d.id }, 'bulk-reject: DM to depositor failed');
    }
    void adminLog.logTopupResolved(ctx.api, {
      user: {
        telegram_id: d.user_id,
        username: null,
        first_name: null,
        email: null,
      },
      depositDbId: d.id,
      method: d.method,
      amount: Number(d.amount),
      status: 'rejected',
      balanceAfter: null,
      resolvedBy: ctx.from!.id,
    });
  }
  const summary = [
    '🧹 *Bulk reject complete*',
    '',
    `• Rejected: *${rejected}*`,
    errors > 0 ? `• Errors: *${errors}* (see server logs)` : '',
    '',
    'Pending queue cleared.',
  ]
    .filter(Boolean)
    .join('\n');
  await ctx.editMessageText(summary, {
    parse_mode: 'Markdown',
    reply_markup: backRow(new InlineKeyboard()),
  });
});

adminBot.callbackQuery(/^adm:dep:amt:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const dep = await getDeposit(id);
  if (!dep || dep.status !== 'pending') {
    await ctx.answerCallbackQuery({ text: 'Deposit no longer pending.' });
    await showDepositList(ctx);
    return;
  }
  ctx.session.adminFlow = {
    type: 'set_deposit_amount',
    step: 'amount',
    data: { deposit_id: id },
  };
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    [
      `💲 *Set amount for deposit #${id}*`,
      '',
      `User: \`${dep.user_id}\``,
      `Method: ${dep.method}`,
      dep.reference ? `Note code: \`${dep.reference}\`` : '',
      dep.note ? dep.note : '',
      '',
      'Send the *USDT amount you verified on-chain* (e.g. `5.12`). The deposit row will be updated, but you still need to tap *Approve* to credit the user.',
    ]
      .filter(Boolean)
      .join('\n'),
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text('⬅️ Back', 'adm:dep'),
    },
  );
});

adminBot.callbackQuery(/^adm:dep:ok:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const dep = await getDeposit(id);
  if (!dep || dep.status !== 'pending') {
    await ctx.answerCallbackQuery({ text: 'Deposit no longer pending.' });
    await showDepositList(ctx);
    return;
  }
  const methods = await listPaymentMethods();
  const method = dep.payment_method_id != null
    ? methods.find((m) => m.id === dep.payment_method_id)
    : methods.find((m) => m.name === dep.method);
  const amount = Number(dep.amount);
  if (!Number.isFinite(amount) || amount <= 0.01) {
    await ctx.answerCallbackQuery({
      text: 'Set the verified amount first via 💲 Set Amount.',
      show_alert: true,
    });
    return;
  }
  if (dep.order_intent) {
    const required = Number(dep.order_intent.total);
    if (Number.isFinite(required) && amount + 0.005 < required) {
      await ctx.answerCallbackQuery({
        text: `Verified amount must be at least $${required.toFixed(2)}.`,
        show_alert: true,
      });
      return;
    }
  } else {
    const minimum = Math.max(0.01, Number(method?.min_amount) || 0);
    if (amount + 0.000001 < minimum) {
      await ctx.answerCallbackQuery({
        text: `Minimum top-up is $${minimum.toFixed(2)}.`,
        show_alert: true,
      });
      return;
    }
  }

  const txHash = dep.tx_hash?.trim() || `manual:deposit:${dep.id}`;
  let approval;
  try {
    approval = await approveDepositAtomic(id, txHash, amount);
  } catch (err) {
    logger.error({ err, depositId: id }, 'manual deposit atomic approval failed');
    await ctx.answerCallbackQuery({ text: 'Approval failed. Please try again.', show_alert: true });
    return;
  }
  if (!approval.approved) {
    await ctx.answerCallbackQuery({ text: 'Deposit was already resolved by another admin/process.', show_alert: true });
    await showDepositList(ctx);
    return;
  }

  const newBal = approval.new_balance == null ? null : Number(approval.new_balance);
  let directOrderId: string | null = null;
  let refundedToWallet = false;
  if (dep.order_intent && method) {
    try {
      const fulfilment = await fulfilOrderForDeposit({
        api: ctx.api,
        deposit: { ...dep, status: 'approved', amount },
        intent: dep.order_intent,
        provider: method.provider,
        methodName: method.name,
      });
      directOrderId = fulfilment.ok ? fulfilment.orderPublicId : null;
      refundedToWallet = 'refundedToWallet' in fulfilment && Boolean(fulfilment.refundedToWallet);
    } catch (err) {
      logger.error({ err, depositId: id }, 'manual direct-pay fulfilment failed');
    }
  }
  if (approval.is_direct && !directOrderId && !refundedToWallet) {
    await ctx.answerCallbackQuery({ text: 'Payment approved, but fulfilment needs recovery. Check the order/deposit state.', show_alert: true });
  } else {
    await ctx.answerCallbackQuery({
      text: refundedToWallet ? 'Approved and refunded to wallet.' : `Approved${directOrderId ? ` — ${directOrderId}` : newBal != null ? `. Balance: $${newBal}` : '.'}`,
      show_alert: true,
    });
  }
  try {
    if (approval.is_direct) {
      if (directOrderId) {
        await ctx.api.sendMessage(
          dep.user_id,
          `✅ Your direct payment *#${id}* was approved and order *${directOrderId}* is being fulfilled.`,
          { parse_mode: 'Markdown' },
        );
      } else if (refundedToWallet) {
        await ctx.api.sendMessage(
          dep.user_id,
          `↩️ Your direct payment *#${id}* was approved, but the order could not be fulfilled. The amount was refunded to your wallet.`,
          { parse_mode: 'Markdown' },
        );
      } else {
        await ctx.api.sendMessage(
          dep.user_id,
          `⏳ Your direct payment *#${id}* was approved, but fulfilment still needs recovery. Your payment has not been credited as wallet balance.`,
          { parse_mode: 'Markdown' },
        );
      }
    } else {
      await ctx.api.sendMessage(
        dep.user_id,
        `✅ Your deposit *#${id}* of *$${dep.amount}* has been credited.\nNew balance: *$${newBal}*`,
        { parse_mode: 'Markdown' },
      );
    }
  } catch (err) {
    logger.warn({ err }, 'Could not DM depositor');
  }
  void adminLog.logTopupResolved(ctx.api, {
    user: {
      telegram_id: dep.user_id,
      username: null,
      first_name: null,
      email: null,
    },
    depositDbId: dep.id,
    method: dep.method,
    amount: Number(dep.amount),
    status: 'approved',
    balanceAfter: Number(Number(newBal).toFixed(3)),
    resolvedBy: ctx.from!.id,
  });
  await showDepositList(ctx);
});

adminBot.callbackQuery(/^adm:dep:no:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const dep = await getDeposit(id);
  if (!dep || dep.status !== 'pending') {
    await ctx.answerCallbackQuery({ text: 'Deposit no longer pending.' });
    await showDepositList(ctx);
    return;
  }
  try {
    const rejected = await rejectDepositAtomic(id);
    if (!rejected) {
      await ctx.answerCallbackQuery({ text: 'Deposit was already resolved by another admin/process.', show_alert: true });
      await showDepositList(ctx);
      return;
    }
  } catch (err) {
    logger.error({ err, depositId: id }, 'manual deposit atomic rejection failed');
    await ctx.answerCallbackQuery({ text: 'Rejection failed. Please try again.', show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery({ text: `Rejected #${id}` });
  try {
    await ctx.api.sendMessage(
      dep.user_id,
      `❌ Your deposit *#${id}* of *$${dep.amount}* was rejected. Please contact support.`,
      { parse_mode: 'Markdown' },
    );
  } catch (err) {
    logger.warn({ err }, 'Could not DM depositor');
  }
  void adminLog.logTopupResolved(ctx.api, {
    user: {
      telegram_id: dep.user_id,
      username: null,
      first_name: null,
      email: null,
    },
    depositDbId: dep.id,
    method: dep.method,
    amount: Number(dep.amount),
    status: 'rejected',
    balanceAfter: null,
    resolvedBy: ctx.from!.id,
  });
  await showDepositList(ctx);
});

adminBot.callbackQuery(/^adm:dep:rv:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const dep = await getDeposit(id);
  if (!dep || dep.status !== 'pending') {
    await ctx.answerCallbackQuery({ text: 'Deposit no longer pending.' });
    await showDepositList(ctx);
    return;
  }
  if (!dep.tx_hash) {
    await ctx.answerCallbackQuery({
      text: 'No tx hash stored — nothing to re-verify.',
      show_alert: true,
    });
    return;
  }
  await ctx.answerCallbackQuery({ text: 'Re-running auto-verify…' });
  let result;
  try {
    result = await verifyAndCreditDeposit({
      api: ctx.api,
      deposit: dep,
      submission: { txHash: dep.tx_hash },
      logUser: {
        telegram_id: dep.user_id,
        username: null,
        first_name: null,
        email: null,
      },
    });
  } catch (err) {
    logger.error({ err, depId: id }, 're-verify threw');
    result = { ok: false as const, reason: `verifier crashed: ${(err as Error)?.message ?? String(err)}` };
  }
  if (result.ok) {
    try {
      await ctx.api.sendMessage(
        dep.user_id,
        `✅ Your deposit *#${id}* of *$${result.amount.toFixed(2)}* has been credited.\nNew balance: *$${Number(result.newBalance).toFixed(2)}*`,
        { parse_mode: 'Markdown' },
      );
    } catch (err) {
      logger.warn({ err }, 'Could not DM depositor');
    }
  } else {
    try {
      await setDepositNote(id, `auto-verify failed: ${result.reason}`);
    } catch {
      /* noop */
    }
  }
  await showDepositList(ctx);
});

// ---------- Customize ----------
adminBot.callbackQuery('adm:cust', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = undefined;
  const kb = new InlineKeyboard()
    .text('📝 Edit Text', 'adm:cust:text')
    .text('🎨 Set Color', 'adm:cust:color:pick')
    .row()
    .text('🎯 Custom Color Glyphs', 'adm:cust:colorglyph')
    .row()
    .text('😀 Set Emoji', 'adm:cust:emoji')
    .text('🎯 Set Button Icon', 'adm:cust:btnicon')
    .row()
    .text('🔁 Reload Settings', 'adm:reload');
  backRow(kb);
  await ctx.editMessageText(
    '✏️ *Customize*\n\nEdit any text, button color, emoji, or button icon used by the bot.',
    { parse_mode: 'Markdown', reply_markup: kb },
  );
});

adminBot.callbackQuery('adm:cust:text', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = { type: 'set_text', step: 'key', data: {} };
  await ctx.editMessageText(
    '📝 *Edit Text*\n\nSend the *i18n key* you want to override' +
      ' (e.g. `welcome.title`, `btn.shop`, `shop.choose_category`).' +
      '\n\nOr `/cancel`.',
    { parse_mode: 'Markdown', reply_markup: backRow(new InlineKeyboard()) },
  );
});

// ----- Emoji picker (button-driven, A → Z) -----
//
// Lists every emoji key (the EMOJI map + every BUTTON_KEYS entry as
// `btn.<key>`) sorted alphabetically. Each row is a single button:
//   "<unicode> <key> — <state>"  where state is one of:
//   - "premium" (a custom_emoji_id is set)
//   - "<unicode>" (only the unicode fallback is set)
//   - "not set" (no override)
// Tapping any row enters the per-key set-emoji flow.
const EMOJI_PER_PAGE = 8;

function allEmojiKeys(): string[] {
  const set = new Set<string>(Object.keys(EMOJI));
  for (const k of Object.keys(BUTTON_KEYS)) set.add(`btn.${k}`);
  return [...set].sort();
}

function emojiStateLabel(key: string): string {
  // Read raw cached override AND the compile-time default to give the
  // admin a clear picture: "🐯 + premium" / "🐯 (default)" / "not set".
  const spec = getEmoji(key);
  if (typeof spec === 'object' && spec.custom_emoji_id) {
    return `${spec.unicode} ${key} — premium`;
  }
  if (typeof spec === 'string' && spec !== key) {
    return `${spec} ${key}`;
  }
  return `· ${key} — not set`;
}

function emojiPickerKb(page: number): InlineKeyboard {
  const keys = allEmojiKeys();
  const totalPages = Math.max(1, Math.ceil(keys.length / EMOJI_PER_PAGE));
  const start = page * EMOJI_PER_PAGE;
  const slice = keys.slice(start, start + EMOJI_PER_PAGE);
  const kb = new InlineKeyboard();
  for (const k of slice) {
    kb.text(emojiStateLabel(k).slice(0, 60), `adm:emoji:pick:${k}`).row();
  }
  if (totalPages > 1) {
    if (page > 0) kb.text('◀️ Prev', `adm:cust:emoji:${page - 1}`);
    kb.text(`${page + 1}/${totalPages}`, 'adm:noop');
    if (page + 1 < totalPages) kb.text('Next ▶️', `adm:cust:emoji:${page + 1}`);
    kb.row();
  }
  kb.text('⬅️ Back', 'adm:cust');
  return kb;
}

async function showEmojiPicker(ctx: AppCtx, page: number): Promise<void> {
  const text =
    '😀 *Set Emoji*\n\n' +
    'Tap any key to update its emoji. You can either send a plain unicode emoji ' +
    '(e.g. `🐯`) — or send a *premium emoji message* directly and the bot will ' +
    'auto-extract its `custom_emoji_id` for you.';
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: emojiPickerKb(page),
  });
}

adminBot.callbackQuery('adm:cust:emoji', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = undefined;
  await showEmojiPicker(ctx, 0);
});

adminBot.callbackQuery(/^adm:cust:emoji:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showEmojiPicker(ctx, Number(ctx.match[1]));
});

adminBot.callbackQuery(/^adm:emoji:pick:(.+)$/, async (ctx) => {
  const key = ctx.match[1]!;
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = { type: 'set_emoji', step: 'value', data: { key } };
  const cur = getEmoji(key);
  const curLine =
    typeof cur === 'object' && cur.custom_emoji_id
      ? `Current: ${cur.unicode}  *premium id* \`${cur.custom_emoji_id}\``
      : typeof cur === 'string' && cur !== key
        ? `Current: ${cur}`
        : 'Current: _not set_';
  await ctx.editMessageText(
    `😀 *Set Emoji* — \`${key}\`\n\n` +
      `${curLine}\n\n` +
      'Send any of:\n' +
      '• A plain unicode emoji — e.g. `🐯`\n' +
      '• A *premium* emoji message — the bot reads its `custom_emoji_id`\n' +
      '• Or the raw form: `<unicode> [custom_emoji_id]`\n\n' +
      'Or `/cancel`.',
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text('⬅️ Back', 'adm:cust:emoji'),
    },
  );
});

// ----- Color picker (button-driven, blue / green / red / yellow / none) -----
//
// Lists every BUTTON_KEYS entry with its current color marker, paginated.
// Tapping a key opens a 5-button color chooser.
const COLOR_PER_PAGE = 8;

function buttonKeyList(): string[] {
  return Object.keys(BUTTON_KEYS).sort();
}

function buttonColorLabel(key: keyof typeof BUTTON_KEYS): string {
  // COLOR_PREFIX values are now empty (the old 🟦🟩🟥🟨 squares were
  // removed). Show the bare button key + its assigned colour name.
  const c = getButtonColor(key);
  return `${key} — ${c}`;
}

function colorPickerKb(page: number): InlineKeyboard {
  const keys = buttonKeyList();
  const totalPages = Math.max(1, Math.ceil(keys.length / COLOR_PER_PAGE));
  const start = page * COLOR_PER_PAGE;
  const slice = keys.slice(start, start + COLOR_PER_PAGE);
  const kb = new InlineKeyboard();
  // Top entry: dedicated picker for product-category buttons. Lives
  // under its own list because categories are dynamic (admin-added)
  // and shouldn't pollute the static button-key roster.
  if (page === 0) {
    kb.text('📂 Product Categories ▶️', 'adm:catcolor:list').row();
  }
  for (const k of slice) {
    kb.text(
      buttonColorLabel(k as keyof typeof BUTTON_KEYS).slice(0, 60),
      `adm:color:pick:${k}`,
    ).row();
  }
  if (totalPages > 1) {
    if (page > 0) kb.text('◀️ Prev', `adm:cust:color:${page - 1}`);
    kb.text(`${page + 1}/${totalPages}`, 'adm:noop');
    if (page + 1 < totalPages) kb.text('Next ▶️', `adm:cust:color:${page + 1}`);
    kb.row();
  }
  kb.text('⬅️ Back', 'adm:cust');
  return kb;
}

async function showColorPicker(ctx: AppCtx, page: number): Promise<void> {
  await ctx.editMessageText(
    '🎨 *Set Color*\n\n' +
      'Pick a tint hint for an inline button (blue / green / red / ' +
      'yellow / none). Tap a button key to change its color.',
    { parse_mode: 'Markdown', reply_markup: colorPickerKb(page) },
  );
}

adminBot.callbackQuery('adm:cust:color:pick', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = undefined;
  await showColorPicker(ctx, 0);
});

adminBot.callbackQuery(/^adm:cust:color:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showColorPicker(ctx, Number(ctx.match[1]));
});

adminBot.callbackQuery(/^adm:color:pick:(.+)$/, async (ctx) => {
  const key = ctx.match[1]!;
  await ctx.answerCallbackQuery();
  const kb = new InlineKeyboard();
  for (const c of Object.keys(COLOR_PREFIX) as ColorMode[]) {
    kb.text(c, `adm:color:set:${key}:${c}`);
  }
  kb.row().text('⬅️ Back', 'adm:cust:color:pick');
  await ctx.editMessageText(`🎨 *Set Color* — \`${key}\`\n\nPick a color:`, {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
});

adminBot.callbackQuery(/^adm:color:set:([^:]+):([^:]+)$/, async (ctx) => {
  const key = ctx.match[1]!;
  const color = ctx.match[2] as ColorMode;
  if (!(color in COLOR_PREFIX)) {
    await ctx.answerCallbackQuery({ text: 'Bad color' });
    return;
  }
  await setColor(key, color, ctx.from!.id);
  await ctx.answerCallbackQuery({ text: `Set ${key} → ${color}` });
  await showColorPicker(ctx, 0);
});

// ----- Product-category color picker -----
//
// Categories are admin-managed (added at runtime), so we list them
// dynamically rather than baking them into BUTTON_KEYS. The "Default"
// entry sets the colour applied to every category that hasn't been
// explicitly themed — including any future categories the admin
// adds. Per-category overrides win over the default; both win over
// the hard-coded 'none'.
const CATEGORY_COLOR_PER_PAGE = 8;

async function showCategoryColorList(ctx: AppCtx, page: number): Promise<void> {
  const cats = await listAllCategories();
  const totalPages = Math.max(1, Math.ceil(cats.length / CATEGORY_COLOR_PER_PAGE));
  const start = page * CATEGORY_COLOR_PER_PAGE;
  const slice = cats.slice(start, start + CATEGORY_COLOR_PER_PAGE);
  const kb = new InlineKeyboard();
  if (page === 0) {
    const def = getCategoryDefaultColor();
    kb.text(`✨ Default (new categories) — ${def}`, 'adm:catcolor:pick:default').row();
  }
  for (const c of slice) {
    const color = getCategoryColor(c.id);
    const emoji = c.emoji ?? '📁';
    const label = `${emoji} ${c.name} — ${color}`.slice(0, 60);
    kb.text(label, `adm:catcolor:pick:${c.id}`).row();
  }
  if (totalPages > 1) {
    if (page > 0) kb.text('◀️ Prev', `adm:catcolor:list:${page - 1}`);
    kb.text(`${page + 1}/${totalPages}`, 'adm:noop');
    if (page + 1 < totalPages) kb.text('Next ▶️', `adm:catcolor:list:${page + 1}`);
    kb.row();
  }
  kb.text('⬅️ Back', 'adm:cust:color:pick');
  await ctx.editMessageText(
    '🎨 *Set Color — Product Categories*\n\n' +
      'Pick a tint hint (blue / green / red / yellow / none) for each ' +
      'product category select button. Tap a category to change its ' +
      'colour. Tap *Default* to set the colour applied to every category ' +
      'you add later.',
    { parse_mode: 'Markdown', reply_markup: kb },
  );
}

adminBot.callbackQuery('adm:catcolor:list', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = undefined;
  await showCategoryColorList(ctx, 0);
});

adminBot.callbackQuery(/^adm:catcolor:list:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showCategoryColorList(ctx, Number(ctx.match[1]));
});

adminBot.callbackQuery(/^adm:catcolor:pick:(default|\d+)$/, async (ctx) => {
  const target = ctx.match[1]!;
  await ctx.answerCallbackQuery();
  let label: string;
  if (target === 'default') {
    label = 'Default (new categories)';
  } else {
    const cats = await listAllCategories();
    const cat = cats.find((c) => c.id === Number(target));
    label = cat ? `${cat.emoji ?? '📁'} ${cat.name}` : `Category #${target}`;
  }
  const kb = new InlineKeyboard();
  for (const c of Object.keys(COLOR_PREFIX) as ColorMode[]) {
    kb.text(c, `adm:catcolor:set:${target}:${c}`);
  }
  kb.row().text('⬅️ Back', 'adm:catcolor:list');
  await ctx.editMessageText(`🎨 *Set Color* — ${label}\n\nPick a color:`, {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
});

adminBot.callbackQuery(/^adm:catcolor:set:(default|\d+):([^:]+)$/, async (ctx) => {
  const target = ctx.match[1]!;
  const color = ctx.match[2] as ColorMode;
  if (!(color in COLOR_PREFIX)) {
    await ctx.answerCallbackQuery({ text: 'Bad color' });
    return;
  }
  if (target === 'default') {
    await setCategoryDefaultColor(color, ctx.from!.id);
    await ctx.answerCallbackQuery({ text: `Default → ${color}` });
  } else {
    const id = Number(target);
    await setCategoryColor(id, color, ctx.from!.id);
    await ctx.answerCallbackQuery({ text: `#${id} → ${color}` });
  }
  await showCategoryColorList(ctx, 0);
});

// ----- Custom Color Glyphs editor -----
//
// Lets the bot owner customise the prefix glyph used for each
// `ColorMode` (blue/green/red/yellow/none). The default is the
// matching coloured circle (🔵🟢🔴🟡), but an admin can replace
// any of them with arbitrary unicode (e.g. squares, hearts, brand
// emojis) or clear it entirely. Stored under `color.prefix.<mode>`
// in the settings cache (see `services/settings.ts`).
async function showColorGlyphPicker(ctx: AppCtx): Promise<void> {
  const modes: ColorMode[] = ['blue', 'green', 'red', 'yellow', 'none'];
  const lines = ['🎯 *Custom Color Glyphs*', ''];
  for (const m of modes) {
    const glyph = getColorPrefix(m);
    const display = glyph.length > 0 ? glyph : '_(none)_';
    lines.push(`*${m}*: ${display}`);
  }
  lines.push('', '_Tap a mode to change its glyph. Send any text (single emoji, brand symbol, etc.) or `/clear` to drop the override._');
  const kb = new InlineKeyboard();
  for (const m of modes) {
    kb.text(`${m} → ${getColorPrefix(m) || '·'}`, `adm:colorglyph:edit:${m}`).row();
  }
  kb.text('⬅️ Back', 'adm:cust');
  await ctx.editMessageText(lines.join('\n'), {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
}

adminBot.callbackQuery('adm:cust:colorglyph', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = undefined;
  await showColorGlyphPicker(ctx);
});

adminBot.callbackQuery(/^adm:colorglyph:edit:([^:]+)$/, async (ctx) => {
  const mode = ctx.match[1]! as ColorMode;
  if (!(mode in COLOR_PREFIX)) {
    await ctx.answerCallbackQuery({ text: 'Bad mode' });
    return;
  }
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = {
    type: 'set_color_glyph',
    step: 'value',
    data: { mode },
  };
  const cur = getColorPrefix(mode);
  await ctx.reply(
    `🎯 *Set Glyph for \`${mode}\`*\n\nCurrent: ${cur || '_(none)_'}\n\nSend a single emoji / symbol as your next message — it will become the new prefix glyph for the *${mode}* color mode. Send \`/clear\` to drop the override (falls back to the built-in default). Send \`/cancel\` to abort.`,
    { parse_mode: 'Markdown' },
  );
});

// ----- Button-icon picker (button-driven, A → Z) -----
//
// Lists every BUTTON_KEYS entry with its current icon state. Tapping
// a key opens the standard set-emoji flow but stores the value under
// `btn.<key>` so it ONLY affects that button (not any shared emoji
// elsewhere in the bot). The lookup happens in
// `src/keyboards/helpers.ts → resolveIconId`.
const BTN_ICON_PER_PAGE = 8;

function buttonIconLabel(key: keyof typeof BUTTON_KEYS): string {
  const spec = getButtonIcon(key);
  if (spec) return `${spec.unicode} ${key} — premium`;
  return `· ${key} — default`;
}

function buttonIconPickerKb(page: number): InlineKeyboard {
  const keys = buttonKeyList();
  const totalPages = Math.max(1, Math.ceil(keys.length / BTN_ICON_PER_PAGE));
  const start = page * BTN_ICON_PER_PAGE;
  const slice = keys.slice(start, start + BTN_ICON_PER_PAGE);
  const kb = new InlineKeyboard();
  for (const k of slice) {
    kb.text(
      buttonIconLabel(k as keyof typeof BUTTON_KEYS).slice(0, 60),
      `adm:btnicon:pick:${k}`,
    ).row();
  }
  if (totalPages > 1) {
    if (page > 0) kb.text('◀️ Prev', `adm:cust:btnicon:${page - 1}`);
    kb.text(`${page + 1}/${totalPages}`, 'adm:noop');
    if (page + 1 < totalPages) kb.text('Next ▶️', `adm:cust:btnicon:${page + 1}`);
    kb.row();
  }
  kb.text('⬅️ Back', 'adm:cust');
  return kb;
}

async function showButtonIconPicker(ctx: AppCtx, page: number): Promise<void> {
  await ctx.editMessageText(
    '🎯 *Set Button Icon*\n\n' +
      'Pick a button to assign your own *premium emoji* icon to it. ' +
      'Send a premium emoji message and the bot will read its ' +
      '`custom_emoji_id` automatically. Each override is per-button — ' +
      "changing one button's icon won't affect anything else.",
    { parse_mode: 'Markdown', reply_markup: buttonIconPickerKb(page) },
  );
}

adminBot.callbackQuery('adm:cust:btnicon', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = undefined;
  await showButtonIconPicker(ctx, 0);
});

adminBot.callbackQuery(/^adm:cust:btnicon:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showButtonIconPicker(ctx, Number(ctx.match[1]));
});

adminBot.callbackQuery(/^adm:btnicon:pick:(.+)$/, async (ctx) => {
  const key = ctx.match[1]!;
  if (!(key in BUTTON_KEYS)) {
    await ctx.answerCallbackQuery({ text: 'Unknown button.' });
    return;
  }
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = { type: 'set_btnicon', step: 'value', data: { btnKey: key } };
  const cur = getButtonIcon(key);
  const curLine = cur
    ? `Current: ${cur.unicode}  *premium id* \`${cur.custom_emoji_id}\``
    : 'Current: _default (none set)_';
  const kb = new InlineKeyboard()
    .text('🗑 Clear icon', `adm:btnicon:clear:${key}`)
    .row()
    .text('⬅️ Back', 'adm:cust:btnicon');
  await ctx.editMessageText(
    `🎯 *Set Button Icon* — \`${key}\`\n\n` +
      `${curLine}\n\n` +
      'Send a *premium emoji message* — the bot reads its ' +
      '`custom_emoji_id` and uses it as the icon for this button.\n\n' +
      'The emoji must be one your bot owner has access to (any premium ' +
      'emoji visible to the owner). Plain unicode emojis without a ' +
      'premium id can\'t be used as button icons.\n\n' +
      'Or `/cancel`.',
    { parse_mode: 'Markdown', reply_markup: kb },
  );
});

adminBot.callbackQuery(/^adm:btnicon:clear:(.+)$/, async (ctx) => {
  const key = ctx.match[1]!;
  if (!(key in BUTTON_KEYS)) {
    await ctx.answerCallbackQuery({ text: 'Unknown button.' });
    return;
  }
  await clearButtonIcon(key);
  ctx.session.adminFlow = undefined;
  await ctx.answerCallbackQuery({ text: `Cleared icon for ${key}.` });
  await showButtonIconPicker(ctx, 0);
});

// Silent no-op (used for the page indicator in the picker).
adminBot.callbackQuery('adm:noop', async (ctx) => {
  await ctx.answerCallbackQuery();
});

// ---------- Announce ----------
//
// Flow:
//   1. `adm:ann`               → reset to step:'text', prompt for body.
//   2. Admin sends text        → step:'confirm' + render preview + the
//                                attach-Buy-button picker.
//   3. (optional) Buy button   → product picker → label / color / icon
//                                editor → returns to confirm.
//   4. `adm:ann:send`          → broadcast. If a Buy button is set, the
//                                broadcast attaches a single-button
//                                inline keyboard with a t.me deep-link
//                                of the form `?start=prod_<id>` so the
//                                tap lands on the product's quantity
//                                page directly (handled by
//                                `handleProductDeepLink` in start.ts).

const ANN_BUY_PER_PAGE = 8;

type AnnounceBuy = {
  product_id: number;
  product_name: string;
  label: string;
  color: ColorMode;
  icon_unicode?: string;
  icon_custom_emoji_id?: string;
};

/**
 * Build the inline keyboard attached to a broadcast announcement.
 * Returns `undefined` when no Buy button is configured so the
 * announcement is sent as a plain message.
 */
function announceBroadcastKeyboard(buy?: AnnounceBuy): InlineKeyboard | undefined {
  if (!buy) return undefined;
  const kb = new InlineKeyboard();
  kb.url(buy.label, publicFeed.publicFeedBotUrl(`prod_${buy.product_id}`));
  if (buy.icon_custom_emoji_id) kb.icon(buy.icon_custom_emoji_id);
  const style = colorModeToStyle(buy.color);
  if (style !== undefined) kb.style(style);
  return kb;
}

function announceConfirmKeyboard(
  recipients: number,
  buy?: AnnounceBuy,
  shareSales = false,
): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text(`📣 Send to ${recipients}`, 'adm:ann:send')
    .row();
  kb.text(
    shareSales ? '🌐 Sales Group: ON' : '🌐 Sales Group: OFF',
    'adm:ann:sales:toggle',
  ).row();
  if (buy) {
    kb.text('🛒 Edit Buy Button', 'adm:ann:buy:edit')
      .text('🗑 Remove Button', 'adm:ann:buy:remove')
      .row();
  } else {
    kb.text('🛒 Add Buy Button', 'adm:ann:buy:add').row();
  }
  kb.text('❌ Cancel', 'adm:root');
  return kb;
}

async function showAnnounceConfirm(ctx: AppCtx): Promise<void> {
  const flow = ctx.session.adminFlow;
  if (
    flow?.type !== 'announce' ||
    !(flow.step === 'confirm' || flow.step === 'buy_label' || flow.step === 'buy_icon')
  ) {
    return;
  }
  // Always normalize to step:'confirm' on entry — callers may have
  // landed here from any of the buy_* sub-steps.
  const buy = (flow.data as { buy?: AnnounceBuy }).buy;
  const shareSales = Boolean(flow.data.share_sales);
  ctx.session.adminFlow = {
    type: 'announce',
    step: 'confirm',
    data: {
      text: flow.data.text,
      format: flow.data.format,
      buy,
      share_sales: shareSales,
    },
  };
  const recipients = await listUsersForAnnouncement();
  const previewHtml =
    flow.data.format === 'html'
      ? renderHtmlTemplate(flow.data.text)
      : renderMdHtml(flow.data.text);
  const buyLine = buy
    ? `\n\n🛒 <b>Buy button:</b> <code>${escapeHtml(buy.label)}</code>` +
      `\n   • Product: <code>${escapeHtml(buy.product_name)}</code> (id=${buy.product_id})` +
      `\n   • Color: <code>${buy.color}</code>` +
      `\n   • Icon: ${buy.icon_unicode ? `${buy.icon_unicode} (premium)` : '<i>none</i>'}`
    : '\n\n<i>No Buy button attached. Tap “Add Buy Button” to deep-link an announcement to a specific product.</i>';
  try {
    await ctx.reply(previewHtml, {
      parse_mode: 'HTML',
      reply_markup: announceBroadcastKeyboard(buy),
    });
  } catch (err) {
    logger.warn({ err }, 'announce preview render failed; retrying without custom emoji tags');
    await ctx.reply(stripCustomEmojiTags(previewHtml), {
      parse_mode: 'HTML',
      reply_markup: announceBroadcastKeyboard(buy),
    });
  }
  const salesLine = shareSales
    ? '\n\n🌐 <b>Sales group mirror:</b> ON'
    : '\n\n🌐 <b>Sales group mirror:</b> OFF';
  await ctx.reply(`📣 <b>Confirm broadcast</b>${buyLine}${salesLine}`, {
    parse_mode: 'HTML',
    reply_markup: announceConfirmKeyboard(recipients.length, buy, shareSales),
  });
}

async function showAnnounceBuyProductPicker(ctx: AppCtx, page: number): Promise<void> {
  const { rows, total } = await listAllProducts(page, ANN_BUY_PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(total / ANN_BUY_PER_PAGE));
  const kb = new InlineKeyboard();
  for (const p of rows) {
    const tag = p.active ? '' : ' (inactive)';
    kb.text(`${p.name}${tag}`.slice(0, 60), `adm:ann:buy:set:${p.id}`).row();
  }
  if (totalPages > 1) {
    if (page > 0) kb.text('◀️ Prev', `adm:ann:buy:prod:${page - 1}`);
    kb.text(`${page + 1}/${totalPages}`, 'adm:noop');
    if (page + 1 < totalPages) kb.text('Next ▶️', `adm:ann:buy:prod:${page + 1}`);
    kb.row();
  }
  kb.text('⬅️ Back', 'adm:ann:buy:cancel');
  await ctx.editMessageText(
    '🛒 *Pick the product the Buy button should open*\n\n' +
      'The button will deep-link straight to the product\'s quantity ' +
      'page in the bot — exactly what the user sees after tapping a ' +
      'product in the Shop.',
    { parse_mode: 'Markdown', reply_markup: kb },
  );
}

function announceBuyEditKeyboard(buy: AnnounceBuy): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text('📝 Edit Label', 'adm:ann:buy:label')
    .row()
    .text(`🎨 Color: ${COLOR_PREFIX[buy.color] || '∅'} ${buy.color}`, 'adm:ann:buy:color')
    .row()
    .text(
      buy.icon_custom_emoji_id ? `✨ Icon: ${buy.icon_unicode ?? ''} (set)` : '✨ Icon: (none)',
      'adm:ann:buy:icon',
    )
    .row()
    .text('🔄 Change Product', 'adm:ann:buy:add')
    .row()
    .text('🗑 Remove Buy Button', 'adm:ann:buy:remove')
    .row()
    .text('✅ Done', 'adm:ann:buy:done');
  return kb;
}

async function showAnnounceBuyEdit(ctx: AppCtx): Promise<void> {
  const flow = ctx.session.adminFlow;
  if (flow?.type !== 'announce') return;
  const buy = (flow.data as { buy?: AnnounceBuy }).buy;
  if (!buy) {
    await showAnnounceBuyProductPicker(ctx, 0);
    return;
  }
  const previewKb = new InlineKeyboard();
  previewKb.url(buy.label, publicFeed.publicFeedBotUrl(`prod_${buy.product_id}`));
  if (buy.icon_custom_emoji_id) previewKb.icon(buy.icon_custom_emoji_id);
  const style = colorModeToStyle(buy.color);
  if (style !== undefined) previewKb.style(style);
  const previewText =
    `🛒 *Buy Button — preview*\n\n` +
    `• Product: \`${buy.product_name}\` (id=${buy.product_id})\n` +
    `• Label: \`${buy.label}\`\n` +
    `• Color: \`${buy.color}\`\n` +
    `• Icon: ${
      buy.icon_unicode ? `${buy.icon_unicode} (premium id \`${buy.icon_custom_emoji_id}\`)` : '_(none)_'
    }`;
  if (ctx.callbackQuery) {
    await ctx.editMessageText(previewText, { parse_mode: 'Markdown', reply_markup: previewKb });
  } else {
    await ctx.reply(previewText, { parse_mode: 'Markdown', reply_markup: previewKb });
  }
  await ctx.reply('Configure the Buy button:', {
    reply_markup: announceBuyEditKeyboard(buy),
  });
}

function announceColorPickerKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const c of Object.keys(COLOR_PREFIX)) {
    kb.text(`${COLOR_PREFIX[c as ColorMode] || '∅'} ${c}`, `adm:ann:buy:color:${c}`);
  }
  kb.row().text('⬅️ Back', 'adm:ann:buy:edit');
  return kb;
}

adminBot.callbackQuery('adm:ann', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = { type: 'announce', step: 'text', data: {} };
  await ctx.editMessageText(
    '📣 *Announce*\n\nSend the announcement text.\n\n' +
      'Tip: use `{tiger}` `{fire}` `{rocket}` etc. to insert mapped emojis (premium-aware).' +
      '\n\nAfter the text you can attach an optional *Buy Button* that deep-links to a product\'s quantity page.' +
      '\n\nOr `/cancel`.',
    { parse_mode: 'Markdown', reply_markup: backRow(new InlineKeyboard()) },
  );
});

adminBot.callbackQuery('adm:ann:buy:add', async (ctx) => {
  const flow = ctx.session.adminFlow;
  if (flow?.type !== 'announce') {
    await ctx.answerCallbackQuery({ text: 'Open Broadcast first.' });
    return;
  }
  await ctx.answerCallbackQuery();
  await showAnnounceBuyProductPicker(ctx, 0);
});

adminBot.callbackQuery(/^adm:ann:buy:prod:(\d+)$/, async (ctx) => {
  const flow = ctx.session.adminFlow;
  if (flow?.type !== 'announce') {
    await ctx.answerCallbackQuery({ text: 'Open Broadcast first.' });
    return;
  }
  await ctx.answerCallbackQuery();
  await showAnnounceBuyProductPicker(ctx, Number(ctx.match[1]));
});

adminBot.callbackQuery(/^adm:ann:buy:set:(\d+)$/, async (ctx) => {
  const flow = ctx.session.adminFlow;
  if (flow?.type !== 'announce') {
    await ctx.answerCallbackQuery({ text: 'Open Broadcast first.' });
    return;
  }
  const productId = Number(ctx.match[1]);
  const product = await getProduct(productId);
  if (!product) {
    await ctx.answerCallbackQuery({ text: 'Product not found.', show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery();
  // Preserve any previously-configured chrome (label override, color,
  // icon) when the admin swaps to a different product. Defaults are
  // only applied on the very first product pick (no prior `buy`).
  const prior = (flow.data as { buy?: AnnounceBuy }).buy;
  const defaultIconId = '5440841102871517055';
  const defaultIconUnicode = undefined;
  const buy: AnnounceBuy = prior
    ? { ...prior, product_id: product.id, product_name: product.name }
    : {
        product_id: product.id,
        product_name: product.name,
        label: 'Buy Now',
        color: 'blue',
        icon_custom_emoji_id: defaultIconId,
        icon_unicode: defaultIconUnicode,
      };
  ctx.session.adminFlow = {
    type: 'announce',
    step: 'confirm',
    data: {
      text: flow.data.text,
      format: flow.data.format,
      buy,
      share_sales: flow.data.share_sales,
    },
  };
  await showAnnounceBuyEdit(ctx);
});

adminBot.callbackQuery('adm:ann:buy:edit', async (ctx) => {
  const flow = ctx.session.adminFlow;
  if (flow?.type !== 'announce') {
    await ctx.answerCallbackQuery({ text: 'Open Broadcast first.' });
    return;
  }
  await ctx.answerCallbackQuery();
  flow.step = 'confirm';
  await showAnnounceBuyEdit(ctx);
});

adminBot.callbackQuery('adm:ann:buy:cancel', async (ctx) => {
  const flow = ctx.session.adminFlow;
  if (flow?.type !== 'announce') {
    await ctx.answerCallbackQuery({ text: 'Open Broadcast first.' });
    return;
  }
  await ctx.answerCallbackQuery();
  await showAnnounceConfirm(ctx);
});

adminBot.callbackQuery('adm:ann:buy:done', async (ctx) => {
  const flow = ctx.session.adminFlow;
  if (flow?.type !== 'announce') {
    await ctx.answerCallbackQuery({ text: 'Open Broadcast first.' });
    return;
  }
  await ctx.answerCallbackQuery();
  await showAnnounceConfirm(ctx);
});

adminBot.callbackQuery('adm:ann:buy:remove', async (ctx) => {
  const flow = ctx.session.adminFlow;
  if (flow?.type !== 'announce') {
    await ctx.answerCallbackQuery({ text: 'Open Broadcast first.' });
    return;
  }
  await ctx.answerCallbackQuery({ text: 'Buy button removed.' });
  ctx.session.adminFlow = {
    type: 'announce',
    step: 'confirm',
    data: {
      text: flow.data.text,
      format: flow.data.format,
      share_sales: flow.data.share_sales,
    },
  };
  await showAnnounceConfirm(ctx);
});

adminBot.callbackQuery('adm:ann:buy:label', async (ctx) => {
  const flow = ctx.session.adminFlow;
  if (flow?.type !== 'announce') {
    await ctx.answerCallbackQuery({ text: 'Open Broadcast first.' });
    return;
  }
  const buy = (flow.data as { buy?: AnnounceBuy }).buy;
  if (!buy) {
    await ctx.answerCallbackQuery({ text: 'Pick a product first.' });
    return;
  }
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = {
    type: 'announce',
    step: 'buy_label',
    data: {
      text: flow.data.text,
      format: flow.data.format,
      buy,
      share_sales: flow.data.share_sales,
    },
  };
  await ctx.editMessageText(
    `📝 *Edit Buy button label*\n\nCurrent: \`${buy.label}\`\n\n` +
      'Send the new label as a text message (max 64 chars). ' +
      'Premium custom emojis are supported — they\'ll render inline ' +
      'on premium clients and as their unicode fallback elsewhere.\n\n' +
      'Type `/cancel` to keep the current label.',
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text('⬅️ Back', 'adm:ann:buy:edit'),
    },
  );
});

adminBot.callbackQuery('adm:ann:buy:color', async (ctx) => {
  const flow = ctx.session.adminFlow;
  if (flow?.type !== 'announce') {
    await ctx.answerCallbackQuery({ text: 'Open Broadcast first.' });
    return;
  }
  const buy = (flow.data as { buy?: AnnounceBuy }).buy;
  if (!buy) {
    await ctx.answerCallbackQuery({ text: 'Pick a product first.' });
    return;
  }
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `🎨 *Pick a button color* (Bot API 9.4 styles)\n\n` +
      `Current: ${COLOR_PREFIX[buy.color] || '∅'} \`${buy.color}\``,
    { parse_mode: 'Markdown', reply_markup: announceColorPickerKeyboard() },
  );
});

adminBot.callbackQuery(/^adm:ann:buy:color:(.+)$/, async (ctx) => {
  const flow = ctx.session.adminFlow;
  if (flow?.type !== 'announce') {
    await ctx.answerCallbackQuery({ text: 'Open Broadcast first.' });
    return;
  }
  const buy = (flow.data as { buy?: AnnounceBuy }).buy;
  if (!buy) {
    await ctx.answerCallbackQuery({ text: 'Pick a product first.' });
    return;
  }
  const color = ctx.match[1] as ColorMode;
  if (!(color in COLOR_PREFIX)) {
    await ctx.answerCallbackQuery({ text: 'Unknown color.' });
    return;
  }
  await ctx.answerCallbackQuery({ text: `Color → ${color}` });
  ctx.session.adminFlow = {
    type: 'announce',
    step: 'confirm',
    data: {
      text: flow.data.text,
      format: flow.data.format,
      buy: { ...buy, color },
      share_sales: flow.data.share_sales,
    },
  };
  await showAnnounceBuyEdit(ctx);
});

adminBot.callbackQuery('adm:ann:buy:icon', async (ctx) => {
  const flow = ctx.session.adminFlow;
  if (flow?.type !== 'announce') {
    await ctx.answerCallbackQuery({ text: 'Open Broadcast first.' });
    return;
  }
  const buy = (flow.data as { buy?: AnnounceBuy }).buy;
  if (!buy) {
    await ctx.answerCallbackQuery({ text: 'Pick a product first.' });
    return;
  }
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = {
    type: 'announce',
    step: 'buy_icon',
    data: {
      text: flow.data.text,
      format: flow.data.format,
      buy,
      share_sales: flow.data.share_sales,
    },
  };
  await ctx.editMessageText(
    '✨ *Set Buy button icon*\n\n' +
      'Send a *premium* emoji message — the bot will read its ' +
      '`custom_emoji_id` automatically. Bot API 9.4 only renders ' +
      'icons for premium-emoji ids; plain unicode emojis aren\'t ' +
      'supported in the icon slot (use the label for those).\n\n' +
      'Type `clear` to remove the icon, or `/cancel` to keep the ' +
      'current one.',
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text('⬅️ Back', 'adm:ann:buy:edit'),
    },
  );
});

adminBot.callbackQuery('adm:ann:sales:toggle', async (ctx) => {
  const flow = ctx.session.adminFlow;
  if (flow?.type !== 'announce') {
    await ctx.answerCallbackQuery({ text: 'Open Broadcast first.' });
    return;
  }
  const shareSales = !Boolean(flow.data.share_sales);
  ctx.session.adminFlow = {
    type: 'announce',
    step: 'confirm',
    data: {
      text: flow.data.text,
      format: flow.data.format,
      buy: flow.data.buy,
      share_sales: shareSales,
    },
  };
  await ctx.answerCallbackQuery({
    text: `Sales group mirror ${shareSales ? 'enabled' : 'disabled'}.`,
  });
  await showAnnounceConfirm(ctx);
});

adminBot.callbackQuery('adm:ann:send', async (ctx) => {
  const flow = ctx.session.adminFlow;
  if (flow?.type !== 'announce' || flow.step !== 'confirm') {
    await ctx.answerCallbackQuery({ text: 'Nothing to send.' });
    return;
  }
  await ctx.answerCallbackQuery();
  const body = flow.data.text;
  const format = flow.data.format ?? 'md';
  const buy = flow.data.buy;
  const shareSales = Boolean(flow.data.share_sales);
  const recipients = await listUsersForAnnouncement();
  const api = ctx.api;
  const statusChatId = ctx.chat?.id;
  const statusMessageId = ctx.callbackQuery.message?.message_id;
  ctx.session.adminFlow = undefined;
  await ctx.editMessageText(
    `📣 Broadcast started for ${recipients.length} user(s).\n\nBot commands stay active while this runs.`,
    { reply_markup: backRow(new InlineKeyboard()) },
  );

  void (async () => {
    // Render once: HTML output expands `{tokens}` AND auto-wraps any
    // unicode emoji that has a configured premium custom_emoji_id.
    const html = format === 'html' ? renderHtmlTemplate(body) : renderMdHtml(body);
    let ok = 0;
    let fail = 0;
    await publicFeed.notifyAnnouncement(api, {
      text: body,
      format,
      ...(buy
        ? {
            button: {
              text: buy.label,
              productId: buy.product_id,
              iconKey: 'broadcast_shop_now',
            },
          }
        : {}),
    });
    if (shareSales) {
      await publicFeed.notifySalesAnnouncement(api, {
        text: body,
        format,
        ...(buy
          ? {
              button: {
                text: buy.label,
                productId: buy.product_id,
                iconKey: 'broadcast_shop_now',
              },
            }
          : {}),
      });
    }
    for (const r of recipients) {
      try {
        // Build a fresh keyboard per recipient — the underlying
        // grammyjs InlineKeyboard is mutable, and reusing the same
        // instance across `sendMessage` calls is unsafe.
        const reply_markup = announceBroadcastKeyboard(buy);
        try {
          await api.sendMessage(r.telegram_id, html, {
            parse_mode: 'HTML',
            ...(reply_markup ? { reply_markup } : {}),
          });
        } catch (err) {
          logger.warn({ err, user: r.telegram_id }, 'announce send HTML failed; retrying without custom emoji tags');
          await api.sendMessage(r.telegram_id, stripCustomEmojiTags(html), {
            parse_mode: 'HTML',
            ...(reply_markup ? { reply_markup } : {}),
          });
        }
        ok++;
      } catch (err) {
        fail++;
        logger.warn({ err, user: r.telegram_id }, 'announce send failed');
      }
      if ((ok + fail) % 25 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
    }
    if (statusChatId && statusMessageId) {
      await api.editMessageText(
        statusChatId,
        statusMessageId,
        `✅ Done. Delivered: *${ok}*, failed: *${fail}*.`,
        { parse_mode: 'Markdown', reply_markup: backRow(new InlineKeyboard()) },
      ).catch((err) => logger.warn({ err }, 'announce final status edit failed'));
    }
  })().catch((err) => logger.error({ err }, 'announce background worker failed'));
});

// ---------- Users ----------
adminBot.callbackQuery(/^adm:usr:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showUserList(ctx, Number(ctx.match[1]));
});

async function showUserList(ctx: AppCtx, page: number): Promise<void> {
  ctx.session.adminFlow = undefined;
  const { rows, total } = await listRecentUsers(page, PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  // Rendered in HTML rather than Markdown V1 — the row text splices
  // raw `username` / `first_name` into the body, and V1 treats `_`
  // and `*` as formatting delimiters with no working backslash
  // escape. A single user on the page with `_` (e.g. `lais_one`)
  // would unbalance the whole message; Telegram rejected the send,
  // `editMessageText` threw, and the 👥 Users button stayed stuck on
  // the loading spinner. HTML side-steps that — every user-supplied
  // string just goes through `escapeHtml`.
  const lines = [
    `👥 <b>Users</b> — page ${page + 1}/${totalPages}  (total ${total})`,
    '',
  ];
  const kb = new InlineKeyboard();
  for (const u of rows) {
    const handle = u.username ? `@${u.username}` : (u.first_name ?? `id ${u.telegram_id}`);
    const safeHandle = escapeHtml(handle);
    lines.push(
      `<code>${u.telegram_id}</code> ${safeHandle}  •  $${Number(u.balance).toFixed(2)}`,
    );
    // Button labels are not parsed as HTML / Markdown by Telegram
    // so we keep the raw `handle` here (truncated to 24 chars).
    kb.text(handle.slice(0, 24), `adm:usr:v:${u.telegram_id}`).row();
  }
  if (page > 0) kb.text('◀️ Prev', `adm:usr:${page - 1}`);
  if (page + 1 < totalPages) kb.text('Next ▶️', `adm:usr:${page + 1}`);
  kb.row().text('🔍 Find user', 'adm:usr:find').row().text('⬅️ Back', 'adm:root');
  await ctx.editMessageText(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
}

adminBot.callbackQuery('adm:usr:find', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = { type: 'find_user', step: 'query', data: {} };
  await ctx.editMessageText(
    '🔍 *Find User*\n\nSend the user\'s Telegram numeric ID or `@username` (or `/cancel`).',
    { parse_mode: 'Markdown', reply_markup: backRow(new InlineKeyboard()) },
  );
});

async function showUserCard(ctx: AppCtx, user: DBUser): Promise<void> {
  const isAdminUser = await isAdmin(user.telegram_id);
  const summary = await getUserOrderSummary(user.telegram_id);
  // We render the whole card in HTML rather than Markdown V1 because
  // V1 treats `_` as italic delimiter and (per the Telegram Bot API)
  // does NOT honour `\_` escapes — so a username like `@lais_one` or
  // a banned-reason containing `_`/`*` would unbalance the message
  // and Telegram would reject the send with `can't parse entities`.
  // The outer admin handler caught that as the generic "Something
  // went wrong. Cancelled." toast and the user-card / custom-prices
  // screens never opened. HTML has no such gotcha — we just need to
  // run user-supplied text through `escapeHtml`.
  const safeUsername = user.username ? escapeHtml(user.username) : null;
  const safeFirst = user.first_name ? escapeHtml(user.first_name) : '';
  const safeLast = user.last_name ? escapeHtml(user.last_name) : '';
  const safeReason = user.banned_reason ? escapeHtml(user.banned_reason) : null;
  const fullName = `${safeFirst} ${safeLast}`.trim();
  const lines = [
    '👤 <b>User Details</b>',
    '',
    `ID: <code>${user.telegram_id}</code>`,
    safeUsername ? `Username: @${safeUsername}` : 'Username: <i>none</i>',
    fullName ? `Name: ${fullName}` : 'Name: <i>none</i>',
    `Balance: <b>$${Number(user.balance).toFixed(2)}</b>`,
    `Language: ${escapeHtml(user.language)}`,
    `Joined: ${new Date(user.joined_at).toLocaleDateString('en-GB')}`,
    `Orders: <b>${summary.orders}</b> • Total spent: <b>$${summary.spent.toFixed(2)}</b>`,
    `Admin: ${isAdminUser ? '✅' : '❌'}`,
    user.is_banned
      ? `Banned: <b>YES</b>${
          user.banned_at
            ? ` (since ${new Date(user.banned_at).toLocaleDateString('en-GB')})`
            : ''
        }${safeReason ? `\nReason: <i>${safeReason}</i>` : ''}`
      : 'Banned: ❌',
  ];
  const kb = new InlineKeyboard()
    .text('💰 Adjust balance', `adm:usr:bal:${user.telegram_id}`)
    .row();
  if (isAdminUser) {
    kb.text('🛡 Demote admin', `adm:usr:demote:${user.telegram_id}`);
  } else {
    kb.text('🛡 Promote admin', `adm:usr:promote:${user.telegram_id}`);
  }
  kb.row();
  // Admins can never be banned via this UI — promote-then-ban
  // would be self-defeating, so just hide the row entirely.
  if (!isAdminUser) {
    if (user.is_banned) {
      kb.text('♻️ Unban user', `adm:usr:unban:${user.telegram_id}`);
    } else {
      kb.text('🚫 Ban user', `adm:usr:ban:${user.telegram_id}`);
    }
    kb.row();
  }
  kb.text('🧾 View Orders', `adm:ord:u:${user.telegram_id}:0`).row();
  kb.text('💎 Custom prices', `adm:price:u:${user.telegram_id}`).row();
  kb.text('⬅️ Back to users', 'adm:usr:0').text('🏠 Main', 'adm:root');
  if (ctx.callbackQuery) {
    await ctx.editMessageText(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
  } else {
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
  }
}

adminBot.callbackQuery(/^adm:usr:v:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await findUserById(Number(ctx.match[1]));
  if (!user) {
    await ctx.editMessageText('User not found.', { reply_markup: backRow(new InlineKeyboard()) });
    return;
  }
  await showUserCard(ctx, user);
});

adminBot.callbackQuery(/^adm:usr:promote:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const u = await findUserById(id);
  await promoteAdmin(id, u?.username ?? null);
  await ctx.answerCallbackQuery({ text: '🛡 Promoted to admin.' });
  if (u) await showUserCard(ctx, u);
});

adminBot.callbackQuery(/^adm:usr:demote:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  if (id === ctx.from!.id) {
    await ctx.answerCallbackQuery({
      text: 'Refusing to demote yourself. Promote another admin first.',
      show_alert: true,
    });
    return;
  }
  await demoteAdmin(id);
  await ctx.answerCallbackQuery({ text: 'Demoted.' });
  const u = await findUserById(id);
  if (u) await showUserCard(ctx, u);
});

adminBot.callbackQuery(/^adm:usr:bal:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = Number(ctx.match[1]);
  ctx.session.adminFlow = { type: 'adjust_balance', step: 'amount', data: { telegram_id: id } };
  await ctx.editMessageText(
    `💰 *Adjust Balance* for \`${id}\`\n\nSend a number to add (e.g. \`5\`) or subtract (e.g. \`-3.50\`).` +
      '\n\nOr `/cancel`.',
    { parse_mode: 'Markdown', reply_markup: backRow(new InlineKeyboard()) },
  );
});

// Step 1 of the ban flow: prompt admin for an optional reason. Admin
// can send `-` (or just hit /cancel) to ban with no reason. Any other
// message becomes the reason and is stored on the user row for
// future reference.
adminBot.callbackQuery(/^adm:usr:ban:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = Number(ctx.match[1]);
  if (id === ctx.from!.id) {
    await ctx.answerCallbackQuery({
      text: 'Refusing to ban yourself.',
      show_alert: true,
    });
    return;
  }
  if (await isAdmin(id)) {
    await ctx.answerCallbackQuery({
      text: 'Demote this admin first before banning.',
      show_alert: true,
    });
    return;
  }
  ctx.session.adminFlow = { type: 'ban_user', step: 'reason', data: { telegram_id: id } };
  await ctx.editMessageText(
    `🚫 *Ban user* \`${id}\`\n\n` +
      'Send a short reason (admin-only note) or `-` to skip.\n' +
      'After confirmation the bot will silently drop every update from this ' +
      'user until you unban them.\n\n' +
      'Or `/cancel`.',
    { parse_mode: 'Markdown', reply_markup: backRow(new InlineKeyboard()) },
  );
});

// One-tap unban — no extra prompt, mirrors how Promote/Demote work.
adminBot.callbackQuery(/^adm:usr:unban:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await unbanUser(id);
  await ctx.answerCallbackQuery({ text: '♻️ User unbanned.' });
  const u = await findUserById(id);
  if (u) await showUserCard(ctx, u);
});

// ============================================================
// Referral Admin — view/correct available referral balances.
// ============================================================

const REFERRAL_ADMIN_PER_PAGE = 7;

function referralUserLabel(user: DBUser): string {
  if (user.username) return `@${user.username}`;
  if (user.first_name) return user.first_name;
  return `id ${user.telegram_id}`;
}

async function showReferralAdminList(ctx: AppCtx, page: number): Promise<void> {
  ctx.session.adminFlow = undefined;
  const { rows, total } = await listReferralAdminRows(page, REFERRAL_ADMIN_PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(total / REFERRAL_ADMIN_PER_PAGE));
  const lines = [
    '🎁 <b>Referral Control</b>',
    '',
    'View available refs, correct balances, or reset used Referral Pay records.',
    'The + / - buttons require migration <code>0039_referral_admin_adjustments.sql</code>.',
    '',
  ];
  const kb = new InlineKeyboard();
  for (const row of rows) {
    const label = referralUserLabel(row.user);
    lines.push(
      `<code>${row.user.telegram_id}</code> ${escapeHtml(label)}  •  ` +
        `available <b>${row.balance.available}</b> / total ${row.balance.total} / used ${row.balance.spent}`,
    );
    kb.text(
      `${label.slice(0, 18)} • ${row.balance.available} refs`,
      `adm:refs:v:${row.user.telegram_id}`,
    ).row();
  }
  if (rows.length === 0) lines.push('<i>No users found.</i>');
  if (page > 0) kb.text('◀️ Prev', `adm:refs:${page - 1}`);
  if (page + 1 < totalPages) kb.text('Next ▶️', `adm:refs:${page + 1}`);
  if (totalPages > 1) kb.row();
  kb.text('🔍 Find User', 'adm:refs:find')
    .text('♻️ Delete All Used Refs', 'adm:refs:resetall:ask')
    .row();
  kb.text('🔄 Refresh', `adm:refs:${page}`).text('⬅️ Back', 'adm:root');
  const body = lines.join('\n');
  if (ctx.callbackQuery) {
    await ctx.editMessageText(body, { parse_mode: 'HTML', reply_markup: kb });
  } else {
    await ctx.reply(body, { parse_mode: 'HTML', reply_markup: kb });
  }
}

async function showReferralAdminUser(ctx: AppCtx, user: DBUser): Promise<void> {
  const balance = await getReferralBalance(user.telegram_id);
  const label = referralUserLabel(user);
  const lines = [
    '🎁 <b>Referral User</b>',
    '',
    `User: ${escapeHtml(label)}`,
    `Telegram ID: <code>${user.telegram_id}</code>`,
    '',
    `Available Refs: <b>${balance.available}</b>`,
    `Total Active Refs: <b>${balance.total}</b>`,
    `Used / Converted: <b>${balance.spent}</b>`,
    '',
    'Use + / - for admin corrections. Reset removes this user\'s referral usage/adjustments, not the real invited-user rows.',
  ];
  const kb = new InlineKeyboard()
    .text('➕ +1 Ref', `adm:refs:adj:${user.telegram_id}:1`)
    .text('➖ -1 Ref', `adm:refs:adj:${user.telegram_id}:-1`)
    .row()
    .text('✍️ Custom +/-', `adm:refs:custom:${user.telegram_id}`)
    .row()
    .text('♻️ Delete User Used Refs', `adm:refs:reset:${user.telegram_id}:ask`)
    .row()
    .text('⬅️ Back to Referrals', 'adm:refs:0')
    .text('🏠 Main', 'adm:root');
  if (ctx.callbackQuery) {
    await ctx.editMessageText(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
  } else {
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
  }
}

async function applyReferralAdjustmentAndShow(
  ctx: AppCtx,
  telegramId: number,
  delta: number,
): Promise<void> {
  const user = await findUserById(telegramId);
  if (!user) {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: 'User not found.', show_alert: true });
    } else {
      await ctx.reply('User not found.');
    }
    return;
  }
  try {
    await addReferralAdjustment({
      user_id: telegramId,
      delta,
      reason: `admin ${delta > 0 ? 'add' : 'deduct'} referral balance`,
      created_by: ctx.from!.id,
    });
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: `Referral balance ${delta > 0 ? '+' : ''}${delta}` });
    }
    await showReferralAdminUser(ctx, user);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const text =
      msg === 'REFERRAL_ADJUSTMENTS_MIGRATION_REQUIRED'
        ? 'Run migration 0039_referral_admin_adjustments.sql first.'
        : 'Could not adjust referral balance.';
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text, show_alert: true });
    } else {
      await ctx.reply(`❌ ${text}`);
    }
  }
}

adminBot.callbackQuery(/^adm:refs:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showReferralAdminList(ctx, Number(ctx.match[1]));
});

adminBot.callbackQuery('adm:refs:find', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = { type: 'referral_find_user', step: 'query', data: {} };
  await ctx.editMessageText(
    '🔍 <b>Find Referral User</b>\n\nSend Telegram numeric ID or @username.\n\nSend /cancel to abort.',
    { parse_mode: 'HTML', reply_markup: backRow(new InlineKeyboard()) },
  );
});

adminBot.callbackQuery(/^adm:refs:v:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await findUserById(Number(ctx.match[1]));
  if (!user) {
    await ctx.editMessageText('User not found.', { reply_markup: backRow(new InlineKeyboard()) });
    return;
  }
  await showReferralAdminUser(ctx, user);
});

adminBot.callbackQuery(/^adm:refs:adj:(\d+):(-?\d+)$/, async (ctx) => {
  await applyReferralAdjustmentAndShow(ctx, Number(ctx.match[1]), Number(ctx.match[2]));
});

adminBot.callbackQuery(/^adm:refs:custom:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const telegramId = Number(ctx.match[1]);
  ctx.session.adminFlow = { type: 'referral_adjust', step: 'delta', data: { telegram_id: telegramId } };
  await ctx.editMessageText(
    `✍️ <b>Custom Referral Adjustment</b>\n\nUser: <code>${telegramId}</code>\nSend an integer like <code>5</code> or <code>-3</code>.\n\nSend /cancel to abort.`,
    { parse_mode: 'HTML', reply_markup: backRow(new InlineKeyboard()) },
  );
});

adminBot.callbackQuery(/^adm:refs:reset:(\d+):ask$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const telegramId = Number(ctx.match[1]);
  const kb = new InlineKeyboard()
    .text('✅ Yes, delete this user used refs', `adm:refs:reset:${telegramId}:do`)
    .row()
    .text('⬅️ Cancel', `adm:refs:v:${telegramId}`);
  await ctx.editMessageText(
    `⚠️ <b>Reset referral usage?</b>\n\nThis clears used Referral Pay records, conversions, and admin adjustments for <code>${telegramId}</code>. Real invited-user rows stay untouched.`,
    { parse_mode: 'HTML', reply_markup: kb },
  );
});

adminBot.callbackQuery(/^adm:refs:reset:(\d+):do$/, async (ctx) => {
  const telegramId = Number(ctx.match[1]);
  const user = await findUserById(telegramId);
  if (!user) {
    await ctx.answerCallbackQuery({ text: 'User not found.', show_alert: true });
    return;
  }
  const result = await resetReferralUsage(telegramId);
  await ctx.answerCallbackQuery({
    text: `Reset ${result.redemptions + result.conversions + result.adjustments} row(s).`,
  });
  await showReferralAdminUser(ctx, user);
});

adminBot.callbackQuery('adm:refs:resetall:ask', async (ctx) => {
  await ctx.answerCallbackQuery();
  const kb = new InlineKeyboard()
    .text('✅ Yes, delete ALL used refs', 'adm:refs:resetall:do')
    .row()
    .text('⬅️ Cancel', 'adm:refs:0');
  await ctx.editMessageText(
    '⚠️ <b>Reset ALL referral usage?</b>\n\nThis clears every user\'s Referral Pay usage, referral conversions, and admin adjustments. Real invited-user rows stay untouched.',
    { parse_mode: 'HTML', reply_markup: kb },
  );
});

adminBot.callbackQuery('adm:refs:resetall:do', async (ctx) => {
  const result = await resetReferralUsage();
  await ctx.answerCallbackQuery({
    text: `Reset ${result.redemptions + result.conversions + result.adjustments} row(s).`,
    show_alert: true,
  });
  await showReferralAdminList(ctx, 0);
});

// ============================================================
// Custom Prices — per-user, per-product price overrides.
//
// Flow:
//   adm:price            → ask admin for telegram_id (or @username)
//   adm:price:u:<tgid>   → render the user's override list with
//                          buttons to add a new override, edit /
//                          clear an existing one, bulk paste, or
//                          clear-all.
//   adm:price:add:<tgid> → list every active product so the admin
//                          can pick which one to override next.
//   adm:price:set:<tgid>:<pid>
//                        → prompt for the override price.
//   adm:price:del:<tgid>:<pid>
//                        → drop a single override.
//   adm:price:bulk:<tgid> → enter bulk-paste mode.
//   adm:price:clr:<tgid> → drop every override for the user.
// ============================================================

const PRICE_PRODUCTS_PER_PAGE = 8;

async function showCustomPriceUserPick(ctx: AppCtx): Promise<void> {
  ctx.session.adminFlow = {
    type: 'price_overrides_pick_user',
    step: 'query',
    data: {},
  };
  const body =
    '💎 *Custom Prices*\n\n' +
    'Per-user, per-product price overrides. Send the user\'s ' +
    'Telegram numeric ID or `@username` to start editing.\n\n' +
    'Tip: you can pre-set prices for users who haven\'t `/start`-ed ' +
    'the bot yet — paste their numeric Telegram ID.\n\n' +
    'Or `/cancel`.';
  // Two top-level shortcuts that don't require typing a user first:
  //   📊 Overview — paginated, deeply detailed table of every
  //                 override across every user.
  //   📥 Export CSV — same data as a downloadable .csv file you can
  //                   open in Excel / Google Sheets for sorting,
  //                   filtering, charting.
  const kb = new InlineKeyboard()
    .text('📊 Full overview', 'adm:price:report:0')
    .text('📥 Export CSV', 'adm:price:csv')
    .row()
    .text('⬅️ Back', 'adm:root');
  if (ctx.callbackQuery) {
    await ctx.editMessageText(body, {
      parse_mode: 'Markdown',
      reply_markup: kb,
    });
  } else {
    await ctx.reply(body, {
      parse_mode: 'Markdown',
      reply_markup: kb,
    });
  }
}

async function showCustomPriceUserCard(
  ctx: AppCtx,
  telegram_id: number,
): Promise<void> {
  ctx.session.adminFlow = undefined;
  const overrides = await listUserPriceOverrides(telegram_id);
  const targetUser = await findUserById(telegram_id);
  const handle = targetUser?.username
    ? `@${targetUser.username}`
    : (targetUser?.first_name ?? `id ${telegram_id}`);
  // Rendered in HTML rather than Markdown V1 — V1 treats `_` as
  // italic delimiter and does not honour `\_` escapes, so a
  // username like `@lais_one` would unbalance the surrounding
  // italic block and Telegram would reject the send. That used to
  // surface as the generic "Something went wrong. Cancelled."
  // toast and the Custom Prices screen never opened.
  const lines: string[] = [
    `💎 <b>Custom Prices for</b> <code>${telegram_id}</code> ` +
      `<i>(${escapeHtml(handle)})</i>`,
    '',
  ];
  if (overrides.length === 0) {
    lines.push('<i>No overrides yet.</i> Tap <b>Add override</b> to set one.');
  } else {
    lines.push(`Active overrides: <b>${overrides.length}</b>`, '');
    for (const o of overrides) {
      lines.push(
        `<code>#${o.product_id}</code> ${escapeHtml(o.product_name)}: ` +
          `<b>$${o.price.toFixed(2)}</b> ` +
          `<i>(default $${o.product_default_price.toFixed(2)})</i>`,
      );
    }
  }
  const kb = new InlineKeyboard()
    .text('➕ Add / edit override', `adm:price:add:${telegram_id}:0`)
    .row()
    .text('📋 Bulk paste', `adm:price:bulk:${telegram_id}`)
    .row();
  if (overrides.length > 0) {
    // Clear-rows: each override gets a one-tap delete row.
    for (const o of overrides) {
      kb.text(
        `🗑 ${o.product_name.slice(0, 40)} ($${o.price.toFixed(2)})`,
        `adm:price:del:${telegram_id}:${o.product_id}`,
      ).row();
    }
    kb.text('🧹 Clear ALL overrides', `adm:price:clr:${telegram_id}`).row();
  }
  kb.text('⬅️ Back', 'adm:price');
  if (ctx.callbackQuery) {
    await ctx.editMessageText(lines.join('\n'), {
      parse_mode: 'HTML',
      reply_markup: kb,
    });
  } else {
    await ctx.reply(lines.join('\n'), {
      parse_mode: 'HTML',
      reply_markup: kb,
    });
  }
}

async function showCustomPriceProductPicker(
  ctx: AppCtx,
  telegram_id: number,
  page: number,
): Promise<void> {
  const { rows, total } = await listAllProducts(page, PRICE_PRODUCTS_PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(total / PRICE_PRODUCTS_PER_PAGE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const overrides = await listUserPriceOverrides(telegram_id);
  const overrideMap = new Map(overrides.map((o) => [o.product_id, o.price]));

  const lines = [
    `💎 *Pick a product* — page ${safePage + 1}/${totalPages}`,
    '',
    `Editing overrides for \`${telegram_id}\`. ` +
      'Tap a product to set/replace its override price.',
  ];
  const kb = new InlineKeyboard();
  for (const p of rows) {
    const cur = overrideMap.get(p.id);
    const label =
      cur !== undefined
        ? `${p.name} — $${cur.toFixed(2)} (was $${Number(p.price).toFixed(2)})`
        : `${p.name} — $${Number(p.price).toFixed(2)}`;
    kb.text(label.slice(0, 60), `adm:price:set:${telegram_id}:${p.id}`).row();
  }
  if (safePage > 0) {
    kb.text('◀ Prev', `adm:price:add:${telegram_id}:${safePage - 1}`);
  }
  if (safePage + 1 < totalPages) {
    kb.text('Next ▶', `adm:price:add:${telegram_id}:${safePage + 1}`);
  }
  kb.row().text('⬅️ Back', `adm:price:u:${telegram_id}`);
  await ctx.editMessageText(lines.join('\n'), {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
}

adminBot.callbackQuery('adm:price', async (ctx) => {
  await ctx.answerCallbackQuery();
  await showCustomPriceUserPick(ctx);
});

adminBot.callbackQuery(/^adm:price:u:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showCustomPriceUserCard(ctx, Number(ctx.match[1]));
});

adminBot.callbackQuery(/^adm:price:add:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showCustomPriceProductPicker(
    ctx,
    Number(ctx.match[1]),
    Number(ctx.match[2]),
  );
});

adminBot.callbackQuery(/^adm:price:set:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const telegram_id = Number(ctx.match[1]);
  const product_id = Number(ctx.match[2]);
  const product = await getProduct(product_id);
  if (!product) {
    await ctx.editMessageText('Product no longer exists.', {
      reply_markup: backRow(new InlineKeyboard()),
    });
    return;
  }
  ctx.session.adminFlow = {
    type: 'price_override_set',
    step: 'price',
    data: { telegram_id, product_id },
  };
  await ctx.editMessageText(
    `💎 *Set override*\n\n` +
      `User: \`${telegram_id}\`\n` +
      `Product: ${escapeHtml(product.name)} (\`#${product.id}\`)\n` +
      `Default price: *$${Number(product.price).toFixed(2)}*\n\n` +
      'Send the new override price (e.g. `12.50`). Send `0` to make ' +
      'it free for this user, or `/cancel` to abort.',
    {
      parse_mode: 'Markdown',
      reply_markup: backRow(new InlineKeyboard()),
    },
  );
});

adminBot.callbackQuery(/^adm:price:del:(\d+):(\d+)$/, async (ctx) => {
  const telegram_id = Number(ctx.match[1]);
  const product_id = Number(ctx.match[2]);
  await clearUserProductPrice(telegram_id, product_id);
  await ctx.answerCallbackQuery({ text: '🗑 Override removed.' });
  await showCustomPriceUserCard(ctx, telegram_id);
});

adminBot.callbackQuery(/^adm:price:clr:(\d+)$/, async (ctx) => {
  const telegram_id = Number(ctx.match[1]);
  const n = await clearAllUserPriceOverrides(telegram_id);
  await ctx.answerCallbackQuery({
    text: n === 0 ? 'No overrides to clear.' : `🧹 Cleared ${n} overrides.`,
  });
  await showCustomPriceUserCard(ctx, telegram_id);
});

adminBot.callbackQuery(/^adm:price:bulk:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const telegram_id = Number(ctx.match[1]);
  ctx.session.adminFlow = {
    type: 'price_override_bulk',
    step: 'block',
    data: { telegram_id },
  };
  await ctx.editMessageText(
    `📋 *Bulk paste* — for user \`${telegram_id}\`\n\n` +
      'Send a single message with one override per line, in the form:\n' +
      '```\n' +
      '<product_id> <price>\n' +
      '<product_id> <price>\n' +
      '```\n' +
      'Example:\n' +
      '```\n' +
      '17 9.99\n' +
      '23 0\n' +
      '42 100.50\n' +
      '```\n' +
      'Lines starting with `#` are ignored. Existing overrides for the ' +
      'listed products are replaced; others are left untouched.\n\n' +
      'Or `/cancel`.',
    {
      parse_mode: 'Markdown',
      reply_markup: backRow(new InlineKeyboard()),
    },
  );
});

// ------------------------------------------------------------
// 📊 Full overview — paginated, deeply detailed table of every
// override across every user. Groups by user; each group shows
// the user's handle / Telegram ID, total override count, total
// dollar swing (sum of override-default deltas) and a row per
// product with default → override price + delta.
//
// USERS_PER_PAGE limits how many user-groups appear per Telegram
// message so we never blow past the 4096-char Markdown limit.
// ------------------------------------------------------------
const PRICE_REPORT_USERS_PER_PAGE = 5;

adminBot.callbackQuery(/^adm:price:report:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const page = Math.max(0, Number(ctx.match[1]));
  const all = await listAllPriceOverrides();
  if (all.length === 0) {
    await ctx.editMessageText(
      '📊 *Custom Prices — Overview*\n\n_No overrides set yet._\n\n' +
        'Add one via the user pick screen or pre-set by Telegram ID.',
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard().text('⬅️ Back', 'adm:price'),
      },
    );
    return;
  }

  // Group by telegram_id while preserving the (telegram_id, product_id)
  // sort coming from the query.
  const groups = new Map<
    number,
    {
      telegram_id: number;
      username: string | null;
      first_name: string | null;
      rows: typeof all;
    }
  >();
  for (const o of all) {
    let g = groups.get(o.telegram_id);
    if (!g) {
      g = {
        telegram_id: o.telegram_id,
        username: o.username,
        first_name: o.first_name,
        rows: [],
      };
      groups.set(o.telegram_id, g);
    }
    g.rows.push(o);
  }
  const groupArr = Array.from(groups.values());
  const totalPages = Math.max(
    1,
    Math.ceil(groupArr.length / PRICE_REPORT_USERS_PER_PAGE),
  );
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PRICE_REPORT_USERS_PER_PAGE;
  const end = Math.min(start + PRICE_REPORT_USERS_PER_PAGE, groupArr.length);

  const header = [
    '📊 *Custom Prices — Overview*',
    `Users with overrides: *${groupArr.length}* · ` +
      `Total override rows: *${all.length}*` +
      ` · Page ${safePage + 1}/${totalPages}`,
    '',
  ];

  const sections: string[] = [];
  for (let i = start; i < end; i++) {
    const g = groupArr[i];
    if (!g) continue;
    const handle = g.username ? `@${g.username}` : (g.first_name ?? '_no name_');
    const swing = g.rows.reduce(
      (acc, r) => acc + (r.price - r.product_default_price),
      0,
    );
    const swingTxt =
      swing === 0
        ? '±$0.00'
        : swing > 0
          ? `+$${swing.toFixed(2)} above default`
          : `−$${Math.abs(swing).toFixed(2)} below default`;
    const userLine =
      `*${i + 1}.* \`${g.telegram_id}\` _(${escapeHtml(handle)})_ · ` +
      `*${g.rows.length}* override${g.rows.length === 1 ? '' : 's'} · ${swingTxt}`;
    const productLines = g.rows.map((r) => {
      const delta = r.price - r.product_default_price;
      const sign = delta === 0 ? '=' : delta > 0 ? '+' : '−';
      const pct =
        r.product_default_price > 0
          ? `${((delta / r.product_default_price) * 100).toFixed(1)}%`
          : 'n/a';
      return (
        `   • \`#${r.product_id}\` ${escapeHtml(r.product_name)}: ` +
        `*$${r.price.toFixed(2)}* ` +
        `(default $${r.product_default_price.toFixed(2)}, ` +
        `${sign}$${Math.abs(delta).toFixed(2)} / ${pct})`
      );
    });
    sections.push([userLine, ...productLines].join('\n'));
  }

  const kb = new InlineKeyboard();
  if (safePage > 0) {
    kb.text('◀ Prev', `adm:price:report:${safePage - 1}`);
  }
  if (safePage + 1 < totalPages) {
    kb.text('Next ▶', `adm:price:report:${safePage + 1}`);
  }
  kb.row().text('📥 Export CSV', 'adm:price:csv').row();
  kb.text('⬅️ Back', 'adm:price');

  const body = [...header, ...sections].join('\n\n');
  await ctx.editMessageText(body, {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
});

// 📥 CSV export — emits the same data as a downloadable file with
// columns the admin can sort / filter / chart in Excel or Google
// Sheets. Quoted with RFC-4180 doubling so commas and quotes inside
// product names don't break parsing.
function csvEscape(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

adminBot.callbackQuery('adm:price:csv', async (ctx) => {
  await ctx.answerCallbackQuery({ text: 'Building CSV…' });
  const all = await listAllPriceOverrides();
  if (all.length === 0) {
    await ctx.reply(
      '📥 No overrides to export — set at least one before downloading.',
    );
    return;
  }
  const header = [
    'telegram_id',
    'username',
    'first_name',
    'product_id',
    'product_name',
    'default_price_usd',
    'override_price_usd',
    'delta_usd',
    'delta_pct',
    'set_by_admin_telegram_id',
    'set_at',
  ];
  const lines = [header.join(',')];
  for (const r of all) {
    const delta = r.price - r.product_default_price;
    const pct =
      r.product_default_price > 0
        ? ((delta / r.product_default_price) * 100).toFixed(2)
        : '';
    lines.push(
      [
        r.telegram_id,
        r.username ?? '',
        r.first_name ?? '',
        r.product_id,
        r.product_name,
        r.product_default_price.toFixed(2),
        r.price.toFixed(2),
        delta.toFixed(2),
        pct,
        r.created_by ?? '',
        r.updated_at,
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const filename = `price_overrides_${stamp}.csv`;
  await ctx.replyWithDocument(
    new InputFile(Buffer.from(lines.join('\n') + '\n', 'utf8'), filename),
    {
      caption:
        `📥 *Custom Prices — Export*\n` +
        `Rows: *${all.length}* · ` +
        `Generated: ${new Date().toUTCString()}`,
      parse_mode: 'Markdown',
    },
  );
});

// ============================================================
// 💸 Promos — qty-threshold flat-USDT auto-discounts.
//
// Hierarchical scope: per-user-per-product → per-user → per-product
// → default. Most specific match wins; ties on the same tier go to
// the largest discount. Resolution + integration live in
// `src/services/promo.ts` and the `pay:wallet:<id>` handler — this
// section is purely the admin CRUD UI.
//
// Routes:
//   adm:promo                     → list page 0
//   adm:promo:list:<page>         → paginated list
//   adm:promo:v:<id>              → view/edit a single promo
//   adm:promo:new                 → start the new-promo wizard
//   adm:promo:scope:<scope>       → scope chosen
//   adm:promo:np:<page>           → product picker (new promo)
//   adm:promo:npp:<product_id>    → product chosen
//   adm:promo:nameSkip            → skip optional promo name
//   adm:promo:toggle:<id>         → flip active flag
//   adm:promo:editq:<id>          → start "change min qty" prompt
//   adm:promo:editd:<id>          → start "change discount" prompt
//   adm:promo:editn:<id>          → start "change name" prompt
//   adm:promo:del:<id>            → delete confirmation
//   adm:promo:delok:<id>          → confirm delete
// ============================================================

const PROMO_PAGE_SIZE = 8;

type PromoTierInput = {
  min_qty: number;
  max_qty: number | null;
  unit_price: number;
};

function promoTierLabel(tiers: PromoTierInput[]): string {
  return tiers
    .map(
      (t) =>
        `${t.max_qty === null ? `${t.min_qty}+` : `${t.min_qty}-${t.max_qty}`}` +
        ` → $${Number(t.unit_price).toFixed(2)} each`,
    )
    .join(' · ');
}

function parsePromoTiers(text: string): { tiers?: PromoTierInput[]; error?: string } {
  const tiers: PromoTierInput[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return { error: 'Send at least one tier line.' };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = line.match(/^(\d+)\s*-\s*(\d+)\s+([0-9]+(?:\.[0-9]+)?)$/) ??
      line.match(/^(\d+)\s*\+\s+([0-9]+(?:\.[0-9]+)?)$/);
    if (!m) {
      return { error: `Line ${i + 1} is invalid: \`${line}\`. Use \`min-max price\` or \`min+ price\`.` };
    }
    const min_qty = Number(m[1]);
    const max_qty = m[3] === undefined ? null : Number(m[2]);
    const unit_price = Number(m[3] === undefined ? m[2] : m[3]);
    if (!Number.isInteger(min_qty) || min_qty < 1) {
      return { error: `Line ${i + 1} has an invalid minimum quantity.` };
    }
    if (max_qty !== null && (!Number.isInteger(max_qty) || max_qty < min_qty)) {
      return { error: `Line ${i + 1} has max quantity below min quantity.` };
    }
    if (!Number.isFinite(unit_price) || unit_price < 0) {
      return { error: `Line ${i + 1} has an invalid unit price.` };
    }
    tiers.push({ min_qty, max_qty, unit_price });
  }
  tiers.sort((a, b) => a.min_qty - b.min_qty);
  for (let i = 1; i < tiers.length; i++) {
    const previous = tiers[i - 1]!;
    const current = tiers[i]!;
    if (previous.max_qty === null || previous.max_qty >= current.min_qty) {
      return { error: `Lines ${i} and ${i + 1} overlap.` };
    }
  }
  return { tiers };
}

async function promptPromoType(ctx: AppCtx, data: {
  scope: 'default' | 'product' | 'user' | 'user_product';
  product_id: number | null;
  telegram_id: number | null;
}): Promise<void> {
  const kb = new InlineKeyboard()
    .text('💵 Flat discount', 'adm:promo:type:flat')
    .row()
    .text('📊 Tiered per-unit pricing', 'adm:promo:type:tiered')
    .row()
    .text('⬅️ Cancel', 'adm:promo');
  ctx.session.adminFlow = { type: 'promo_add', step: 'type', data };
  await ctx.reply(
    [
      '➕ *New promo — Step 3/4: Pricing type*',
      '',
      'Choose the existing flat discount or a quantity-tiered unit price ladder.',
    ].join('\n'),
    { parse_mode: 'Markdown', reply_markup: kb },
  );
}

async function promptPromoTiers(ctx: AppCtx, data: {
  scope: 'default' | 'product' | 'user' | 'user_product';
  product_id: number | null;
  telegram_id: number | null;
}): Promise<void> {
  ctx.session.adminFlow = { type: 'promo_add', step: 'tiers', data };
  await ctx.reply(
    [
      '➕ *New promo — Tier ladder*',
      '',
      'Send one tier per line as `min-max price`.',
      'Use `min+ price` for an open-ended top tier.',
      'Example:',
      '`1-99 0.70`',
      '`100-199 0.60`',
      '`200+ 0.50`',
      '',
      'Gaps are allowed; overlapping ranges are rejected.',
      'Send `/cancel` to abort.',
    ].join('\n'),
    { parse_mode: 'Markdown', reply_markup: new InlineKeyboard().text('⬅️ Cancel', 'adm:promo') },
  );
}

/** Human-readable scope label for the list / detail views. */
function promoScopeLabel(p: Pick<DBPromo, 'product_id' | 'telegram_id'> & { product_name?: string | null }): string {
  if (p.telegram_id !== null && p.product_id !== null) {
    return `User \`${p.telegram_id}\` · Product ${p.product_name ? `*${p.product_name}*` : `#${p.product_id}`}`;
  }
  if (p.telegram_id !== null) return `User \`${p.telegram_id}\` · _any product_`;
  if (p.product_id !== null) return `_any user_ · Product ${p.product_name ? `*${p.product_name}*` : `#${p.product_id}`}`;
  return '_default — every user, every product_';
}

async function showPromoList(ctx: AppCtx, page: number): Promise<void> {
  ctx.session.adminFlow = undefined;
  const { rows, total } = await listPromos(page, PROMO_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PROMO_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const lines: string[] = [
    '💸 *Promos*',
    '',
    `Active rule set — page ${safePage + 1}/${totalPages}  (total ${total})`,
  ];
  if (rows.length === 0) {
    lines.push('', '_No promos yet._', 'Tap *➕ Add promo* to create the first one.');
  } else {
    lines.push('');
    for (const p of rows) {
      const scope = promoScopeLabel(p);
      const active = p.active ? '🟢' : '⏸';
      const name = p.name?.trim() ? ` — _${p.name.trim()}_` : '';
      lines.push(
        `${active} \`#${p.id}\` ${
          p.tiers && p.tiers.length > 0
            ? promoTierLabel(p.tiers)
            : `qty ≥ *${p.min_qty}* → −*$${Number(p.discount_amount).toFixed(2)}*`
        }${name}`,
        `   ${scope}`,
      );
    }
  }
  const kb = new InlineKeyboard()
    .text('➕ Add promo', 'adm:promo:new')
    .text('🎁 Gift Codes', 'adm:gift')
    .row()
    .text('📊 Full overview', 'adm:promo:report:0')
    .row();
  for (const p of rows) {
    const scope = p.telegram_id && p.product_id
      ? 'U+P'
      : p.telegram_id
        ? 'User'
        : p.product_id
          ? 'Prod'
          : 'Def';
    kb.text(
      `#${p.id} ${scope} ${
        p.tiers && p.tiers.length > 0
          ? 'tiered'
          : `q≥${p.min_qty} −$${Number(p.discount_amount).toFixed(2)}`
      }`,
      `adm:promo:v:${p.id}`,
    ).row();
  }
  if (safePage > 0) kb.text('◀ Prev', `adm:promo:list:${safePage - 1}`);
  if (safePage + 1 < totalPages) kb.text('Next ▶', `adm:promo:list:${safePage + 1}`);
  kb.row().text('⬅️ Back', 'adm:root');
  await sendOrEdit(ctx, lines.join('\n'), kb);
}

adminBot.callbackQuery('adm:promo', async (ctx) => {
  await ctx.answerCallbackQuery();
  await showPromoList(ctx, 0);
});

/**
 * `/promo [add|list|edit <id>|delete <id>]` — convenience slash
 * command that lands on the same UI as the panel button. Subcommands
 * are best-effort shortcuts:
 *   /promo            → list page 0
 *   /promo list       → list page 0
 *   /promo add        → start the new-promo wizard (scope picker)
 *   /promo edit <id>  → jump to the promo card (toggle / edit / delete)
 *   /promo delete <id>→ jump to the delete confirmation
 */
adminBot.command('promo', async (ctx) => {
  ctx.session.adminFlow = undefined;
  const arg = (ctx.match ?? '').toString().trim();
  if (!arg || /^list\b/i.test(arg)) {
    await showPromoList(ctx, 0);
    return;
  }
  if (/^add\b/i.test(arg)) {
    const kb = new InlineKeyboard()
      .text('🌐 Default (everyone, every product)', 'adm:promo:scope:default')
      .row()
      .text('📦 Per product (any user)', 'adm:promo:scope:product')
      .row()
      .text('👤 Per user (any product)', 'adm:promo:scope:user')
      .row()
      .text('👤📦 Per user + product', 'adm:promo:scope:user_product')
      .row()
      .text('⬅️ Cancel', 'adm:promo');
    await ctx.reply(
      [
        '➕ *New promo — Step 1/4: Scope*',
        '',
        'Pick how widely this discount should apply.',
        'Most-specific scope wins at order time, so a per-user-per-product',
        'promo overrides a per-user one, etc.',
      ].join('\n'),
      { parse_mode: 'Markdown', reply_markup: kb },
    );
    return;
  }
  const editMatch = arg.match(/^edit\s+(\d+)\b/i);
  if (editMatch) {
    const id = Number(editMatch[1]);
    await showPromoCard(ctx, id);
    return;
  }
  const delMatch = arg.match(/^(?:delete|del|rm)\s+(\d+)\b/i);
  if (delMatch) {
    const id = Number(delMatch[1]);
    const p = await getPromo(id);
    if (!p) {
      await ctx.reply(`❓ Promo #${id} not found.`);
      return;
    }
    const kb = new InlineKeyboard()
      .text('🗑 Yes, delete', `adm:promo:delok:${id}`)
      .text('❌ Cancel', `adm:promo:v:${id}`);
    await ctx.reply(
      `🗑 *Delete promo #${id}?*\n\nThis cannot be undone.`,
      { parse_mode: 'Markdown', reply_markup: kb },
    );
    return;
  }
  await ctx.reply(
    [
      '💸 *Usage:*',
      '`/promo`              — list promos',
      '`/promo add`          — new promo wizard',
      '`/promo edit <id>`    — open a promo',
      '`/promo delete <id>`  — delete a promo',
    ].join('\n'),
    { parse_mode: 'Markdown' },
  );
});

adminBot.callbackQuery(/^adm:promo:list:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showPromoList(ctx, Number(ctx.match[1]));
});

/**
 * Send `text` either by editing the current callback message or, if
 * we're being called from a `message:text` handler (no callback to
 * edit), by replying with a fresh message. Used by every admin
 * helper that can be reached both ways.
 */
async function sendOrEdit(
  ctx: AppCtx,
  text: string,
  reply_markup: InlineKeyboard,
): Promise<void> {
  const opts = { parse_mode: 'Markdown' as const, reply_markup };
  // Answer callback immediately before editing to stop loading spinner
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery().catch(() => {});
    try {
      await ctx.editMessageText(text, opts);
      return;
    } catch {
      // Fall through to a fresh reply if the source message can't
      // be edited (e.g. too old, deleted by user, etc.).
    }
  }
  await ctx.reply(text, opts);
}

/**
 * Render the deep-detail card for a single promo. Mirrors the
 * Custom Prices "user card" — beyond the raw row, also surfaces
 * the joined product (name / default price / stock), the joined
 * target user (handle / balance), the admin actor that created
 * the promo, and aggregate impact stats from the orders table.
 */
async function showPromoCard(ctx: AppCtx, promo_id: number): Promise<void> {
  ctx.session.adminFlow = undefined;
  const p = await getPromo(promo_id);
  if (!p) {
    await sendOrEdit(
      ctx,
      '❓ Promo not found.',
      new InlineKeyboard().text('⬅️ Back', 'adm:promo'),
    );
    return;
  }
  // Hydrate side-tables in parallel — none of them block on each
  // other and only the first three are guaranteed to fire.
  // Use timeout wrapper to prevent hangs if a query stalls.
  const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ]);

  const [product, targetUser, actorUser, impact] = await Promise.all([
    withTimeout(
      p.product_id !== null ? getProduct(p.product_id) : Promise.resolve(null),
      5000,
      null,
    ),
    withTimeout(
      p.telegram_id !== null ? findUserById(p.telegram_id) : Promise.resolve(null),
      5000,
      null,
    ),
    withTimeout(
      p.created_by !== null ? findUserById(p.created_by) : Promise.resolve(null),
      5000,
      null,
    ),
    withTimeout(getPromoImpact(p.id), 5000, { orders: 0, total_discount: 0, last_used: null }),
  ]);

  const scope = promoScopeLabel({ ...p, product_name: product?.name ?? null });
  const lines: string[] = [
    `💸 *Promo #${p.id}*`,
    '',
    `Status: ${p.active ? '🟢 *Active*' : '⏸ *Paused*'}`,
    `Scope: ${scope}`,
    p.tiers && p.tiers.length > 0
      ? `Tiers: *${promoTierLabel(p.tiers)}*`
      : `Min qty: *${p.min_qty}*`,
    p.tiers && p.tiers.length > 0
      ? 'Pricing: tiered per-unit (never above the effective user price)'
      : `Discount: *$${Number(p.discount_amount).toFixed(2)}* off the line total`,
    `Name: ${p.name?.trim() ? `_${p.name.trim()}_` : '—'}`,
  ];

  if (product) {
    const stock = Number(product.stock);
    const price = Number(product.price);
    lines.push(
      '',
      `📦 *Product*`,
      `   • \`#${product.id}\` ${escapeHtml(product.name)}`,
      `   • Default price: *$${price.toFixed(2)}*`,
      `   • In stock: *${stock}*`,
    );
    // Cheap "savings preview" so the admin can sanity-check the
    // promo at a glance — what the buyer pays at the threshold qty.
    const previewTier = p.tiers?.[0];
    const previewQty = previewTier?.min_qty ?? p.min_qty;
    const grossAtMin = price * previewQty;
    const previewUnit = previewTier
      ? Math.min(price, Number(previewTier.unit_price))
      : price;
    const totalAtMin = previewUnit * previewQty;
    const discountAtMin = grossAtMin - totalAtMin;
    const pct =
      grossAtMin > 0 ? `${((discountAtMin / grossAtMin) * 100).toFixed(1)}%` : 'n/a';
    lines.push(
      `   • At qty *${previewQty}*: gross *$${grossAtMin.toFixed(2)}*` +
        ` → pay *$${totalAtMin.toFixed(2)}* (saves $${discountAtMin.toFixed(2)} / ${pct})`,
    );
  }

  if (targetUser) {
    const handle = targetUser.username
      ? `@${targetUser.username}`
      : (targetUser.first_name ?? '_no name_');
    const balance = Number(targetUser.balance ?? 0);
    lines.push(
      '',
      `👤 *Target user*`,
      `   • \`${targetUser.telegram_id}\` _(${escapeHtml(handle)})_`,
      `   • Wallet balance: *$${balance.toFixed(2)}*`,
    );
  } else if (p.telegram_id !== null) {
    // User-scoped promo set for a tg id that hasn't /start-ed yet.
    lines.push(
      '',
      `👤 *Target user*`,
      `   • \`${p.telegram_id}\` _(hasn't started the bot)_`,
    );
  }

  // Excluded users — opt-out list, applied on top of the scope
  // filter. We surface the count + first few IDs inline so the
  // admin doesn't have to drill in to know if anyone is excluded.
  const excluded = Array.isArray(p.excluded_telegram_ids)
    ? p.excluded_telegram_ids.map(Number)
    : [];
  if (excluded.length > 0) {
    const preview = excluded.slice(0, 5).map((id) => `\`${id}\``).join(', ');
    const more = excluded.length > 5 ? `, +${excluded.length - 5} more` : '';
    lines.push(
      '',
      `🚫 *Excluded users (${excluded.length})*`,
      `   ${preview}${more}`,
    );
  } else {
    lines.push('', `🚫 *Excluded users:* _none_`);
  }

  // Impact stats — only meaningful once at least one order has used
  // this promo, but we always render the section so the admin sees
  // "0 orders so far" for new rules.
  lines.push(
    '',
    `📊 *Impact (paid orders)*`,
    `   • Orders matched: *${impact.orders}*`,
    `   • Total discount given: *$${impact.total_discount.toFixed(2)}*`,
    `   • Last used: ${impact.last_used ? new Date(impact.last_used).toLocaleString('en-GB') : '—'}`,
  );

  // Audit trail.
  const actorHandle = actorUser
    ? actorUser.username
      ? `@${actorUser.username}`
      : (actorUser.first_name ?? `id ${actorUser.telegram_id}`)
    : null;
  lines.push(
    '',
    `Created: ${new Date(p.created_at).toLocaleString('en-GB')}`,
    p.created_by
      ? `By: ${actorHandle ? `_${escapeHtml(actorHandle)}_ ` : ''}\`${p.created_by}\``
      : 'By: _—_',
    `Updated: ${new Date(p.updated_at).toLocaleString('en-GB')}`,
  );

  const kb = new InlineKeyboard()
    .text(p.active ? '⏸ Pause' : '▶️ Activate', `adm:promo:toggle:${p.id}`)
    .row();
  if (p.tiers && p.tiers.length > 0) {
    kb.text('✏️ Edit tiers', `adm:promo:editt:${p.id}`).row();
  } else {
    kb.text('✏️ Min qty', `adm:promo:editq:${p.id}`)
      .text('💵 Discount', `adm:promo:editd:${p.id}`)
      .row();
  }
  kb
    .text('🏷 Name', `adm:promo:editn:${p.id}`)
    .text(
      excluded.length > 0
        ? `🚫 Excluded (${excluded.length})`
        : '🚫 Exclude users',
      `adm:promo:ex:${p.id}`,
    )
    .row()
    .text('🗑 Delete', `adm:promo:del:${p.id}`)
    .row()
    .text('⬅️ Back to list', 'adm:promo');
  await sendOrEdit(ctx, lines.join('\n'), kb);
}

adminBot.callbackQuery(/^adm:promo:v:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  // Answer immediately to stop loading spinner - before any async work
  await ctx.answerCallbackQuery().catch(() => {});
  try {
    await showPromoCard(ctx, id);
  } catch (err) {
    logger.error({ err, promo_id: id }, 'adm:promo:v failed');
    try {
      await ctx.answerCallbackQuery({ text: 'Failed to load promo', show_alert: true });
    } catch { /* noop */ }
  }
});

adminBot.callbackQuery(/^adm:promo:toggle:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  const p = await getPromo(id);
  if (!p) {
    await ctx.answerCallbackQuery({ text: 'Not found.', show_alert: true });
    return;
  }
  await updatePromo(id, { active: !p.active });
  await ctx.answerCallbackQuery({ text: !p.active ? 'Activated' : 'Paused' });
  await showPromoCard(ctx, id);
});

adminBot.callbackQuery(/^adm:promo:del:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = Number(ctx.match[1]);
  const kb = new InlineKeyboard()
    .text('🗑 Yes, delete', `adm:promo:delok:${id}`)
    .text('❌ Cancel', `adm:promo:v:${id}`);
  await ctx.editMessageText(
    `🗑 *Delete promo #${id}?*\n\nThis cannot be undone.`,
    { parse_mode: 'Markdown', reply_markup: kb },
  );
});

adminBot.callbackQuery(/^adm:promo:delok:(\d+)$/, async (ctx) => {
  const id = Number(ctx.match[1]);
  await deletePromo(id);
  await ctx.answerCallbackQuery({ text: 'Deleted' });
  await showPromoList(ctx, 0);
});

// -------- Per-promo user exclusion list ---------------------------
//
// Lets the admin opt specific users OUT of a promo that would
// otherwise apply (default / per-product). Filtering happens in
// `findApplicablePromos` and `findScopedActivePromos` — this is
// purely the CRUD UI.
//
// Routes:
//   adm:promo:ex:<id>             → list excluded users for promo
//   adm:promo:exadd:<id>          → start "exclude user" prompt
//   adm:promo:exdel:<id>:<tg>     → un-exclude a user

async function showPromoExclusions(ctx: AppCtx, promo_id: number): Promise<void> {
  ctx.session.adminFlow = undefined;
  const p = await getPromo(promo_id);
  if (!p) {
    await sendOrEdit(
      ctx,
      '❓ Promo not found.',
      new InlineKeyboard().text('⬅️ Back', 'adm:promo'),
    );
    return;
  }
  const excluded = Array.isArray(p.excluded_telegram_ids)
    ? p.excluded_telegram_ids.map(Number)
    : [];
  // Hydrate handles for the listed users — same pattern as the
  // promo card's target-user lookup. Misses (user hasn't /start-ed
  // the bot) render as just the numeric id.
  const handles = await Promise.all(
    excluded.map(async (id) => {
      const u = await findUserById(id);
      const label = u?.username
        ? `@${u.username}`
        : (u?.first_name ?? '_no name_');
      return { id, label };
    }),
  );

  const lines: string[] = [
    `🚫 *Promo #${p.id} — Excluded users*`,
    '',
    `Promo: ${
      p.tiers && p.tiers.length > 0
        ? promoTierLabel(p.tiers)
        : `qty ≥ *${p.min_qty}* → −*$${Number(p.discount_amount).toFixed(2)}*`
    } ` +
      `(${p.active ? '🟢 Active' : '⏸ Paused'})`,
    `Scope: ${promoScopeLabel(p)}`,
    '',
  ];
  if (handles.length === 0) {
    lines.push(
      '_Nobody is excluded._',
      '',
      'Tap *➕ Exclude a user* to opt someone out of this promo.',
      'They will keep seeing other promos that apply to them — only',
      'this specific rule will be skipped at checkout.',
    );
  } else {
    lines.push(`*${handles.length}* user${handles.length === 1 ? '' : 's'} opted out:`);
    for (const h of handles) {
      lines.push(`   • \`${h.id}\` — ${escapeHtml(h.label)}`);
    }
  }

  const kb = new InlineKeyboard()
    .text('➕ Exclude a user', `adm:promo:exadd:${p.id}`)
    .row();
  for (const h of handles) {
    kb.text(`🗑 Remove ${h.id}`, `adm:promo:exdel:${p.id}:${h.id}`).row();
  }
  kb.text('⬅️ Back to promo', `adm:promo:v:${p.id}`);
  await sendOrEdit(ctx, lines.join('\n'), kb);
}

adminBot.callbackQuery(/^adm:promo:ex:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showPromoExclusions(ctx, Number(ctx.match[1]));
});

adminBot.callbackQuery(/^adm:promo:exadd:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = Number(ctx.match[1]);
  ctx.session.adminFlow = {
    type: 'promo_exclude_add',
    step: 'pick_user',
    data: { promo_id: id },
  };
  await ctx.editMessageText(
    [
      `🚫 *Promo #${id} — Exclude a user*`,
      '',
      'Send the *numeric Telegram ID* (e.g. `123456789`) or `@username`',
      'of the user to opt out of this promo. They will still be able',
      'to buy the product — only this promo will be skipped for them.',
      '',
      '`/cancel` to abort.',
    ].join('\n'),
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text('⬅️ Cancel', `adm:promo:ex:${id}`),
    },
  );
});

adminBot.callbackQuery(/^adm:promo:exdel:(\d+):(\d+)$/, async (ctx) => {
  const promo_id = Number(ctx.match[1]);
  const telegram_id = Number(ctx.match[2]);
  try {
    await removePromoExclusion(promo_id, telegram_id);
    await ctx.answerCallbackQuery({ text: 'Un-excluded.' });
  } catch {
    await ctx.answerCallbackQuery({
      text: 'Could not un-exclude — try again.',
      show_alert: true,
    });
  }
  await showPromoExclusions(ctx, promo_id);
});

// -------- Full overview (paginated, grouped by scope tier) -------
//
// Mirrors `adm:price:report` — groups every promo into the four
// scope tiers (default / per-product / per-user / per-user-product),
// shows totals + impact stats per row, and offers a CSV export.
//
// Tier ordering matches the runtime resolver: most-specific first.

const PROMO_REPORT_TIERS = [
  { key: 'user_product', label: '👤📦 Per user + product', tier: 3 },
  { key: 'user', label: '👤 Per user (any product)', tier: 2 },
  { key: 'product', label: '📦 Per product (any user)', tier: 1 },
  { key: 'default', label: '🌐 Default (everyone, every product)', tier: 0 },
] as const;

const PROMO_REPORT_PER_PAGE = 4; // 4 tier blocks per page max — keeps under Telegram's 4096-char limit comfortably.

function tierOf(p: { product_id: number | null; telegram_id: number | null }): number {
  if (p.telegram_id !== null && p.product_id !== null) return 3;
  if (p.telegram_id !== null) return 2;
  if (p.product_id !== null) return 1;
  return 0;
}

adminBot.callbackQuery(/^adm:promo:report:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const page = Math.max(0, Number(ctx.match[1]));
  const all = await listAllPromos();
  if (all.length === 0) {
    await ctx.editMessageText(
      '📊 *Promos — Overview*\n\n_No promos yet._\n\nTap *➕ Add promo* on the previous screen.',
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard().text('⬅️ Back', 'adm:promo'),
      },
    );
    return;
  }

  // Resolve impact stats in parallel (one query per promo). Cheap
  // since the partial index on orders.promo_id keeps each query
  // tight even when there are many promos.
  const impactArr = await Promise.all(all.map((p) => getPromoImpact(p.id)));
  const impactMap = new Map<number, (typeof impactArr)[number]>();
  all.forEach((p, i) => impactMap.set(p.id, impactArr[i]!));

  // Group by tier — already sorted by created_at desc inside listAllPromos.
  const buckets = new Map<number, typeof all>();
  for (const p of all) {
    const t = tierOf(p);
    const arr = buckets.get(t) ?? [];
    arr.push(p);
    buckets.set(t, arr);
  }
  const populated = PROMO_REPORT_TIERS.filter((t) => (buckets.get(t.tier) ?? []).length > 0);
  const totalPages = Math.max(1, Math.ceil(populated.length / PROMO_REPORT_PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PROMO_REPORT_PER_PAGE;
  const end = Math.min(start + PROMO_REPORT_PER_PAGE, populated.length);

  // Headline totals.
  const totalActive = all.filter((p) => p.active).length;
  const totalImpact = impactArr.reduce(
    (acc, x) => ({
      orders: acc.orders + x.orders,
      total_discount: acc.total_discount + x.total_discount,
    }),
    { orders: 0, total_discount: 0 },
  );

  const header = [
    '📊 *Promos — Overview*',
    `Promos: *${all.length}* (active *${totalActive}*) · ` +
      `Lifetime discounted *$${totalImpact.total_discount.toFixed(2)}* across *${totalImpact.orders}* orders` +
      ` · Page ${safePage + 1}/${totalPages}`,
    '',
  ];

  const sections: string[] = [];
  for (let i = start; i < end; i++) {
    const tierMeta = populated[i]!;
    const rows = buckets.get(tierMeta.tier) ?? [];
    const tierImpact = rows.reduce(
      (acc, r) => {
        const im = impactMap.get(r.id)!;
        return {
          orders: acc.orders + im.orders,
          total_discount: acc.total_discount + im.total_discount,
        };
      },
      { orders: 0, total_discount: 0 },
    );
    const lines: string[] = [
      `${tierMeta.label}`,
      `   _${rows.length} rule${rows.length === 1 ? '' : 's'} · ` +
        `${tierImpact.orders} orders · ` +
        `$${tierImpact.total_discount.toFixed(2)} given_`,
    ];
    for (const r of rows) {
      const status = r.active ? '🟢' : '⏸';
      const name = r.name?.trim() ? ` — _${r.name.trim()}_` : '';
      const userPart =
        r.telegram_id !== null
          ? ` user \`${r.telegram_id}\`${
              r.username ? ` (@${r.username})` : r.first_name ? ` (${escapeHtml(r.first_name)})` : ''
            }`
          : '';
      const productPart =
        r.product_id !== null
          ? ` · *${escapeHtml(r.product_name ?? `#${r.product_id}`)}*`
          : '';
      const im = impactMap.get(r.id)!;
      lines.push(
        `   • ${status} \`#${r.id}\` ${
          r.tiers && r.tiers.length > 0
            ? promoTierLabel(r.tiers)
            : `qty ≥ *${r.min_qty}* → −*$${Number(r.discount_amount).toFixed(2)}*`
        }${name}` +
          `${userPart}${productPart}`,
        `       impact: ${im.orders} orders · $${im.total_discount.toFixed(2)}`,
      );
    }
    sections.push(lines.join('\n'));
  }

  const kb = new InlineKeyboard();
  if (safePage > 0) kb.text('◀ Prev', `adm:promo:report:${safePage - 1}`);
  if (safePage + 1 < totalPages) kb.text('Next ▶', `adm:promo:report:${safePage + 1}`);
  kb.row().text('📥 Export CSV', 'adm:promo:csv').row().text('⬅️ Back', 'adm:promo');

  await ctx.editMessageText([...header, ...sections].join('\n\n'), {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
});

adminBot.callbackQuery('adm:promo:csv', async (ctx) => {
  await ctx.answerCallbackQuery({ text: 'Building CSV…' });
  const all = await listAllPromos();
  if (all.length === 0) {
    await ctx.reply('📥 No promos to export — add at least one before downloading.');
    return;
  }
  const impactArr = await Promise.all(all.map((p) => getPromoImpact(p.id)));
  const header = [
    'promo_id',
    'scope',
    'tier',
    'telegram_id',
    'username',
    'first_name',
    'product_id',
    'product_name',
    'product_default_price',
    'product_stock',
    'min_qty',
    'discount_amount_usd',
    'name',
    'active',
    'orders_used',
    'total_discount_given_usd',
    'last_used_at',
    'created_at',
    'updated_at',
    'created_by_telegram_id',
    'created_by_username',
  ];
  const tierName: Record<number, string> = {
    3: 'user_product',
    2: 'user',
    1: 'product',
    0: 'default',
  };
  const lines = [header.join(',')];
  for (let i = 0; i < all.length; i++) {
    const r = all[i]!;
    const im = impactArr[i]!;
    const t = tierOf(r);
    lines.push(
      [
        r.id,
        tierName[t],
        t,
        r.telegram_id ?? '',
        r.username ?? '',
        r.first_name ?? '',
        r.product_id ?? '',
        r.product_name ?? '',
        r.product_default_price !== null ? r.product_default_price.toFixed(2) : '',
        r.product_stock ?? '',
        r.min_qty,
        Number(r.discount_amount).toFixed(2),
        r.name ?? '',
        r.active ? 'true' : 'false',
        im.orders,
        im.total_discount.toFixed(2),
        im.last_used ?? '',
        r.created_at,
        r.updated_at,
        r.created_by ?? '',
        r.created_by_username ?? '',
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const filename = `promos_${stamp}.csv`;
  await ctx.replyWithDocument(
    new InputFile(Buffer.from(lines.join('\n') + '\n', 'utf8'), filename),
    {
      caption:
        `📥 *Promos — Export*\n` +
        `Rows: *${all.length}* · ` +
        `Generated: ${new Date().toUTCString()}`,
      parse_mode: 'Markdown',
    },
  );
});

// -------- New promo wizard --------

adminBot.callbackQuery('adm:promo:new', async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = undefined;
  const kb = new InlineKeyboard()
    .text('🌐 Default (everyone, every product)', 'adm:promo:scope:default')
    .row()
    .text('📦 Per product (any user)', 'adm:promo:scope:product')
    .row()
    .text('👤 Per user (any product)', 'adm:promo:scope:user')
    .row()
    .text('👤📦 Per user + product', 'adm:promo:scope:user_product')
    .row()
    .text('⬅️ Cancel', 'adm:promo');
  await ctx.editMessageText(
    [
      '➕ *New promo — Step 1/4: Scope*',
      '',
      'Pick how widely this discount should apply.',
      'Most-specific scope wins at order time, so a per-user-per-product',
      'promo overrides a per-user one, etc.',
    ].join('\n'),
    { parse_mode: 'Markdown', reply_markup: kb },
  );
});

async function showPromoNewProductPicker(
  ctx: AppCtx,
  page: number,
): Promise<void> {
  const flow = ctx.session.adminFlow;
  if (flow?.type !== 'promo_add' || flow.step !== 'pick_product') {
    await ctx.editMessageText(
      '❓ Lost the promo flow — start over.',
      { reply_markup: new InlineKeyboard().text('⬅️ Back', 'adm:promo') },
    );
    return;
  }
  const { rows, total } = await listAllProducts(page, PROMO_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PROMO_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const lines = [
    '➕ *New promo — pick a product*',
    `Page ${safePage + 1}/${totalPages}  (total ${total})`,
    '',
    'Tap a product to attach the promo to it.',
  ];
  const kb = new InlineKeyboard();
  for (const p of rows) {
    kb.text(
      `${p.name.slice(0, 40)} — $${Number(p.price).toFixed(2)}`,
      `adm:promo:npp:${p.id}`,
    ).row();
  }
  if (safePage > 0) kb.text('◀ Prev', `adm:promo:np:${safePage - 1}`);
  if (safePage + 1 < totalPages) kb.text('Next ▶', `adm:promo:np:${safePage + 1}`);
  kb.row().text('⬅️ Cancel', 'adm:promo');
  await ctx.editMessageText(lines.join('\n'), {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
}

async function promptPromoMinQty(ctx: AppCtx): Promise<void> {
  await ctx.editMessageText(
    [
      '➕ *New promo — Step 3/4: Minimum qty*',
      '',
      'Send the minimum quantity that triggers this promo.',
      'Whole number ≥ 1, e.g. `10`.',
      '',
      'Send `/cancel` to abort.',
    ].join('\n'),
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text('⬅️ Cancel', 'adm:promo'),
    },
  );
}

adminBot.callbackQuery(/^adm:promo:scope:(default|product|user|user_product)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const scope = ctx.match[1] as 'default' | 'product' | 'user' | 'user_product';
  if (scope === 'default') {
    await promptPromoType(ctx, { scope, product_id: null, telegram_id: null });
    return;
  }
  if (scope === 'product') {
    ctx.session.adminFlow = {
      type: 'promo_add',
      step: 'pick_product',
      data: { scope, telegram_id: null },
    };
    await showPromoNewProductPicker(ctx, 0);
    return;
  }
  // user / user_product → first ask for telegram id or @username.
  ctx.session.adminFlow = {
    type: 'promo_add',
    step: 'pick_user',
    data: { scope },
  };
  await ctx.editMessageText(
    [
      '➕ *New promo — Step 2: Pick user*',
      '',
      'Send the user\'s numeric Telegram ID or `@username`.',
      '',
      '`@username` only works for users who have already started the bot at least once.',
      'Numeric IDs work for anyone.',
      '',
      'Send `/cancel` to abort.',
    ].join('\n'),
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text('⬅️ Cancel', 'adm:promo'),
    },
  );
});

adminBot.callbackQuery(/^adm:promo:np:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showPromoNewProductPicker(ctx, Number(ctx.match[1]));
});

adminBot.callbackQuery(/^adm:promo:npp:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const product_id = Number(ctx.match[1]);
  const flow = ctx.session.adminFlow;
  if (flow?.type !== 'promo_add' || flow.step !== 'pick_product') {
    await ctx.editMessageText('❓ Lost the promo flow — start over.', {
      reply_markup: new InlineKeyboard().text('⬅️ Back', 'adm:promo'),
    });
    return;
  }
  const prod = await getProduct(product_id);
  if (!prod) {
    await ctx.answerCallbackQuery({ text: 'Product not found.', show_alert: true });
    return;
  }
  await promptPromoType(ctx, {
    scope: flow.data.scope,
    product_id,
    telegram_id: flow.data.telegram_id,
  });
});

adminBot.callbackQuery(/^adm:promo:type:(flat|tiered)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const flow = ctx.session.adminFlow;
  if (flow?.type !== 'promo_add' || flow.step !== 'type') {
    await ctx.editMessageText('❓ Lost the promo flow — start over.', {
      reply_markup: new InlineKeyboard().text('⬅️ Back', 'adm:promo'),
    });
    return;
  }
  if (ctx.match[1] === 'tiered') {
    await promptPromoTiers(ctx, flow.data);
    return;
  }
  ctx.session.adminFlow = { type: 'promo_add', step: 'min_qty', data: flow.data };
  await promptPromoMinQty(ctx);
});

adminBot.callbackQuery('adm:promo:tierSave', async (ctx) => {
  await ctx.answerCallbackQuery();
  const flow = ctx.session.adminFlow;
  if (flow?.type !== 'promo_add' || flow.step !== 'tier_confirm') {
    await ctx.editMessageText('❓ Lost the promo flow — start over.', {
      reply_markup: new InlineKeyboard().text('⬅️ Back', 'adm:promo'),
    });
    return;
  }
  try {
    const created = await addTieredPromo({
      product_id: flow.data.product_id,
      telegram_id: flow.data.telegram_id,
      name: null,
      created_by: ctx.from!.id,
      tiers: flow.data.tiers,
    });
    ctx.session.adminFlow = undefined;
    await showPromoCard(ctx, created.id);
  } catch (err) {
    logger.error({ err, flow }, 'tiered promo save failed');
    await ctx.editMessageText(
      '⚠️ Could not save tiered promo. Apply migration `0043_promo_tiers.sql` and try again.',
      { parse_mode: 'Markdown', reply_markup: new InlineKeyboard().text('⬅️ Back', 'adm:promo') },
    );
  }
});

adminBot.callbackQuery(/^adm:promo:editq:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = Number(ctx.match[1]);
  ctx.session.adminFlow = { type: 'promo_edit_qty', step: 'value', data: { promo_id: id } };
  await ctx.editMessageText(
    `✏️ *Promo #${id} — Min qty*\n\nSend the new minimum quantity (whole number ≥ 1).\n\n\`/cancel\` to abort.`,
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text('⬅️ Cancel', `adm:promo:v:${id}`),
    },
  );
});

adminBot.callbackQuery(/^adm:promo:editd:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = Number(ctx.match[1]);
  ctx.session.adminFlow = { type: 'promo_edit_discount', step: 'value', data: { promo_id: id } };
  await ctx.editMessageText(
    `💵 *Promo #${id} — Discount*\n\nSend the new flat discount in USDT (e.g. \`5\` or \`12.5\`).\n\n\`/cancel\` to abort.`,
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text('⬅️ Cancel', `adm:promo:v:${id}`),
    },
  );
});

adminBot.callbackQuery(/^adm:promo:editt:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = Number(ctx.match[1]);
  ctx.session.adminFlow = { type: 'promo_edit_tiers', step: 'value', data: { promo_id: id } };
  await ctx.editMessageText(
    [
      `✏️ *Promo #${id} — Edit tiers*`,
      '',
      'Send the replacement ladder, one tier per line:',
      '`min-max price` or `min+ price`',
      '',
      'Overlapping ranges are rejected. `/cancel` to abort.',
    ].join('\n'),
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text('⬅️ Cancel', `adm:promo:v:${id}`),
    },
  );
});

adminBot.callbackQuery(/^adm:promo:editn:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = Number(ctx.match[1]);
  ctx.session.adminFlow = { type: 'promo_edit_name', step: 'value', data: { promo_id: id } };
  await ctx.editMessageText(
    `🏷 *Promo #${id} — Name*\n\nSend a short label shown to buyers, or \`-\` to clear it.\n\n\`/cancel\` to abort.`,
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text('⬅️ Cancel', `adm:promo:v:${id}`),
    },
  );
});

adminBot.callbackQuery('adm:promo:nameSkip', async (ctx) => {
  await ctx.answerCallbackQuery();
  const flow = ctx.session.adminFlow;
  if (flow?.type !== 'promo_add' || flow.step !== 'name') {
    await ctx.editMessageText('❓ Lost the promo flow — start over.', {
      reply_markup: new InlineKeyboard().text('⬅️ Back', 'adm:promo'),
    });
    return;
  }
  // Mirror the message:text-handler error shape so admins see the
  // real Postgres error (e.g. missing table) instead of a stuck UI.
  let created;
  try {
    created = await addPromo({
      product_id: flow.data.product_id,
      telegram_id: flow.data.telegram_id,
      name: null,
      min_qty: flow.data.min_qty,
      discount_amount: flow.data.discount_amount,
      created_by: ctx.from!.id,
    });
  } catch (err) {
    logger.error({ err, flow }, 'promo nameSkip addPromo failed');
    ctx.session.adminFlow = undefined;
    const e = err as { code?: string; message?: string };
    const detail =
      e?.code === '42P01'
        ? 'The `promos` table is missing — apply migrations 0013 / 0014.'
        : (e?.message ?? String(err)).slice(0, 500);
    await ctx.editMessageText(
      `⚠️ *Could not save promo*\n\n\`${escapeHtml(detail)}\``,
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard().text('⬅️ Back', 'adm:promo'),
      },
    );
    return;
  }
  ctx.session.adminFlow = undefined;
  try {
    await showPromoCard(ctx, created.id);
  } catch (err) {
    logger.error({ err, promo_id: created.id }, 'showPromoCard after nameSkip failed');
    await ctx.reply(
      `✅ Promo *#${created.id}* saved.\n\n_(Detail card render failed — open it from /promo list.)_`,
      { parse_mode: 'Markdown', reply_markup: rootMenu() },
    );
  }
});

// ============================================================
// Multi-step input handler — fired for any text msg from admin
// when session.adminFlow is set.
// ============================================================
function captureTelegramRichText(
  rawText: string,
  entities: ReadonlyArray<MessageEntity> | undefined | null,
  markerText: string,
): string {
  const entityList = entities ?? [];
  const hasTelegramFormatting = entityList.some(
    (entity) => FORMAT_ENTITY_TYPES.has(entity.type) || entity.type === 'custom_emoji',
  );
  if (!hasTelegramFormatting) return markerText;
  try {
    return entitiesToHtml(rawText, entityList).trim();
  } catch (err) {
    logger.warn({ err }, 'admin rich-text capture failed; falling back to custom emoji markers');
    return markerText;
  }
}

adminBot.on('message:text', async (ctx, next) => {
  const flow = ctx.session.adminFlow;
  if (!flow) return next();
  // Defence in depth: if for any reason a non-admin has a flow set
  // (shouldn't happen), discard it silently.
  if (!ctx.from || !(await isAdmin(ctx.from.id))) {
    ctx.session.adminFlow = undefined;
    return next();
  }

  // Bot-owner spec: admins can drop *arbitrary* premium custom emojis
  // into any admin-authored body (announcements, product / bot /
  // payment-method tutorial text, view-note text, support replies,
  // etc.) and have them survive both DB storage and the user-facing
  // render pipeline. We do that by rewriting each `custom_emoji`
  // entity in the original message into a `{{ce:<id>|<unicode>}}`
  // marker on the text we hand off to flow handlers — `renderMdHtml`
  // expands those markers into `<tg-emoji>` tags at render time.
  //
  // Markers are inserted using offsets relative to the *untrimmed*
  // text so the indices stay valid; we trim AFTER injection.
  //
  // Numeric / URL / address flows are unaffected because real
  // numeric / URL inputs from the admin keyboard never carry
  // `custom_emoji` entities, so the helper is a no-op for them.
  const text = injectCustomEmojiMarkers(
    ctx.message.text,
    ctx.message.entities,
  ).trim();
  const productRichText = captureTelegramRichText(ctx.message.text, ctx.message.entities, text);

  if (text === '/cancel') {
    ctx.session.adminFlow = undefined;
    await ctx.reply('❌ Cancelled.', { reply_markup: rootMenu() });
    return;
  }

  if (text.startsWith('/')) {
    // Allow global navigation commands to explicitly break out of any
    // in-flight admin text flow before passing control onward.
    const cmd = text.split(/\s+/, 1)[0]?.toLowerCase() ?? '';
    if (/^\/(?:start|menu|admin)(?:@\S+)?$/.test(cmd)) {
      ctx.session.adminFlow = undefined;
    }
    // Don't capture other commands; let them through.
    return next();
  }

  try {
    if (flow.type === 'preorder_manual_send') {
      const order = await getOrder(flow.data.order_id);
      if (!order || !isPendingPreorderOrder(order) || order.product_id === null) {
        ctx.session.adminFlow = undefined;
        await ctx.reply('⚠️ This preorder is not pending anymore.', {
          reply_markup: rootMenu(),
        });
        return;
      }

      const items = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (items.length === 0) {
        await ctx.reply('⚠️ Send at least one product detail/link/code line, or /cancel.');
        return;
      }

      const product = await getProduct(order.product_id);
      const buyer = await findUserById(order.user_id);
      const lang = buyer?.language ?? env.DEFAULT_LANG;
      const tr = (key: string, vars?: Record<string, string | number>) =>
        translate(lang, key, vars);
      const publicId = publicOrderId(order);
      const deliveredText = items.join('\n');
      await setOrderDeliveredItems(order.id, deliveredText);
      await markOrderLifecycleSafe(order.id, 'delivered', {
        actor: 'admin',
        actor_id: ctx.from?.id ?? null,
        note: 'Preorder sent manually',
      });

      const chunks = buildOrderDeliveredChunks(items);
      const firstChunkBlock = chunks[0]?.inlineBlock ?? `> ${deliveredText}`;
      const deliveredKb = new InlineKeyboard();
      inlineBtn(deliveredKb, lang, 'using_method', `tut:${order.product_id}`);
      deliveredKb.row();
      inlineBtn(deliveredKb, lang, 'send_note_txt', `order:txt:${order.id}`);

      const headerHasKeyboard = chunks.length <= 1;
      await ctx.api.sendMessage(
        order.user_id,
        renderMdHtml(
          tr('shop.buy.order_auto_delivered', {
            order_id: publicId,
            name: order.product_name,
            qty: order.qty,
            total: Number(order.total).toFixed(2),
            items: firstChunkBlock,
          }),
        ),
        headerHasKeyboard
          ? { parse_mode: 'HTML', reply_markup: deliveredKb }
          : { parse_mode: 'HTML' },
      );

      for (let i = 1; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk) continue;
        await ctx.api.sendMessage(
          order.user_id,
          renderMdHtml(chunk.inlineBlock),
          chunk.isLast
            ? { parse_mode: 'HTML', reply_markup: deliveredKb }
            : { parse_mode: 'HTML' },
        );
      }

      if (product) {
        await maybeStartDeliveryFormFromApi({
          api: ctx.api,
          product,
          orderId: order.id,
          orderPublicId: publicId,
          buyerTelegramId: order.user_id,
          buyerLang: lang,
          qty: order.qty,
        }).catch((err) => {
          logger.warn(
            { err, orderId: order.id, productId: order.product_id },
            'admin preorder manual send delivery form failed',
          );
        });
      }

      void adminLog
        .logOrderCreated(ctx.api, {
          user: {
            telegram_id: order.user_id,
            username: buyer?.username ?? null,
            first_name: buyer?.first_name ?? null,
            email: buyer?.email ?? null,
          },
          orderDbId: order.id,
          orderPublicId: publicId,
          productId: order.product_id,
          productName: order.product_name,
          qty: order.qty,
          unitPrice: Number(order.unit_price),
          total: Number(order.total),
          paidVia: 'Manual preorder auto-send',
          balanceAfter: Number((buyer?.balance ?? 0).toFixed(3)),
          lifecycle: 'auto_delivered',
        })
        .catch((err) => logger.warn({ err }, 'admin preorder manual send log failed'));

      ctx.session.adminFlow = undefined;
      await ctx.reply(
        `✅ Auto-sent preorder <code>${escapeHtml(publicId)}</code> to buyer.\n\nItems sent: <b>${items.length}</b>`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('🔎 View Order', `adm:ord:v:${order.id}`)
            .row()
            .text('⬅️ Back to orders', 'adm:ord:0'),
        },
      );
      return;
    }

    if (flow.type === 'supplier_reseller_add') {
      const rawKey = ctx.message.text.trim();
      const key =
        rawKey.match(/\b(rsk_live_[a-zA-Z0-9_-]{24,})\b/)?.[1] ??
        rawKey.match(/\b(stapi_[a-zA-Z0-9_-]{24,})\b/)?.[1] ??
        rawKey.match(/bearer\s+([a-zA-Z0-9_-]{24,})/i)?.[1] ??
        rawKey;
      if (key.length < 24) {
        await ctx.reply('❌ Send the full reseller API key, or `/cancel`.', {
          parse_mode: 'Markdown',
        });
        return;
      }
      const source = await createSupplierApiSource(supabaseResellerSupplierConfig(key));
      ctx.session.adminFlow = undefined;
      let testLine = 'Saved. Tap Test Connection if you want to retry the live check.';
      try {
        const test = await testSupplierConnection(source);
        testLine = test.ok
          ? `Live test OK: ${test.balance === null ? 'balance unknown' : `balance ${apiMoney(test.balance)}`} · ${test.productsSeen} products`
          : `Saved, but live test needs attention: ${test.error ?? 'unknown error'}`;
      } catch (err) {
        testLine = `Saved, but live test failed: ${err instanceof Error ? err.message : String(err)}`;
      }
      await ctx.reply(
        `✅ Reseller API supplier saved: *${escapeMd(source.name)}* (#${source.id})\n\n${escapeMd(testLine)}\n\nTap *Browse Products* to import by button.`,
        { parse_mode: 'Markdown' },
      );
      await showSupplierDetail(ctx, source.id);
      return;
    }

    if (flow.type === 'supplier_canboso_add') {
      const key = ctx.message.text.trim();
      if (key.length < 12) {
        await ctx.reply('❌ Send the full Canboso API key, or `/cancel`.', {
          parse_mode: 'Markdown',
        });
        return;
      }
      const source = await createSupplierApiSource(canbosoSupplierConfig(key));
      ctx.session.adminFlow = undefined;
      let testLine = 'Saved. Tap Test Connection if you want to retry the live check.';
      try {
        const test = await testSupplierConnection(source);
        testLine = test.ok
          ? `Live test OK: ${test.balance === null ? 'balance unknown' : `balance ${apiMoney(test.balance)}`} · ${test.productsSeen} products`
          : `Saved, but live test needs attention: ${test.error ?? 'unknown error'}`;
      } catch (err) {
        testLine = `Saved, but live test failed: ${err instanceof Error ? err.message : String(err)}`;
      }
      await ctx.reply(
        `✅ Canboso supplier saved: *${escapeMd(source.name)}* (#${source.id})\n\n${escapeMd(testLine)}\n\nTap *Browse Products* to import by button.`,
        { parse_mode: 'Markdown' },
      );
      await showSupplierDetail(ctx, source.id);
      return;
    }

    if (flow.type === 'supplier_vex_add') {
      const rawKey = ctx.message.text.trim();
      const key =
        rawKey.match(/\b(vex_sk_[a-zA-Z0-9_-]{24,})\b/)?.[1] ??
        rawKey.match(/\b(rsk_live_[a-zA-Z0-9_-]{24,})\b/)?.[1] ??
        rawKey.match(/\b(stapi_[a-zA-Z0-9_-]{24,})\b/)?.[1] ??
        rawKey.match(/bearer\s+([a-zA-Z0-9_-]{24,})/i)?.[1] ??
        rawKey;
      if (key.length < 24) {
        await ctx.reply('❌ Send the full VEX reseller API key, or `/cancel`.', {
          parse_mode: 'Markdown',
        });
        return;
      }
      const source = await createSupplierApiSource(vexResellerSupplierConfig(key));
      ctx.session.adminFlow = undefined;
      let testLine = 'Saved. Tap Test Connection if you want to retry the live check.';
      try {
        const test = await testSupplierConnection(source);
        testLine = test.ok
          ? `Live test OK: ${test.balance === null ? 'balance unknown' : `balance ${apiMoney(test.balance)}`} · ${test.productsSeen} products`
          : `Saved, but live test needs attention: ${test.error ?? 'unknown error'}`;
      } catch (err) {
        testLine = `Saved, but live test failed: ${err instanceof Error ? err.message : String(err)}`;
      }
      await ctx.reply(
        `✅ VEX Reseller API supplier saved: *${escapeMd(source.name)}* (#${source.id})\n\n${escapeMd(testLine)}\n\nTap *Browse Products* to import by button.`,
        { parse_mode: 'Markdown' },
      );
      await showSupplierDetail(ctx, source.id);
      return;
    }

    if (flow.type === 'supplier_api_add') {
      const cfg = parseSupplierSourceConfig(ctx.message.text.trim());
      const source = await createSupplierApiSource(cfg);
      ctx.session.adminFlow = undefined;
      let testLine = 'Tap Test Connection to verify balance/products.';
      try {
        const test = await testSupplierConnection(source);
        testLine = test.ok
          ? `Test OK: ${test.balance === null ? 'balance —' : `balance ${apiMoney(test.balance)}`} · ${test.productsSeen} products`
          : `Saved, but test needs attention: ${test.error ?? 'unknown error'}`;
      } catch (err) {
        testLine = `Saved, but test failed: ${err instanceof Error ? err.message : String(err)}`;
      }
      await ctx.reply(
        `✅ Supplier API saved: *${escapeMd(source.name)}* (#${source.id})\n\n${escapeMd(testLine)}`,
        { parse_mode: 'Markdown' },
      );
      await showSupplierDetail(ctx, source.id);
      return;
    }

    if (flow.type === 'supplier_product_link_add') {
      const cfg = parseSupplierLinkConfig(ctx.message.text.trim(), flow.data.supplier_id);
      const source = await getSupplierApiSource(cfg.supplier_id);
      if (!source) {
        await ctx.reply('❌ Supplier not found. Check `supplier_id` and try again.', {
          parse_mode: 'Markdown',
        });
        return;
      }
      const product = await getProduct(cfg.local_product_id);
      if (!product) {
        await ctx.reply('❌ Local product not found. Check `local_product_id` and try again.', {
          parse_mode: 'Markdown',
        });
        return;
      }
      const link = await upsertSupplierProductLink(cfg);
      ctx.session.adminFlow = undefined;
      await ctx.reply(
        [
          '✅ Supplier product mapped.',
          '',
          `Local: *${escapeMd(product.name)}* (#${product.id})`,
          `Supplier: *${escapeMd(source.name)}* (#${source.id})`,
          `Supplier product id: \`${escapeMd(link.supplier_product_id)}\``,
          '',
          'Run *Sync Links* to pull supplier stock/price into this product.',
        ].join('\n'),
        { parse_mode: 'Markdown' },
      );
      await showSupplierDetail(ctx, source.id);
      return;
    }

    if (flow.type === 'add_category') {
      if (flow.step === 'name') {
        ctx.session.adminFlow = {
          type: 'add_category',
          step: 'emoji',
          data: { name: text },
        };
        const kb = new InlineKeyboard().text('Skip emoji', 'adm:cat:skip_emoji');
        backRow(kb);
        await ctx.reply(
          `🗂 Category name: *${text}*\n\nNow send a single emoji for the category, or tap *Skip emoji*.`,
          { parse_mode: 'Markdown', reply_markup: kb },
        );
      } else if (flow.step === 'emoji') {
        const ent = ctx.message.entities?.find(
          (e) => e.type === 'custom_emoji' && 'custom_emoji_id' in e,
        ) as { offset: number; length: number; custom_emoji_id: string } | undefined;
        const emoji = ent
          ? `{{ce:${ent.custom_emoji_id.replace(/[|}\n]/g, '')}|${
              text
                .substring(ent.offset, ent.offset + ent.length)
                .replace(/[|}\n]/g, '')
                .trim() || text.slice(0, 4)
            }}}`
          : text;
        const cat = await addCategory(flow.data.name, emoji);
        ctx.session.adminFlow = undefined;
        cache.del('cats');
        await ctx.reply(
          `✅ Category *${cat.name}* added (id=${cat.id}).`,
          { parse_mode: 'Markdown', reply_markup: rootMenu() },
        );
      }
      return;
    }

    if (flow.type === 'add_product') {
      if (flow.step === 'name') {
        ctx.session.adminFlow = {
          type: 'add_product',
          step: 'price',
          data: { ...flow.data, name: text },
        };
        await ctx.reply(`Product name: *${text}*\n\nSend the *price* (number, e.g. \`9.99\`).`, {
          parse_mode: 'Markdown',
        });
      } else if (flow.step === 'price') {
        const price = Number(text);
        if (!Number.isFinite(price) || price < 0) {
          await ctx.reply('❌ Bad price. Send a number like `9.99`.');
          return;
        }
        ctx.session.adminFlow = {
          type: 'add_product',
          step: 'unlimited',
          data: { ...flow.data, price },
        };
        // Two-button question: skips the integer count when admin
        // picks "Unlimited". This is the new flow the bot owner
        // explicitly asked for ("no products asking for stock brooo").
        const kb = new InlineKeyboard()
          .text('♾ Unlimited', 'adm:prod:unl:yes')
          .text('🔢 Set Count', 'adm:prod:unl:no');
        await ctx.reply(
          [
            '*Unlimited stock?*',
            '',
            'Tap *Unlimited* if you can deliver this product as many ',
            'times as needed (no per-buy decrement). Tap *Set Count* ',
            'to set an integer stock that decrements on each sale.',
          ].join('\n'),
          { parse_mode: 'Markdown', reply_markup: kb },
        );
      } else if (flow.step === 'unlimited') {
        // Free-form text in this step is unexpected — the user is
        // supposed to tap one of the inline buttons. Re-prompt.
        await ctx.reply('Tap *Unlimited* or *Set Count* on the buttons above.', {
          parse_mode: 'Markdown',
        });
        return;
      } else if (flow.step === 'stock') {
        const stock = Number(text);
        if (!Number.isInteger(stock) || stock < 0) {
          await ctx.reply('❌ Bad stock. Send an integer ≥ 0.');
          return;
        }
        ctx.session.adminFlow = {
          type: 'add_product',
          step: 'warranty',
          data: { ...flow.data, stock },
        };
        const kb = new InlineKeyboard().text('Skip', 'adm:prod:skip:warranty');
        await ctx.reply('Send the *warranty* text (or tap Skip).', {
          parse_mode: 'Markdown',
          reply_markup: kb,
        });
      } else if (flow.step === 'warranty') {
        ctx.session.adminFlow = {
          type: 'add_product',
          step: 'description',
          data: { ...flow.data, warranty: text },
        };
        const kb = new InlineKeyboard().text('Skip', 'adm:prod:skip:description');
        await ctx.reply('Send the *description* (or Skip).', {
          parse_mode: 'Markdown',
          reply_markup: kb,
        });
      } else if (flow.step === 'description') {
        ctx.session.adminFlow = {
          type: 'add_product',
          step: 'note',
          data: { ...flow.data, description: productRichText },
        };
        const kb = new InlineKeyboard().text('Skip', 'adm:prod:skip:note');
        await ctx.reply(
          'Send the *View Note* text shown when buyer taps 📝 View Note (or Skip).',
          { parse_mode: 'Markdown', reply_markup: kb },
        );
      } else if (flow.step === 'note') {
        ctx.session.adminFlow = {
          type: 'add_product',
          step: 'items',
          data: { ...flow.data, note: productRichText },
        };
        const kb = new InlineKeyboard().text('Skip', 'adm:prod:skip:items');
        await ctx.reply(
          [
            '📦 *Send the deliverables (items pool)* — one payload per line.',
            'These are the actual things buyers receive (acc emails+passwords, links, codes, etc).',
            'Example:',
            '```',
            'email1@example.com|password123',
            'email2@example.com|password456',
            'https://account-link/...',
            '```',
            '',
            'Or tap *Skip* to leave the pool empty (you can always add items later from the Edit screen).',
          ].join('\n'),
          { parse_mode: 'Markdown', reply_markup: kb },
        );
      } else if (flow.step === 'items') {
        const payloads = text
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        await finalizeProduct(ctx, flow.data, payloads);
      }
      return;
    }

    // -------- Per-product editor: text-based steps --------
    if (flow.type === 'delivery_manual_message') {
      const result = await sendManualDeliveryMessage({
        api: ctx.api,
        submissionId: flow.data.submission_id,
        message: productRichText,
      });
      ctx.session.adminFlow = undefined;
      await ctx.reply(
        result.ok
          ? `✅ Custom message sent to buyer${result.productName ? ` for *${escapeMd(result.productName)}*` : ''}.`
          : '⚠️ Submission not found. It may have been removed.',
        { parse_mode: 'Markdown' },
      );
      return;
    }
    if (flow.type === 'edit_product_emoji') {
      // Premium emoji is sent as a `custom_emoji` entity attached to
      // a text message — the visible text is the unicode fallback,
      // the entity carries the `custom_emoji_id`. Read it directly
      // off the message.
      const ent = ctx.message.entities?.find(
        (e) => e.type === 'custom_emoji' && 'custom_emoji_id' in e,
      ) as { custom_emoji_id: string } | undefined;
      if (!ent) {
        await ctx.reply(
          '❌ I didn\'t see a premium emoji in that message. Try again with a single premium emoji.',
        );
        return;
      }
      await updateProduct(flow.data.product_id, { emoji_id: ent.custom_emoji_id });
      ctx.session.adminFlow = undefined;
      await ctx.reply('✅ Premium emoji saved.');
      await showProductEditor(ctx, flow.data.product_id, flow.data.page);
      return;
    }
    if (flow.type === 'edit_product_note_text') {
      await updateProduct(flow.data.product_id, { note: productRichText });
      ctx.session.adminFlow = undefined;
      await ctx.reply('✅ Note text saved.');
      await showProductEditor(ctx, flow.data.product_id, flow.data.page);
      return;
    }
    if (flow.type === 'edit_product_description') {
      await updateProduct(flow.data.product_id, { description: productRichText });
      ctx.session.adminFlow = undefined;
      await ctx.reply('✅ Description saved.');
      await showProductEditor(ctx, flow.data.product_id, flow.data.page);
      return;
    }
    if (flow.type === 'edit_product_warranty') {
      await updateProduct(flow.data.product_id, { warranty: text });
      ctx.session.adminFlow = undefined;
      await ctx.reply('✅ Warranty saved.');
      await showProductEditor(ctx, flow.data.product_id, flow.data.page);
      return;
    }
    if (flow.type === 'edit_product_tutorial_text') {
      await updateProduct(flow.data.product_id, { tutorial_text: text });
      ctx.session.adminFlow = undefined;
      await ctx.reply('✅ Tutorial text saved.');
      await showProductEditor(ctx, flow.data.product_id, flow.data.page);
      return;
    }
    if (flow.type === 'edit_product_tutorial_url') {
      if (!/^https?:\/\//.test(text)) {
        await ctx.reply('❌ URL must start with `http://` or `https://`.');
        return;
      }
      await updateProduct(flow.data.product_id, { tutorial_url: text });
      ctx.session.adminFlow = undefined;
      await ctx.reply('✅ Tutorial URL saved.');
      await showProductEditor(ctx, flow.data.product_id, flow.data.page);
      return;
    }
    if (flow.type === 'edit_product_items') {
      // Bulk-add staging flow — accumulate payloads across many
      // messages instead of committing on the first one. The admin
      // can paste a 100-line block, then forward several vendor
      // messages, then drop a `.txt` upload (handled in the document
      // listener below) and the buffer keeps growing. Confirm flushes
      // it to the pool atomically.
      const payloads = parsePayloadLines(text);
      if (payloads.length === 0) {
        await ctx.reply(
          '❌ No payloads found in that message. Send one payload per line, or tap *Cancel* on the staging card to exit.',
          { parse_mode: 'Markdown' },
        );
        return;
      }
      const staged = flow.data.staged ?? [];
      const room = ITEMS_STAGING_CAP - staged.length;
      const accepted = payloads.slice(0, Math.max(0, room));
      flow.data.staged = staged.concat(accepted);
      const note =
        accepted.length < payloads.length
          ? `Capped at ${ITEMS_STAGING_CAP} — ${payloads.length - accepted.length} line(s) were dropped. Tap Confirm to flush, then add more.`
          : undefined;
      await renderItemsStagingCard(ctx, flow, { lastDelta: accepted.length, note });
      return;
    }
    if (flow.type === 'edit_product_price') {
      const price = Number(text);
      if (!Number.isFinite(price) || price < 0) {
        await ctx.reply('❌ Bad price. Send a number like `9.99`.');
        return;
      }
      const before = await getProduct(flow.data.product_id);
      await updateProduct(flow.data.product_id, { price });
      if (before && Number(before.price) !== price) {
        void notifyApiPriceChange(ctx.api, before, Number(before.price), price).catch((err) => {
          logger.warn(
            { err, productId: before.id },
            'API price alert worker failed',
          );
        });
      }
      ctx.session.adminFlow = undefined;
      await ctx.reply('✅ Price updated.');
      await showProductEditor(ctx, flow.data.product_id, flow.data.page);
      return;
    }
    if (flow.type === 'edit_product_stock') {
      const stock = Number(text);
      if (!Number.isInteger(stock) || stock < 0) {
        await ctx.reply('❌ Bad stock. Send an integer ≥ 0.');
        return;
      }
      const before = await getProduct(flow.data.product_id);
      await updateProduct(flow.data.product_id, { stock });
      await autoFulfillPreordersAfterRestock(ctx, flow.data.product_id);
      await notifyPublicStockAdded(
        ctx,
        flow.data.product_id,
        Math.max(0, stock - Number(before?.stock ?? 0)),
      );
      ctx.session.adminFlow = undefined;
      await ctx.reply('✅ Stock updated.');
      await showProductEditor(ctx, flow.data.product_id, flow.data.page);
      return;
    }
    if (flow.type === 'edit_product_name') {
      await updateProduct(flow.data.product_id, { name: text });
      ctx.session.adminFlow = undefined;
      await ctx.reply('✅ Name updated.');
      await showProductEditor(ctx, flow.data.product_id, flow.data.page);
      return;
    }
    if (flow.type === 'edit_product_low_stock') {
      const trimmed = text.trim().toLowerCase();
      const useDefault = trimmed === 'default' || trimmed === 'clear' || trimmed === 'off';
      const threshold = useDefault ? null : Number(text);
      if (threshold !== null && (!Number.isInteger(threshold) || threshold < 0)) {
        await ctx.reply('❌ Bad number. Send an integer ≥ 0, or `default`.');
        return;
      }
      await setProductLowStockThreshold(flow.data.product_id, threshold);
      ctx.session.adminFlow = undefined;
      await ctx.reply(
        threshold === null
          ? '✅ Low-stock alert now follows the global default.'
          : `✅ Low-stock alert set at ${threshold}.`,
      );
      await showProductEditor(ctx, flow.data.product_id, flow.data.page);
      return;
    }
    if (flow.type === 'edit_product_referral_required') {
      const trimmed = text.trim().toLowerCase();
      const count = trimmed === 'clear' || trimmed === 'off' ? 0 : Number(text);
      if (!Number.isInteger(count) || count < 0) {
        await ctx.reply('❌ Bad number. Send an integer ≥ 0.');
        return;
      }
      await updateProduct(flow.data.product_id, { referral_required_count: count });
      ctx.session.adminFlow = undefined;
      await ctx.reply(
        count > 0 ? `✅ Referral Pay set: ${count} referrals required.` : '✅ Referral Pay disabled.',
      );
      await showProductEditor(ctx, flow.data.product_id, flow.data.page);
      return;
    }
    if (flow.type === 'edit_product_id') {
      const newId = Number(text);
      if (!Number.isInteger(newId) || newId <= 0) {
        await ctx.reply('❌ Bad ID. Send a positive integer.');
        return;
      }
      const existing = await getProduct(newId);
      if (existing) {
        await ctx.reply(`❌ Product with ID ${newId} already exists (*${escapeMd(existing.name)}*). Choose a different ID.`, { parse_mode: 'Markdown' });
        return;
      }
      await changeProductId(flow.data.product_id, newId);
      ctx.session.adminFlow = undefined;
      await ctx.reply(`✅ Product ID changed: ${flow.data.product_id} → ${newId}`);
      await showProductEditor(ctx, newId, flow.data.page);
      return;
    }
    // -------- Post-purchase delivery form sub-editor --------
    if (flow.type === 'edit_product_delivery_instruction') {
      const cleared = text.trim().toLowerCase() === 'clear';
      await updateProduct(flow.data.product_id, {
        delivery_instruction: cleared ? null : productRichText,
      });
      ctx.session.adminFlow = undefined;
      await ctx.reply(cleared ? '✅ Instruction reset to default.' : '✅ Instruction saved.');
      await showProductEditor(ctx, flow.data.product_id, flow.data.page);
      return;
    }
    if (flow.type === 'edit_product_delivery_success') {
      const cleared = text.trim().toLowerCase() === 'clear';
      await updateProduct(flow.data.product_id, {
        delivery_success_message: cleared ? null : productRichText,
      });
      ctx.session.adminFlow = undefined;
      await ctx.reply(cleared ? '✅ Success card reset to default.' : '✅ Success card saved.');
      await showProductEditor(ctx, flow.data.product_id, flow.data.page);
      return;
    }
    if (flow.type === 'edit_product_delivery_completion') {
      const cleared = text.trim().toLowerCase() === 'clear';
      await updateProduct(flow.data.product_id, {
        delivery_completion_message: cleared ? null : productRichText,
      });
      ctx.session.adminFlow = undefined;
      await ctx.reply(cleared ? '✅ Completed message reset.' : '✅ Completed message saved.');
      await showProductEditor(ctx, flow.data.product_id, flow.data.page);
      return;
    }
    if (flow.type === 'edit_product_delivery_fields') {
      if (text.trim().toLowerCase() === 'clear') {
        await updateProduct(flow.data.product_id, { delivery_fields: [] });
        ctx.session.adminFlow = undefined;
        await ctx.reply('✅ All fields cleared.');
        await showProductEditor(ctx, flow.data.product_id, flow.data.page);
        return;
      }
      // Parse `key | Label | required?` rows. Empty/blank lines are
      // skipped. We dedupe on `key` (last-write-wins) so a slip-of-the
      // -finger duplicate row doesn't ask the buyer twice. `required`
      // defaults to true; an explicit `optional` flips it.
      const rawLines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      const fields: {
        key: string;
        label: string;
        required?: boolean;
        type?: 'text' | 'email';
        per_unit?: boolean;
      }[] = [];
      const seenKeys = new Set<string>();
      const errors: string[] = [];
      for (const line of rawLines) {
        const parts = line.split('|').map((p) => p.trim());
        if (parts.length < 2 || !parts[0] || !parts[1]) {
          errors.push(`• \`${line}\` — expected \`key | Label | required\``);
          continue;
        }
        const key = parts[0].toLowerCase().replace(/[^a-z0-9_]+/g, '_');
        if (!key) {
          errors.push(`• \`${line}\` — key must contain alphanumerics.`);
          continue;
        }
        const required =
          parts[2] === undefined
            ? true
            : !/^(optional|opt|false|no)$/i.test(parts[2]);
        const options = (parts[3] ?? '').toLowerCase();
        const type = options.includes('email') || /email/i.test(key) ? 'email' : 'text';
        const per_unit = /per[_ -]?unit|email[_ -]?per[_ -]?unit/.test(options);
        if (seenKeys.has(key)) {
          // last-write-wins
          const idx = fields.findIndex((f) => f.key === key);
          if (idx >= 0) fields.splice(idx, 1);
        }
        seenKeys.add(key);
        fields.push({ key, label: parts[1], required, type, per_unit });
      }
      if (errors.length > 0) {
        await ctx.reply(
          ['❌ Could not parse:', ...errors, '', 'Try again or send `/cancel`.'].join('\n'),
          { parse_mode: 'Markdown' },
        );
        return;
      }
      if (fields.length === 0) {
        await ctx.reply('❌ No valid fields found. Send `clear` to wipe the spec or `/cancel` to abort.');
        return;
      }
      await updateProduct(flow.data.product_id, { delivery_fields: fields });
      ctx.session.adminFlow = undefined;
      await ctx.reply(
        `✅ Saved \`${fields.length}\` field${fields.length === 1 ? '' : 's'}.`,
        { parse_mode: 'Markdown' },
      );
      await showProductEditor(ctx, flow.data.product_id, flow.data.page);
      return;
    }
    if (flow.type === 'edit_product_delivery_vendor') {
      if (text.trim().toLowerCase() === 'clear') {
        await updateProduct(flow.data.product_id, { delivery_vendor_chat_id: null });
        ctx.session.adminFlow = undefined;
        await ctx.reply('✅ Vendor forward disabled.');
        await showProductEditor(ctx, flow.data.product_id, flow.data.page);
        return;
      }
      const chatId = Number(text.trim());
      if (!Number.isInteger(chatId) || chatId === 0) {
        await ctx.reply(
          '❌ Expected a non-zero integer (positive for users, negative for groups). Try again or send `/cancel`.',
        );
        return;
      }
      await updateProduct(flow.data.product_id, { delivery_vendor_chat_id: chatId });
      ctx.session.adminFlow = undefined;
      await ctx.reply(`✅ Vendor chat saved: \`${chatId}\``, { parse_mode: 'Markdown' });
      await showProductEditor(ctx, flow.data.product_id, flow.data.page);
      return;
    }
    if (flow.type === 'edit_product_delivery_vendor_label') {
      const cleared = text.trim().toLowerCase() === 'clear';
      await updateProduct(flow.data.product_id, {
        delivery_vendor_label: cleared ? null : text.trim(),
      });
      ctx.session.adminFlow = undefined;
      await ctx.reply(cleared ? '✅ Vendor label cleared.' : '✅ Vendor label saved.');
      await showProductEditor(ctx, flow.data.product_id, flow.data.page);
      return;
    }
    if (flow.type === 'edit_bot_tutorial_text') {
      await setBotTutorialField('text', text, ctx.from!.id);
      ctx.session.adminFlow = undefined;
      await ctx.reply('✅ Bot Tutorial text saved.');
      return;
    }
    if (flow.type === 'edit_bot_tutorial_url') {
      if (!/^https?:\/\//.test(text)) {
        await ctx.reply('❌ URL must start with `http://` or `https://`.');
        return;
      }
      await setBotTutorialField('url', text, ctx.from!.id);
      ctx.session.adminFlow = undefined;
      await ctx.reply('✅ Bot Tutorial URL saved.');
      return;
    }
    if (flow.type === 'edit_payment_tutorial_text') {
      await setPaymentMethodTutorialField(
        flow.data.method_id,
        'text',
        text,
        ctx.from!.id,
      );
      ctx.session.adminFlow = undefined;
      await ctx.reply(
        `✅ Tutorial text for method #${flow.data.method_id} saved.`,
      );
      return;
    }
    if (flow.type === 'edit_payment_tutorial_url') {
      if (!/^https?:\/\//.test(text)) {
        await ctx.reply('❌ URL must start with `http://` or `https://`.');
        return;
      }
      await setPaymentMethodTutorialField(
        flow.data.method_id,
        'url',
        text,
        ctx.from!.id,
      );
      ctx.session.adminFlow = undefined;
      await ctx.reply(
        `✅ Tutorial URL for method #${flow.data.method_id} saved.`,
      );
      return;
    }

    if (flow.type === 'add_payment') {
      if (flow.step === 'name') {
        ctx.session.adminFlow = {
          type: 'add_payment',
          step: 'instructions',
          data: { name: text },
        };
        await ctx.reply(
          'Send the *instructions* (what users should do to pay; e.g. wallet address + reply with txid).',
          { parse_mode: 'Markdown' },
        );
      } else if (flow.step === 'instructions') {
        const m = await addPaymentMethod({
          name: flow.data.name,
          instructions: text,
          min_amount: 0,
        });
        ctx.session.adminFlow = undefined;
        await ctx.reply(`✅ Payment method *${m.name}* added (id=${m.id}).`, {
          parse_mode: 'Markdown',
          reply_markup: rootMenu(),
        });
      }
      return;
    }

    if (flow.type === 'add_bybit_payment') {
      if (flow.step === 'name') {
        if (!text || text.length < 2 || text.length > 60) {
          await ctx.reply('❌ Name must be 2–60 chars. Try again or `/cancel`.');
          return;
        }
        ctx.session.adminFlow = {
          type: 'add_bybit_payment',
          step: 'bybit_id',
          data: { name: text },
        };
        await ctx.reply(
          [
            'Send the *Bybit UID / ID* users should pay inside Bybit.',
            '',
            'Users will send USDT to this ID, then paste their Bybit internal transfer TXID for auto-verify.',
          ].join('\n'),
          { parse_mode: 'Markdown' },
        );
        return;
      }
      if (flow.step === 'bybit_id') {
        const cleaned = text.replace(/\s+/g, '');
        if (!/^\d{4,20}$/.test(cleaned)) {
          await ctx.reply(
            '❌ Bybit UID / ID should be 4–20 digits, no spaces. Try again or `/cancel`.',
          );
          return;
        }
        ctx.session.adminFlow = {
          type: 'add_bybit_payment',
          step: 'bybit_name',
          data: { name: flow.data.name, bybit_id: cleaned },
        };
        await ctx.reply(
          'Send the *Bybit Name* shown near your UID / ID. Users see this on the deposit screen so they know they are paying the right account.',
          { parse_mode: 'Markdown' },
        );
        return;
      }
      if (flow.step === 'bybit_name') {
        const trimmed = text.trim();
        if (!trimmed || trimmed.length < 2 || trimmed.length > 64) {
          await ctx.reply(
            '❌ Bybit Name must be 2–64 chars. Try again or `/cancel`.',
          );
          return;
        }
        const m = await addPaymentMethod({
          name: flow.data.name,
          instructions: '(auto-verify - Bybit internal transfer instructions are rendered by the bot)',
          min_amount: 0,
          provider: 'bybit_pay',
          address: flow.data.bybit_id,
          pay_name: trimmed,
        });
        ctx.session.adminFlow = undefined;
        await ctx.reply(
          [
            `✅ *${m.name}* added (id=${m.id})`,
            'Provider: `bybit_pay`',
            `Bybit UID: \`${flow.data.bybit_id}\``,
            `Bybit Name: \`${trimmed}\``,
            '',
            'Set `BYBIT_API_KEY` and `BYBIT_API_SECRET` in Railway before users pay with it.',
          ].join('\n'),
          { parse_mode: 'Markdown', reply_markup: rootMenu() },
        );
        return;
      }
      return;
    }

    if (flow.type === 'add_cryptobot_payment' && flow.step === 'name') {
      if (!text || text.length < 2 || text.length > 60) {
        await ctx.reply('❌ Name must be 2–60 chars. Try again or `/cancel`.');
        return;
      }
      const m = await addPaymentMethod({
        name: text,
        instructions: '(auto-verify — Crypto Pay invoice instructions are rendered by the bot)',
        min_amount: 0,
        provider: 'cryptobot',
      });
      ctx.session.adminFlow = undefined;
      await ctx.reply(
        [
          `✅ *${m.name}* added (id=${m.id})`,
          'Provider: `cryptobot`',
          '',
          'Set `CRYPTOBOT_API_TOKEN` in Railway before users pay with it.',
          'The webhook path is `/cryptobot/webhook`.',
        ].join('\n'),
        { parse_mode: 'Markdown', reply_markup: rootMenu() },
      );
      return;
    }

    if (flow.type === 'add_binance_payment') {
      if (flow.step === 'name') {
        if (!text || text.length < 2 || text.length > 60) {
          await ctx.reply('❌ Name must be 2–60 chars. Try again or `/cancel`.');
          return;
        }
        ctx.session.adminFlow = {
          type: 'add_binance_payment',
          step: 'pay_id',
          data: { name: text },
        };
        await ctx.reply(
          [
            'Send the *Binance Pay ID* — your 10-digit numeric ID (e.g. `1101801594`). The verifier rejects orders sent to any other Pay ID.',
            '',
            'You can find it in the Binance app → *Pay* → *Receive* → it\'s the long number above your QR code.',
          ].join('\n'),
          { parse_mode: 'Markdown' },
        );
        return;
      }
      if (flow.step === 'pay_id') {
        const cleaned = text.replace(/\s+/g, '');
        if (!/^\d{6,15}$/.test(cleaned)) {
          await ctx.reply(
            '❌ Pay ID should be 6–15 digits, no spaces. Try again or `/cancel`.',
          );
          return;
        }
        ctx.session.adminFlow = {
          type: 'add_binance_payment',
          step: 'pay_name',
          data: { name: flow.data.name, pay_id: cleaned },
        };
        await ctx.reply(
          'Send the *Binance Pay Name* — the display string shown next to your Pay ID (e.g. `urweebboii`). Users see this on the deposit screen so they know they\'re paying the right account.',
          { parse_mode: 'Markdown' },
        );
        return;
      }
      if (flow.step === 'pay_name') {
        const trimmed = text.trim();
        if (!trimmed || trimmed.length < 2 || trimmed.length > 64) {
          await ctx.reply(
            '❌ Pay Name must be 2–64 chars. Try again or `/cancel`.',
          );
          return;
        }
        const m = await addPaymentMethod({
          name: flow.data.name,
          instructions: '(auto-verify — instructions are rendered by the bot)',
          min_amount: 0,
          provider: 'binance_pay',
          address: flow.data.pay_id,
          pay_name: trimmed,
        });
        ctx.session.adminFlow = undefined;
        await ctx.reply(
          [
            `✅ *${m.name}* added (id=${m.id})`,
            `Provider: \`binance_pay\``,
            `Pay ID: \`${flow.data.pay_id}\``,
            `Pay Name: \`${trimmed}\``,
          ].join('\n'),
          { parse_mode: 'Markdown', reply_markup: rootMenu() },
        );
        return;
      }
      return;
    }

    if (flow.type === 'add_chain_payment') {
      const provider = flow.data.provider;
      const info = CHAIN_WIZARD_INFO[provider];
      if (flow.step === 'name') {
        if (!text || text.length < 2 || text.length > 60) {
          await ctx.reply('❌ Name must be 2–60 chars. Try again or `/cancel`.');
          return;
        }
        ctx.session.adminFlow = {
          type: 'add_chain_payment',
          step: 'address',
          data: { provider, name: text },
        };
        await ctx.reply(info.addressPrompt, { parse_mode: 'Markdown' });
        return;
      }
      if (flow.step === 'address') {
        const addr = text.trim();
        if (provider === 'usdt_trc20' && !isValidTronAddress(addr)) {
          await ctx.reply(
            '❌ Not a valid TRON address. Should start with `T` and be 34 chars. Try again or `/cancel`.',
            { parse_mode: 'Markdown' },
          );
          return;
        }
        if (provider === 'usdt_bep20' && !isValidBscAddress(addr)) {
          await ctx.reply(
            '❌ Not a valid BSC address. Should be `0x` + 40 hex chars. Try again or `/cancel`.',
            { parse_mode: 'Markdown' },
          );
          return;
        }
        if (provider === 'usdt_ton' && !isValidTonAddress(addr)) {
          await ctx.reply(
            '❌ Not a valid TON address. Should be `EQ…` or `UQ…` 48 chars. Try again or `/cancel`.',
            { parse_mode: 'Markdown' },
          );
          return;
        }
        if (provider === 'ltc' && !isValidLtcAddress(addr)) {
          await ctx.reply(
            '❌ Not a valid Litecoin address. Should start with `L`, `M`, `3`, or `ltc1`. Try again or `/cancel`.',
            { parse_mode: 'Markdown' },
          );
          return;
        }
        const m = await addPaymentMethod({
          name: flow.data.name,
          instructions: '(auto-verify — instructions are rendered by the bot)',
          min_amount: 0,
          provider,
          address: addr,
        });
        ctx.session.adminFlow = undefined;
        await ctx.reply(
          `✅ *${m.name}* added (id=${m.id})\nProvider: \`${provider}\`\nAddress: \`${addr}\``,
          { parse_mode: 'Markdown', reply_markup: rootMenu() },
        );
        return;
      }
      return;
    }

    if (flow.type === 'add_gift') {
      // The whole gift-create flow uses HTML — Markdown V1 trips on
      // any underscore in a code (e.g. `MY_CODE`) and silently rejects
      // editMessageText / sendMessage, which surfaced as a generic
      // "Something went wrong. Cancelled." at every step.
      if (flow.step === 'code') {
        if (!/^[A-Z0-9_-]{3,40}$/i.test(text)) {
          await ctx.reply(
            '⚠️ Code must be 3–40 chars: letters, digits, <code>_</code> or <code>-</code>.',
            { parse_mode: 'HTML' },
          );
          return;
        }
        const code = text.toUpperCase();
        // Pre-check existence so the admin gets actionable feedback
        // BEFORE we walk them through amount / per-user / cap. The
        // table's primary key is `code`, so re-using one would later
        // crash the insert with `23505` and surface a misleading
        // "operator must apply migration 0007_gift_codes.sql" copy.
        // Keep the flow armed at step `code` so they can just send
        // a fresh code without restarting the wizard.
        const existing = await getGiftCode(code).catch(() => null);
        if (existing) {
          await ctx.reply(
            `⚠️ A gift code <code>${escapeHtml(code)}</code> already exists ` +
              `(${existing.amount} USDT). Send a different code, or ` +
              `<code>/cancel</code> and delete the existing one from ` +
              `🎁 Gift Codes first.`,
            { parse_mode: 'HTML' },
          );
          return;
        }
        ctx.session.adminFlow = { type: 'add_gift', step: 'amount', data: { code } };
        await ctx.reply(
          `Send the <b>amount in USDT</b> to credit when <code>${escapeHtml(code)}</code> is redeemed.`,
          { parse_mode: 'HTML' },
        );
      } else if (flow.step === 'amount') {
        const amount = Number(text);
        if (!Number.isFinite(amount) || amount <= 0) {
          await ctx.reply('⚠️ Send a positive number.');
          return;
        }
        ctx.session.adminFlow = {
          type: 'add_gift',
          step: 'per_user_limit',
          data: { code: flow.data.code, amount },
        };
        await ctx.reply(
          'How many times can a <b>single user</b> redeem this code? Send the number (default <code>1</code>).',
          { parse_mode: 'HTML' },
        );
      } else if (flow.step === 'per_user_limit') {
        const lim = Number(text);
        if (!Number.isInteger(lim) || lim < 1) {
          await ctx.reply(
            '⚠️ Send a positive integer (e.g. <code>1</code>).',
            { parse_mode: 'HTML' },
          );
          return;
        }
        ctx.session.adminFlow = {
          type: 'add_gift',
          step: 'max_redemptions',
          data: { code: flow.data.code, amount: flow.data.amount, per_user_limit: lim },
        };
        await ctx.reply(
          'Total redemption <b>cap</b> across all users? Send a number, or <code>-</code> for unlimited.',
          { parse_mode: 'HTML' },
        );
      } else if (flow.step === 'max_redemptions') {
        let max: number | null = null;
        if (text !== '-' && text !== '') {
          const n = Number(text);
          if (!Number.isInteger(n) || n < 1) {
            await ctx.reply(
              '⚠️ Send a positive integer or <code>-</code> for unlimited.',
              { parse_mode: 'HTML' },
            );
            return;
          }
          max = n;
        }
        try {
          const gift = await createGiftCode({
            code: flow.data.code,
            amount: flow.data.amount,
            per_user_limit: flow.data.per_user_limit,
            max_redemptions: max,
            created_by: ctx.from!.id,
          });
          ctx.session.adminFlow = undefined;
          await ctx.reply(
            `✅ Gift code <code>${escapeHtml(gift.code)}</code> created — <b>${gift.amount} USDT</b>, ` +
              `per-user ${gift.per_user_limit}, total ${gift.max_redemptions ?? '∞'}.`,
            { parse_mode: 'HTML', reply_markup: rootMenu() },
          );
        } catch (err) {
          // Distinguish the actual failure modes instead of always
          // blaming a missing migration:
          //   • 23505           → code already exists (PK violation).
          //                       Keep flow at step `code` so the admin
          //                       can retype a fresh code without
          //                       restarting the wizard.
          //   • 42P01 / PGRST204 / PGRST205 → table or schema-cache miss
          //                       → migration 0007 isn't applied (or the
          //                       PostgREST cache is stale).
          //   • everything else → surface the real DB error so the
          //                       operator can self-diagnose.
          const e = err as { code?: string; message?: string } | undefined;
          const detail = e?.message
            ? ` <i>(${escapeHtml(e.code ?? 'err')}: ${escapeHtml(e.message)})</i>`
            : '';
          if (e?.code === '23505') {
            // Keep the flow alive — drop back to the `code` step so the
            // admin doesn't lose the partial wizard input.
            ctx.session.adminFlow = { type: 'add_gift', step: 'code', data: {} };
            await ctx.reply(
              `⚠️ A gift code <code>${escapeHtml(flow.data.code)}</code> ` +
                `already exists. Send a different code, or ` +
                `<code>/cancel</code> and delete the existing one from ` +
                `🎁 Gift Codes first.`,
              { parse_mode: 'HTML' },
            );
            return;
          }
          ctx.session.adminFlow = undefined;
          if (e?.code === '42P01' || e?.code === 'PGRST204' || e?.code === 'PGRST205') {
            await ctx.reply(
              '⚠️ Could not create gift code — the bot operator must apply ' +
                'migration <code>0007_gift_codes.sql</code>. ' +
                'If already applied, reload the API schema in Supabase ' +
                '(Project Settings → API → Restart server, or run ' +
                "<code>select pg_notify('pgrst', 'reload schema');</code>)." +
                detail,
              { parse_mode: 'HTML', reply_markup: rootMenu() },
            );
            return;
          }
          await ctx.reply(
            '⚠️ Could not create gift code.' + detail,
            { parse_mode: 'HTML', reply_markup: rootMenu() },
          );
        }
      }
      return;
    }

    if (flow.type === 'stats_custom_days') {
      const days = Number(text);
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        await ctx.reply('⚠️ Send a whole number between 1 and 365.');
        return;
      }
      ctx.session.adminFlow = undefined;
      await showAdminStats(ctx, days);
      return;
    }

    if (flow.type === 'set_text') {
      if (flow.step === 'key') {
        ctx.session.adminFlow = { type: 'set_text', step: 'value', data: { key: text } };
        await ctx.reply(`Send the new value for \`${text}\`:`, { parse_mode: 'Markdown' });
      } else if (flow.step === 'value') {
        await setText(flow.data.key, text, ctx.from!.id);
        ctx.session.adminFlow = undefined;
        await ctx.reply(`✅ Text \`${flow.data.key}\` updated.`, {
          parse_mode: 'Markdown',
          reply_markup: rootMenu(),
        });
      }
      return;
    }

    if (flow.type === 'set_emoji') {
      if (flow.step === 'key') {
        // Legacy slash-command path: admin typed the key first.
        ctx.session.adminFlow = { type: 'set_emoji', step: 'value', data: { key: text } };
        await ctx.reply(
          `Send the emoji for \`${text}\`. You can send a *premium* emoji ` +
            'directly (the bot reads its `custom_emoji_id`), a plain unicode ' +
            'emoji, or `<unicode> <custom_emoji_id>`.',
          { parse_mode: 'Markdown' },
        );
        return;
      }
      // step === 'value'
      let unicode: string | undefined;
      let customId: string | undefined;

      // Preferred path: the admin forwarded / typed a premium emoji
      // — Telegram surfaces it as a `custom_emoji` MessageEntity
      // alongside the unicode fallback in the message text.
      const ce = (ctx.message.entities ?? []).find(
        (e) => e.type === 'custom_emoji' && 'custom_emoji_id' in e,
      ) as { offset: number; length: number; custom_emoji_id: string } | undefined;
      if (ce) {
        // Slice from the original (un-trimmed) text using the entity
        // offsets (UTF-16 code units, matching String.prototype.length).
        const raw = ctx.message.text;
        unicode = raw.slice(ce.offset, ce.offset + ce.length);
        customId = ce.custom_emoji_id;
      } else {
        // Fallback: parse `<unicode> [custom_emoji_id]` from the text.
        const parts = text.split(/\s+/, 2);
        unicode = parts[0];
        customId = parts[1];
      }

      if (!unicode) {
        await ctx.reply('❌ Empty value.');
        return;
      }
      await setEmoji(flow.data.key, unicode, customId, ctx.from!.id);
      ctx.session.adminFlow = undefined;
      const idLine = customId
        ? ` (premium id \`${customId}\`)`
        : '';
      await ctx.reply(
        `✅ Emoji \`${flow.data.key}\` updated → ${unicode}${idLine}.`,
        { parse_mode: 'Markdown', reply_markup: rootMenu() },
      );
      return;
    }

    if (flow.type === 'edit_payment_icon') {
      // Per-payment-method icon override. Mirrors the `set_btnicon`
      // shape but writes to `payment_methods.{emoji_id, emoji_unicode}`
      // instead of the shared `btnicon.<key>` settings table. Plain
      // unicode emojis are accepted (they go into `emoji_unicode`),
      // and premium custom emojis populate both fields.
      const trimmed = text.trim();
      if (trimmed.toLowerCase() === 'clear' || trimmed === '/clear') {
        await setPaymentMethodIcon(flow.data.method_id, null, null);
        ctx.session.adminFlow = undefined;
        await ctx.reply('🧹 Icon reset to per-provider default.');
        return;
      }
      const ce = (ctx.message.entities ?? []).find(
        (e) => e.type === 'custom_emoji' && 'custom_emoji_id' in e,
      ) as { offset: number; length: number; custom_emoji_id: string } | undefined;
      let unicode: string | null = null;
      let customId: string | null = null;
      if (ce) {
        const raw = ctx.message.text;
        unicode = raw.slice(ce.offset, ce.offset + ce.length);
        customId = ce.custom_emoji_id;
      } else {
        unicode = trimmed;
      }
      if (!unicode) {
        await ctx.reply(
          '❌ Couldn\'t read an emoji. Send a single emoji or `clear` to reset.',
          { parse_mode: 'Markdown' },
        );
        return;
      }
      // Sanity-check unicode length — a plain emoji is at most ~8
      // UTF-16 code units (e.g. ZWJ-joined family emojis). A long
      // word / sentence almost certainly isn't an emoji and would
      // make the button label look weird, so reject it early and
      // keep the flow armed for a retry.
      if (!customId && unicode.length > 8) {
        await ctx.reply(
          '⚠️ That doesn\'t look like a single emoji.\n\n' +
            'Send a single emoji (or a *premium* custom emoji message). ' +
            'Type `clear` to reset to default, or `/cancel` to abort.',
          { parse_mode: 'Markdown' },
        );
        return;
      }
      await setPaymentMethodIcon(flow.data.method_id, unicode, customId);
      ctx.session.adminFlow = undefined;
      const idLine = customId ? ` (premium id \`${customId}\`)` : '';
      await ctx.reply(
        `✅ Payment method #${flow.data.method_id} icon → ${unicode}${idLine}.`,
        { parse_mode: 'Markdown' },
      );
      return;
    }

    if (flow.type === 'set_btnicon') {
      // Per-button icon override → stored under `btnicon.<key>`,
      // separate from the shared `emoji.<key>` map. Requires a real
      // premium emoji (custom_emoji_id) — plain unicode can't be used
      // in `icon_custom_emoji_id` per Bot API 9.4.
      const ce = (ctx.message.entities ?? []).find(
        (e) => e.type === 'custom_emoji' && 'custom_emoji_id' in e,
      ) as { offset: number; length: number; custom_emoji_id: string } | undefined;
      let unicode: string | undefined;
      let customId: string | undefined;
      if (ce) {
        const raw = ctx.message.text;
        unicode = raw.slice(ce.offset, ce.offset + ce.length);
        customId = ce.custom_emoji_id;
      } else {
        const parts = text.split(/\s+/, 2);
        unicode = parts[0];
        customId = parts[1];
      }
      if (!unicode || !customId || !/^\d{8,}$/.test(customId)) {
        await ctx.reply(
          '❌ This needs a *premium* emoji. Send a premium emoji message ' +
            'directly (the bot will read its `custom_emoji_id`), or type ' +
            '`<unicode> <custom_emoji_id>` with a numeric id.',
          { parse_mode: 'Markdown' },
        );
        return;
      }
      await setButtonIcon(flow.data.btnKey, unicode, customId, ctx.from!.id);
      ctx.session.adminFlow = undefined;
      await ctx.reply(
        `✅ Button \`${flow.data.btnKey}\` icon updated → ${unicode} ` +
          `(premium id \`${customId}\`).`,
        { parse_mode: 'Markdown', reply_markup: rootMenu() },
      );
      return;
    }

    if (flow.type === 'set_color') {
      // The picker UI uses callback buttons; if we get here, the user
      // typed text instead of tapping. Treat the text as the button
      // key and offer a colour chooser.
      if (!flow.data.key) {
        ctx.session.adminFlow = { type: 'set_color', step: 'value', data: { key: text } };
        const kb = new InlineKeyboard();
        for (const c of Object.keys(COLOR_PREFIX)) {
          kb.text(`${COLOR_PREFIX[c as ColorMode] || '∅'} ${c}`, `adm:color:set:${text}:${c}`);
        }
        backRow(kb);
        await ctx.reply(`Pick a color for \`${text}\`:`, {
          parse_mode: 'Markdown',
          reply_markup: kb,
        });
      }
      return;
    }

    if (flow.type === 'set_color_glyph') {
      const mode = flow.data.mode as ColorMode;
      if (!(mode in COLOR_PREFIX)) {
        ctx.session.adminFlow = undefined;
        await ctx.reply('⚠️ Unknown color mode — aborted.');
        return;
      }
      const trimmed = text.trim();
      if (trimmed === '/cancel') {
        ctx.session.adminFlow = undefined;
        await ctx.reply('Cancelled.');
        return;
      }
      if (trimmed === '/clear') {
        await clearColorPrefix(mode);
        ctx.session.adminFlow = undefined;
        await ctx.reply(
          `✅ Cleared *${mode}* glyph — falling back to the built-in default.`,
          { parse_mode: 'Markdown' },
        );
        return;
      }
      // Trim whitespace but allow zero-width / multi-codepoint emoji.
      // Cap to 16 chars so the prefix never breaks the button label.
      const glyph = trimmed.slice(0, 16);
      await setColorPrefix(mode, glyph, ctx.from!.id);
      ctx.session.adminFlow = undefined;
      await ctx.reply(
        `✅ Updated *${mode}* glyph → ${glyph || '_(empty)_'}.`,
        { parse_mode: 'Markdown' },
      );
      return;
    }

    if (flow.type === 'announce') {
      if (flow.step === 'text') {
        const hasFormatEntities = (ctx.message.entities ?? []).some((entity) =>
          FORMAT_ENTITY_TYPES.has(entity.type),
        );
        const format: 'md' | 'html' = hasFormatEntities ? 'html' : 'md';
        const body = hasFormatEntities
          ? entitiesToHtml(ctx.message.text, ctx.message.entities).trim()
          : text;
        ctx.session.adminFlow = {
          type: 'announce',
          step: 'confirm',
          data: { text: body, format, share_sales: true },
        };
        await showAnnounceConfirm(ctx);
        return;
      }
      if (flow.step === 'buy_label') {
        // Cap to 64 chars so the inline button never gets truncated
        // mid-emoji on Android. Keep premium-emoji markers intact —
        // `injectCustomEmojiMarkers` ran above already, but the URL
        // button label is RAW string (no HTML render), so we want
        // the unicode-only label here. Strip {{ce:..|x}} markers
        // back to the unicode fallback.
        const trimmed = text
          .replace(/\{\{ce:[^|}]+\|([^}]*)\}\}/g, '$1')
          .trim()
          .slice(0, 64);
        if (!trimmed) {
          await ctx.reply('❌ Empty label. Send the new button label or `/cancel`.');
          return;
        }
        ctx.session.adminFlow = {
          type: 'announce',
          step: 'confirm',
          data: {
            text: flow.data.text,
            format: flow.data.format,
            buy: { ...flow.data.buy, label: trimmed },
            share_sales: flow.data.share_sales,
          },
        };
        await ctx.reply(`✅ Label updated → \`${trimmed}\``, { parse_mode: 'Markdown' });
        await showAnnounceBuyEdit(ctx);
        return;
      }
      if (flow.step === 'buy_icon') {
        // `clear` keyword drops the icon; otherwise we expect a
        // premium emoji message and pull `custom_emoji_id` off the
        // first matching entity. Plain unicode is rejected because
        // Bot API 9.4 only renders icons for premium-emoji ids.
        if (text.trim().toLowerCase() === 'clear') {
          ctx.session.adminFlow = {
            type: 'announce',
            step: 'confirm',
            data: {
              text: flow.data.text,
              format: flow.data.format,
              buy: {
                ...flow.data.buy,
                icon_unicode: undefined,
                icon_custom_emoji_id: undefined,
              },
              share_sales: flow.data.share_sales,
            },
          };
          await ctx.reply('🗑 Icon cleared.');
          await showAnnounceBuyEdit(ctx);
          return;
        }
        const ce = (ctx.message.entities ?? []).find(
          (e) => e.type === 'custom_emoji' && 'custom_emoji_id' in e,
        ) as { offset: number; length: number; custom_emoji_id: string } | undefined;
        if (!ce) {
          await ctx.reply(
            '❌ Send a *premium* emoji message (the bot will read its `custom_emoji_id`), or type `clear` / `/cancel`.',
            { parse_mode: 'Markdown' },
          );
          return;
        }
        const raw = ctx.message.text;
        const unicode = raw.slice(ce.offset, ce.offset + ce.length);
        const customId = ce.custom_emoji_id;
        if (!unicode || !customId || !/^\d{8,}$/.test(customId)) {
          await ctx.reply(
            '❌ That emoji has no valid premium id. Send a real premium emoji, or type `clear`.',
          );
          return;
        }
        ctx.session.adminFlow = {
          type: 'announce',
          step: 'confirm',
          data: {
            text: flow.data.text,
            format: flow.data.format,
            buy: {
              ...flow.data.buy,
              icon_unicode: unicode,
              icon_custom_emoji_id: customId,
            },
            share_sales: flow.data.share_sales,
          },
        };
        await ctx.reply(
          `✅ Icon set → ${unicode} (premium id \`${customId}\`).`,
          { parse_mode: 'Markdown' },
        );
        await showAnnounceBuyEdit(ctx);
        return;
      }
      return;
    }

    if (flow.type === 'set_force_join_channel') {
      const value = text.trim();
      const valid =
        /^@[A-Za-z0-9_]{5,}$/i.test(value) ||
        /^https?:\/\/t\.me\/[A-Za-z0-9_]{5,}(?:\/.*)?$/i.test(value) ||
        /^-100\d+$/.test(value);
      if (!valid) {
        await ctx.reply(
          [
            '❌ Send a public channel username or link:',
            '`@yourchannel`',
            '`https://t.me/yourchannel`',
            '',
            'For private channels, send numeric chat id like `-1001234567890` and make sure bot is admin.',
          ].join('\n'),
          { parse_mode: 'Markdown' },
        );
        return;
      }
      await setChannelUrl(value, ctx.from!.id);
      await setForceJoinEnabled(true, ctx.from!.id);
      ctx.session.adminFlow = undefined;
      await ctx.reply(
        [
          '✅ Force Join channel saved and enabled.',
          '',
          `Channel: \`${value}\``,
          '',
          'Make sure the bot is admin in that channel so membership checks work.',
        ].join('\n'),
        { parse_mode: 'Markdown', reply_markup: rootMenu() },
      );
      return;
    }

    if (flow.type === 'find_user') {
      const query = text.replace(/^@/, '');
      const user = /^\d+$/.test(query)
        ? await findUserById(Number(query))
        : await findUserByUsername(query);
      ctx.session.adminFlow = undefined;
      if (!user) {
        await ctx.reply('No user found.', { reply_markup: rootMenu() });
        return;
      }
      await showUserCard(ctx, user);
      return;
    }

    if (flow.type === 'referral_find_user') {
      const query = text.replace(/^@/, '');
      const user = /^\d+$/.test(query)
        ? await findUserById(Number(query))
        : await findUserByUsername(query);
      ctx.session.adminFlow = undefined;
      if (!user) {
        await ctx.reply('No user found.', { reply_markup: rootMenu() });
        return;
      }
      await showReferralAdminUser(ctx, user);
      return;
    }

    if (flow.type === 'referral_adjust') {
      const delta = Number(text);
      if (!Number.isInteger(delta) || delta === 0) {
        await ctx.reply('❌ Send a non-zero integer, like `5` or `-3`.', {
          parse_mode: 'Markdown',
        });
        return;
      }
      ctx.session.adminFlow = undefined;
      await applyReferralAdjustmentAndShow(ctx, flow.data.telegram_id, delta);
      return;
    }

    if (flow.type === 'adjust_balance') {
      const delta = Number(text);
      if (!Number.isFinite(delta)) {
        await ctx.reply('❌ Bad number. Send e.g. `5` or `-3.5`.');
        return;
      }
      const newBal = await adjustBalance(flow.data.telegram_id, delta);
      ctx.session.adminFlow = undefined;
      await ctx.reply(
        `✅ Balance adjusted by *${delta >= 0 ? '+' : ''}${delta}*. New balance: *$${newBal}*.`,
        { parse_mode: 'Markdown', reply_markup: rootMenu() },
      );
      try {
        if (delta !== 0) {
          // Render via the locale + premium-emoji pipeline so the
          // wallet credit / debit notification picks up `credit_emoji`,
          // `balance_emoji`, `debit_emoji` from the EMOJI map (and any
          // admin override stored under `emoji.<key>`). Recipient's
          // lang isn't loaded here, so we render in English; ar/vi
          // fall through to en automatically via the i18n resolver.
          const balanceFmt = Number(newBal).toFixed(2);
          const tpl =
            delta > 0
              ? translate('en', 'wallet.admin_credit', {
                  amount: delta.toFixed(2),
                  balance: balanceFmt,
                })
              : translate('en', 'wallet.admin_debit', {
                  amount: Math.abs(delta).toFixed(2),
                  balance: balanceFmt,
                });
          await ctx.api.sendMessage(
            flow.data.telegram_id,
            renderMdHtml(tpl),
            { parse_mode: 'HTML' },
          );
        }
      } catch (err) {
        logger.warn({ err }, 'Could not DM user about balance change');
      }
      // Deep-detail admin log so the action ends up in the same
      // structured feed as everything else (auditable trail across
      // sessions, even when the admin is the actor).
      void adminLog.logBalanceChange(ctx.api, {
        user: {
          telegram_id: flow.data.telegram_id,
          username: null,
          first_name: null,
          email: null,
        },
        delta,
        balanceAfter: Number(Number(newBal).toFixed(3)),
        reason: delta > 0 ? 'admin manual credit' : 'admin manual debit',
        by: 'admin',
      });
      return;
    }

    if (flow.type === 'ban_user') {
      const reason = text === '-' ? null : text.slice(0, 200);
      await banUser(flow.data.telegram_id, reason);
      ctx.session.adminFlow = undefined;
      await ctx.reply(
        `🚫 *User banned.*\n\n` +
          `\`${flow.data.telegram_id}\` will see no responses from the bot ` +
          `until you unban them.${
            reason ? `\n\nReason on file: _${reason}_` : ''
          }`,
        { parse_mode: 'Markdown', reply_markup: rootMenu() },
      );
      return;
    }

    if (flow.type === 'price_overrides_pick_user') {
      const query = text.replace(/^@/, '');
      const numeric = /^\d+$/.test(query);
      // Username path requires the user to have started the bot at
      // least once (otherwise we have no row to look up). Numeric
      // path works regardless — the override system is keyed by
      // telegram_id, not by users.id.
      let telegram_id: number | null = null;
      if (numeric) {
        telegram_id = Number(query);
      } else {
        const u = await findUserByUsername(query);
        if (u) telegram_id = u.telegram_id;
      }
      if (telegram_id === null || !Number.isFinite(telegram_id) || telegram_id <= 0) {
        await ctx.reply(
          'Could not resolve that user. Send a numeric Telegram ID ' +
            '(e.g. `123456789`) or `@username` of a user who has ' +
            'previously started the bot. Or `/cancel`.',
          { parse_mode: 'Markdown' },
        );
        return;
      }
      ctx.session.adminFlow = undefined;
      await showCustomPriceUserCard(ctx, telegram_id);
      return;
    }

    if (flow.type === 'price_override_set') {
      const price = Number(text);
      if (!Number.isFinite(price) || price < 0) {
        await ctx.reply('❌ Send a non-negative number, e.g. `9.99` or `0`.');
        return;
      }
      await setUserProductPrice({
        telegram_id: flow.data.telegram_id,
        product_id: flow.data.product_id,
        price,
        created_by: ctx.from!.id,
      });
      const target = flow.data.telegram_id;
      ctx.session.adminFlow = undefined;
      await ctx.reply(
        `💎 *Override saved.*\n\n` +
          `User \`${target}\` now sees product \`#${flow.data.product_id}\` ` +
          `at *$${price.toFixed(2)}*.`,
        { parse_mode: 'Markdown' },
      );
      await showCustomPriceUserCard(ctx, target);
      return;
    }

    if (flow.type === 'price_override_bulk') {
      const target = flow.data.telegram_id;
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'));
      const ok: string[] = [];
      const bad: string[] = [];
      for (const line of lines) {
        const m = line.match(/^(\d+)\s+(-?\d+(?:\.\d+)?)$/);
        if (!m) {
          bad.push(`• \`${line.slice(0, 40)}\` — bad format`);
          continue;
        }
        const product_id = Number(m[1]);
        const price = Number(m[2]);
        if (!Number.isFinite(price) || price < 0) {
          bad.push(`• \`#${product_id}\` — price must be ≥ 0`);
          continue;
        }
        const product = await getProduct(product_id);
        if (!product) {
          bad.push(`• \`#${product_id}\` — product not found`);
          continue;
        }
        await setUserProductPrice({
          telegram_id: target,
          product_id,
          price,
          created_by: ctx.from!.id,
        });
        ok.push(
          `• ${escapeHtml(product.name)} (\`#${product_id}\`) → *$${price.toFixed(2)}*`,
        );
      }
      ctx.session.adminFlow = undefined;
      const summary = [
        `📋 *Bulk paste applied* for \`${target}\``,
        '',
        ok.length > 0 ? `*Saved (${ok.length}):*` : '_No overrides saved._',
        ...ok,
        '',
        bad.length > 0 ? `*Skipped (${bad.length}):*` : '',
        ...bad,
      ]
        .filter((l) => l !== '')
        .join('\n');
      await ctx.reply(summary, { parse_mode: 'Markdown' });
      await showCustomPriceUserCard(ctx, target);
      return;
    }

    if (flow.type === 'set_deposit_amount') {
      const amount = Number(text);
      if (!Number.isFinite(amount) || amount <= 0) {
        await ctx.reply('❌ Send a positive number, e.g. `5.12`.');
        return;
      }
      // numeric(14,2) — keep at most 2 decimals.
      const rounded = Math.floor(amount * 100) / 100;
      await setDepositAmount(flow.data.deposit_id, rounded);
      ctx.session.adminFlow = undefined;
      await ctx.reply(
        `✅ Deposit *#${flow.data.deposit_id}* amount set to *$${rounded.toFixed(2)}*. Tap Approve to credit the user.`,
        { parse_mode: 'Markdown' },
      );
      await showDepositList(ctx);
      return;
    }

    // -------- Promo flows (add wizard + single-field edits) --------

    if (flow.type === 'promo_add' && flow.step === 'pick_user') {
      // Resolve the user — numeric Telegram ID always works,
      // @username only resolves when the user has /start-ed the bot.
      const query = text.replace(/^@/, '');
      const numeric = /^\d+$/.test(query);
      let telegram_id: number | null = null;
      if (numeric) {
        telegram_id = Number(query);
      } else {
        const u = await findUserByUsername(query);
        if (u) telegram_id = u.telegram_id;
      }
      if (telegram_id === null || !Number.isFinite(telegram_id) || telegram_id <= 0) {
        await ctx.reply(
          'Could not resolve that user. Send a numeric Telegram ID ' +
            '(e.g. `123456789`) or `@username` of a user who has ' +
            'previously started the bot. Or `/cancel`.',
          { parse_mode: 'Markdown' },
        );
        return;
      }
      if (flow.data.scope === 'user') {
        await promptPromoType(ctx, {
          scope: 'user',
          product_id: null,
          telegram_id,
        });
        return;
      }
      // user_product → next step is product picker.
      ctx.session.adminFlow = {
        type: 'promo_add',
        step: 'pick_product',
        data: { scope: 'user_product', telegram_id },
      };
      const { rows, total } = await listAllProducts(0, PROMO_PAGE_SIZE);
      const totalPages = Math.max(1, Math.ceil(total / PROMO_PAGE_SIZE));
      const kb = new InlineKeyboard();
      for (const p of rows) {
        kb.text(
          `${p.name.slice(0, 40)} — $${Number(p.price).toFixed(2)}`,
          `adm:promo:npp:${p.id}`,
        ).row();
      }
      if (totalPages > 1) kb.text('Next ▶', 'adm:promo:np:1');
      kb.row().text('⬅️ Cancel', 'adm:promo');
      await ctx.reply(
        [
          '➕ *New promo — pick a product*',
          `User: \`${telegram_id}\``,
          `Page 1/${totalPages}  (total ${total})`,
          '',
          'Tap a product to attach the promo to it.',
        ].join('\n'),
        { parse_mode: 'Markdown', reply_markup: kb },
      );
      return;
    }

    if (flow.type === 'promo_add' && flow.step === 'min_qty') {
      const min_qty = Number(text);
      if (!Number.isInteger(min_qty) || min_qty < 1) {
        await ctx.reply('❌ Send a whole number ≥ 1, e.g. `10`.');
        return;
      }
      ctx.session.adminFlow = {
        type: 'promo_add',
        step: 'discount',
        data: { ...flow.data, min_qty },
      };
      await ctx.reply(
        [
          '➕ *New promo — Step 4/4: Discount*',
          '',
          `Triggers when qty ≥ *${min_qty}*. Send the flat USDT discount`,
          'taken off the line total, e.g. `5` or `12.5`.',
          '',
          'Send `/cancel` to abort.',
        ].join('\n'),
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard().text('⬅️ Cancel', 'adm:promo'),
        },
      );
      return;
    }

    if (flow.type === 'promo_add' && flow.step === 'tiers') {
      const parsed = parsePromoTiers(text);
      if (!parsed.tiers) {
        await ctx.reply(`❌ ${parsed.error}`, { parse_mode: 'Markdown' });
        return;
      }
      ctx.session.adminFlow = {
        type: 'promo_add',
        step: 'tier_confirm',
        data: { ...flow.data, tiers: parsed.tiers },
      };
      const kb = new InlineKeyboard()
        .text('✅ Save tiered promo', 'adm:promo:tierSave')
        .row()
        .text('❌ Cancel', 'adm:promo');
      await ctx.reply(
        [
          '📊 *Confirm tier ladder*',
          '',
          promoTierLabel(parsed.tiers),
          '',
          'Save this tiered promo?',
        ].join('\n'),
        { parse_mode: 'Markdown', reply_markup: kb },
      );
      return;
    }

    if (flow.type === 'promo_add' && flow.step === 'discount') {
      const discount_amount = Number(text);
      if (!Number.isFinite(discount_amount) || discount_amount < 0) {
        await ctx.reply('❌ Send a non-negative number, e.g. `5` or `12.5`.');
        return;
      }
      ctx.session.adminFlow = {
        type: 'promo_add',
        step: 'name',
        data: { ...flow.data, discount_amount },
      };
      const kb = new InlineKeyboard()
        .text('Skip name', 'adm:promo:nameSkip')
        .row()
        .text('⬅️ Cancel', 'adm:promo');
      await ctx.reply(
        [
          '➕ *New promo — optional label*',
          '',
          'Send a short label that buyers will see on the product page',
          '(e.g. `Bulk deal`, `VIP offer`), or tap *Skip name*.',
        ].join('\n'),
        { parse_mode: 'Markdown', reply_markup: kb },
      );
      return;
    }

    if (flow.type === 'promo_add' && flow.step === 'name') {
      const name = text === '-' ? null : text.slice(0, 80);
      const created = await addPromo({
        product_id: flow.data.product_id,
        telegram_id: flow.data.telegram_id,
        name,
        min_qty: flow.data.min_qty,
        discount_amount: flow.data.discount_amount,
        created_by: ctx.from!.id,
      });
      ctx.session.adminFlow = undefined;
      await ctx.reply(`✅ Promo *#${created.id}* saved.`, {
        parse_mode: 'Markdown',
      });
      // Isolate the post-save card render — if the impact-stats query
      // happens to fail (e.g. orders.promo_id column missing) the
      // promo is already in the database and the admin shouldn't
      // see "Something went wrong" on top of a successful save.
      try {
        await showPromoCard(ctx, created.id);
      } catch (err) {
        logger.error({ err, promo_id: created.id }, 'showPromoCard after save failed');
        await ctx.reply(
          '_(Detail card render failed — promo is saved. Open it from /promo list.)_',
          { parse_mode: 'Markdown' },
        );
      }
      return;
    }

    if (flow.type === 'promo_edit_qty') {
      const min_qty = Number(text);
      if (!Number.isInteger(min_qty) || min_qty < 1) {
        await ctx.reply('❌ Send a whole number ≥ 1, e.g. `10`.');
        return;
      }
      await updatePromo(flow.data.promo_id, { min_qty });
      ctx.session.adminFlow = undefined;
      await ctx.reply(`✅ Min qty updated to *${min_qty}*.`, { parse_mode: 'Markdown' });
      await showPromoCard(ctx, flow.data.promo_id);
      return;
    }

    if (flow.type === 'promo_edit_discount') {
      const discount_amount = Number(text);
      if (!Number.isFinite(discount_amount) || discount_amount < 0) {
        await ctx.reply('❌ Send a non-negative number, e.g. `5` or `12.5`.');
        return;
      }
      await updatePromo(flow.data.promo_id, { discount_amount });
      ctx.session.adminFlow = undefined;
      await ctx.reply(`✅ Discount updated to *$${discount_amount.toFixed(2)}*.`, {
        parse_mode: 'Markdown',
      });
      await showPromoCard(ctx, flow.data.promo_id);
      return;
    }

    if (flow.type === 'promo_edit_tiers') {
      const parsed = parsePromoTiers(text);
      if (!parsed.tiers) {
        await ctx.reply(`❌ ${parsed.error}`, { parse_mode: 'Markdown' });
        return;
      }
      try {
        await replacePromoTiers(flow.data.promo_id, parsed.tiers);
        ctx.session.adminFlow = undefined;
        await ctx.reply(`✅ Tiers updated: ${promoTierLabel(parsed.tiers)}`, {
          parse_mode: 'Markdown',
        });
        await showPromoCard(ctx, flow.data.promo_id);
      } catch (err) {
        logger.error({ err, promo_id: flow.data.promo_id }, 'promo tiers update failed');
        await ctx.reply(
          '⚠️ Could not replace tiers. Apply migration `0043_promo_tiers.sql` and try again.',
          { parse_mode: 'Markdown' },
        );
      }
      return;
    }

    if (flow.type === 'promo_edit_name') {
      const name = text === '-' ? null : text.slice(0, 80);
      await updatePromo(flow.data.promo_id, { name });
      ctx.session.adminFlow = undefined;
      await ctx.reply(name ? `✅ Name updated.` : `✅ Name cleared.`);
      await showPromoCard(ctx, flow.data.promo_id);
      return;
    }

    if (flow.type === 'promo_exclude_add') {
      // Resolve to a numeric telegram_id — same logic as the new-
      // promo `pick_user` step. @usernames only resolve once the
      // user has /start-ed the bot, but a raw numeric id always
      // works so the admin can opt out users they only know by ID.
      const query = text.replace(/^@/, '');
      const numeric = /^\d+$/.test(query);
      let telegram_id: number | null = null;
      if (numeric) {
        telegram_id = Number(query);
      } else {
        const u = await findUserByUsername(query);
        if (u) telegram_id = u.telegram_id;
      }
      if (telegram_id === null || !Number.isFinite(telegram_id) || telegram_id <= 0) {
        await ctx.reply(
          'Could not resolve that user. Send a numeric Telegram ID ' +
            '(e.g. `123456789`) or `@username` of a user who has ' +
            'previously started the bot. Or `/cancel`.',
          { parse_mode: 'Markdown' },
        );
        return;
      }
      const promo_id = flow.data.promo_id;
      await addPromoExclusion(promo_id, telegram_id);
      ctx.session.adminFlow = undefined;
      await ctx.reply(`🚫 \`${telegram_id}\` is now excluded from promo #${promo_id}.`, {
        parse_mode: 'Markdown',
      });
      await showPromoExclusions(ctx, promo_id);
      return;
    }
  } catch (err) {
    logger.error({ err, flow }, 'admin flow error');
    ctx.session.adminFlow = undefined;
    // Surface the real DB error for promo flows — these have been
    // failing silently with "Something went wrong" when the
    // migrations weren't applied. Knowing the Postgres error code is
    // usually enough for the admin to tell whether they need to run
    // a migration or just retry.
    const e = err as { code?: string; message?: string; hint?: string } & Error;
    const isPromoFlow = flow.type.startsWith('promo_');
    if (isPromoFlow && e?.code === '42P01') {
      // undefined_table — migrations 0013 / 0014 didn't run.
      await ctx.reply(
        '⚠️ *Promo system not migrated*\n\n' +
          'The `promos` table is missing on this database. Apply the\n' +
          '`supabase/migrations/0013_promos.sql` and `0014_orders_promo_id.sql`\n' +
          'migrations on your Supabase, then try again.',
        { parse_mode: 'Markdown', reply_markup: rootMenu() },
      );
      return;
    }
    if (isPromoFlow && e?.code === '42703') {
      // undefined_column — schema partly migrated.
      await ctx.reply(
        '⚠️ *Promo schema is partially migrated*\n\n' +
          `The database is missing a column: \`${escapeHtml(e.message ?? '')}\`. Make sure ` +
          'both `0013_promos.sql` and `0014_orders_promo_id.sql` ran in full.',
        { parse_mode: 'Markdown', reply_markup: rootMenu() },
      );
      return;
    }
    if (isPromoFlow) {
      const detail = e?.message ?? String(err);
      await ctx.reply(
        '⚠️ *Promo flow failed*\n\n' +
          `\`\`\`\n${detail.slice(0, 500)}\n\`\`\`\n` +
          (e?.hint ? `_Hint: ${escapeHtml(e.hint)}_\n` : '') +
          '\nCheck the bot logs for the full stack trace.',
        { parse_mode: 'Markdown', reply_markup: rootMenu() },
      );
      return;
    }
    // Surface DB errors for payment-method wizards (mirrors the
    // promo-flow handler above) so missing migrations are visible
    // instead of a generic "Cancelled" reply.
    const isPaymentFlow =
      flow.type === 'add_payment' ||
      flow.type === 'add_chain_payment' ||
      flow.type === 'add_binance_payment' ||
      flow.type === 'add_bybit_payment' ||
      flow.type === 'add_cryptobot_payment';
    if (isPaymentFlow && (e?.code === '42P01' || e?.code === '42703')) {
      await ctx.reply(
        '⚠️ *Payment-methods schema not migrated*\n\n' +
          `The database is missing a column or table needed for this provider: \`${escapeHtml(
            e.message ?? '',
          )}\`.\n\nRun the latest \`supabase/migrations/*.sql\` files (in particular ` +
          '`0044_cryptobot_provider.sql`) on your Supabase project, then retry.',
        { parse_mode: 'Markdown', reply_markup: rootMenu() },
      );
      return;
    }
    if (isPaymentFlow && e?.code === '23514') {
      // check_violation — most likely the provider CHECK constraint
      // hasn't been widened yet to accept this provider value.
      await ctx.reply(
        '⚠️ *Provider not allowed by the database*\n\n' +
          'The Postgres CHECK constraint on `payment_methods.provider` rejected this row. ' +
          'Apply the latest payment-provider migration so the constraint includes the selected provider.',
        { parse_mode: 'Markdown', reply_markup: rootMenu() },
      );
      return;
    }
    if (isPaymentFlow) {
      const detail = e?.message ?? String(err);
      await ctx.reply(
        '⚠️ *Payment-method wizard failed*\n\n' +
          `\`\`\`\n${detail.slice(0, 500)}\n\`\`\`\n` +
          (e?.hint ? `_Hint: ${escapeHtml(e.hint)}_\n` : '') +
          '\nCheck the bot logs for the full stack trace.',
        { parse_mode: 'Markdown', reply_markup: rootMenu() },
      );
      return;
    }
    if (
      flow.type === 'supplier_api_add' ||
      flow.type === 'supplier_canboso_add' ||
      flow.type === 'supplier_reseller_add' ||
      flow.type === 'supplier_product_link_add'
    ) {
      if (isSupplierMigrationError(err)) {
        await ctx.reply(
          '⚠️ *Supplier APIs Not Ready*\n\n' +
            'Run `supabase/migrations/0037_supplier_apis.sql` and `0038_supplier_easy_import.sql` in Supabase SQL Editor, ' +
            'then try this setup again.',
          { parse_mode: 'Markdown', reply_markup: rootMenu() },
        );
        return;
      }
      const detail = e?.message ?? String(err);
      await ctx.reply(
        '⚠️ *Supplier setup failed*\n\n' +
          `\`\`\`\n${detail.slice(0, 700)}\n\`\`\`\n` +
          '\nFix the JSON/API details and retry.',
        { parse_mode: 'Markdown', reply_markup: rootMenu() },
      );
      return;
    }
    // Special-case the icon flow: distinguish "DB schema not migrated"
    // from "input wasn't recognised as an emoji" so the admin gets
    // actionable guidance instead of a generic hint.
    if (flow?.type === 'edit_payment_icon') {
      // Missing table / column / schema-cache miss → migration 0021
      // (`payment_methods_chrome.sql`) hasn't been applied (or the
      // PostgREST schema cache is stale). Tell the admin exactly
      // what to run instead of pretending the emoji input was wrong.
      if (e?.code === 'PGRST204' || e?.code === '42703' || e?.code === '42P01') {
        await ctx.reply(
          '⚠️ *Payment-methods schema not migrated*\n\n' +
            'The `payment_methods.emoji_id` / `emoji_unicode` columns are ' +
            'missing on your Supabase project. Apply ' +
            '`supabase/migrations/0021_payment_methods_chrome.sql`, then ' +
            'reload the API schema (Project Settings → API → Restart ' +
            'server, or run `select pg_notify(\'pgrst\', \'reload schema\');`) ' +
            'and retry.',
          { parse_mode: 'Markdown', reply_markup: rootMenu() },
        );
        return;
      }
      // Unknown DB error — keep the flow armed so the admin can
      // simply re-send the right input, but surface the real error
      // detail so they can self-diagnose (mirrors the promo-flow
      // handler above).
      ctx.session.adminFlow = flow;
      const detail = e?.message ?? String(err);
      await ctx.reply(
        '⚠️ Couldn\'t set that as the icon.\n\n' +
          `\`\`\`\n${detail.slice(0, 500)}\n\`\`\`\n` +
          (e?.hint ? `_Hint: ${escapeHtml(e.hint)}_\n` : '') +
          '\nSend a single emoji (or a *premium* custom emoji message), ' +
          '`clear` to reset, or `/cancel` to abort.',
        { parse_mode: 'Markdown' },
      );
      return;
    }
    await ctx.reply('⚠️ Something went wrong. Cancelled.', { reply_markup: rootMenu() });
    ctx.session.adminFlow = undefined;
  }
});

// -------- Per-product editor: file-based steps --------
//
// We listen for documents/photos/videos and dispatch only when an
// `edit_product_*_file` flow is armed. Anything else passes through
// to the next handler so other features (announcements, etc.) keep
// working unchanged.
adminBot.on('message:document', async (ctx, next) => {
  const flow = ctx.session.adminFlow;
  if (!flow) return next();
  if (!ctx.from || !(await isAdmin(ctx.from.id))) return next();
  const doc = ctx.message.document;
  if (flow.type === 'edit_product_tutorial_file') {
    await updateProduct(flow.data.product_id, {
      tutorial_file_id: doc.file_id,
      tutorial_file_type: 'document',
    });
    ctx.session.adminFlow = undefined;
    await ctx.reply('✅ Tutorial document saved.');
    return;
  }
  if (flow.type === 'add_product' && flow.step === 'items') {
    // .txt upload during the add-product wizard's items step.
    const isTxt =
      (doc.mime_type ?? '').toLowerCase().startsWith('text/') ||
      (doc.file_name ?? '').toLowerCase().endsWith('.txt');
    if (!isTxt) {
      await ctx.reply(
        '❌ Only `.txt` files are supported in this step. Re-upload as plain text.',
        { parse_mode: 'Markdown' },
      );
      return;
    }
    if ((doc.file_size ?? 0) > ITEMS_DOC_BYTE_CAP) {
      await ctx.reply(
        `❌ File is too large (${doc.file_size} bytes). Cap is ${ITEMS_DOC_BYTE_CAP} bytes — split it and try again.`,
      );
      return;
    }
    let raw: string;
    try {
      raw = await downloadTelegramDocumentAsText(ctx, doc.file_id);
    } catch (err) {
      logger.error({ err, file_id: doc.file_id }, 'add_product .txt download failed');
      await ctx.reply('❌ Could not download that file. Try again in a moment.');
      return;
    }
    const payloads = parsePayloadLines(raw);
    if (payloads.length === 0) {
      await ctx.reply('❌ The uploaded file had no non-empty lines.');
      return;
    }
    await finalizeProduct(ctx, flow.data, payloads);
    return;
  }
  if (flow.type === 'edit_product_items') {
    // Bulk-add: admin attached a `.txt` file. Sanity-check size +
    // mime, download via Bot API, parse one payload per line, and
    // append to the staging buffer. Errors stay friendly so the
    // admin can re-upload without losing any text they already
    // pasted.
    const isTxt =
      (doc.mime_type ?? '').toLowerCase().startsWith('text/') ||
      (doc.file_name ?? '').toLowerCase().endsWith('.txt');
    if (!isTxt) {
      await ctx.reply(
        '❌ Only `.txt` files are supported in this flow. Re-upload as plain text.',
        { parse_mode: 'Markdown' },
      );
      return;
    }
    if ((doc.file_size ?? 0) > ITEMS_DOC_BYTE_CAP) {
      await ctx.reply(
        `❌ File is too large (${doc.file_size} bytes). Cap is ${ITEMS_DOC_BYTE_CAP} bytes — split it and try again.`,
      );
      return;
    }
    let raw: string;
    try {
      raw = await downloadTelegramDocumentAsText(ctx, doc.file_id);
    } catch (err) {
      logger.error({ err, file_id: doc.file_id }, 'items .txt download failed');
      await ctx.reply('❌ Could not download that file. Try again in a moment.');
      return;
    }
    const payloads = parsePayloadLines(raw);
    if (payloads.length === 0) {
      await ctx.reply('❌ The uploaded file had no non-empty lines.');
      return;
    }
    const staged = flow.data.staged ?? [];
    const room = ITEMS_STAGING_CAP - staged.length;
    const accepted = payloads.slice(0, Math.max(0, room));
    flow.data.staged = staged.concat(accepted);
    const note =
      accepted.length < payloads.length
        ? `File capped at ${ITEMS_STAGING_CAP} — ${payloads.length - accepted.length} line(s) were dropped. Tap Confirm to flush, then re-upload the rest.`
        : `Imported ${accepted.length} line(s) from "${doc.file_name ?? 'upload.txt'}".`;
    await renderItemsStagingCard(ctx, flow, { lastDelta: accepted.length, note });
    return;
  }
  if (flow.type === 'edit_bot_tutorial_file') {
    await setBotTutorialField('file_id', doc.file_id, ctx.from.id);
    await setBotTutorialField('file_type', 'document', ctx.from.id);
    ctx.session.adminFlow = undefined;
    await ctx.reply('✅ Bot Tutorial document saved.');
    return;
  }
  if (flow.type === 'edit_payment_tutorial_file') {
    await setPaymentMethodTutorialField(
      flow.data.method_id,
      'file_id',
      doc.file_id,
      ctx.from.id,
    );
    await setPaymentMethodTutorialField(
      flow.data.method_id,
      'file_type',
      'document',
      ctx.from.id,
    );
    ctx.session.adminFlow = undefined;
    await ctx.reply(
      `✅ Tutorial document for method #${flow.data.method_id} saved.`,
    );
    return;
  }
  if (flow.type === 'edit_payment_icon') {
    await ctx.reply(
      '⚠️ That\'s a document, not an emoji.\n\n' +
        'Send a single emoji (or a *premium* custom emoji message). ' +
        'Type `clear` to reset to default, or `/cancel` to abort.',
      { parse_mode: 'Markdown' },
    );
    return;
  }
  return next();
});

adminBot.on('message:photo', async (ctx, next) => {
  const flow = ctx.session.adminFlow;
  if (!flow) return next();
  if (!ctx.from || !(await isAdmin(ctx.from.id))) return next();
  const photos = ctx.message.photo;
  // Telegram sends a sized array; the last entry is the largest. We
  // store the largest because the bot will re-send it directly and
  // Telegram resizes per-client anyway.
  const fileId = photos[photos.length - 1]?.file_id;
  if (!fileId) return next();
  if (flow.type === 'edit_product_tutorial_file') {
    await updateProduct(flow.data.product_id, {
      tutorial_file_id: fileId,
      tutorial_file_type: 'photo',
    });
    ctx.session.adminFlow = undefined;
    await ctx.reply('✅ Tutorial photo saved.');
    return;
  }
  if (flow.type === 'edit_bot_tutorial_file') {
    await setBotTutorialField('file_id', fileId, ctx.from.id);
    await setBotTutorialField('file_type', 'photo', ctx.from.id);
    ctx.session.adminFlow = undefined;
    await ctx.reply('✅ Bot Tutorial photo saved.');
    return;
  }
  if (flow.type === 'edit_payment_tutorial_file') {
    await setPaymentMethodTutorialField(
      flow.data.method_id,
      'file_id',
      fileId,
      ctx.from.id,
    );
    await setPaymentMethodTutorialField(
      flow.data.method_id,
      'file_type',
      'photo',
      ctx.from.id,
    );
    ctx.session.adminFlow = undefined;
    await ctx.reply(
      `✅ Tutorial photo for method #${flow.data.method_id} saved.`,
    );
    return;
  }
  if (flow.type === 'edit_payment_icon') {
    // Photos / images aren't valid Telegram emoji icons. Tell the
    // admin to send an actual emoji instead. Keep the flow armed so
    // they can retry without re-tapping the icon button.
    await ctx.reply(
      '⚠️ That looks like a photo, not an emoji.\n\n' +
        'Send a single emoji (or a *premium* custom emoji message) — ' +
        'photos / images / stickers can\'t be used as button icons.\n\n' +
        'Send `clear` to reset to the per-provider default, or `/cancel` to abort.',
      { parse_mode: 'Markdown' },
    );
    return;
  }
  return next();
});

// Stickers / animations aren't valid emoji icons either. Redirect
// the admin to send a plain emoji or premium custom emoji message.
adminBot.on('message:sticker', async (ctx, next) => {
  const flow = ctx.session.adminFlow;
  if (!flow) return next();
  if (!ctx.from || !(await isAdmin(ctx.from.id))) return next();
  if (flow.type === 'edit_payment_icon') {
    await ctx.reply(
      '⚠️ That\'s a sticker, not an emoji.\n\n' +
        'Send a single emoji (or a *premium* custom emoji message) — ' +
        'stickers can\'t be used as button icons.\n\n' +
        'Send `clear` to reset to the per-provider default, or `/cancel` to abort.',
      { parse_mode: 'Markdown' },
    );
    return;
  }
  return next();
});

adminBot.on('message:animation', async (ctx, next) => {
  const flow = ctx.session.adminFlow;
  if (!flow) return next();
  if (!ctx.from || !(await isAdmin(ctx.from.id))) return next();
  if (flow.type === 'edit_payment_icon') {
    await ctx.reply(
      '⚠️ That\'s an animation, not an emoji.\n\n' +
        'Send a single emoji (or a *premium* custom emoji message).',
      { parse_mode: 'Markdown' },
    );
    return;
  }
  return next();
});

adminBot.on('message:video', async (ctx, next) => {
  const flow = ctx.session.adminFlow;
  if (!flow) return next();
  if (!ctx.from || !(await isAdmin(ctx.from.id))) return next();
  const fileId = ctx.message.video.file_id;
  if (flow.type === 'edit_product_tutorial_file') {
    await updateProduct(flow.data.product_id, {
      tutorial_file_id: fileId,
      tutorial_file_type: 'video',
    });
    ctx.session.adminFlow = undefined;
    await ctx.reply('✅ Tutorial video saved.');
    return;
  }
  if (flow.type === 'edit_bot_tutorial_file') {
    await setBotTutorialField('file_id', fileId, ctx.from.id);
    await setBotTutorialField('file_type', 'video', ctx.from.id);
    ctx.session.adminFlow = undefined;
    await ctx.reply('✅ Bot Tutorial video saved.');
    return;
  }
  if (flow.type === 'edit_payment_tutorial_file') {
    await setPaymentMethodTutorialField(
      flow.data.method_id,
      'file_id',
      fileId,
      ctx.from.id,
    );
    await setPaymentMethodTutorialField(
      flow.data.method_id,
      'file_type',
      'video',
      ctx.from.id,
    );
    ctx.session.adminFlow = undefined;
    await ctx.reply(
      `✅ Tutorial video for method #${flow.data.method_id} saved.`,
    );
    return;
  }
  if (flow.type === 'edit_payment_icon') {
    await ctx.reply(
      '⚠️ That\'s a video, not an emoji.\n\n' +
        'Send a single emoji (or a *premium* custom emoji message). ' +
        'Type `clear` to reset to default, or `/cancel` to abort.',
      { parse_mode: 'Markdown' },
    );
    return;
  }
  return next();
});

// Belt-and-braces catch-all for any *other* message type (voice,
// video_note, audio, dice, poll, contact, location, venue, game…)
// while the admin is in the edit_payment_icon flow. Without this,
// a stray message would fall through every specific handler, hit
// no branch, and bubble up to the generic "Something went wrong.
// Cancelled." reply at the bottom of the text-message handler —
// which is the exact bug the user reported. This handler keeps the
// flow armed so the admin can simply re-send the correct emoji.
adminBot.on('message', async (ctx, next) => {
  const flow = ctx.session.adminFlow;
  if (flow?.type !== 'edit_payment_icon') return next();
  if (!ctx.from || !(await isAdmin(ctx.from.id))) return next();
  // Plain text messages have already been routed by the dedicated
  // text handler above (which knows how to validate and persist a
  // single emoji or a custom-emoji entity). Anything else lands here
  // and gets the polite retry hint.
  if ('text' in ctx.message && ctx.message.text) return next();
  await ctx.reply(
    '⚠️ That message isn\'t an emoji.\n\n' +
      'Send a single emoji (or a *premium* custom emoji message). ' +
      'Type `clear` to reset to default, or `/cancel` to abort.',
    { parse_mode: 'Markdown' },
  );
});

// "Skip" buttons for optional product fields
adminBot.callbackQuery('adm:cat:skip_emoji', async (ctx) => {
  const flow = ctx.session.adminFlow;
  if (flow?.type !== 'add_category' || flow.step !== 'emoji') {
    await ctx.answerCallbackQuery({ text: 'Stale flow' });
    return;
  }
  const cat = await addCategory(flow.data.name);
  ctx.session.adminFlow = undefined;
  cache.del('cats');
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`✅ Category *${cat.name}* added (id=${cat.id}).`, {
    parse_mode: 'Markdown',
    reply_markup: rootMenu(),
  });
});

// "Unlimited?" buttons fired during the product creation flow,
// right after the user enters the price. Yes → stock=0 + unlimited=true.
// No → continue to the integer stock prompt.
adminBot.callbackQuery('adm:prod:unl:yes', async (ctx) => {
  const flow = ctx.session.adminFlow;
  if (flow?.type !== 'add_product' || flow.step !== 'unlimited') {
    await ctx.answerCallbackQuery({ text: 'Stale flow' });
    return;
  }
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = {
    type: 'add_product',
    step: 'warranty',
    data: { ...flow.data, stock: 0, unlimited: true },
  };
  const kb = new InlineKeyboard().text('Skip', 'adm:prod:skip:warranty');
  await ctx.reply('♾ Stock set to *Unlimited*.\n\nSend the *warranty* text (or tap Skip).', {
    parse_mode: 'Markdown',
    reply_markup: kb,
  });
});

adminBot.callbackQuery('adm:prod:unl:no', async (ctx) => {
  const flow = ctx.session.adminFlow;
  if (flow?.type !== 'add_product' || flow.step !== 'unlimited') {
    await ctx.answerCallbackQuery({ text: 'Stale flow' });
    return;
  }
  await ctx.answerCallbackQuery();
  ctx.session.adminFlow = {
    type: 'add_product',
    step: 'stock',
    data: { ...flow.data },
  };
  await ctx.reply('Send the *stock* quantity (integer ≥ 0).', { parse_mode: 'Markdown' });
});

adminBot.callbackQuery(/^adm:prod:skip:(warranty|description|note|items)$/, async (ctx) => {
  const which = ctx.match[1] as 'warranty' | 'description' | 'note' | 'items';
  const flow = ctx.session.adminFlow;
  if (flow?.type !== 'add_product') {
    await ctx.answerCallbackQuery({ text: 'Stale flow' });
    return;
  }
  await ctx.answerCallbackQuery();
  if (which === 'warranty' && flow.step === 'warranty') {
    ctx.session.adminFlow = {
      type: 'add_product',
      step: 'description',
      data: flow.data,
    };
    const kb = new InlineKeyboard().text('Skip', 'adm:prod:skip:description');
    await ctx.reply('Send the *description* (or Skip).', {
      parse_mode: 'Markdown',
      reply_markup: kb,
    });
  } else if (which === 'description' && flow.step === 'description') {
    ctx.session.adminFlow = {
      type: 'add_product',
      step: 'note',
      data: flow.data,
    };
    const kb = new InlineKeyboard().text('Skip', 'adm:prod:skip:note');
    await ctx.reply(
      'Send the *View Note* text shown when buyer taps 📝 View Note (or Skip).',
      { parse_mode: 'Markdown', reply_markup: kb },
    );
  } else if (which === 'note' && flow.step === 'note') {
    ctx.session.adminFlow = {
      type: 'add_product',
      step: 'items',
      data: flow.data,
    };
    const kb = new InlineKeyboard().text('Skip', 'adm:prod:skip:items');
    await ctx.reply(
      [
        '📦 *Send the deliverables (items pool)* — one payload per line.',
        'These are the actual things buyers receive (acc emails+passwords, links, codes, etc).',
        '',
        'Or tap *Skip* to leave the pool empty (you can add items later from the Edit screen).',
      ].join('\n'),
      { parse_mode: 'Markdown', reply_markup: kb },
    );
  } else if (which === 'items' && flow.step === 'items') {
    await finalizeProduct(ctx, flow.data, []);
  }
});

async function finalizeProduct(
  ctx: AppCtx,
  data: {
    category_id: number;
    name: string;
    price: number;
    stock: number;
    unlimited?: boolean;
    warranty?: string;
    description?: string;
    note?: string;
  },
  items: string[] = [],
): Promise<void> {
  const { unlimited, ...payload } = data;
  const product = await addProduct(payload);
  // If admin chose "Unlimited" earlier, persist the flag now that we
  // have a product id. addProduct() doesn't know about the new
  // column, so we do this as a follow-up update — graceful no-op
  // when migration 0015 isn't applied (updateProduct will just throw
  // and we log/swallow).
  if (unlimited === true) {
    try {
      await updateProduct(product.id, { unlimited_stock: true });
    } catch (err) {
      logger.error({ err, product_id: product.id }, 'set unlimited_stock on create failed');
    }
  }
  if (items.length > 0) {
    try {
      await addProductItems(product.id, items);
      await autoFulfillPreordersAfterRestock(ctx, product.id);
      await notifyPublicStockAdded(ctx, product.id, items.length);
    } catch (err) {
      logger.error({ err, product_id: product.id }, 'addProductItems on create failed');
    }
  }
  ctx.session.adminFlow = undefined;
  cache.del('cats');
  const stockBlurb = unlimited
    ? 'stock ∞'
    : `stock ${product.stock}`;
  await ctx.reply(
    [
      `✅ Product *${product.name}* added (id=${product.id}, $${product.price}, ${stockBlurb}).`,
      items.length > 0 ? `📦 ${items.length} items added to the pool.` : null,
      '',
      `_Tap_ ✏️ Edit #${product.id} _on the product list to add a premium emoji, view-note file, tutorial, or more items._`,
    ]
      .filter((s) => s !== null)
      .join('\n'),
    { parse_mode: 'Markdown', reply_markup: rootMenu() },
  );
}

// ============================================================
// Legacy slash commands (still supported for power users).
// ============================================================
adminBot.command('settext', async (ctx) => {
  const [, key, ...rest] = (ctx.message?.text ?? '').split(/\s+/);
  const value = rest.join(' ');
  if (!key || !value) {
    await ctx.reply('Usage: /settext <key> <text...>');
    return;
  }
  await setText(key, value, ctx.from!.id);
  await ctx.reply(`✅ Text \`${key}\` updated.`, { parse_mode: 'Markdown' });
});

adminBot.command('setcolor', async (ctx) => {
  const [, key, modeRaw] = (ctx.message?.text ?? '').split(/\s+/);
  if (!key || !modeRaw) {
    await ctx.reply('Usage: /setcolor <key> <none|blue|green|red|yellow>');
    return;
  }
  const mode = modeRaw as ColorMode;
  if (!(mode in COLOR_PREFIX)) {
    await ctx.reply(`Unknown color "${modeRaw}". Allowed: ${Object.keys(COLOR_PREFIX).join(', ')}`);
    return;
  }
  await setColor(key, mode, ctx.from!.id);
  await ctx.reply(`✅ Color for \`${key}\` set to *${mode}*.`, { parse_mode: 'Markdown' });
});

adminBot.command('setemoji', async (ctx) => {
  const [, key, unicode, customId] = (ctx.message?.text ?? '').split(/\s+/);
  if (!key || !unicode) {
    await ctx.reply('Usage: /setemoji <key> <unicode> [custom_emoji_id]');
    return;
  }
  await setEmoji(key, unicode, customId, ctx.from!.id);
  await ctx.reply(`✅ Emoji \`${key}\` updated.`, { parse_mode: 'Markdown' });
});

// ---------------------------------------------------------------------------
//  Premium-shop overhaul: per-product asset commands.
//
//  Each command operates on a single product id. Replying *to* the
//  admin's own message that contains a photo / video / document
//  swaps the slash-command target into the replied-to file, so the
//  admin can drag-drop a file into Telegram and run the command in
//  the same chat without copy-pasting file_ids.
// ---------------------------------------------------------------------------

function readPremiumEmojiFromMessage(
  ctx: AppCtx,
): { unicode: string; custom_emoji_id: string } | null {
  // Admin replies to a message containing a single premium emoji.
  // We grab the first `custom_emoji` entity and snapshot its unicode
  // fallback (one grapheme cluster from the entity range).
  const reply = ctx.message?.reply_to_message;
  if (!reply) return null;
  const text = reply.text ?? reply.caption ?? '';
  const entities = reply.entities ?? reply.caption_entities ?? [];
  const entity = entities.find(
    (e) => e.type === 'custom_emoji' && 'custom_emoji_id' in e,
  ) as { offset: number; length: number; custom_emoji_id: string } | undefined;
  if (!entity) return null;
  const unicode = text
    .substring(entity.offset, entity.offset + entity.length)
    .trim();
  if (!unicode) return null;
  return { unicode, custom_emoji_id: entity.custom_emoji_id };
}

adminBot.command('setproductemoji', async (ctx) => {
  // Usage: /setproductemoji <id> [<unicode> <custom_emoji_id>]
  // Or: reply to a premium-emoji message with `/setproductemoji <id>`.
  const parts = (ctx.message?.text ?? '').split(/\s+/);
  const id = Number(parts[1]);
  if (!Number.isFinite(id)) {
    await ctx.reply('Usage: /setproductemoji <id> [<unicode> <custom_emoji_id>]');
    return;
  }
  let customId: string | null = null;
  if (parts[2] && parts[3]) {
    customId = parts[3]!;
  } else {
    const fromReply = readPremiumEmojiFromMessage(ctx);
    if (fromReply) customId = fromReply.custom_emoji_id;
  }
  if (!customId) {
    await ctx.reply(
      'Reply to a single premium-emoji message with `/setproductemoji <id>`, or pass the id directly.',
      { parse_mode: 'Markdown' },
    );
    return;
  }
  await updateProduct(id, { emoji_id: customId });
  await ctx.reply(`✅ Product #${id} emoji_id set.`);
});

adminBot.command('clearproductemoji', async (ctx) => {
  const id = Number((ctx.message?.text ?? '').split(/\s+/)[1]);
  if (!Number.isFinite(id)) {
    await ctx.reply('Usage: /clearproductemoji <id>');
    return;
  }
  await updateProduct(id, { emoji_id: null });
  await ctx.reply(`🧹 Product #${id} emoji_id cleared.`);
});

adminBot.command('setproductunlimited', async (ctx) => {
  // Usage: /setproductunlimited <id> on|off
  const parts = (ctx.message?.text ?? '').split(/\s+/);
  const id = Number(parts[1]);
  const flag = parts[2]?.toLowerCase();
  if (!Number.isFinite(id) || (flag !== 'on' && flag !== 'off')) {
    await ctx.reply('Usage: /setproductunlimited <id> on|off');
    return;
  }
  await updateProduct(id, { unlimited_stock: flag === 'on' });
  await ctx.reply(`✅ Product #${id} unlimited_stock = ${flag.toUpperCase()}.`);
});

adminBot.command('setproducttutorial', async (ctx) => {
  // Usage variants:
  //   /setproducttutorial <id> text <body...>
  //   /setproducttutorial <id> url <https://...>
  //   /setproducttutorial <id> clear
  //   reply to photo/video/doc with: /setproducttutorial <id> file
  const text = ctx.message?.text ?? '';
  const m = text.match(/^\/setproducttutorial(?:@\S+)?\s+(\d+)\s+(text|url|file|clear)\s*([\s\S]*)$/);
  if (!m) {
    await ctx.reply(
      'Usage:\n' +
        '`/setproducttutorial <id> text <body>`\n' +
        '`/setproducttutorial <id> url <https://...>`\n' +
        '`/setproducttutorial <id> file` (reply to photo/video/document)\n' +
        '`/setproducttutorial <id> clear`',
      { parse_mode: 'Markdown' },
    );
    return;
  }
  const id = Number(m[1]);
  const action = m[2];
  const value = m[3]?.trim() ?? '';
  if (action === 'text') {
    await updateProduct(id, { tutorial_text: value || null });
    await ctx.reply(`✅ Product #${id} tutorial text saved.`);
    return;
  }
  if (action === 'url') {
    await updateProduct(id, { tutorial_url: value || null });
    await ctx.reply(`✅ Product #${id} tutorial url saved.`);
    return;
  }
  if (action === 'clear') {
    await updateProduct(id, {
      tutorial_text: null,
      tutorial_file_id: null,
      tutorial_file_type: null,
      tutorial_url: null,
    });
    await ctx.reply(`🧹 Product #${id} tutorial wiped.`);
    return;
  }
  // file
  const reply = ctx.message?.reply_to_message;
  let file_id: string | undefined;
  let file_type: 'photo' | 'video' | 'document' | undefined;
  if (reply?.photo && reply.photo.length > 0) {
    file_id = reply.photo[reply.photo.length - 1]!.file_id;
    file_type = 'photo';
  } else if (reply?.video) {
    file_id = reply.video.file_id;
    file_type = 'video';
  } else if (reply?.document) {
    file_id = reply.document.file_id;
    file_type = 'document';
  }
  if (!file_id || !file_type) {
    await ctx.reply('Reply to a photo, video, or document message with this command.');
    return;
  }
  await updateProduct(id, {
    tutorial_file_id: file_id,
    tutorial_file_type: file_type,
  });
  await ctx.reply(`✅ Product #${id} tutorial ${file_type} saved.`);
});

adminBot.command('addproductitems', async (ctx) => {
  // Usage: /addproductitems <id>
  // Then reply to a message containing newline-separated payloads,
  // OR include them after the id in the same message body.
  const text = ctx.message?.text ?? '';
  const m = text.match(/^\/addproductitems(?:@\S+)?\s+(\d+)\s*([\s\S]*)$/);
  if (!m) {
    await ctx.reply(
      'Usage: /addproductitems <id>\nThen include payloads on subsequent lines, or reply to a message containing them.',
    );
    return;
  }
  const id = Number(m[1]);
  let body = (m[2] ?? '').trim();
  if (!body && ctx.message?.reply_to_message) {
    body = (ctx.message.reply_to_message.text ?? ctx.message.reply_to_message.caption ?? '').trim();
  }
  if (!body) {
    await ctx.reply('No payloads found. Either include them after the id or reply to a message with one payload per line.');
    return;
  }
  const payloads = body
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (payloads.length === 0) {
    await ctx.reply('No payloads found.');
    return;
  }
  const inserted = await addProductItems(id, payloads);
  await autoFulfillPreordersAfterRestock(ctx, id);
  await notifyPublicStockAdded(ctx, id, inserted);
  const remaining = await countAvailableProductItems(id);
  await ctx.reply(`✅ Added ${inserted} items to product #${id}. Pool now has ${remaining} unconsumed.`);
});

adminBot.command('countproductitems', async (ctx) => {
  const id = Number((ctx.message?.text ?? '').split(/\s+/)[1]);
  if (!Number.isFinite(id)) {
    await ctx.reply('Usage: /countproductitems <id>');
    return;
  }
  const remaining = await countAvailableProductItems(id);
  await ctx.reply(`Product #${id}: ${remaining} unconsumed item(s).`);
});

adminBot.command('clearproductitems', async (ctx) => {
  const id = Number((ctx.message?.text ?? '').split(/\s+/)[1]);
  if (!Number.isFinite(id)) {
    await ctx.reply('Usage: /clearproductitems <id>');
    return;
  }
  await clearProductItems(id);
  await ctx.reply(`🧹 Product #${id}: all items wiped.`);
});

// ---- Bot Tutorial (Settings) ----
adminBot.command('setbottutorial', async (ctx) => {
  // /setbottutorial text <body>
  // /setbottutorial url <https://...>
  // /setbottutorial file (reply to photo/video/document)
  // /setbottutorial clear
  const text = ctx.message?.text ?? '';
  const m = text.match(/^\/setbottutorial(?:@\S+)?\s+(text|url|file|clear)\s*([\s\S]*)$/);
  if (!m) {
    await ctx.reply(
      'Usage:\n' +
        '`/setbottutorial text <body>`\n' +
        '`/setbottutorial url <https://...>`\n' +
        '`/setbottutorial file` (reply to a photo/video/document)\n' +
        '`/setbottutorial clear`',
      { parse_mode: 'Markdown' },
    );
    return;
  }
  const action = m[1];
  const value = m[2]?.trim() ?? '';
  const adminId = ctx.from!.id;
  if (action === 'text') {
    await setBotTutorialField('text', value || null, adminId);
    await ctx.reply('✅ Bot Tutorial text saved.');
    return;
  }
  if (action === 'url') {
    await setBotTutorialField('url', value || null, adminId);
    await ctx.reply('✅ Bot Tutorial URL saved.');
    return;
  }
  if (action === 'clear') {
    await setBotTutorialField('text', null, adminId);
    await setBotTutorialField('file_id', null, adminId);
    await setBotTutorialField('file_type', null, adminId);
    await setBotTutorialField('url', null, adminId);
    await ctx.reply('🧹 Bot Tutorial wiped.');
    return;
  }
  // file
  const reply = ctx.message?.reply_to_message;
  let file_id: string | undefined;
  let file_type: NonNullable<BotTutorial['file_type']> | undefined;
  if (reply?.photo && reply.photo.length > 0) {
    file_id = reply.photo[reply.photo.length - 1]!.file_id;
    file_type = 'photo';
  } else if (reply?.video) {
    file_id = reply.video.file_id;
    file_type = 'video';
  } else if (reply?.document) {
    file_id = reply.document.file_id;
    file_type = 'document';
  }
  if (!file_id || !file_type) {
    await ctx.reply('Reply to a photo, video, or document message with /setbottutorial file.');
    return;
  }
  await setBotTutorialField('file_id', file_id, adminId);
  await setBotTutorialField('file_type', file_type, adminId);
  await ctx.reply(`✅ Bot Tutorial ${file_type} saved.`);
});

adminBot.command('showbottutorial', async (ctx) => {
  const tut = getBotTutorial();
  await ctx.reply(
    [
      '*Bot Tutorial:*',
      `Text: ${tut.text ? '`set`' : '_unset_'}`,
      `File: ${tut.file_id ? `\`${tut.file_type}\`` : '_unset_'}`,
      `URL: ${tut.url ? `\`${tut.url}\`` : '_unset_'}`,
    ].join('\n'),
    { parse_mode: 'Markdown' },
  );
});

adminBot.command('clearcache', async (ctx) => {
  cache.clearAll();
  await ctx.reply('🧹 Cache cleared.');
});

adminBot.command('reload', async (ctx) => {
  await refreshSettings();
  cache.clearAll();
  await ctx.reply('🔁 Settings reloaded.');
});

// Diagnostic: show whether the welcome / change / delete emails will
// actually leave the bot. Useful when "no emails are arriving" — it
// answers the first question (transport configured?) without
// requiring shell access to the Railway env vars.
adminBot.command('mailerstatus', async (ctx) => {
  const status = describeMailerStatus();
  await ctx.reply(`📬 *Mailer status*\n\n\`\`\`\n${status}\n\`\`\``, {
    parse_mode: 'Markdown',
  });
});

// Diagnostic: send a real "set"-mode welcome email to the admin's
// chosen address so they can verify the transport / domain / DNS
// end-to-end. Usage: /testemail you@example.com [set|change|delete]
adminBot.command('testemail', async (ctx) => {
  const [, target, modeRaw] = (ctx.message?.text ?? '').split(/\s+/);
  if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
    await ctx.reply('Usage: /testemail <email> [set|change|delete]');
    return;
  }
  const mode = (modeRaw === 'change' || modeRaw === 'delete' ? modeRaw : 'set') as
    | 'set'
    | 'change'
    | 'delete';
  await ctx.reply(`Sending ${mode} test email to ${target}…`);
  const ok = await sendWelcomeEmail({
    email: target,
    previousEmail: mode === 'change' || mode === 'delete' ? target : null,
    firstName: ctx.from?.first_name ?? null,
    username: ctx.from?.username ?? null,
    mode,
  });
  await ctx.reply(
    ok
      ? `✅ Sent. Check ${target}'s inbox (and spam). If nothing arrives, run /mailerstatus and check the bot logs for the Resend / SMTP error.`
      : `❌ Send failed. Run /mailerstatus and check the logs — usually missing RESEND_API_KEY or unverified domain.`,
  );
});
