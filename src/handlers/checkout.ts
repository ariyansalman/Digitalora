/**
 * 🧾 Shared checkout screen — the single professional checkout used by
 * both 🛒 Cart and ⚡ Buy Now.
 *
 * The handler is deliberately thin: it renders what
 * `services/checkout.ts` calculated and forwards *intent only*
 * (pay / coupon / back / cancel) back into that service. No price,
 * total, discount or quantity ever travels through callback data or a
 * chat message.
 */
import type { Composer } from 'grammy';
import { formatPriceWithCurrency } from '../../config/currencies.js';
import { QTY_MIN } from '../../config/index.js';
import type { AppCtx } from '../middleware/user.js';
import { clearTransientFlowState } from '../ui/flowState.js';
import { renderMdHtml } from '../services/premium.js';
import { logger } from '../logger.js';
import { publicOrderId } from '../services/orderId.js';
import {
  buildCheckout,
  executeWalletCheckout,
  type CheckoutContext,
  type CheckoutSource,
} from '../services/checkout.js';
import type { CheckoutLine, CheckoutQuote } from '../core/checkout.js';
import {
  checkoutConfirmKeyboard,
  checkoutKeyboard,
  couponPromptKeyboard,
} from '../keyboards/checkout.js';
import { finalizeOrderDelivery } from './shop.js';

/** Max coupon code length accepted from chat input. */
const COUPON_MAX_LEN = 40;

/**
 * In-process double-tap guard. The authoritative guards are the SQL
 * functions `begin_cart_checkout` and `begin_checkout_intent`; this
 * set only avoids pointless work for taps milliseconds apart.
 */
const payInFlight = new Set<number>();

// ---------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------

function readSource(ctx: AppCtx): CheckoutSource | null {
  const stored = ctx.session.checkout;
  if (!stored) return null;
  if (stored.kind === 'cart') return { kind: 'cart' };
  if (stored.kind === 'buy_now' && stored.product_id) {
    return {
      kind: 'buy_now',
      product_id: Number(stored.product_id),
      // Quantity is re-read from the qty stepper (and re-clamped
      // server-side); the session only remembers which product.
      qty: Number(ctx.session.qty?.[Number(stored.product_id)] ?? stored.qty ?? QTY_MIN),
    };
  }
  return null;
}

function writeSource(ctx: AppCtx, source: CheckoutSource): void {
  ctx.session.checkout =
    source.kind === 'cart'
      ? { kind: 'cart' }
      : { kind: 'buy_now', product_id: source.product_id, qty: source.qty };
}

function clearCheckoutState(ctx: AppCtx): void {
  ctx.session.checkout = undefined;
  ctx.session.checkoutCoupon = undefined;
  if (ctx.session.userFlow && ctx.session.userFlow.type === 'checkout_coupon') {
    ctx.session.userFlow = undefined;
  }
}

// ---------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------

function lineNote(ctx: AppCtx, line: CheckoutLine): string {
  switch (line.status) {
    case 'inactive':
      return ctx.t('cart.line.inactive');
    case 'out_of_stock':
      return ctx.t('cart.line.out_of_stock');
    case 'adjusted':
      return ctx.t('cart.line.adjusted', { max: line.maxQty });
    default:
      return line.priceChanged ? ctx.t('cart.line.price_changed') : '';
  }
}

/** 🧾 Order Summary card. */
export function renderCheckout(ctx: AppCtx, quote: CheckoutQuote): string {
  const currency = quote.currency;
  if (quote.isEmpty) return ctx.t('checkout.empty');

  const blocks = quote.lines.map((line, index) => {
    const note = lineNote(ctx, line);
    return ctx.t('checkout.line', {
      index: index + 1,
      name: line.name,
      qty: line.qty > 0 ? line.qty : line.requestedQty,
      unit_price: formatPriceWithCurrency(line.unitPrice, currency),
      subtotal: formatPriceWithCurrency(line.subtotal, currency),
      note: note ? `\n${note}` : '',
    });
  });

  const discountLines: string[] = [];
  if (quote.promotionDiscount > 0) {
    discountLines.push(
      ctx.t('checkout.discount.promo', {
        amount: formatPriceWithCurrency(quote.promotionDiscount, currency),
      }),
    );
  }
  if (quote.couponDiscount > 0 && quote.coupon?.ok) {
    discountLines.push(
      ctx.t('checkout.discount.coupon', {
        code: quote.coupon.code,
        amount: formatPriceWithCurrency(quote.couponDiscount, currency),
      }),
    );
  }
  const couponWarning =
    quote.coupon && !quote.coupon.ok
      ? `\n${ctx.t('checkout.coupon.rejected', {
          code: quote.coupon.code,
          reason: ctx.t(`checkout.coupon.reason.${quote.coupon.reason}`),
        })}`
      : '';

  return ctx.t('checkout.title', {
    lines: blocks.join('\n\n'),
    items: quote.itemCount,
    subtotal: formatPriceWithCurrency(quote.subtotal, currency),
    discount_lines: discountLines.length > 0 ? `\n${discountLines.join('\n')}` : '',
    payable: formatPriceWithCurrency(quote.payable, currency),
    balance: formatPriceWithCurrency(quote.walletBalance, currency),
    warning: quote.hasProblems ? `\n${ctx.t('checkout.warning')}` : '',
    coupon_warning: couponWarning,
  });
}

async function loadContext(
  ctx: AppCtx,
  source: CheckoutSource,
): Promise<CheckoutContext> {
  return buildCheckout(ctx.user.telegram_id, source, {
    walletBalance: Number(ctx.user.balance),
    currency: ctx.user.currency ?? 'USDT',
    couponCode: ctx.session.checkoutCoupon ?? null,
  });
}

async function showCheckout(
  ctx: AppCtx,
  source: CheckoutSource,
  opts: { edit?: boolean } = {},
): Promise<CheckoutContext> {
  const context = await loadContext(ctx, source);
  const quote = context.quote;
  const text = renderMdHtml(renderCheckout(ctx, quote));
  const kb = checkoutKeyboard(ctx.lang, {
    canPayWallet: quote.canCheckout && quote.walletCovers,
    couponApplied: Boolean(quote.coupon?.ok),
  });
  const payload = { parse_mode: 'HTML' as const, reply_markup: kb };

  if (opts.edit !== false && ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, payload);
      return context;
    } catch (err) {
      const description = (err as { description?: string }).description ?? '';
      if (description.includes('message is not modified')) return context;
      logger.debug({ err }, 'checkout: edit failed, sending a fresh card');
    }
  }
  await ctx.reply(text, payload);
  return context;
}

/** Programmatic entry used by the cart / product screens. */
export async function openCheckout(
  ctx: AppCtx,
  source: CheckoutSource,
  opts: { edit?: boolean } = {},
): Promise<void> {
  writeSource(ctx, source);
  await showCheckout(ctx, source, opts);
}

// ---------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------

export function registerCheckout(bot: Composer<AppCtx>): void {
  // ---- Open: from the cart ---------------------------------------
  bot.callbackQuery('co:open:cart', async (ctx) => {
    await ctx.answerCallbackQuery();
    clearTransientFlowState(ctx);
    ctx.session.checkoutCoupon = undefined;
    await openCheckout(ctx, { kind: 'cart' });
  });

  // ---- Open: from a product (⚡ Buy Now) --------------------------
  bot.callbackQuery(/^co:open:buy:(\d+)$/, async (ctx) => {
    const productId = Number(ctx.match[1]);
    await ctx.answerCallbackQuery();
    clearTransientFlowState(ctx);
    ctx.session.checkoutCoupon = undefined;
    const qty = Number(ctx.session.qty?.[productId] ?? QTY_MIN);
    await openCheckout(ctx, { kind: 'buy_now', product_id: productId, qty });
  });

  // ---- Re-render the current checkout ----------------------------
  bot.callbackQuery('co:open', async (ctx) => {
    const source = readSource(ctx);
    await ctx.answerCallbackQuery();
    if (!source) {
      await ctx.reply(renderMdHtml(ctx.t('checkout.expired')), { parse_mode: 'HTML' });
      return;
    }
    if (ctx.session.userFlow?.type === 'checkout_coupon') {
      ctx.session.userFlow = undefined;
    }
    await showCheckout(ctx, source);
  });

  // ---- 💳 Payment Methods ----------------------------------------
  // Buy Now → the existing per-product payment-method picker.
  // Cart    → the existing Top-up screen, so the buyer can fund the
  //           wallet the cart is settled from. Both flows are the
  //           untouched originals.
  bot.callbackQuery('co:methods', async (ctx) => {
    const source = readSource(ctx);
    await ctx.answerCallbackQuery();
    const target = source?.kind === 'buy_now' ? `buy:${source.product_id}` : 'topup:open';
    // Re-enter the existing screens by simulating their own callback
    // route — keeps every payment integration exactly as it was.
    await ctx.reply(renderMdHtml(ctx.t('checkout.methods.hint')), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: ctx.t('checkout.btn.methods'), callback_data: target }],
          [{ text: ctx.t('checkout.btn.back'), callback_data: 'co:open' }],
        ],
      },
    });
  });

  // ---- 🎟️ Coupon --------------------------------------------------
  bot.callbackQuery('co:coupon', async (ctx) => {
    const source = readSource(ctx);
    await ctx.answerCallbackQuery();
    if (!source) {
      await ctx.reply(renderMdHtml(ctx.t('checkout.expired')), { parse_mode: 'HTML' });
      return;
    }
    ctx.session.userFlow = { type: 'checkout_coupon', step: 'code', data: {} };
    await ctx.editMessageText(renderMdHtml(ctx.t('checkout.coupon.prompt')), {
      parse_mode: 'HTML',
      reply_markup: couponPromptKeyboard(ctx.lang),
    });
  });

  bot.callbackQuery('co:coupon:clear', async (ctx) => {
    const source = readSource(ctx);
    ctx.session.checkoutCoupon = undefined;
    await ctx.answerCallbackQuery({ text: ctx.t('checkout.coupon.removed') });
    if (source) await showCheckout(ctx, source);
  });

  // Plain-text coupon entry while the prompt is open.
  bot.on('message:text', async (ctx, next) => {
    const flow = ctx.session.userFlow;
    if (!flow || flow.type !== 'checkout_coupon') return next();
    const source = readSource(ctx);
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) {
      ctx.session.userFlow = undefined;
      return next();
    }
    if (!source) {
      ctx.session.userFlow = undefined;
      await ctx.reply(renderMdHtml(ctx.t('checkout.expired')), { parse_mode: 'HTML' });
      return;
    }
    ctx.session.userFlow = undefined;
    const code = text.slice(0, COUPON_MAX_LEN).toUpperCase();
    // Validation happens server-side inside the quote — the code is
    // only ever a *lookup key*, never a discount amount.
    ctx.session.checkoutCoupon = code;
    const context = await buildCheckout(ctx.user.telegram_id, source, {
      walletBalance: Number(ctx.user.balance),
      currency: ctx.user.currency ?? 'USDT',
      couponCode: code,
    });
    if (!context.quote.coupon?.ok) {
      ctx.session.checkoutCoupon = undefined;
      const reason = context.quote.coupon
        ? ctx.t(`checkout.coupon.reason.${context.quote.coupon.reason}`)
        : ctx.t('checkout.coupon.reason.unknown');
      await ctx.reply(
        renderMdHtml(ctx.t('checkout.coupon.rejected', { code, reason })),
        { parse_mode: 'HTML' },
      );
    } else {
      await ctx.reply(
        renderMdHtml(
          ctx.t('checkout.coupon.applied', {
            code,
            amount: formatPriceWithCurrency(
              context.quote.couponDiscount,
              context.quote.currency,
            ),
          }),
        ),
        { parse_mode: 'HTML' },
      );
    }
    await showCheckout(ctx, source, { edit: false });
  });

  // ---- ⬅️ Back / ❌ Cancel -----------------------------------------
  bot.callbackQuery('co:back', async (ctx) => {
    const source = readSource(ctx);
    await ctx.answerCallbackQuery();
    if (source?.kind === 'buy_now') {
      await ctx.reply(renderMdHtml(ctx.t('checkout.back.hint')), {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: ctx.t('cart.btn.back_to_product'), callback_data: `prod:${source.product_id}` }],
          ],
        },
      });
      return;
    }
    await ctx.reply(renderMdHtml(ctx.t('checkout.back.hint')), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: ctx.t('btn.cart_view'), callback_data: 'cart:open' }]],
      },
    });
  });

  bot.callbackQuery('co:cancel', async (ctx) => {
    clearCheckoutState(ctx);
    await ctx.answerCallbackQuery({ text: ctx.t('checkout.cancelled') });
    try {
      await ctx.editMessageText(renderMdHtml(ctx.t('checkout.cancelled.card')), {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: ctx.t('btn.main_menu'), callback_data: 'main:open' }]],
        },
      });
    } catch {
      // The card may already be gone — cancelling is still complete.
    }
  });

  // ---- 👛 Pay with Wallet: confirmation ---------------------------
  bot.callbackQuery('co:pay', async (ctx) => {
    const source = readSource(ctx);
    if (!source) {
      await ctx.answerCallbackQuery({ text: ctx.t('checkout.expired'), show_alert: true });
      return;
    }
    const { quote } = await loadContext(ctx, source);
    if (!quote.canCheckout) {
      await ctx.answerCallbackQuery({ text: ctx.t('checkout.nothing'), show_alert: true });
      await showCheckout(ctx, source);
      return;
    }
    if (!quote.walletCovers) {
      await ctx.answerCallbackQuery({
        text: ctx.t('shop.buy.insufficient', {
          need: quote.payable,
          have: quote.walletBalance,
        }),
        show_alert: true,
      });
      return;
    }
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      renderMdHtml(
        ctx.t('checkout.confirm', {
          items: quote.itemCount,
          payable: formatPriceWithCurrency(quote.payable, quote.currency),
          balance: formatPriceWithCurrency(quote.walletBalance, quote.currency),
        }),
      ),
      { parse_mode: 'HTML', reply_markup: checkoutConfirmKeyboard(ctx.lang) },
    );
  });

  // ---- 👛 Pay with Wallet: charge + deliver -----------------------
  bot.callbackQuery('co:pay:do', async (ctx) => {
    const userId = ctx.user.telegram_id;
    const source = readSource(ctx);
    if (!source) {
      await ctx.answerCallbackQuery({ text: ctx.t('checkout.expired'), show_alert: true });
      return;
    }
    if (payInFlight.has(userId)) {
      await ctx.answerCallbackQuery({ text: ctx.t('checkout.in_progress'), show_alert: true });
      return;
    }
    payInFlight.add(userId);
    try {
      await ctx.answerCallbackQuery();
      const outcome = await executeWalletCheckout({
        telegram_id: userId,
        source,
        couponCode: ctx.session.checkoutCoupon ?? null,
        walletBalance: Number(ctx.user.balance),
        currency: ctx.user.currency ?? 'USDT',
        deliver: async ({ product, order, qty, total, discount, balanceAfter }) => {
          ctx.user.balance = balanceAfter;
          await finalizeOrderDelivery({
            ctx,
            product,
            qty,
            total,
            discount,
            order,
            paidVia: source.kind === 'cart' ? 'Wallet balance (Cart)' : 'Wallet balance',
            balanceAfter,
            confirmationText: ctx.t('shop.buy.payment_verified', {
              total: formatPriceWithCurrency(total, ctx.user.currency),
              order_id: publicOrderId(order),
              paid_via: source.kind === 'cart' ? 'Wallet balance (Cart)' : 'Wallet balance',
            }),
          });
        },
      });

      ctx.user.balance = outcome.balanceAfter;

      if (!outcome.ok && outcome.orders.length === 0) {
        const key =
          outcome.reason === 'duplicate'
            ? 'checkout.duplicate'
            : outcome.reason === 'in_progress'
              ? 'checkout.in_progress'
              : outcome.reason === 'insufficient_funds'
                ? 'checkout.insufficient'
                : outcome.reason === 'empty' || outcome.reason === 'nothing_purchasable'
                  ? 'checkout.nothing'
                  : 'shop.buy.failed';
        await ctx.reply(renderMdHtml(ctx.t(key)), { parse_mode: 'HTML' });
        return;
      }

      if (outcome.failures.length > 0) {
        await ctx.reply(
          renderMdHtml(ctx.t('cart.checkout.partial', { names: outcome.failures.join(', ') })),
          { parse_mode: 'HTML' },
        );
      }
      clearCheckoutState(ctx);
    } catch (err) {
      logger.error({ err, userId }, 'checkout pay failed');
      try {
        await ctx.reply(renderMdHtml(ctx.t('shop.buy.failed')), { parse_mode: 'HTML' });
      } catch {
        // Nothing more we can do.
      }
    } finally {
      payInFlight.delete(userId);
    }
  });
}
