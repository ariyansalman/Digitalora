/**
 * Direct-pay order fulfilment.
 *
 * The Phase A wallet-top-up flow credits the user's wallet on
 * successful auto-verify. Phase B introduces *direct-pay-per-order*:
 * the user pays for a specific product directly with crypto and the
 * verifier delivers the order on success — without the wallet ever
 * being touched.
 *
 * `fulfilOrderForDeposit()` is the entry point. It runs the same
 * post-payment work the legacy `pay:wallet:<id>` callback runs in
 * `handlers/shop.ts` (create order, decrement stock, claim items,
 * deliver, send invoice, log to the admin channel) but driven from
 * a `Bot.api` instance so it works from both the user-side text
 * handler (verify-on-tx-hash-submit) and the admin re-verify
 * callback.
 *
 * When stock is gone between deposit creation and verification, the
 * function now creates a paid preorder/manual-delivery order instead
 * of refunding automatically. That keeps direct-pay behaviour aligned
 * with wallet/referral preorder checkout.
 */
import type { Api } from 'grammy';
import { logger } from '../logger.js';
import { env } from '../env.js';
import { createDirectPayOrderAtomic, getOrder, beginDirectPayFulfillment, finishDirectPayFulfillment, setOrderDeliveredItems, markOrderLifecycleSafe } from '../db/repositories/orders.js';
import { getProduct } from '../db/repositories/products.js';
import { findUserById } from '../db/repositories/users.js';
import {
  claimProductItems,
  releaseProductItemsForOrder,
  reserveProductStock,
  commitStockReservation,
  releaseStockReservation,
  beginOrderDelivery,
  finishOrderDelivery,
  type StockReservation,
} from '../db/repositories/products.js';
import { refundWalletOnce } from '../db/repositories/wallet.js';
import { publicOrderId } from './orderId.js';
import { sendInvoiceEmail } from './mailer.js';
import * as adminLog from './adminLog.js';
import { renderMdHtml } from './premium.js';
import { buildOrderDeliveredChunks } from './orderRender.js';
import { trySupplierAutoOrder } from './supplierApi.js';
import { InlineKeyboard, inlineBtn } from '../keyboards/helpers.js';
import {
  maybeStartDeliveryFormFromApi,
  productHasDeliveryForm,
} from './postPurchaseDelivery.js';
import { t as translate } from '../i18n/index.js';
import type { DBDeposit, OrderIntent, PaymentProvider } from '../types.js';
import { PE } from '../handlers/paymentInstructionEmojis.js';

/**
 * Map a payment provider to the user-facing "Paid Via" label that
 * the admin log + invoice email render. Mirrors the wording the
 * legacy wallet flow uses ("Wallet balance") so admins can tell at a
 * glance which path produced the order.
 */
function paidViaLabel(provider: PaymentProvider, methodName: string): string {
  switch (provider) {
    case 'usdt_trc20':
      return `USDT TRC20 (${methodName})`;
    case 'usdt_bep20':
      return `USDT BEP20 (${methodName})`;
    case 'usdt_ton':
      return `USDT TON (${methodName})`;
    case 'ltc':
      return `LTC (${methodName})`;
    default:
      return methodName;
  }
}

export type FulfilResult =
  | { ok: true; orderId: number; orderPublicId: string }
  | { ok: false; reason: string; refundedToWallet?: boolean };

/**
 * Fulfil a direct-pay deposit: create the order, deliver the items,
 * email the invoice (if the user has an email on file), and ping
 * the admin log channel.
 *
 * Caller is expected to have already marked the deposit `approved`
 * via the verifier; this function owns no DB state beyond order
 * creation and delivery.
 */
export async function fulfilOrderForDeposit(args: {
  api: Api;
  deposit: DBDeposit;
  intent: OrderIntent;
  provider: PaymentProvider;
  methodName: string;
}): Promise<FulfilResult> {
  const { api, deposit, intent, provider, methodName } = args;

  const guard = await beginDirectPayFulfillment(deposit.id);
  if (!guard.should_process) {
    if (guard.status === 'completed' && guard.order_id) {
      const existing = await getOrder(guard.order_id);
      if (!existing) return { ok: false, reason: 'direct-pay order state is incomplete' };
      return { ok: true, orderId: guard.order_id, orderPublicId: publicOrderId(existing) };
    }
    if (guard.status === 'refunded') {
      return { ok: false, reason: 'direct-pay already refunded', refundedToWallet: true };
    }
    return { ok: false, reason: 'direct-pay fulfilment is already being processed' };
  }

  const product = await getProduct(intent.product_id);
  if (!product) {
    // The product was deleted between deposit creation and verify.
    // Refund to wallet so the user isn't out of money.
    const newBalance = await refundWalletOnce(
      deposit.user_id,
      Number(intent.total),
      `delivery_refund:deposit:${deposit.id}:product_gone`,
    );
    logger.warn(
      { deposit: deposit.id, productId: intent.product_id, newBalance },
      'fulfilOrderForDeposit: product missing — refunded to wallet',
    );
    await finishDirectPayFulfillment(deposit.id, 'refunded', 'product missing').catch((err) => logger.warn({ err, depositId: deposit.id }, 'direct-pay: refund state update failed'));
    await safeNotify(
      api,
      deposit.user_id,
      `⚠️ Your direct-pay for *${intent.product_name}* could not be delivered (the product is no longer listed). The full amount of *$${intent.total.toFixed(2)}* was credited to your wallet instead.`,
    );
    return {
      ok: false,
      reason: 'product missing — refunded to wallet',
      refundedToWallet: true,
    };
  }

  const user = await findUserById(deposit.user_id);
  const lang = user?.language ?? env.DEFAULT_LANG;
  const t = (key: string, vars?: Record<string, string | number>) =>
    translate(lang, key, vars);
  const preorder = !product.unlimited_stock && product.stock < intent.qty;
  const manualForm = productHasDeliveryForm(product);
  let reservation: StockReservation | null = null;
  let deliveryCommitted = false;

  let order = guard.order_id ? await getOrder(guard.order_id) : null;
  if (!order) {
    // Create the order and attach it to the durable fulfilment guard in one
    // database transaction. This closes the crash window where the process
    // could create an order and die before recording order_id, which would
    // otherwise allow a later recovery attempt to create a duplicate order.
    order = await createDirectPayOrderAtomic({
      deposit_id: deposit.id,
      user_id: deposit.user_id,
      product_id: intent.product_id,
      product_name: intent.product_name,
      qty: intent.qty,
      unit_price: intent.unit_price,
      total: intent.total,
      discount: intent.discount,
      promo_id: intent.promo_id,
      delivery: `Order #${intent.product_id}-${intent.qty}`,
    });
  } else if (order.delivered_items && !order.delivered_items.startsWith('Fulfillment failed —')) {
    await finishDirectPayFulfillment(deposit.id, 'completed');
    return { ok: true, orderId: order.id, orderPublicId: publicOrderId(order) };
  }
  // Single-winner delivery guard on top of the direct-pay fulfilment
  // guard: two verifier callbacks racing on the same order can never
  // both claim items or both deliver.
  const deliveryGuard = await beginOrderDelivery(order.id);
  if (!deliveryGuard.should_process) {
    logger.warn(
      { orderId: order.id, depositId: deposit.id, state: deliveryGuard.state },
      'direct-pay: delivery already handled by another attempt — skipping duplicate fulfilment',
    );
    await finishDirectPayFulfillment(deposit.id, 'completed').catch(() => undefined);
    return { ok: true, orderId: order.id, orderPublicId: publicOrderId(order) };
  }
  try {
    if (!preorder) {
      // Idempotent on `order:<id>` — a replayed verification re-uses the
      // same reserved units instead of taking stock a second time.
      reservation = await reserveProductStock({
        product_id: intent.product_id,
        qty: intent.qty,
        reference: `order:${order.id}`,
        order_id: order.id,
      });
    }
    const publicId = publicOrderId(order);
    const paidVia = paidViaLabel(provider, methodName);
    const supplierOrder = preorder || manualForm
      ? null
      : await trySupplierAutoOrder({
        localProductId: intent.product_id,
        qty: intent.qty,
        localOrderId: order.id,
        onFailure: (failure) =>
          adminLog.logSupplierOrderFailed(api, {
            user: {
              telegram_id: deposit.user_id,
              username: user?.username ?? null,
              first_name: user?.first_name ?? null,
              email: user?.email ?? null,
            },
            orderDbId: order.id,
            orderPublicId: publicId,
            productId: intent.product_id,
            productName: intent.product_name,
            qty: intent.qty,
            total: intent.total,
            paidVia,
            balanceAfter: Number((user?.balance ?? 0).toFixed(3)),
            supplierName: failure.supplierName,
            supplierProductId: failure.supplierProductId,
            reason: failure.error,
            lowBalance: failure.lowBalance,
          }).catch((err) => logger.warn({ err }, 'direct-pay: supplier failure admin log failed')),
      });
    const claimed = preorder || manualForm
      ? []
      : supplierOrder
        ? supplierOrder.items
        : await claimProductItems(
            intent.product_id,
            intent.qty,
            order.id,
          );
    if (!preorder && !manualForm && claimed.length !== intent.qty) {
      throw new Error(`DELIVERY_INCOMPLETE:${claimed.length}/${intent.qty}`);
    }
    // Match the wallet-pay layout: split the items into 10-per-chunk
  // messages so the Order Delivered card never blows past Telegram's
  // 4096-char limit on bulk orders. The first chunk goes inside the
  // header card; subsequent chunks are sent as plain blockquote
  // messages right below it.
  const deliveredChunks = buildOrderDeliveredChunks(claimed);
  const pendingText = manualForm
    ? 'Buyer details pending admin fulfillment.'
    : preorder
    ? t('shop.buy.preorder_pending')
    : t('shop.buy.delivery_pending');
  const firstChunkBlock =
    deliveredChunks[0]?.inlineBlock ??
    `> ${pendingText}`;
  const deliveredItemsForDb =
    claimed.length > 0 ? claimed.join('\n') : pendingText;
  // Always persist `delivered_items` — even the manual-delivery
  // placeholder — so the My Orders detail screen can render the
  // order without falling back to the legacy `delivery` blob.
  await setOrderDeliveredItems(order.id, deliveredItemsForDb);
  // Lifecycle: items in hand ⇒ delivered; still waiting on stock, a
  // supplier or an admin ⇒ processing. Best-effort by design — the
  // delivery itself must never fail on a status write.
  await markOrderLifecycleSafe(
    order.id,
    claimed.length > 0 ? 'delivered' : 'processing',
    {
      note: claimed.length > 0 ? 'Auto-delivered (direct pay)' : pendingText,
      supplier_status: supplierOrder?.status ?? null,
    },
  );
  await finishDirectPayFulfillment(deposit.id, 'completed');
  if (reservation) await commitStockReservation(reservation);
  await finishOrderDelivery(order.id, 'delivered', claimed.length);
  deliveryCommitted = true;
  const deliveredKb = new InlineKeyboard();
  inlineBtn(deliveredKb, lang, 'using_method', `tut:${intent.product_id}`);
  deliveredKb.row();
  inlineBtn(deliveredKb, lang, 'send_note_txt', `order:txt:${order.id}`);

  // Step 1: Payment Verified card
  await safeSendHtml(
    api,
    deposit.user_id,
    renderMdHtml(
      `${provider === 'cryptobot' ? `${PE.usdt_title} ` : ''}${t(
        'shop.buy.payment_verified',
        {
          total: intent.total.toFixed(2),
        },
      )}`,
    ),
  );

  // Step 2: Order Delivered card with the first chunk of items.
  const headerHasKeyboard = deliveredChunks.length <= 1;
  if (!manualForm) {
    await safeSendHtml(
      api,
      deposit.user_id,
      renderMdHtml(
        t(preorder ? 'shop.buy.order_preordered' : 'shop.buy.order_delivered', {
          order_id: publicId,
          name: intent.product_name,
          qty: intent.qty,
          total: intent.total.toFixed(2),
          items: firstChunkBlock,
        }),
      ),
      headerHasKeyboard ? { reply_markup: deliveredKb } : undefined,
    );
  }

  // Step 2b: send any remaining 10-link chunks as plain blockquote
  // follow-up messages. We push on through individual failures so a
  // single bad link doesn't keep the buyer from receiving the rest.
  for (let i = 1; !manualForm && i < deliveredChunks.length; i++) {
    const chunk = deliveredChunks[i];
    if (!chunk) continue;
    try {
      const opts = chunk.isLast
        ? { parse_mode: 'HTML' as const, reply_markup: deliveredKb }
        : { parse_mode: 'HTML' as const };
      await api.sendMessage(deposit.user_id, renderMdHtml(chunk.inlineBlock), opts);
    } catch (err) {
      logger.warn(
        {
          err,
          userId: deposit.user_id,
          orderId: order.id,
          chunkIndex: i,
          chunkSize: deliveredChunks.length,
        },
        'direct-pay: chunked items follow-up failed',
      );
    }
  }

  // Step 2c: Post-purchase delivery form — opens the per-product
  // "send your details" wizard when `delivery_form_enabled` is
  // turned on for this product. No-op for ordinary products.
  // Direct-pay has no live ctx so we drive the bot via raw Api;
  // see `maybeStartDeliveryFormFromApi` for the session-recovery
  // discussion.
  try {
    await maybeStartDeliveryFormFromApi({
      api,
      product,
      orderId: order.id,
      orderPublicId: publicId,
      buyerTelegramId: deposit.user_id,
      buyerLang: lang,
      qty: intent.qty,
    });
  } catch (err) {
    logger.warn(
      { err, orderId: order.id, productId: product.id },
      'direct-pay: delivery form start failed',
    );
  }

  // Step 3: Email follow-up
  if (user?.email) {
    void sendInvoiceEmail({
      email: user.email,
      firstName: user.first_name ?? null,
      username: user.username ?? null,
      orderPublicId: publicId,
      orderDate: order.created_at,
      productName: intent.product_name,
      qty: intent.qty,
      unitPrice: intent.unit_price,
      total: intent.total,
      discount: intent.discount,
          paidVia,
      items: claimed,
      invoiceLink: env.BOT_USERNAME
        ? `https://t.me/${env.BOT_USERNAME}?start=ord_${publicId}`
        : '',
    });
  }

  // Step 4: Admin log entry. `balanceAfter` is the user's current
  // wallet balance (unchanged — direct-pay never touches the wallet);
  // we pass it through so the admin block looks identical to the
  // wallet-pay variant.
  void adminLog
    .logOrderCreated(api, {
      user: {
        telegram_id: deposit.user_id,
        username: user?.username ?? null,
        first_name: user?.first_name ?? null,
        email: user?.email ?? null,
      },
      orderDbId: order.id,
      orderPublicId: publicId,
      productId: intent.product_id,
      productName: intent.product_name,
      qty: intent.qty,
      unitPrice: intent.unit_price,
      total: intent.total,
      paidVia,
      balanceAfter: Number((user?.balance ?? 0).toFixed(3)),
      lifecycle: manualForm ? 'manual_pending' : preorder ? 'preorder' : 'delivered',
    })
    .catch((err) => logger.warn({ err }, 'direct-pay: logOrderCreated failed'));

    return { ok: true, orderId: order.id, orderPublicId: publicId };
  } catch (err) {
    if (deliveryCommitted) {
      logger.warn({ err, orderId: order.id, depositId: deposit.id }, 'direct-pay: post-delivery notification step failed; order remains completed');
      return { ok: true, orderId: order.id, orderPublicId: publicOrderId(order) };
    }
    try {
      await releaseProductItemsForOrder(order.id);
    } catch (releaseErr) {
      logger.error({ err: releaseErr, orderId: order.id }, 'direct-pay: failed to release partially claimed items');
    }
    if (reservation) {
      try {
        await releaseStockReservation(reservation);
        reservation = null;
      } catch (restoreErr) {
        logger.error({ err: restoreErr, orderId: order.id, productId: intent.product_id, qty: intent.qty }, 'direct-pay: failed to release stock reservation');
      }
    }
    await finishOrderDelivery(order.id, 'failed', 0, 'direct-pay delivery rolled back');
    const reason = err instanceof Error ? err.message : String(err);
    try {
      await refundWalletOnce(
        deposit.user_id,
        Number(intent.total),
        `delivery_refund:deposit:${deposit.id}`,
      );
      await finishDirectPayFulfillment(deposit.id, 'refunded', reason);
    } catch (refundErr) {
      logger.error({ err: refundErr, depositId: deposit.id, orderId: order.id, reason }, 'direct-pay: refund/recovery failed');
      await finishDirectPayFulfillment(deposit.id, 'failed', reason).catch(() => undefined);
    }
    await markOrderLifecycleSafe(order.id, 'failed', { note: reason.slice(0, 200) });
    await setOrderDeliveredItems(order.id, `Fulfillment failed — admin recovery required. ${reason.slice(0, 500)}`).catch((stateErr) =>
      logger.warn({ err: stateErr, orderId: order.id }, 'direct-pay: failed to persist recovery marker'),
    );
    return { ok: false, reason, refundedToWallet: true };
  }
}

async function safeNotify(api: Api, userId: number, text: string): Promise<void> {
  try {
    await api.sendMessage(userId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    logger.warn({ err, userId }, 'direct-pay: user DM failed');
  }
}

async function safeSendHtml(
  api: Api,
  userId: number,
  html: string,
  opts?: Parameters<Api['sendMessage']>[2],
): Promise<void> {
  try {
    await api.sendMessage(userId, html, { parse_mode: 'HTML', ...(opts ?? {}) });
  } catch (err) {
    logger.warn({ err, userId }, 'direct-pay: user HTML DM failed');
  }
}
