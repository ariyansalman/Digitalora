/**
 * 🛒 Persistent shopping cart handlers.
 *
 * This flow is strictly *additive*: Buy Now, direct pay, referral pay
 * and every existing order path are untouched. The cart is a second
 * road to the exact same `orders` rows, and it re-validates product
 * state, stock, prices and promos server-side right before charging.
 */
import type { Composer } from 'grammy';
import { formatPriceWithCurrency } from '../../config/currencies.js';
import { QTY_MIN } from '../../config/index.js';
import type { AppCtx } from '../middleware/user.js';
import { clearTransientFlowState } from '../ui/flowState.js';
import { renderMdHtml } from '../services/premium.js';
import { logger } from '../logger.js';
import { publicOrderId } from '../services/orderId.js';
import { charge } from '../services/wallet.js';
import { refundWalletOnce } from '../db/repositories/wallet.js';
import { createOrder } from '../db/repositories/orders.js';
import {
  beginCartCheckout,
  finishCartCheckout,
  removeCartItem,
} from '../db/repositories/cart.js';
import {
  addToCart,
  emptyCart,
  loadCartView,
  revalidateForCheckout,
  updateCartQty,
  type CartView,
} from '../services/cart.js';
import { priceBreakdown } from '../services/promo.js';
import {
  addedToCartKeyboard,
  cartCheckoutConfirmKeyboard,
  cartClearConfirmKeyboard,
  cartKeyboard,
} from '../keyboards/cart.js';
import type { CartLine } from '../core/cart.js';
import { finalizeOrderDelivery } from './shop.js';

/**
 * In-process duplicate-click guard. The authoritative guard is the
 * `begin_cart_checkout` SQL function (atomic status flip); this set
 * just avoids doing pointless work when Telegram delivers the same
 * tap twice within milliseconds.
 */
const checkoutInFlight = new Set<number>();

function statusNote(ctx: AppCtx, line: CartLine): string {
  switch (line.status) {
    case 'missing':
      return ctx.t('cart.line.removed');
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

function renderCart(ctx: AppCtx, view: CartView): string {
  const currency = ctx.user.currency;
  if (view.totals.isEmpty) return ctx.t('cart.empty');

  const blocks = view.totals.lines.map((line, index) => {
    const note = statusNote(ctx, line);
    return ctx.t('cart.line', {
      index: index + 1,
      name: line.name,
      qty: line.qty > 0 ? line.qty : line.requestedQty,
      unit_price: formatPriceWithCurrency(line.unitPrice, currency),
      subtotal: formatPriceWithCurrency(line.subtotal, currency),
      note: note ? `\n${note}` : '',
    });
  });

  const discountLine =
    view.totals.discount > 0
      ? ctx.t('cart.discount', {
          discount: formatPriceWithCurrency(view.totals.discount, currency),
        })
      : '';

  return ctx.t('cart.title', {
    lines: blocks.join('\n\n'),
    items: view.totals.itemCount,
    discount_line: discountLine ? `\n${discountLine}` : '',
    total: formatPriceWithCurrency(view.totals.total, currency),
    balance: formatPriceWithCurrency(ctx.user.balance, currency),
  });
}

async function showCart(ctx: AppCtx, opts: { edit?: boolean } = {}): Promise<CartView> {
  const view = await loadCartView(ctx.user.telegram_id);
  const text = renderMdHtml(renderCart(ctx, view));
  const kb = cartKeyboard(ctx.lang, view.totals.lines, {
    canCheckout: view.totals.canCheckout,
  });
  const payload = { parse_mode: 'HTML' as const, reply_markup: kb };
  if (opts.edit !== false && ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, payload);
      return view;
    } catch (err) {
      const description = (err as { description?: string }).description ?? '';
      if (description.includes('message is not modified')) return view;
      logger.debug({ err }, 'cart: edit failed, sending a fresh card');
    }
  }
  await ctx.reply(text, payload);
  return view;
}

export async function openCart(ctx: AppCtx): Promise<void> {
  await showCart(ctx);
}

export function registerCart(bot: Composer<AppCtx>): void {
  // ---- View cart -------------------------------------------------
  bot.callbackQuery('cart:open', async (ctx) => {
    await ctx.answerCallbackQuery();
    clearTransientFlowState(ctx);
    await showCart(ctx);
  });

  bot.command('cart', async (ctx) => {
    await showCart(ctx, { edit: false });
  });

  // ---- Add to cart (from the product page) -----------------------
  bot.callbackQuery(/^cart:add:(\d+)$/, async (ctx) => {
    const productId = Number(ctx.match[1]);
    // The qty stepper on the product page is the source of intent;
    // the real quantity is clamped against live stock server-side.
    const qty = ctx.session.qty[productId] ?? QTY_MIN;
    const result = await addToCart(ctx.user.telegram_id, productId, qty);
    if (!result.ok) {
      const text =
        result.reason === 'too_many_lines'
          ? ctx.t('cart.add.too_many')
          : result.reason === 'missing'
            ? ctx.t('err.unknown_action')
            : ctx.t('cart.add.unavailable');
      await ctx.answerCallbackQuery({ text, show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery({ text: ctx.t('cart.add.toast') });
    await ctx.reply(
      renderMdHtml(
        ctx.t('cart.add.done', {
          name: result.product.name,
          qty: result.qty,
          unit_price: formatPriceWithCurrency(Number(result.product.price), ctx.user.currency),
        }),
      ),
      { parse_mode: 'HTML', reply_markup: addedToCartKeyboard(ctx.lang, productId) },
    );
  });

  // ---- Quantity controls ----------------------------------------
  bot.callbackQuery(/^cart:(inc|dec):(\d+)$/, async (ctx) => {
    const kind = ctx.match[1] as 'inc' | 'dec';
    const productId = Number(ctx.match[2]);
    const result = await updateCartQty(ctx.user.telegram_id, productId, { type: kind });
    await ctx.answerCallbackQuery({
      text: result.removed ? ctx.t('cart.item.removed') : ctx.t('cart.item.qty', { qty: result.qty }),
    });
    await showCart(ctx);
  });

  bot.callbackQuery(/^cart:set:(\d+):(\d+)$/, async (ctx) => {
    const productId = Number(ctx.match[1]);
    const qty = Number(ctx.match[2]);
    const result = await updateCartQty(ctx.user.telegram_id, productId, { type: 'set', qty });
    await ctx.answerCallbackQuery({
      text: result.removed ? ctx.t('cart.item.removed') : ctx.t('cart.item.qty', { qty: result.qty }),
    });
    await showCart(ctx);
  });

  bot.callbackQuery(/^cart:rm:(\d+)$/, async (ctx) => {
    const productId = Number(ctx.match[1]);
    await updateCartQty(ctx.user.telegram_id, productId, { type: 'remove' });
    await ctx.answerCallbackQuery({ text: ctx.t('cart.item.removed') });
    await showCart(ctx);
  });

  bot.callbackQuery(/^cart:item:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  // ---- Clear cart -------------------------------------------------
  bot.callbackQuery('cart:clear', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(renderMdHtml(ctx.t('cart.clear.confirm')), {
      parse_mode: 'HTML',
      reply_markup: cartClearConfirmKeyboard(ctx.lang),
    });
  });

  bot.callbackQuery('cart:clear:do', async (ctx) => {
    await emptyCart(ctx.user.telegram_id);
    await ctx.answerCallbackQuery({ text: ctx.t('cart.clear.done') });
    await showCart(ctx);
  });

  // ---- Checkout: review card -------------------------------------
  bot.callbackQuery('cart:checkout', async (ctx) => {
    const view = await revalidateForCheckout(ctx.user.telegram_id);
    if (!view.totals.canCheckout) {
      await ctx.answerCallbackQuery({ text: ctx.t('cart.checkout.nothing'), show_alert: true });
      await showCart(ctx);
      return;
    }
    if (ctx.user.balance < view.totals.total) {
      await ctx.answerCallbackQuery({
        text: ctx.t('shop.buy.insufficient', {
          need: view.totals.total,
          have: ctx.user.balance,
        }),
        show_alert: true,
      });
      return;
    }
    await ctx.answerCallbackQuery();
    const summary = view.totals.purchasable
      .map((line) =>
        ctx.t('cart.checkout.line', {
          name: line.name,
          qty: line.qty,
          subtotal: formatPriceWithCurrency(line.subtotal, ctx.user.currency),
        }),
      )
      .join('\n');
    await ctx.editMessageText(
      renderMdHtml(
        ctx.t('cart.checkout.confirm', {
          lines: summary,
          total: formatPriceWithCurrency(view.totals.total, ctx.user.currency),
          balance: formatPriceWithCurrency(ctx.user.balance, ctx.user.currency),
          warning: view.totals.hasProblems ? `\n${ctx.t('cart.checkout.warning')}` : '',
        }),
      ),
      { parse_mode: 'HTML', reply_markup: cartCheckoutConfirmKeyboard(ctx.lang) },
    );
  });

  // ---- Checkout: charge + deliver ---------------------------------
  bot.callbackQuery('cart:checkout:do', async (ctx) => {
    const userId = ctx.user.telegram_id;
    if (checkoutInFlight.has(userId)) {
      await ctx.answerCallbackQuery({ text: ctx.t('cart.checkout.in_progress'), show_alert: true });
      return;
    }
    checkoutInFlight.add(userId);
    let cartId: number | null = null;
    let anyOrdered = false;
    let allOrdered = false;
    try {
      // Atomic guard — a second tap that slipped past the in-memory
      // set is rejected right here by the database.
      const cart = await beginCartCheckout(userId);
      cartId = cart.id;

      // Full server-side revalidation AFTER the guard: product active
      // flags, live stock, current prices and promos are all re-read.
      const view = await revalidateForCheckout(userId);
      if (!view.totals.canCheckout) {
        await ctx.answerCallbackQuery({ text: ctx.t('cart.checkout.nothing'), show_alert: true });
        return;
      }
      if (ctx.user.balance < view.totals.total) {
        await ctx.answerCallbackQuery({
          text: ctx.t('shop.buy.insufficient', {
            need: view.totals.total,
            have: ctx.user.balance,
          }),
          show_alert: true,
        });
        return;
      }

      await ctx.answerCallbackQuery();

      const failures: string[] = [];
      for (const line of view.totals.purchasable) {
        const product = view.products.get(line.product_id);
        if (!product) continue;
        // Re-derive the charge from the authoritative unit price and
        // the promo we just resolved. Never from the keyboard.
        const promo = view.promos.get(line.product_id) ?? null;
        const breakdown = priceBreakdown(Number(product.price), line.qty, promo);
        let orderId: number | null = null;
        let charged = false;
        try {
          const order = await createOrder({
            user_id: userId,
            product_id: product.id,
            product_name: product.name,
            qty: line.qty,
            unit_price: Number(product.price),
            total: breakdown.total,
            discount: breakdown.discount,
            promo_id: promo?.promo.id ?? null,
            delivery: `Cart #${cart.id} — Order ${product.id}-${line.qty}`,
          });
          orderId = order.id;
          const newBalance = await charge(
            userId,
            breakdown.total,
            ctx.user.balance,
            `cart:${cart.id}:order:${order.id}`,
          );
          ctx.user.balance = newBalance;
          charged = true;

          await finalizeOrderDelivery({
            ctx,
            product,
            qty: line.qty,
            total: breakdown.total,
            discount: breakdown.discount,
            order,
            paidVia: 'Wallet balance (Cart)',
            balanceAfter: newBalance,
            confirmationText: ctx.t('shop.buy.payment_verified', {
              total: formatPriceWithCurrency(breakdown.total, ctx.user.currency),
              order_id: publicOrderId(order),
              paid_via: 'Wallet balance (Cart)',
            }),
          });
          anyOrdered = true;
          await removeCartItem(cart.id, product.id);
        } catch (err) {
          logger.error({ err, productId: product.id, userId }, 'cart checkout line failed');
          failures.push(product.name);
          if (charged) {
            try {
              const refunded = await refundWalletOnce(
                userId,
                breakdown.total,
                `cart_refund:order:${orderId ?? `unknown:${product.id}`}`,
              );
              ctx.user.balance = refunded;
            } catch (refundErr) {
              logger.error({ err: refundErr, userId, orderId }, 'cart checkout refund failed');
            }
          }
        }
      }

      allOrdered = anyOrdered && failures.length === 0;
      if (failures.length > 0) {
        await ctx.reply(
          renderMdHtml(ctx.t('cart.checkout.partial', { names: failures.join(', ') })),
          { parse_mode: 'HTML' },
        );
      }
    } catch (err) {
      const message = (err as { message?: string }).message ?? '';
      if (message.includes('CART_CHECKOUT_IN_PROGRESS')) {
        await ctx.answerCallbackQuery({ text: ctx.t('cart.checkout.in_progress'), show_alert: true });
        return;
      }
      if (message.includes('CART_EMPTY')) {
        await ctx.answerCallbackQuery({ text: ctx.t('cart.checkout.nothing'), show_alert: true });
        return;
      }
      logger.error({ err, userId }, 'cart checkout failed');
      try {
        await ctx.answerCallbackQuery({ text: ctx.t('shop.buy.failed'), show_alert: true });
      } catch {
        // Callback older than 15 minutes — nothing we can do.
      }
    } finally {
      checkoutInFlight.delete(userId);
      if (cartId !== null) {
        // `true` archives the (now empty) cart and opens a fresh one;
        // `false` simply releases the guard with the leftovers intact.
        try {
          await finishCartCheckout(cartId, allOrdered);
        } catch (err) {
          logger.error({ err, cartId }, 'cart checkout guard release failed');
        }
      }
    }
  });
}
