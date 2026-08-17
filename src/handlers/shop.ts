import type { Composer } from 'grammy';
import { InlineKeyboard, InputFile } from 'grammy';
import {
  LOCALES,
  PRODUCTS_PER_PAGE,
  QTY_MAX,
  QTY_MIN,
  type Lang,
} from '../../config/index.js';
import { formatPriceWithCurrency } from '../../config/currencies.js';
import {
  createOrder,
  releaseProductItemsForOrder,
  reserveProductStock,
  commitStockReservation,
  releaseStockReservation,
  beginOrderDelivery,
  finishOrderDelivery,
  type StockReservation,
  getProduct,
  getOrder,
  getUserShopGroupMode,
  getUserShopListMode,
  getUserShopSortMode,
  setUserShopSortMode,
  listFavoriteProductIds,
  listFavoriteProducts,
  toggleFavorite,
  isFavorite,
  InsufficientReferralBalanceError,
  listCategories,
  listActiveProducts,
  claimProductItems,
  spendReferralBalance,
  setOrderDeliveredItems,
  markOrderLifecycleSafe,
} from '../db/queries.js';
import { supabase } from '../db/supabase.js';
import {
  applyUserPriceToProduct,
  applyUserPriceToProducts,
} from '../services/pricing.js';
import {
  nextPromoTeaser,
  nextPromoTier,
  priceBreakdown,
  resolvePromo,
  type PromoMatch,
} from '../services/promo.js';
import type { DBProduct, DBPromo } from '../types.js';
import { charge } from '../services/wallet.js';
import { refundWalletOnce } from '../db/repositories/wallet.js';
import {
  paymentMethodKeyboard,
  searchPromptKeyboard,
  sortMenuKeyboard,
  productVariantPage,
  productVariantKeyboard,
  productKeyboard,
  qtyKeypadKeyboard,
  type ShopProductRow,
  shopProductsKeyboard,
  shopHomeBackKeyboard,
} from '../keyboards/shop.js';
import { inlineBtn } from '../keyboards/helpers.js';
import type { AppCtx } from '../middleware/user.js';
import { clearTransientFlowState } from '../ui/flowState.js';
import {
  clampForTelegram,
  escapeAttr,
  htmlToPlain,
  renderHtmlTemplate,
  renderMdHtml,
  sanitizeButtonUrl,
  stripCustomEmojiTags,
} from '../services/premium.js';
import { env } from '../env.js';
import { publicOrderId } from '../services/orderId.js';
import { buildOrderDeliveredChunks } from '../services/orderRender.js';
import { trySupplierAutoOrder } from '../services/supplierApi.js';
import * as adminLog from '../services/adminLog.js';
import { renderScreen } from '../ui/screen.js';
import {
  badgeStrip,
  discountPercent,
  featureLines,
  hasInstantDelivery,
  isInStock,
  paginate,
  parseSortMode,
  searchProducts,
  sortProducts,
  SORT_EMOJI,
  type SortMode,
} from '../services/catalog.js';
import { logger } from '../logger.js';
import { sendInvoiceEmail } from '../services/mailer.js';
import { t as translate } from '../i18n/index.js';
import {
  handleDeliveryFormMessage,
  maybeStartDeliveryFormForCtx,
  productHasDeliveryForm,
  startEditDelivery,
} from '../services/postPurchaseDelivery.js';

/**
 * Top-level Shop home — paginated all-products list. The categories
 * step has been removed per UX request: tapping the Shop button
 * now drops the user directly onto this screen with the bold
 * `Available Products:` header and a Prev / Refresh / Next / Back
 * footer.
 */
function categoryCanGroup(name: string): boolean {
  return /\b(all|plans?|subscription|bundle|variants?|section)\b/i.test(name);
}

function buildShopRows(
  products: DBProduct[],
  categories: Array<{ id: number; name: string; emoji: string | null }>,
  grouped = true,
): ShopProductRow[] {
  if (!grouped) return products.map((product) => ({ kind: 'product', product }));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const byCat = new Map<number, DBProduct[]>();
  for (const p of products) {
    if (p.category_id == null) continue;
    const list = byCat.get(p.category_id) ?? [];
    list.push(p);
    byCat.set(p.category_id, list);
  }
  const groupedCats = new Set<number>();
  for (const [catId, rows] of byCat) {
    const cat = catById.get(catId);
    if (cat && rows.length >= 2 && categoryCanGroup(cat.name)) groupedCats.add(catId);
  }

  const out: ShopProductRow[] = [];
  for (const p of products) {
    if (p.category_id != null && groupedCats.has(p.category_id)) {
      if (out.some((row) => row.kind === 'group' && row.category_id === p.category_id)) continue;
      const cat = catById.get(p.category_id);
      const rows = byCat.get(p.category_id) ?? [];
      const inStockRows = rows.filter((row) => row.unlimited_stock || row.stock > 0);
      out.push({
        kind: 'group',
        category_id: p.category_id,
        name: cat?.name ?? p.name,
        emoji: cat?.emoji ?? p.emoji,
        count: rows.length,
        stock: rows.reduce((sum, row) => sum + (row.unlimited_stock ? 0 : Math.max(0, row.stock)), 0),
        unlimited_stock: rows.some((row) => row.unlimited_stock),
        min_price: Math.min(...rows.map((row) => Number(row.price))),
        in_stock: inStockRows.length > 0,
      });
      continue;
    }
    out.push({ kind: 'product', product: p });
  }
  return out;
}

/**
 * Marketplace home. One code path renders three surfaces — the full
 * catalog, a 🔍 search result set and the ⭐ favorites list — so
 * typography, badges, pagination and the toolbar are identical on all
 * three.
 */
export async function showShopHome(
  ctx: AppCtx,
  page = 0,
  opts: { source?: 'catalog' | 'favorites' } = {},
) {
  const source = opts.source ?? 'catalog';
  const query = source === 'catalog' ? (ctx.session.shopSearch ?? '').trim() : '';
  const rawRows =
    source === 'favorites'
      ? await listFavoriteProducts(ctx.user.telegram_id)
      : (await listActiveProducts(0, 10000)).rows;
  // Layer per-user price overrides onto the catalog rows before we
  // build the keyboard so the price embedded in each button label
  // matches what the user will actually be charged.
  const priced = await applyUserPriceToProducts(ctx.user.telegram_id, rawRows);
  const favoriteIds = new Set(await listFavoriteProductIds(ctx.user.telegram_id));

  if (source === 'favorites' && priced.length === 0) {
    await renderScreen(ctx, renderMdHtml(ctx.t('shop.favorites.empty')), {
      keyboard: shopHomeBackKeyboard(ctx.lang),
      screen: 'shop.favorites.empty',
    });
    return;
  }
  if (source === 'catalog' && priced.length === 0) {
    await renderScreen(ctx, renderMdHtml(ctx.t('shop.empty_products')), {
      screen: 'shop.empty_products',
    });
    return;
  }

  const sortMode: SortMode = parseSortMode(await getUserShopSortMode(ctx.user.telegram_id));
  const matched = query ? searchProducts(priced, query) : priced;
  if (query && matched.length === 0) {
    await renderScreen(ctx, renderMdHtml(ctx.t('shop.search.empty', { query })), {
      keyboard: searchPromptKeyboard(ctx.lang, true),
      screen: 'shop.search.empty',
    });
    return;
  }
  const rows = sortProducts(matched, sortMode);

  const categories = await listCategories();
  const [listMode, groupMode] = await Promise.all([
    getUserShopListMode(ctx.user.telegram_id),
    getUserShopGroupMode(ctx.user.telegram_id),
  ]);
  // Search results and favorites are always a flat list — grouping
  // would hide the very rows the user asked for.
  const grouped = groupMode === 'grouped' && !query && source === 'catalog';
  const shopRows = buildShopRows(rows, categories, grouped);
  const allMode = listMode === 'all';
  const paged = paginate(shopRows, page, PRODUCTS_PER_PAGE);
  const pageRows = allMode ? shopRows.slice(0, 95) : paged.rows;

  const headerParams = {
    total: paged.total,
    page: paged.page + 1,
    pages: paged.totalPages,
    query,
  };
  const headerKey =
    source === 'favorites'
      ? 'shop.favorites.header'
      : query
        ? 'shop.search.header'
        : 'shop.home.header.professional';
  const html = renderMdHtml(ctx.t(headerKey, headerParams));
  const kb = shopProductsKeyboard(
    ctx.lang,
    pageRows,
    paged.page,
    paged.totalPages,
    ctx.user.currency ?? 'USDT',
    {
      allMode,
      favoriteIds,
      toolbar: true,
      searchActive: Boolean(query),
      pagePrefix: source === 'favorites' ? 'fav:p' : 'shop:p',
      backCallback: source === 'favorites' ? 'shop:home' : 'main:open',
    },
  );
  await renderScreen(ctx, html, { keyboard: kb, screen: `shop.home.${source}` });
}

/** ⭐ Favorites list — same rendering contract as the catalog. */
export async function showFavorites(ctx: AppCtx, page = 0): Promise<void> {
  await showShopHome(ctx, page, { source: 'favorites' });
}

function escapeHtmlLocal(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function showProductGroup(ctx: AppCtx, categoryId: number, page = 0): Promise<void> {
  const [categories, { rows: rawRows }] = await Promise.all([
    listCategories(),
    listActiveProducts(0, 10000),
  ]);
  const category = categories.find((c) => c.id === categoryId) ?? null;
  const filtered = rawRows.filter((p) => p.category_id === categoryId);
  if (!category || filtered.length === 0) {
    const empty = renderMdHtml(ctx.t('shop.empty_products'));
    await renderScreen(ctx, empty, { screen: 'shop.empty_products' });
    return;
  }
  const rows = (await applyUserPriceToProducts(ctx.user.telegram_id, filtered)).sort((a, b) => {
    const aInStock = a.unlimited_stock || a.stock > 0;
    const bInStock = b.unlimited_stock || b.stock > 0;
    if (aInStock !== bInStock) return aInStock ? -1 : 1;
    return (a.sort_order ?? a.id) - (b.sort_order ?? b.id);
  });
  const pageData = productVariantPage(rows, page);
  const html = `<b>${escapeHtmlLocal(category.name)}</b>\n\nChoose a variant:`;
  const premiumOpts = {
    parse_mode: 'HTML',
    reply_markup: productVariantKeyboard(ctx.lang, pageData.rows, ctx.user.currency ?? 'USDT', {
      categoryId,
      page: pageData.page,
      totalPages: pageData.totalPages,
    }),
  } as const;
  const plainOpts = {
    parse_mode: 'HTML',
    reply_markup: productVariantKeyboard(ctx.lang, pageData.rows, ctx.user.currency ?? 'USDT', {
      categoryId,
      page: pageData.page,
      totalPages: pageData.totalPages,
      icons: false,
    }),
  } as const;
  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(html, premiumOpts);
    } catch (err) {
      logger.warn({ err, categoryId }, 'grouped list premium keyboard failed; retrying plain');
      await ctx.reply(html, plainOpts);
    }
  } else {
    try {
      await ctx.reply(html, premiumOpts);
    } catch (err) {
      logger.warn({ err, categoryId }, 'grouped list premium keyboard reply failed; retrying plain');
      await ctx.reply(html, plainOpts);
    }
  }
}

const STORED_HTML_RX =
  /<tg-emoji\b|<a\b[^>]*href="[^"]*"[^>]*>[\s\S]*<\/a>|<(b|blockquote|code|del|em|i|pre|s|span|strong|tg-spoiler|u)\b[^>]*>[\s\S]*<\/\1>/i;

function renderStoredProductText(raw: string | null | undefined, fallbackMarkdown: string): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return renderMdHtml(fallbackMarkdown);
  return STORED_HTML_RX.test(trimmed)
    ? renderHtmlTemplate(trimmed)
    : renderMdHtml(trimmed);
}

/**
 * Render the new product detail body — product emoji + name on
 * line 1, then a blank line, then a stack of premium-emoji-prefixed
 * facts (Price Base / Available Stock / Warranty), a blank line,
 * then the live "Selected Qty / Total Amount / Wallet" trio that
 * updates whenever the user changes the qty.
 *
 * Each `{prod_*}` token in the locale strings resolves to a
 * `<tg-emoji>` tag at render time so premium subscribers see the
 * animated glyph. Bot-owner-supplied custom_emoji_id values live in
 * the EMOJI map in `config/index.ts`.
 */
function productPageText(
  ctx: AppCtx,
  p: NonNullable<Awaited<ReturnType<typeof getProduct>>>,
  qty: number,
  promo: PromoMatch | null = null,
  teaser: DBPromo | null = null,
) {
  const { gross, discount, total } = priceBreakdown(p.price, qty, promo);
  const eligible = !!promo && discount > 0;
  const inStock = isInStock(p);
  const stockLabel = p.unlimited_stock ? '∞' : String(Math.max(0, p.stock));
  const lines: string[] = [];

  // 1) 🛍️ Heading + badge strip (🔥 ⭐ 🆕 💎 🏆 🏷️), all data-driven.
  lines.push(ctx.t('shop.product.heading', { name: p.name }));
  const badges = badgeStrip(p);
  if (badges) lines.push(ctx.t('shop.product.badges', { badges }));

  // 2) 💰 Price / 📦 Stock block.
  lines.push('');
  const percent = discountPercent(p);
  if (percent > 0 && p.compare_at_price) {
    lines.push(
      ctx.t('shop.product.price.discounted', {
        price: formatPriceWithCurrency(p.price, ctx.user.currency),
        was: formatPriceWithCurrency(Number(p.compare_at_price), ctx.user.currency),
        percent,
      }),
    );
  } else {
    lines.push(
      ctx.t('shop.product.price', {
        price: formatPriceWithCurrency(p.price, ctx.user.currency),
      }),
    );
  }
  lines.push(
    inStock
      ? ctx.t('shop.product.stock', { stock: stockLabel })
      : ctx.t('shop.product.stock.out'),
  );
  lines.push(ctx.t('shop.product.line.warranty', { warranty: p.warranty ?? '—' }));

  // 3) ✨ Features — sourced from the product row, never hardcoded.
  const features = featureLines(p);
  if (features.length > 0) {
    lines.push('', ctx.t('shop.product.features.title'));
    for (const feature of features) {
      lines.push(ctx.t('shop.product.feature', { feature }));
    }
  }

  // 4) ⚡ Delivery promise.
  lines.push(
    '',
    hasInstantDelivery(p)
      ? ctx.t('shop.product.instant_delivery')
      : ctx.t('shop.product.manual_delivery'),
  );

  if (!inStock) {
    lines.push(ctx.t('shop.product.line.preorder_notice'));
  }

  // 5) Promo teaser (unchanged rules — multi-tier aware).
  const teaserTier = teaser ? nextPromoTier(teaser, qty) : null;
  const teaserBeats = teaserTier
    ? Math.min(p.price, Number(teaserTier.unit_price)) < p.price
    : teaser
      ? Number(teaser.discount_amount) > discount
      : false;
  if (teaser && (!eligible || teaserBeats)) {
    lines.push(teaserTier
      ? ctx.t('shop.product.line.promo.tier_teaser', {
          min_qty: teaserTier.min_qty,
          unit_price: Number(Math.min(p.price, teaserTier.unit_price)).toFixed(2),
        })
      : ctx.t('shop.product.line.promo.teaser', {
          min_qty: teaser.min_qty,
          discount: Number(teaser.discount_amount).toFixed(2),
        }));
  }

  // 6) Live order trio — qty / total / wallet.
  lines.push('', ctx.t('shop.product.line.qty', { qty }));
  if (eligible) {
    lines.push(
      ctx.t('shop.product.line.total.discounted', {
        gross: formatPriceWithCurrency(gross, ctx.user.currency),
        total: formatPriceWithCurrency(total, ctx.user.currency),
      }),
    );
  } else {
    lines.push(ctx.t('shop.product.line.total', { total: formatPriceWithCurrency(total, ctx.user.currency) }));
  }
  lines.push(ctx.t('shop.product.line.balance', { balance: formatPriceWithCurrency(ctx.user.balance, ctx.user.currency) }));
  return lines.join('\n');
}

const BLANK_TXT_PAYLOAD = ' ';
const MANUAL_DELIVERY_PLACEHOLDER = 'Manual delivery — admin will follow up shortly.';

function deliveryPendingValues(): Set<string> {
  const values = new Set<string>();
  for (const lang of Object.keys(LOCALES) as Lang[]) {
    values.add(translate(lang, 'shop.buy.delivery_pending').trim());
  }
  values.add(MANUAL_DELIVERY_PLACEHOLDER);
  return values;
}

function buildDeliveredItemsTxt(args: {
  deliveredItems: string | null | undefined;
  isOneToOne: boolean;
}): string {
  const trimmed = (args.deliveredItems ?? '').trim();
  const pending = trimmed.length === 0 || deliveryPendingValues().has(trimmed);
  if (args.isOneToOne || pending) return BLANK_TXT_PAYLOAD;
  const lines = (args.deliveredItems ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return lines.length > 0 ? lines.join('\n') + '\n' : BLANK_TXT_PAYLOAD;
}

/**
 * Build the deep-link URL that lands anyone who opens it back on
 * this product page inside the bot. The product keyboard wires
 * this URL straight into a Telegram `copy_text` button so tapping
 * it copies the link to the user's clipboard with a "Copied" toast
 * — no share dialog, no auto-forward to a chat. The receiver still
 * lands on the product page when they paste the link anywhere.
 */
function buildProductShareUrl(productId: number): string {
  return `https://t.me/${env.BOT_USERNAME}?start=prod_${productId}`;
}

/**
 * Build the localized "Promo: …" order-summary line (with trailing
 * newline) for the given promo match, or an empty string when no
 * promo is active. Centralized so the buy / pay-wallet handlers
 * can just splice it into the existing `shop.pay.title` template.
 */
function renderPromoLine(
  ctx: AppCtx,
  promo: PromoMatch | null,
  discount: number,
): string {
  if (!promo || discount <= 0) return '';
  const label =
    promo.promo.name?.trim() ||
    ctx.t('shop.product.line.promo.fallback_label', {
      min_qty: promo.promo.min_qty,
    });
  if (promo.selectedTier) {
    return (
      ctx.t('shop.product.line.promo.tier', {
        min_qty: promo.selectedTier.min_qty,
        unit_price: formatPriceWithCurrency(promo.chargedUnitPrice ?? 0, ctx.user.currency),
      }) + '\n'
    );
  }
  return ctx.t('shop.product.line.promo', {
    label,
    discount: formatPriceWithCurrency(discount, ctx.user.currency),
  }) + '\n';
}

type ReferralPaymentState = {
  requiredPerUnit: number;
  requiredTotal: number;
  totalReferrals: number;
  spentReferrals: number;
  availableReferrals: number;
  remaining: number;
  eligible: boolean;
};

async function getReferralPaymentState(
  _ctx: AppCtx,
  _product: NonNullable<Awaited<ReturnType<typeof getProduct>>>,
  _qty: number,
): Promise<ReferralPaymentState> {
  return {
    requiredPerUnit: 0,
    requiredTotal: 0,
    totalReferrals: 0,
    spentReferrals: 0,
    availableReferrals: 0,
    remaining: 0,
    eligible: false,
  };
}

async function showLowReferralBalance(
  ctx: AppCtx,
  product: NonNullable<Awaited<ReturnType<typeof getProduct>>>,
  state: ReferralPaymentState,
): Promise<void> {
  try {
    await ctx.answerCallbackQuery();
  } catch {
    // The callback may already have been acknowledged after a
    // server-side balance recheck.
  }
  const kb = new InlineKeyboard();
  inlineBtn(kb, ctx.lang, 'referral_earn_buy', `profile:refer:buy:${product.id}`);
  kb.row();
  inlineBtn(kb, ctx.lang, 'refresh', `pay:referral:${product.id}`);
  kb.row();
  inlineBtn(kb, ctx.lang, 'back', `buy:${product.id}`);
  const html = renderMdHtml(
    ctx.t('shop.referral.insufficient.card', {
      required: state.requiredTotal,
      available: state.availableReferrals,
      remaining: state.remaining,
    }),
  );
  if (ctx.callbackQuery?.message) {
    await ctx.editMessageText(html, {
      parse_mode: 'HTML',
      reply_markup: kb,
    });
    return;
  }
  await ctx.reply(html, {
    parse_mode: 'HTML',
    reply_markup: kb,
  });
}

export async function finalizeOrderDelivery(args: {
  ctx: AppCtx;
  product: NonNullable<Awaited<ReturnType<typeof getProduct>>>;
  qty: number;
  total: number;
  discount: number;
  order: Awaited<ReturnType<typeof createOrder>>;
  paidVia: string;
  balanceAfter: number;
  confirmationText: string;
}): Promise<void> {
  const { ctx, product: p, qty, total, discount, order, paidVia, balanceAfter, confirmationText } = args;
  const preorder = isPreorder(p, qty);
  const manualForm = productHasDeliveryForm(p);
  let reservation: StockReservation | null = null;
  let deliveryCommitted = false;
  // Single-winner guard: a double-tapped Pay button, a retried callback
  // or a second worker can never deliver the same order twice.
  const guard = await beginOrderDelivery(order.id);
  if (!guard.should_process) {
    logger.warn(
      { orderId: order.id, state: guard.state, attempts: guard.attempts },
      'order delivery: already handled by another attempt — skipping duplicate fulfilment',
    );
    return;
  }
  try {
    if (!preorder) {
      // Reservation, not a bare decrement: idempotent on the order
      // reference, so a retry re-uses the same units instead of
      // overselling, and a crash leaves a releasable reservation.
      reservation = await reserveProductStock({
        product_id: p.id,
        qty,
        reference: `order:${order.id}`,
        order_id: order.id,
      });
    }
  delete ctx.session.qty[p.id];
  const publicId = publicOrderId(order);
  // Pull the actual delivery payload off the per-product items
  // pool. When the pool is empty (or short), fall back to a
  // "manual delivery" placeholder; the admin gets pinged via
  // logOrderCreated either way.
  const supplierOrder = preorder || manualForm
    ? null
    : await trySupplierAutoOrder({
        localProductId: p.id,
        qty,
        localOrderId: order.id,
        onFailure: (failure) =>
          adminLog.logSupplierOrderFailed(ctx.api, {
            user: {
              telegram_id: ctx.user.telegram_id,
              username: ctx.user.username ?? null,
              first_name: ctx.user.first_name ?? null,
              email: ctx.user.email ?? null,
            },
            orderDbId: order.id,
            orderPublicId: publicId,
            productId: p.id,
            productName: p.name,
            qty,
            total,
            paidVia,
            balanceAfter: Number(balanceAfter.toFixed(3)),
            supplierName: failure.supplierName,
            supplierProductId: failure.supplierProductId,
            reason: failure.error,
            lowBalance: failure.lowBalance,
          }).catch((err) => logger.warn({ err }, 'supplier failure admin log failed')),
      });
    const claimed = preorder || manualForm
      ? []
      : supplierOrder
        ? supplierOrder.items
        : await claimProductItems(p.id, qty, order.id);
    if (!preorder && !manualForm && claimed.length !== qty) {
      throw new Error(`DELIVERY_INCOMPLETE:${claimed.length}/${qty}`);
    }
  // Items are rendered as Telegram blockquote pills (one `> line`
  // per claimed link / account) — same style as the View Note
  // "luli" / "Hey" pills the bot owner pointed to.
  //
  // For bulk orders (10/30/50/100+ links) we split the items
  // across multiple messages of `ORDER_DELIVERED_CHUNK_SIZE` each
  // (the bot owner's preferred 7-per-msg layout). The first
  // chunk goes inside the Order Delivered header card; the
  // remaining chunks are sent as plain blockquote messages right
  // below. Only the last chunk's message carries the Using
  // Method inline keyboard so the buyer scrolls to the bottom
  // and finds it there. This replaces the previous .txt
  // attachment workaround.
  //
  // The DB-stored copy keeps plain single-line separation so the
  // existing /myorders renderer (and the /admin orders block)
  // doesn't suddenly contain blockquote markers.
  const deliveredChunks = buildOrderDeliveredChunks(claimed);
  const pendingText = manualForm
    ? 'Buyer details pending admin fulfillment.'
    : preorder
    ? ctx.t('shop.buy.preorder_pending')
    : ctx.t('shop.buy.delivery_pending');
  const firstChunkBlock =
    deliveredChunks[0]?.inlineBlock ?? `> ${pendingText}`;
  const deliveredItemsForDb =
    claimed.length > 0 ? claimed.join('\n') : pendingText;
  // Always persist `delivered_items` — even the manual-delivery
  // placeholder — so the My Orders detail screen can render the
  // order without falling back to the legacy `delivery` blob.
  // Without this, a bulk order whose item pool is empty or whose
  // chat-render failed would leave `delivered_items` NULL, and
  // tapping the order in /myorders would render a broken
  // "Received: Order #N-37" line that confused buyers.
  await setOrderDeliveredItems(order.id, deliveredItemsForDb);
  // Lifecycle: real items ⇒ delivered, placeholder ⇒ processing.
  await markOrderLifecycleSafe(
    order.id,
    claimed.length > 0 ? 'delivered' : 'processing',
    { note: claimed.length > 0 ? 'Auto-delivered (wallet pay)' : pendingText },
  );
  deliveryCommitted = true;
  // The sale is final: the reserved units stay deducted and the
  // delivery guard closes so no retry can re-deliver this order.
  if (reservation) await commitStockReservation(reservation);
  await finishOrderDelivery(order.id, 'delivered', claimed.length);
  await ctx.answerCallbackQuery();
  // ---- Step 1: Payment Verified card (auto-deletes after 15s) ----
  // We capture the message_id and schedule a delete via setTimeout
  // so the chat stays clean: by the time the user finishes reading
  // "Order Delivered!" the verified card has slid away.
  const verifiedMsg = await ctx.reply(renderMdHtml(confirmationText), {
    parse_mode: 'HTML',
  });
  const verifiedChatId = verifiedMsg.chat.id;
  const verifiedMessageId = verifiedMsg.message_id;
  setTimeout(() => {
    // Fire-and-forget; if the user already deleted it manually
    // or 48h have passed, Telegram will reject — we just swallow.
    void ctx.api.deleteMessage(verifiedChatId, verifiedMessageId).catch((err) => {
      logger.debug(
        { err, chatId: verifiedChatId, messageId: verifiedMessageId },
        'auto-delete of payment_verified message failed (likely already gone)',
      );
    });
  }, 15_000);
  // ---- Step 2: Order Delivered card -----------------------
  // The keyboard carries only the per-product Using Method
  // button — the standalone "View Invoice" button was removed
  // per the bot owner's follow-up note. For bulk orders we send
  // the keyboard with the LAST items message instead of the
  // header card, so the buyer scrolls past every link before
  // tapping Using Method.
  const deliveredKb = new InlineKeyboard();
  inlineBtn(deliveredKb, ctx.lang, 'using_method', `tut:${p.id}`);
  deliveredKb.row();
  inlineBtn(deliveredKb, ctx.lang, 'view_order', `orders:open:${order.id}`);
  inlineBtn(deliveredKb, ctx.lang, 'send_note_txt', `order:txt:${order.id}`);
  if (!manualForm) {
    const headerHasKeyboard = deliveredChunks.length <= 1;
    await ctx.reply(
      renderMdHtml(
        ctx.t(preorder ? 'shop.buy.order_preordered' : 'shop.buy.order_delivered', {
          order_id: publicId,
          name: p.name,
          qty,
          total: total.toFixed(2),
          items: firstChunkBlock,
        }),
      ),
      headerHasKeyboard ? { parse_mode: 'HTML', reply_markup: deliveredKb } : { parse_mode: 'HTML' },
    );
  }
  // Send the remaining 7-link chunks as plain blockquote
  // follow-up messages. Only the very last one gets the inline
  // keyboard. If a follow-up message fails to render we still
  // press on so a single bad link doesn't keep the buyer from
  // seeing the rest. The DB has the full list either way.
  for (let i = 1; !manualForm && i < deliveredChunks.length; i++) {
    const chunk = deliveredChunks[i];
    if (!chunk) continue;
    const opts = chunk.isLast
      ? { parse_mode: 'HTML' as const, reply_markup: deliveredKb }
      : { parse_mode: 'HTML' as const };
    try {
      await ctx.reply(renderMdHtml(chunk.inlineBlock), opts);
    } catch (err) {
      logger.warn(
        {
          err,
          orderId: order.id,
          chunkIndex: i,
          chunkSize: deliveredChunks.length,
        },
        'order delivery — chunked items follow-up failed',
      );
    }
  }
  // ---- Step 2b: Post-purchase delivery form ---------------
  // Some products require the buyer to send extra details
  // (account email + password, recovery key, voucher code, …)
  // BEFORE the seller can finish provisioning. When the product
  // has `delivery_form_enabled` we drop an instruction message
  // + a single in-place prompt card right under the items so
  // the buyer can submit their details directly. Vendor DM +
  // success / edit / admin-help buttons all live in the
  // `postPurchaseDelivery` service.
  try {
    await maybeStartDeliveryFormForCtx({
      ctx,
      product: p,
      orderId: order.id,
      orderPublicId: publicId,
      qty,
      startOnly: true,
    });
  } catch (err) {
    logger.warn(
      { err, orderId: order.id, productId: p.id },
      'order delivery — delivery form start failed',
    );
  }
  // ---- Step 3: Email follow-up ----------------------------
  // Two branches per the bot-owner spec:
  //   a) No email → polite prompt with a `Set Email` deep link
  //      that opens Settings → Email Settings → Set Email and
  //      remembers `order.id` so once the email is saved we can
  //      retroactively fire the invoice for THIS purchase.
  //   b) Has email → single-line "invoice sent" card that
  //      auto-deletes after 13 s + the polished invoice email.
  if (!ctx.user.email) {
    const noEmailKb = new InlineKeyboard();
    // Tag the callback with `:post:<orderId>` so the profile
    // handler knows this came from a post-purchase nudge (vs.
    // Settings → Set Email) and can run the auto-delete +
    // retroactive-invoice path.
    inlineBtn(
      noEmailKb,
      ctx.lang,
      'set_email_now',
      `profile:email:set:post:${order.id}`,
    );
    await ctx.reply(renderMdHtml(ctx.t('shop.buy.add_email_prompt')), {
      parse_mode: 'HTML',
      reply_markup: noEmailKb,
    });
  } else {
    // Single bold confirmation line — no spam-folder note, no
    // Invoice-Email / Invoice-Link block, no inline buttons.
    // Auto-deletes ~13 s later so the chat stays clean once the
    // user has had time to read it.
    const invoiceSentMsg = await ctx.reply(renderMdHtml(ctx.t('shop.buy.invoice_sent')), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
    const sentChatId = invoiceSentMsg.chat.id;
    const sentMessageId = invoiceSentMsg.message_id;
    setTimeout(() => {
      void ctx.api.deleteMessage(sentChatId, sentMessageId).catch((err) => {
        logger.debug(
          { err, chatId: sentChatId, messageId: sentMessageId },
          'auto-delete of invoice_sent message failed (likely already gone)',
        );
      });
    }, 13_000);
    // Fire-and-forget the professional invoice. Failure modes
    // (transport down, bad address) are logged inside mailer.ts
    // and never surface to the buyer — they already have the
    // delivery card with the items in-chat.
    const invoiceLink = env.BOT_USERNAME
      ? `https://t.me/${env.BOT_USERNAME}?start=ord_${publicId}`
      : '';
    void sendInvoiceEmail({
      email: ctx.user.email,
      firstName: ctx.user.first_name ?? null,
      username: ctx.user.username ?? null,
      orderPublicId: publicId,
      orderDate: order.created_at,
      productName: p.name,
      qty,
      unitPrice: p.price,
      total,
      discount,
      paidVia,
      items: claimed,
      invoiceLink,
    });
  }
  // ---- Step 4: remove the old product/payment card -----------
  // The callback was triggered from the product/payment message.
  // Once the order is delivered, delete that old card so the chat
  // doesn't keep a stale product section above the delivered items.
  try {
    await ctx.deleteMessage();
  } catch (err) {
    logger.debug(
      { err, productId: p.id, orderId: order.id },
      'post-delivery old product/payment card delete failed (likely already gone)',
    );
  }
  // Notify admin with the deep-detail order block.
  void adminLog.logOrderCreated(ctx.api, {
    user: {
      telegram_id: ctx.user.telegram_id,
      username: ctx.user.username ?? null,
      first_name: ctx.user.first_name ?? null,
      email: ctx.user.email ?? null,
    },
    orderDbId: order.id,
    orderPublicId: publicOrderId(order),
    productId: p.id,
    productName: p.name,
    qty,
    unitPrice: p.price,
    total,
    paidVia,
    balanceAfter: Number(balanceAfter.toFixed(3)),
    lifecycle: manualForm ? 'manual_pending' : preorder ? 'preorder' : 'delivered',
  });
  } catch (err) {
    if (deliveryCommitted) {
      logger.warn({ err, orderId: order.id }, 'order delivery: post-delivery notification step failed; order remains completed');
      return;
    }
    // Roll the whole reservation back: items return to 📦 Available and
    // the reserved units go back to the catalog count, exactly once.
    try { await releaseProductItemsForOrder(order.id); } catch (releaseErr) { logger.error({ err: releaseErr, orderId: order.id }, 'order delivery: failed to release partial items'); }
    if (reservation) {
      try { await releaseStockReservation(reservation); } catch (restoreErr) { logger.error({ err: restoreErr, orderId: order.id, productId: p.id, qty }, 'order delivery: failed to release stock reservation'); }
    }
    await finishOrderDelivery(order.id, 'failed', 0, 'delivery rolled back');
    throw err;
  }
}

async function showProduct(ctx: AppCtx, productId: number) {
  const raw = await getProduct(productId);
  if (!raw) {
    await ctx.answerCallbackQuery({ text: ctx.t('err.unknown_action') });
    return;
  }
  const p = await applyUserPriceToProduct(ctx.user.telegram_id, raw);
  const qty = ctx.session.qty[productId] ?? QTY_MIN;
  const promo = await resolvePromo(ctx.user.telegram_id, p.id, qty, p.price);
  const teaser = await nextPromoTeaser(
    ctx.user.telegram_id,
    p.id,
    qty,
    promo?.discount ?? 0,
  );
  const shareUrl = buildProductShareUrl(p.id);
  const favorited = await isFavorite(ctx.user.telegram_id, p.id);
  await renderScreen(ctx, renderMdHtml(productPageText(ctx, p, qty, promo, teaser)), {
    keyboard: productKeyboard(ctx.lang, p, qty, shareUrl, { isFavorite: favorited }),
    screen: 'shop.product',
  });
}

/**
 * Send the product detail page as a brand-new chat message (i.e.
 * `ctx.reply` instead of `ctx.editMessageText`). Used by the
 * direct-pay flow after Order Delivered to drop the buyer back on
 * the qty / Buy Now page so they can buy more without re-navigating.
 */
export async function sendProductPage(
  ctx: AppCtx,
  productId: number,
): Promise<void> {
  const raw = await getProduct(productId);
  if (!raw) return;
  const p = await applyUserPriceToProduct(ctx.user.telegram_id, raw);
  const qty = ctx.session.qty[productId] ?? QTY_MIN;
  const promo = await resolvePromo(ctx.user.telegram_id, p.id, qty, p.price);
  const teaser = await nextPromoTeaser(
    ctx.user.telegram_id,
    p.id,
    qty,
    promo?.discount ?? 0,
  );
  const shareUrl = buildProductShareUrl(p.id);
  const favorited = await isFavorite(ctx.user.telegram_id, p.id);
  await ctx.reply(
    renderMdHtml(productPageText(ctx, p, qty, promo, teaser)),
    {
      parse_mode: 'HTML',
      reply_markup: productKeyboard(ctx.lang, p, qty, shareUrl, { isFavorite: favorited }),
    },
  );
}

/**
 * Render the *Custom Quantity* keypad screen. Edits the current
 * product page in place so the user stays in one message; the
 * accumulating digit buffer (the "Current:" line) lives in
 * `ctx.session.qtyInput[productId]` so taps and direct-typed
 * numbers feed into the same string.
 *
 * Body mirrors the product-page layout (name + Price Base /
 * Available Stock / Warranty / Selected Qty / Total Amount /
 * Wallet) so the user can see the running cost while they enter
 * the qty; the digit buffer is rendered into the "Selected Qty"
 * (and Total Amount via `productPageText`) plus a short usage
 * instruction line below the body.
 *
 * The bot stores `ctx.session.userFlow = { type: 'qty_keypad', ... }`
 * while the keypad is open so the text-message middleware knows to
 * treat plain numbers as qty input (and to auto-delete the prompt
 * + the user's reply on a successful submission).
 */
async function showQtyKeypad(ctx: AppCtx, productId: number, currentBuf?: string) {
  const raw = await getProduct(productId);
  if (!raw) {
    await ctx.answerCallbackQuery({ text: ctx.t('err.unknown_action') });
    return;
  }
  const p = await applyUserPriceToProduct(ctx.user.telegram_id, raw);
  const buf = currentBuf ?? ctx.session.qtyInput?.[productId] ?? '';
  // Live preview qty: buffer-as-number while the user is typing,
  // else the saved qty (or QTY_MIN) so the page is never visually
  // empty before the first tap.
  const previewQty = buf.length > 0 ? Number(buf) : ctx.session.qty[productId] ?? QTY_MIN;
  const promo = await resolvePromo(ctx.user.telegram_id, p.id, previewQty, p.price);
  const teaser = await nextPromoTeaser(
    ctx.user.telegram_id,
    p.id,
    previewQty,
    promo?.discount ?? 0,
  );
  const body = productPageText(ctx, p, previewQty, promo, teaser);
  // The placeholder text is rendered when the digit buffer is
  // empty so the line reads as a sentence to first-time users
  // ("Current: (Amount)") instead of the cryptic em-dash we used
  // before. Localised — falls back to "(Amount)" for languages
  // without a translation.
  const placeholder = ctx.t('shop.qty.keypad.placeholder');
  const instruction = ctx.t('shop.qty.keypad.instruction', {
    current: buf.length > 0 ? buf : placeholder,
  });
  await ctx.editMessageText(renderMdHtml(`${body}\n\n${instruction}`), {
    parse_mode: 'HTML',
    reply_markup: qtyKeypadKeyboard(ctx.lang, p),
  });
}

/**
 * For normal products, cap quantity at the live stock. For out-of-stock
 * products, allow a preorder quantity up to QTY_MAX instead of blocking
 * at zero.
 */
function qtyLimitForProduct(p: { unlimited_stock: boolean; stock: number }): number {
  if (p.unlimited_stock) return QTY_MAX;
  return p.stock > 0 ? Math.min(QTY_MAX, p.stock) : QTY_MAX;
}

function isPreorder(
  p: { unlimited_stock: boolean; stock: number },
  qty: number,
): boolean {
  return !p.unlimited_stock && p.stock < qty;
}

/**
 * Validate a candidate quantity against `[1, max]`.
 * Returns the clamped integer on success or `null` if the input is
 * non-numeric / out of range — caller surfaces the premium-emoji
 * error message and keeps the keypad open.
 */
function validateQty(candidate: string | number, max: number): number | null {
  const n = typeof candidate === 'string' ? Number(candidate) : candidate;
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  const ceiling = Math.max(0, max);
  if (n < QTY_MIN || n > ceiling) return null;
  return n;
}

export function registerShop(bot: Composer<AppCtx>): void {
  // ----- Inline callbacks -----
  bot.callbackQuery('shop:home', async (ctx) => {
    await ctx.answerCallbackQuery();
    // Leaving a product / quantity flow for the Store home must also drop
    // that flow, or the next plain message is still read as a quantity.
    clearTransientFlowState(ctx);
    await showShopHome(ctx);
  });

  // Paginated all-products list — `shop:p:<page>` is emitted by the
  // Prev / Refresh / Next buttons on the Shop home keyboard.
  bot.callbackQuery(/^shop:p:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await showShopHome(ctx, Number(ctx.match[1]));
  });

  // ---- 🔍 Search -------------------------------------------------
  bot.callbackQuery('shop:search', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.userFlow = { type: 'shop_search', step: 'query', data: {} };
    await renderScreen(ctx, renderMdHtml(ctx.t('shop.search.prompt')), {
      keyboard: searchPromptKeyboard(ctx.lang, Boolean(ctx.session.shopSearch)),
      screen: 'shop.search.prompt',
    });
  });

  bot.callbackQuery('shop:search:clear', async (ctx) => {
    ctx.session.shopSearch = undefined;
    if (ctx.session.userFlow?.type === 'shop_search') ctx.session.userFlow = undefined;
    await ctx.answerCallbackQuery({ text: ctx.t('shop.search.cleared') });
    await showShopHome(ctx, 0);
  });

  // ---- ↕️ Sort ---------------------------------------------------
  bot.callbackQuery('shop:sort', async (ctx) => {
    await ctx.answerCallbackQuery();
    const current = parseSortMode(await getUserShopSortMode(ctx.user.telegram_id));
    await renderScreen(
      ctx,
      renderMdHtml(
        ctx.t('shop.sort.title', {
          current: `${SORT_EMOJI[current]} ${ctx.t(`btn.sort_${current}`)}`.trim(),
        }),
      ),
      { keyboard: sortMenuKeyboard(ctx.lang, current), screen: 'shop.sort' },
    );
  });

  bot.callbackQuery(/^shop:sort:([a-z_]+)$/, async (ctx) => {
    const mode = parseSortMode(ctx.match[1]);
    await setUserShopSortMode(ctx.user.telegram_id, mode);
    await ctx.answerCallbackQuery({
      text: ctx.t('shop.sort.applied', { label: ctx.t(`btn.sort_${mode}`) }),
    });
    await showShopHome(ctx, 0);
  });

  // ---- ⭐ Favorites / wishlist -----------------------------------
  bot.callbackQuery('fav:open', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showFavorites(ctx, 0);
  });

  bot.callbackQuery(/^fav:p:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await showFavorites(ctx, Number(ctx.match[1]));
  });

  bot.callbackQuery(/^fav:toggle:(\d+)$/, async (ctx) => {
    const productId = Number(ctx.match[1]);
    const product = await getProduct(productId);
    if (!product) {
      await ctx.answerCallbackQuery({ text: ctx.t('err.unknown_action'), show_alert: true });
      return;
    }
    const nowFavorite = await toggleFavorite(ctx.user.telegram_id, productId);
    await ctx.answerCallbackQuery({
      text: ctx.t(nowFavorite ? 'shop.favorites.added' : 'shop.favorites.removed'),
    });
    await showProduct(ctx, productId);
  });

  bot.callbackQuery(/^grp:(\d+)(?::(\d+))?$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    try {
      await showProductGroup(ctx, Number(ctx.match[1]), Number(ctx.match[2] ?? 0));
    } catch (err) {
      logger.error({ err, categoryId: ctx.match[1] }, 'shop grouped list failed');
      await ctx.reply('⚠️ Could not open this grouped list. Please tap Refresh and try again.').catch(() => undefined);
    }
  });

  // Legacy category callbacks (`cat:<id>:<page>`) from older
  // messages still in users' chat histories — redirect to the new
  // all-products home so taps don't appear hung.
  bot.callbackQuery(/^cat:(\d+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    try {
      await showProductGroup(ctx, Number(ctx.match[1]), Number(ctx.match[2] ?? 0));
    } catch (err) {
      logger.error({ err, categoryId: ctx.match[1] }, 'legacy category grouped list failed');
      await ctx.reply('⚠️ Could not open this grouped list. Please tap Refresh and try again.').catch(() => undefined);
    }
  });

  bot.callbackQuery(/^prod:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await showProduct(ctx, Number(ctx.match[1]));
  });

  // Inline `➖` / `➕` stepper on the product page — each tap nudges
  // the qty by one and re-renders the same message in place. The
  // value is clamped to `[QTY_MIN, min(QTY_MAX, stock)]`; tapping
  // past either edge surfaces a small toast and leaves the qty as
  // it was so we never push a no-op `editMessageText`.
  bot.callbackQuery(/^qty:(\d+):(inc|dec)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const direction = ctx.match[2];
    const raw = await getProduct(id);
    if (!raw) {
      await ctx.answerCallbackQuery({ text: ctx.t('err.unknown_action') });
      return;
    }
    const p = await applyUserPriceToProduct(ctx.user.telegram_id, raw!);
    const ceiling = qtyLimitForProduct(p);
    const current = ctx.session.qty[id] ?? QTY_MIN;
    const candidate = direction === 'inc' ? current + 1 : current - 1;
    if (candidate < QTY_MIN || candidate > ceiling) {
      // Silent ack at the boundaries — pressing ➖ at qty 1 or ➕
      // at the stock ceiling is a soft cap, not an error worth a
      // toast.
      await ctx.answerCallbackQuery();
      return;
    }
    ctx.session.qty[id] = candidate;
    await ctx.answerCallbackQuery();
    await showProduct(ctx, id);
  });

  // Tap *Custom Quantity* on the product page → switches the same
  // message into the numeric-keypad screen. Resets the digit buffer
  // and arms the userFlow so plain-text replies are interpreted as
  // qty input (with auto-delete of the prompt + reply on success).
  bot.callbackQuery(/^qty:(\d+):custom$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    if (!ctx.session.qtyInput) ctx.session.qtyInput = {};
    ctx.session.qtyInput[id] = '';
    ctx.session.userFlow = {
      type: 'qty_keypad',
      step: 'await_qty',
      data: {
        productId: id,
        promptChatId: ctx.chat?.id ?? ctx.from!.id,
        promptMessageId: ctx.callbackQuery!.message?.message_id,
      },
    };
    await ctx.answerCallbackQuery();
    await showQtyKeypad(ctx, id, '');
  });

  // Numeric-keypad actions: digit / backspace / clear / max / confirm.
  // Digits are appended as strings so `1` + `1` becomes `"11"` (not
  // arithmetic 2). `Back` (cancel) is wired straight to `prod:<id>`
  // in the keyboard.
  bot.callbackQuery(/^qkp:(\d+):(d:[0-9]|p:\d{1,4}|back|clear|max|confirm)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const action = ctx.match[2]!;
    const raw = await getProduct(id);
    if (!raw) {
      await ctx.answerCallbackQuery({ text: ctx.t('err.unknown_action') });
      return;
    }
    const p = await applyUserPriceToProduct(ctx.user.telegram_id, raw!);
    if (!ctx.session.qtyInput) ctx.session.qtyInput = {};
    const prev = ctx.session.qtyInput[id] ?? '';
    let buf = prev;
    if (action.startsWith('p:')) {
      // Quick-pick preset (25 / 50 / 100). Snap the buffer to the
      // chosen preset, clamped down to the user's purchasable
      // ceiling so a 30-stock product taps to 30 (not the silently-
      // unattainable 100). Out-of-stock products short-circuit the
      // same way as `max` so the user sees an explanation instead
      // of a no-op tap.
      const preset = Number(action.slice(2));
      const ceiling = qtyLimitForProduct(p);
      if (ceiling < QTY_MIN) {
        await ctx.answerCallbackQuery({
          text: ctx.t('shop.qty.keypad.invalid', { max: ceiling }),
          show_alert: true,
        });
        return;
      }
      buf = String(Math.min(preset, ceiling));
    } else if (action.startsWith('d:')) {
      const digit = action.slice(2);
      // Cap at 4 digits and at `min(QTY_MAX, stock)` so the buffer
      // never represents a qty the user couldn't actually buy.
      // Trailing taps past the ceiling are silently dropped (the
      // ack still happens below, so Telegram doesn't show a spinner).
      const ceiling = qtyLimitForProduct(p);
      if (buf.length < 4) {
        const candidate = (buf + digit).replace(/^0+(\d)/, '$1');
        if (Number(candidate) <= ceiling) buf = candidate;
      }
    } else if (action === 'back') {
      buf = buf.slice(0, -1);
    } else if (action === 'clear') {
      buf = '';
    } else if (action === 'max') {
      // 🎯 Max snaps the buffer to the user's purchasable ceiling
      // (`min(QTY_MAX, stock)` for finite stock, plain `QTY_MAX`
      // when the product is `unlimited_stock`). Surfaces a small
      // toast on out-of-stock so the user understands why the
      // buffer didn't move. The action only updates the staged
      // buffer — the user still has to tap ✅ Confirm to apply.
      const ceiling = qtyLimitForProduct(p);
      if (ceiling < QTY_MIN) {
        await ctx.answerCallbackQuery({
          text: ctx.t('shop.qty.keypad.invalid', { max: ceiling }),
          show_alert: true,
        });
        return;
      }
      buf = String(ceiling);
    } else if (action === 'confirm') {
      const ceiling = qtyLimitForProduct(p);
      const next = validateQty(buf, ceiling);
      if (next === null) {
        await ctx.answerCallbackQuery({
          text: ctx.t('shop.qty.keypad.invalid', { max: ceiling }),
          show_alert: true,
        });
        return;
      }
      ctx.session.qty[id] = next;
      delete ctx.session.qtyInput[id];
      ctx.session.userFlow = undefined;
      await ctx.answerCallbackQuery();
      await showProduct(ctx, id);
      return;
    }
    ctx.session.qtyInput[id] = buf;
    await ctx.answerCallbackQuery();
    // Skip the edit when the buffer didn't change (e.g. backspace
    // on an already-empty buffer, digit beyond the 4-char cap) —
    // Telegram rejects no-op edits with "message is not modified".
    if (buf === prev) return;
    await showQtyKeypad(ctx, id, buf);
  });

  // While the *Custom Quantity* keypad is open, plain-text replies
  // are interpreted as the quantity. On success: auto-delete the
  // keypad prompt + the user's message, apply the qty, and re-open
  // the product page (matches the bot-owner spec). On failure: show
  // the premium-emoji invalid-quantity warning (auto-deleted after
  // a short delay so the chat stays tidy) and keep the keypad open.
  // 🔍 Marketplace search — the next plain text message after tapping
  // Search is treated as a partial query (case-insensitive, token
  // based) and rendered through the same catalog screen.
  bot.on('message:text', async (ctx, next) => {
    const flow = ctx.session.userFlow;
    if (!flow || flow.type !== 'shop_search') return next();
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) {
      ctx.session.userFlow = undefined;
      return next();
    }
    ctx.session.userFlow = undefined;
    ctx.session.shopSearch = text.slice(0, 64);
    await showShopHome(ctx, 0);
  });

  bot.on('message:text', async (ctx, next) => {
    const flow = ctx.session.userFlow;
    if (!flow || flow.type !== 'qty_keypad') return next();
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) {
      // /cancel etc — leave the keypad and let downstream commands
      // run normally.
      ctx.session.userFlow = undefined;
      delete ctx.session.qtyInput?.[flow.data.productId];
      return next();
    }
    const raw = await getProduct(flow.data.productId);
    if (!raw) {
      ctx.session.userFlow = undefined;
      return;
    }
    const p = await applyUserPriceToProduct(ctx.user.telegram_id, raw!);
    // Strip non-digits so a stray space / punctuation doesn't
    // invalidate an otherwise-valid number ("11 " → "11").
    const digits = text.replace(/[^0-9]/g, '');
    const ceiling = qtyLimitForProduct(p);
    const next_ = digits ? validateQty(digits, ceiling) : null;
    if (next_ === null) {
      // Premium-emoji invalid warning. Sent to the chat (as opposed
      // to a callback popup) because the user typed a message — a
      // popup wouldn't surface here.
      const warn = await ctx.reply(
        renderMdHtml(
          ctx.t('shop.qty.keypad.invalid', { max: ceiling }),
        ),
        { parse_mode: 'HTML' },
      );
      // Auto-cleanup: delete the user's bad reply now and the
      // warning bubble after ~5s so the screen stays calm.
      void ctx.deleteMessage().catch(() => undefined);
      setTimeout(() => {
        void ctx.api
          .deleteMessage(warn.chat.id, warn.message_id)
          .catch(() => undefined);
      }, 5_000);
      return;
    }
    // Success — apply the qty and tear down both messages.
    ctx.session.qty[flow.data.productId] = next_;
    delete ctx.session.qtyInput?.[flow.data.productId];
    ctx.session.userFlow = undefined;
    void ctx.deleteMessage().catch(() => undefined);
    if (flow.data.promptMessageId) {
      void ctx.api
        .deleteMessage(flow.data.promptChatId, flow.data.promptMessageId)
        .catch(() => undefined);
    }
    // Re-open the product page as a fresh message (the prompt was
    // just deleted, so we can't editMessageText into it).
    const shareUrl = buildProductShareUrl(p.id);
    const promo = await resolvePromo(ctx.user.telegram_id, p.id, next_, p.price);
    const teaser = await nextPromoTeaser(
      ctx.user.telegram_id,
      p.id,
      next_,
      promo?.discount ?? 0,
    );
    await ctx.reply(
      renderMdHtml(productPageText(ctx, p, next_, promo, teaser)),
      {
        parse_mode: 'HTML',
        reply_markup: productKeyboard(ctx.lang, p, next_, shareUrl, {
          isFavorite: await isFavorite(ctx.user.telegram_id, p.id),
        }),
      },
    );
  });

  // ---- Post-purchase delivery form: per-field text capture ----
  // While the buyer is mid-flow on a product that asks for extra
  // details after delivery (e.g. account email + password), every
  // plain-text reply feeds into `handleDeliveryFormMessage` which
  // advances the in-place prompt card field-by-field and finalises
  // with a vendor DM + success card. Returns `false` when the user
  // is NOT in a delivery form so all other text handlers (Live
  // Support echo, qty keypad above, etc.) still get a turn.
  bot.on('message:text', async (ctx, next) => {
    const flow = ctx.session.userFlow;
    if (!flow || flow.type !== 'delivery_form') return next();
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) {
      // Bail-out commands always win — clear the flow and let the
      // command run normally (e.g. /cancel, /myorders, /start).
      ctx.session.userFlow = undefined;
      return next();
    }
    const consumed = await handleDeliveryFormMessage(ctx);
    if (!consumed) return next();
  });

  bot.callbackQuery(/^delivery:start:(\d+)$/, async (ctx) => {
    const orderId = Number(ctx.match[1]);
    const order = await getOrder(orderId);
    if (!order || order.user_id !== ctx.user.telegram_id || order.product_id === null) {
      await ctx.answerCallbackQuery({ text: 'Order not found.', show_alert: true });
      return;
    }
    const product = await getProduct(order.product_id);
    if (!product || !productHasDeliveryForm(product)) {
      await ctx.answerCallbackQuery({ text: 'This form is no longer available.', show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    await maybeStartDeliveryFormForCtx({
      ctx,
      product,
      orderId: order.id,
      orderPublicId: publicOrderId(order),
      qty: order.qty,
      skipInstruction: true,
    });
  });

  // ---- Edit Details (re-open the form with the last submission) ----
  // Callback fires from the success card after the buyer's first
  // submission. `startEditDelivery` looks up the existing
  // submission, re-opens the prompt card pre-filled with every
  // previously-typed answer, and flips the flow into edit mode so
  // the next submission gets posted to the vendor as a CORRECTION
  // (revision N+1) instead of a duplicate first-time order.
  bot.callbackQuery(/^delivery:edit:(\d+)$/, async (ctx) => {
    const orderId = Number(ctx.match[1]);
    await ctx.answerCallbackQuery();
    const ok = await startEditDelivery({ ctx, orderId });
    if (!ok) {
      // The submission is gone, the product was deleted, or the
      // delivery form was turned off mid-flight. Tell the buyer
      // gently so they can DM the admin manually.
      await ctx.reply(
        renderMdHtml(ctx.t('shop.delivery.edit_unavailable')),
        { parse_mode: 'HTML' },
      );
    }
  });

  // ---- View Note ----
  // Premium full-screen note view. The body is a single header
  // (`{prod_view_note} View Note`) plus the product description and
  // any admin-typed note text, rendered in a quoted/code block for
  // visual focus. When the admin uploaded a `.txt` (or any document)
  // we resend it as a Telegram document immediately after editing
  // the message — matches the pic-2 reference UX.
  //
  // Buttons: just `Back`. The legacy `📥 Save Note as TXT` button is
  // gone per the bot-owner spec.
  bot.callbackQuery(/^note:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const raw = await getProduct(id);
    if (!raw) {
      await ctx.answerCallbackQuery({ text: ctx.t('err.unknown_action') });
      return;
    }
    const p = await applyUserPriceToProduct(ctx.user.telegram_id, raw!);
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard();
    inlineBtn(kb, ctx.lang, 'back', `prod:${p.id}`);
    const html = [
      renderMdHtml(`{note_premium} *View Note — ${p.name}*`),
      '',
      renderMdHtml('{note_desc} *Description:*'),
      renderStoredProductText(p.description, ctx.t('shop.note.empty_description')),
      '',
      renderMdHtml('{note_text} *Note:*'),
      renderStoredProductText(p.note, ctx.t('shop.note.empty')),
    ].join('\n');
    // View Note is text-only: just edit the in-place message back
    // to the rendered note body (description + note + product name).
    // Per bot-owner request the per-product file attachment was
    // removed — this keeps the screen consistent and avoids
    // file_id-expiry edge cases.
    const safeHtml = clampForTelegram(html);
    try {
      await ctx.editMessageText(safeHtml, {
        parse_mode: 'HTML',
        reply_markup: kb,
      });
    } catch (err) {
      logger.warn({ err, productId: p.id }, 'View Note HTML render failed; falling back to plain text');
      const noCustomEmojiHtml = clampForTelegram(stripCustomEmojiTags(safeHtml));
      try {
        await ctx.editMessageText(noCustomEmojiHtml, {
          parse_mode: 'HTML',
          reply_markup: kb,
        });
      } catch (retryErr) {
        logger.warn({ err: retryErr, productId: p.id }, 'View Note HTML retry failed; falling back to plain text');
        const plain = htmlToPlain(safeHtml).slice(0, 3900);
        await ctx.editMessageText(plain, { reply_markup: kb });
      }
    }
  });

  // ---- Using Method tutorial ----
  // Surfaced as a `📘 Using Method` button under every Order
  // Delivered card (and also accessible as a deep-link `/start tut_<id>`
  // from outside chats). Renders the admin-configured tutorial body
  // plus an optional photo / video / document attachment + an
  // optional URL button. When nothing has been configured yet we
  // surface a polite placeholder so the button isn't a dead end.
  bot.callbackQuery(/^tut:(\d+)$/, async (ctx) => {
    // Always ack first so Telegram never shows a perpetual spinner
    // even if the body below throws.
    await ctx.answerCallbackQuery();
    let stage = 'load_product';
    try {
      const id = Number(ctx.match[1]);
      const raw = await getProduct(id);
      if (!raw) {
        await ctx.reply(
          '⚠️ <b>Product no longer available.</b>\n\nThis product was removed by the admin.',
          { parse_mode: 'HTML' },
        );
        return;
      }
      stage = 'compose_body';
      const text = (raw.tutorial_text ?? '').trim();
      const body =
        text.length > 0
          ? ctx.t('shop.tutorial.body', { name: raw.name, body: text })
          : ctx.t('shop.tutorial.empty', { name: raw.name });
      stage = 'build_keyboard';
      const safeUrl = sanitizeButtonUrl(raw.tutorial_url);
      const kb = new InlineKeyboard();
      if (safeUrl) {
        kb.url(ctx.t('btn.tutorial_open_link'), safeUrl).row();
      }
      inlineBtn(kb, ctx.lang, 'back', `prod:${id}`);
      stage = 'render_html';
      const html = renderMdHtml(body);
      const safeHtml = clampForTelegram(html);
      logger.info(
        {
          productId: id,
          hasText: text.length > 0,
          hasFile: Boolean(raw.tutorial_file_id && raw.tutorial_file_type),
          fileType: raw.tutorial_file_type ?? null,
          hasUrl: Boolean(safeUrl),
          rejectedUrl: raw.tutorial_url && !safeUrl ? raw.tutorial_url : null,
          htmlLen: safeHtml.length,
        },
        'tut: — rendering Using Method tutorial',
      );
      // Always send a NEW message (`reply`) instead of editing.
      // Sending a fresh message is bulletproof — every tap shows a
      // brand-new tutorial card, and the Back button returns the
      // user to the product page.
      stage = 'send_html';
      try {
        await ctx.reply(safeHtml, {
          parse_mode: 'HTML',
          reply_markup: kb,
          link_preview_options: { is_disabled: true },
        });
      } catch (htmlErr) {
        // HTML parse failure (malformed admin-typed markdown, weird
        // characters, etc.) → drop the formatting and resend the body
        // as plain text so the tutorial still loads. The Back button
        // and the optional URL button still come along.
        logger.warn(
          { err: htmlErr, productId: id },
          'tut: HTML send failed, retrying as plain text',
        );
        stage = 'send_plain';
        const plain = htmlToPlain(safeHtml);
        await ctx.reply(plain, {
          reply_markup: kb,
          link_preview_options: { is_disabled: true },
        });
      }
      if (raw.tutorial_file_id && raw.tutorial_file_type) {
        try {
          stage = 'send_file';
          if (raw.tutorial_file_type === 'photo') {
            await ctx.replyWithPhoto(raw.tutorial_file_id);
          } else if (raw.tutorial_file_type === 'video') {
            await ctx.replyWithVideo(raw.tutorial_file_id);
          } else {
            await ctx.replyWithDocument(raw.tutorial_file_id);
          }
        } catch (err) {
          logger.warn({ err }, 'tut: file send failed');
        }
      }
    } catch (err) {
      logger.error({ err, stage }, 'tut: — failed to render');
      const reason = (err as Error)?.message ?? String(err);
      try {
        await ctx.reply(
          `⚠️ <b>Couldn't load this tutorial.</b>\n\n` +
            `Stage: <code>${escapeAttr(stage)}</code>\n` +
            `Reason: <code>${escapeAttr(reason).slice(0, 200)}</code>\n\n` +
            `Admin: open <code>/admin</code> → <i>Products → Edit Product → Tutorial Text / File / URL</i> and double-check the URL (must start with <code>https://</code> and contain no spaces or newlines).`,
          { parse_mode: 'HTML' },
        );
      } catch {
        // Last-ditch: nothing else to do.
      }
    }
  });

  // ---- Download delivered items as TXT ----
  bot.callbackQuery(/^order:txt:(\d+)$/, async (ctx) => {
    const orderId = Number(ctx.match[1]);
    const order = await getOrder(orderId);
    if (!order || order.user_id !== ctx.from?.id) {
      await ctx.answerCallbackQuery({ text: ctx.t('err.unknown_action'), show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    const product = order.product_id ? await getProduct(order.product_id) : null;
    const contents = buildDeliveredItemsTxt({
      deliveredItems: order.delivered_items,
      isOneToOne: product?.delivery_form_enabled === true,
    });
    // Format: (quantity)x (product name) (buying time)
    // e.g: 10x Gemini 18M 1:48Utc
    const safeName = (order.product_name ?? 'Unknown')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const d = new Date(order.created_at);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const timeStr = `${hh}:${mm}Utc`;
    const filename = `${order.qty}x ${safeName} ${timeStr}.txt`;
    try {
      await ctx.replyWithDocument(new InputFile(Buffer.from(contents, 'utf8'), filename));
    } catch (err) {
      logger.warn({ err, orderId }, 'order:txt download failed');
    }
  });

  // *Buy Now* on the product page no longer charges immediately —
  // it edits the message into a payment-method picker that lets the
  // user choose between paying with their wallet balance and topping
  // up first. The actual charge happens on `pay:wallet:<id>`.
  bot.callbackQuery(/^pay:referral:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({
      text: 'Referral Pay is disabled.',
      show_alert: true,
    });
    return;
    const productId = Number(ctx.match[1]);
    const raw = await getProduct(productId);
    if (!raw) {
      await ctx.answerCallbackQuery({ text: ctx.t('err.unknown_action') });
      return;
    }
    const p = await applyUserPriceToProduct(ctx.user.telegram_id, raw!);
    if (!p.referral_required_count || p.referral_required_count <= 0) {
      await ctx.answerCallbackQuery({
        text: ctx.t('shop.referral.disabled'),
        show_alert: true,
      });
      return;
    }
    const qty = ctx.session.qty[productId] ?? QTY_MIN;
    const referral = await getReferralPaymentState(ctx, p, qty);
    if (!referral) {
      await ctx.answerCallbackQuery({
        text: ctx.t('shop.referral.disabled'),
        show_alert: true,
      });
      return;
    }
    if (!referral.eligible) {
      await showLowReferralBalance(ctx, p, referral);
      return;
    }
    await ctx.answerCallbackQuery();
    const text = ctx.t('shop.referral.confirm', {
      name: p.name,
      qty,
      required: referral.requiredTotal,
      available: referral.availableReferrals,
      after: referral.availableReferrals - referral.requiredTotal,
      emoji: p.emoji === '🛒' ? '' : (p.emoji ?? ''),
    });
    const kb = new InlineKeyboard();
    inlineBtn(kb, ctx.lang, 'confirm_pay', `pay:referral:do:${productId}`);
    kb.row();
    inlineBtn(kb, ctx.lang, 'cancel_pay', `buy:${productId}`);
    await ctx.editMessageText(renderMdHtml(text), {
      parse_mode: 'HTML',
      reply_markup: kb,
    });
  });

  bot.callbackQuery(/^pay:referral:do:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({
      text: 'Referral Pay is disabled.',
      show_alert: true,
    });
    return;
    const productId = Number(ctx.match[1]);
    const raw = await getProduct(productId);
    if (!raw) {
      await ctx.answerCallbackQuery({ text: ctx.t('err.unknown_action') });
      return;
    }
    const p = await applyUserPriceToProduct(ctx.user.telegram_id, raw!);
    if (!p.referral_required_count || p.referral_required_count <= 0) {
      await ctx.answerCallbackQuery({
        text: ctx.t('shop.referral.disabled'),
        show_alert: true,
      });
      return;
    }
    const qty = ctx.session.qty[productId] ?? QTY_MIN;
    const referral = await getReferralPaymentState(ctx, p, qty);
    if (!referral) {
      await ctx.answerCallbackQuery({
        text: ctx.t('shop.referral.disabled'),
        show_alert: true,
      });
      return;
    }
    if (!referral.eligible) {
      await showLowReferralBalance(ctx, p, referral);
      return;
    }
    await ctx.answerCallbackQuery();
    try {
      const total = 0;
      const discount = p.price * qty;
      const order = await createOrder({
        user_id: ctx.from!.id,
        product_id: productId,
        product_name: p.name,
        qty,
        unit_price: p.price,
        total,
        discount,
        promo_id: null,
        delivery: ctx.t('shop.referral.delivery', { product_id: p.id, qty }),
      });
      try {
        await spendReferralBalance({
          user_id: ctx.user.telegram_id,
          product_id: p.id,
          order_id: order.id,
          referral_cost: referral.requiredTotal,
        });
      } catch (spendErr) {
        logger.warn(
          { err: spendErr, order_id: order.id, product_id: p.id, user: ctx.user.telegram_id },
          'referral payment failed - rolling back order',
        );
        await supabase.from('orders').delete().eq('id', order.id);
        if (spendErr instanceof InsufficientReferralBalanceError) {
          const latest = await getReferralPaymentState(ctx, p, qty);
          if (latest) {
            await showLowReferralBalance(ctx, p, latest);
            return;
          }
        }
        throw spendErr;
      }
      const confirmationText = ctx.t('shop.referral.confirmed', {
        name: p.name,
        qty,
        spent: referral.requiredTotal,
      });
      await finalizeOrderDelivery({
        ctx,
        product: p,
        qty,
        total,
        discount,
        order,
        paidVia: 'Referral Pay',
        balanceAfter: ctx.user.balance,
        confirmationText,
      });
    } catch (err) {
      logger.error(
        { err, product_id: productId, user: ctx.user.telegram_id },
        'pay:referral failed',
      );
      try {
        await ctx.reply(renderMdHtml(ctx.t('shop.referral.failed')), { parse_mode: 'HTML' });
      } catch {
        // noop
      }
    }
  });

  bot.callbackQuery(/^buy:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const raw = await getProduct(id);
    if (!raw) {
      await ctx.answerCallbackQuery({ text: ctx.t('err.unknown_action') });
      return;
    }
    const p = await applyUserPriceToProduct(ctx.user.telegram_id, raw);
    const qty = ctx.session.qty[id] ?? QTY_MIN;
    const promo = await resolvePromo(ctx.user.telegram_id, p.id, qty, p.price);
    const { discount, total } = priceBreakdown(p.price, qty, promo);
    const text = ctx.t('shop.pay.title', {
      name: p.name,
      qty,
      total: formatPriceWithCurrency(total, ctx.user.currency),
      balance: formatPriceWithCurrency(ctx.user.balance, ctx.user.currency),
      // Per-product unicode emoji rendered behind the product name.
      // The premium auto-scan in `renderMdHtml` upgrades it to the
      // animated `<tg-emoji>` if a `custom_emoji_id` is configured.
      emoji: p.emoji === '🛒' ? '' : (p.emoji ?? ''),
      promo_line: renderPromoLine(ctx, promo, discount),
      referral_line: '',
    });
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(renderMdHtml(text), {
      parse_mode: 'HTML',
      reply_markup: paymentMethodKeyboard(ctx.lang, p, { showReferralPay: false }),
    });
  });

  // Wallet-payment branch of the new payment-method picker. Shows a
  // confirmation card first ("Are you sure you want to buy this with
  // your wallet?") and only performs the actual charge once the user
  // taps the confirm button (`pay:wallet:do:<id>`).
  bot.callbackQuery(/^pay:wallet:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const raw = await getProduct(id);
    if (!raw) {
      await ctx.answerCallbackQuery({ text: ctx.t('err.unknown_action') });
      return;
    }
    const p = await applyUserPriceToProduct(ctx.user.telegram_id, raw);
    const qty = ctx.session.qty[id] ?? QTY_MIN;
    const promo = await resolvePromo(ctx.user.telegram_id, p.id, qty, p.price);
    const { discount, total } = priceBreakdown(p.price, qty, promo);
    if (ctx.user.balance < total) {
      await ctx.answerCallbackQuery({
        text: ctx.t('shop.buy.insufficient', { need: total, have: ctx.user.balance }),
        show_alert: true,
      });
      return;
    }
    await ctx.answerCallbackQuery();
    const discountLine =
      discount > 0
        ? ctx.t('shop.pay.confirm.discount_line', {
            discount: formatPriceWithCurrency(discount, ctx.user.currency),
          })
        : '';
    const text = ctx.t('shop.pay.confirm', {
      name: p.name,
      qty,
      total: formatPriceWithCurrency(total, ctx.user.currency),
      balance: formatPriceWithCurrency(ctx.user.balance, ctx.user.currency),
      // Per-product unicode emoji prefix; auto-scan upgrades to
      // `<tg-emoji>` when `custom_emoji_id` is configured.
      emoji: p.emoji === '🛒' ? '' : (p.emoji ?? ''),
      discount_line: discountLine,
    });
    const kb = new InlineKeyboard();
    inlineBtn(kb, ctx.lang, 'confirm_pay', `pay:wallet:do:${id}`);
    kb.row();
    inlineBtn(kb, ctx.lang, 'cancel_pay', `buy:${id}`);
    await ctx.editMessageText(renderMdHtml(text), {
      parse_mode: 'HTML',
      reply_markup: kb,
    });
  });

  // Actually performs the wallet charge. Only reachable after the
  // user confirmed via the `pay:wallet:<id>` confirmation card.
  bot.callbackQuery(/^pay:wallet:do:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const raw = await getProduct(id);
    if (!raw) {
      await ctx.answerCallbackQuery({ text: ctx.t('err.unknown_action') });
      return;
    }
    // Use the per-user effective price for charge / order recording
    // so the price the user saw on the product page is the price
    // they're actually billed.
    const p = await applyUserPriceToProduct(ctx.user.telegram_id, raw);
    // Email is no longer a hard gate — the bot-owner spec relaxed
    // checkout so users without a saved email can still buy. The
    // 12-hour nag (see `services/emailNag.ts`) handles the soft
    // reminder without blocking the purchase flow.
    const qty = ctx.session.qty[id] ?? QTY_MIN;
    // Resolve the promo *server-side* — never trust the client.
    // The product page may have rendered a promo for a different
    // qty since the user tapped Buy Now; we always recompute here.
    const promo = await resolvePromo(ctx.user.telegram_id, p.id, qty, p.price);
    const breakdown = priceBreakdown(p.price, qty, promo);
    const total = breakdown.total;
    const discount = breakdown.discount;
    if (ctx.user.balance < total) {
      await ctx.answerCallbackQuery({
        text: ctx.t('shop.buy.insufficient', { need: total, have: ctx.user.balance }),
        show_alert: true,
      });
      return;
    }
    let createdOrderId: number | null = null;
    let walletCharged = false;
    try {
      const order = await createOrder({
        user_id: ctx.from!.id,
        product_id: id,
        product_name: p.name,
        qty,
        unit_price: p.price,
        total,
        discount,
        promo_id: promo?.promo.id ?? null,
        delivery: `Order #${id}-${qty}`,
      });
      createdOrderId = order.id;
      const newBalance = await charge(
        ctx.from!.id,
        total,
        ctx.user.balance,
        `order:${order.id}`,
      );
      ctx.user.balance = newBalance;
      walletCharged = true;
      const confirmationText = ctx.t('shop.buy.payment_verified', {
        total: formatPriceWithCurrency(total, ctx.user.currency),
        order_id: publicOrderId(order),
        paid_via: 'Wallet balance',
      });
      await finalizeOrderDelivery({
        ctx,
        product: p,
        qty,
        total,
        discount,
        order,
        paidVia: 'Wallet balance',
        balanceAfter: newBalance,
        confirmationText,
      });
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === 'INSUFFICIENT_FUNDS') {
        if (createdOrderId !== null && !walletCharged) {
          const { error: deleteErr } = await supabase.from('orders').delete().eq('id', createdOrderId);
          if (deleteErr) {
            logger.error({ err: deleteErr, orderId: createdOrderId }, 'pay:wallet failed to remove unpaid order');
          }
        }
        await ctx.answerCallbackQuery({
          text: ctx.t('shop.buy.insufficient', { need: total, have: ctx.user.balance }),
          show_alert: true,
        });
        return;
      }
      // If the wallet was already charged but fulfilment failed before
      // commit, refund exactly once using a durable ledger reference.
      if (walletCharged) {
        try {
          const refundBalance = await refundWalletOnce(
            ctx.user.telegram_id,
            total,
            `delivery_refund:order:${createdOrderId ?? `unknown:${id}`}`,
          );
          ctx.user.balance = refundBalance;
        } catch (refundErr) {
          logger.error({ err: refundErr, product_id: id, user: ctx.user.telegram_id }, 'pay:wallet fulfilment refund failed');
        }
      }
      // Anything else (DB column missing, RLS, network) MUST still
      // dismiss the loading spinner — otherwise the Wallet Pay button
      // sits in the "loading" state forever, which is exactly what
      // the bot owner reported. We surface a generic alert and log
      // the underlying error so the admin can debug from the logs.
      logger.error({ err: e, product_id: id, user: ctx.user.telegram_id }, 'pay:wallet failed');
      try {
        await ctx.answerCallbackQuery({
          text: ctx.t('shop.buy.failed'),
          show_alert: true,
        });
      } catch {
        // Fall through — Telegram sometimes rejects answerCallbackQuery
        // when the callback is too old (>15 min). Nothing we can do.
      }
    }
  });

  // Tapping an out-of-stock product (either the row in the catalog
  // list or the disabled "Out of Stock" button on the product page)
  // pops up a localized "Please contact admin to restock" alert
  // instead of silently acking — gives the customer a clear next
  // step instead of a non-response. Must be registered BEFORE the
  // catch-all `noop:` handler below or the regex would swallow it.
  bot.callbackQuery('noop:oos', async (ctx) => {
    await ctx.answerCallbackQuery({
      text: ctx.t('shop.product.out_of_stock_popup'),
      show_alert: true,
    });
  });

  bot.callbackQuery(/^noop:/, async (ctx) => {
    await ctx.answerCallbackQuery();
  });
}
