/**
 * Phase B — per-order direct-pay handlers.
 *
 * Wires the four auto-verify networks (USDT BEP20 / TRC20 / TON,
 * LTC) into the checkout flow so a buyer can pay for a *specific*
 * product directly with crypto rather than topping up their wallet
 * first.
 *
 * The user-facing surface mirrors `topup.ts`: a network picker, a
 * "Send X to <address>, paste tx hash below" screen, and a verifier
 * that auto-fulfils on success. The two flows are kept in separate
 * modules because:
 *   1. Direct-pay deposits carry an `order_intent` (locked product +
 *      qty + price), and the verifier uses that intent in
 *      `services/orderFulfill.ts` to deliver the order instead of
 *      crediting the wallet.
 *   2. The LTC step is collapsed to a single screen — USD is fixed
 *      at the order total, so we lock the rate as soon as the user
 *      picks LTC instead of asking for a USD amount first.
 *
 * On verifier failure the deposit stays pending and admin can
 * approve manually via the existing `🔁 Re-verify` panel; if the
 * order is approved later the same `fulfilOrderForDeposit` path
 * runs and the user gets their items.
 */
import type { Composer } from 'grammy';
import { InlineKeyboard } from 'grammy';
import {
  createDeposit,
  findDepositByTxHash,
  getDeposit,
  getProduct,
  listPaymentMethods,
  setCryptoPayInvoiceId,
  setCryptoPayNotificationMessage,
  setDepositNote,
  setDepositStatus,
} from '../db/queries.js';
import { btn, inlineBtn } from '../keyboards/helpers.js';
import { paymentMethodsKeyboard } from '../keyboards/payMethods.js';
import { PE } from './paymentInstructionEmojis.js';
import {
  invoiceAmount,
  paymentInvoiceKeyboard,
  renderPaymentInvoice,
} from '../ui/paymentInvoice.js';
import { invoiceSpecFor } from '../ui/paymentInvoiceSpecs.js';
import type { AppCtx } from '../middleware/user.js';
import { renderMdHtml } from '../services/premium.js';
import { fetchLtcUsdRate, quoteLtc } from '../services/chainVerify.js';
import { verifyAndCreditDeposit } from '../services/depositVerify.js';
import { classifyReason, friendlyReason } from '../services/verifyReason.js';
import { startVerifyingMessage } from '../services/verifyingMsg.js';
import {
  manualReviewKeyboard,
  rejectionKeyboard,
  successKeyboard,
} from '../keyboards/verifyResult.js';
import { consume, formatRetryAfter } from '../services/rateLimit.js';
import {
  applyUserPriceToProduct,
} from '../services/pricing.js';
import { priceBreakdown, resolvePromo } from '../services/promo.js';
import { logger } from '../logger.js';
import * as adminLog from '../services/adminLog.js';
import { QTY_MIN } from '../../config/index.js';
import type {
  DBPaymentMethod,
  DBProduct,
  OrderIntent,
  PaymentProvider,
} from '../types.js';
import { renderPaymentMethodTutorial } from '../services/payMethodTutorialView.js';
import { createInvoice } from '../services/cryptoPay.js';

const LTC_QUOTE_TTL_MIN = 10;

/**
 * If the same user re-pastes the same TX hash for an *already-pending*
 * direct-pay deposit within this window, we reuse the existing row
 * and re-run the verifier instead of rejecting them as "already used".
 * Mirrors the top-up re-verify window so a buyer whose first attempt
 * was deferred to admin can simply paste the hash again to retry
 * without losing their order. An approved row, or a stale pending row
 * older than 15 minutes / belonging to another user, still falls
 * through to the strict "Already used" reject.
 */
const REVERIFY_WINDOW_MS = 15 * 60 * 1000;

/**
 * Render the short, dangerous-looking "Transaction Cancelled" card
 * shown when a buyer pastes an unrecognised TX hash / Order ID into
 * the direct-pay flow. The bot owner asked us to skip the previous
 * long "that doesn't look like…" explainer in favour of an instant
 * cancel + Back button so first-time mistypers don't get stuck on a
 * wall of text.
 *
 * Render path:
 *   - `{tx_cancelled}` token resolves to the premium red ❌ glyph
 *     declared in `EMOJI.tx_cancelled` (see config/index.ts).
 *   - The body is a single bold line — short enough to fit on one
 *     line on every Telegram client.
 *   - The keyboard is a single red `◀️ Back` row that takes the
 *     buyer back to the product detail page so they can re-open
 *     the direct-pay screen for a fresh attempt.
 */
async function sendTxCancelled(
  ctx: AppCtx,
  productId: number,
): Promise<void> {
  const kb = new InlineKeyboard();
  inlineBtn(kb, ctx.lang, 'cancel_pay', `prod:${productId}`);
  await ctx.reply(
    renderMdHtml('{tx_cancelled} *Transaction Cancelled.*', {
      tx_cancelled: 'tx_cancelled',
    }),
    { parse_mode: 'HTML', reply_markup: kb },
  );
}

/**
 * Build the OrderIntent for a given product/user/qty pair. Resolves
 * the user's effective price + active promo server-side so the
 * total locked into the deposit matches what the user saw on the
 * product page.
 */
/**
 * Pick the user-facing tutorial button label for a payment method —
 * Binance Pay collects an Order ID (not an on-chain hash), so it
 * gets the "Where Order ID?" CTA; everything else (USDT chains + LTC)
 * gets "Where TXID?". Mirrors the helper of the same name in
 * `topup.ts` so both flows surface the tutorial card consistently.
 */
function tutButtonKeyFor(
  provider: PaymentProvider,
): 'where_txid' | 'where_order_id' {
  return provider === 'binance_pay' || provider === 'bybit_pay'
    ? 'where_order_id'
    : 'where_txid';
}

/**
 * Build the inline keyboard rendered under each direct-pay
 * instruction screen. Adds the per-method tutorial button
 * (`📘 Where TXID? / Where Order ID?`) above the standard Back row.
 * The tutorial callback (`paytut:dp:<productId>:<methodId>`) opens
 * the admin-editable how-to card sourced from
 * `pay_tutorial.<id>.*` and routes its Back button back to the
 * direct-pay network picker for this product.
 */
function directPayInstructionKeyboard(
  ctx: AppCtx,
  m: DBPaymentMethod,
  productId: number,
  opts: { depositId?: number | null; amount?: number | null; currency?: string } = {},
): InlineKeyboard {
  const spec = invoiceSpecFor(m, {
    depositId: opts.depositId ?? null,
    amount: opts.amount ?? null,
    currency: opts.currency ?? 'USDT',
  });
  const submitLabel =
    m.provider === 'binance_pay' ? '🧾 Submit Order ID' : '🧾 Submit TXID';
  return paymentInvoiceKeyboard({
    copies: spec.copies,
    extra: [
      {
        label: btn(ctx.lang, tutButtonKeyFor(m.provider)),
        callbackData: `paytut:dp:${productId}:${m.id}`,
      },
    ],
    submit: { label: submitLabel, callbackData: `payinv:submit:${m.id}` },
    // Same red Cancel affordance as every other payment screen; the
    // callback target still returns to the network picker.
    cancel: {
      label: btn(ctx.lang, 'cancel_pay'),
      callbackData: `pay:direct:${productId}`,
    },
  });
}

async function buildIntent(
  ctx: AppCtx,
  raw: DBProduct,
  qty: number,
): Promise<OrderIntent> {
  const p = await applyUserPriceToProduct(ctx.user.telegram_id, raw);
  const promo = await resolvePromo(ctx.user.telegram_id, p.id, qty, p.price);
  const { discount, total } = priceBreakdown(p.price, qty, promo);
  return {
    product_id: p.id,
    product_name: p.name,
    qty,
    unit_price: p.price,
    discount,
    promo_id: promo?.promo.id ?? null,
    total,
  };
}

export function registerDirectPay(bot: Composer<AppCtx>): void {
  // Step 1 — user tapped "💸 Pay Directly" on the buy-now picker.
  // Show the auto-verify network picker (same providers as top-up
  // minus 'manual' since manual providers can't auto-fulfil).
  bot.callbackQuery(/^pay:direct:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const raw = await getProduct(id);
    if (!raw) {
      await ctx.answerCallbackQuery({ text: ctx.t('err.unknown_action') });
      return;
    }
    const p = await applyUserPriceToProduct(ctx.user.telegram_id, raw);
    const qty = ctx.session.qty[id] ?? QTY_MIN;
    const intent = await buildIntent(ctx, raw, qty);

    const methods = (await listPaymentMethods()).filter((m) => m.provider !== 'manual');
    if (methods.length === 0) {
      await ctx.answerCallbackQuery({
        text: 'No direct-pay networks are configured yet — admin must add at least one auto-verify method.',
        show_alert: true,
      });
      return;
    }

    // Bot-owner spec: Direct-Pay's network picker drops the
    // "Others / Payment Support" row entirely. Buyers who need help
    // with an unsupported method use the main Support menu — keeping
    // that entry point on the buy-flow added an extra click between
    // tapping Pay Directly and seeing the actual address.
    const kb = paymentMethodsKeyboard(
      ctx.lang,
      methods,
      (mid) => `pdpm:${id}:${mid}`,
      null,
      `buy:${p.id}`,
    );

    // Direct-Pay "Select payment method" card — minimal layout per
    // user spec:
    //
    //   💸 Select payment method
    //   <product-glyph> Product name × Qty
    //   💳 Total: 2.00 USDT
    //   🔎 Please send the exact amount for verification.
    //
    // The Order-summary block stays on the *Buy Now* card (shop.ts);
    // this screen is only the actual pay-method picker, so it just
    // re-states the product + total before the keyboard.
    //
    // The product glyph uses the product's own premium emoji_id (with
    // the unicode emoji as fallback). We can't register it in the
    // EMOJI map (it's per-product / dynamic), so we render via a
    // placeholder token that's safe across the markdown→HTML pipeline
    // (alphanumerics + underscore aren't HTML-escaped), then swap it
    // post-render for the raw `<tg-emoji>` HTML.
    const PRODUCT_GLYPH_PLACEHOLDER = 'XPRODUCTGLYPHX';
    const productUnicode = p.emoji && p.emoji.length > 0 && p.emoji !== '🛒' ? p.emoji : '🎁';
    // Defensive HTML-escape of the product fields so a stray `"` /
    // `<` in admin-typed values can't break out of the attribute or
    // smuggle markup.
    const escAttr = (s: string): string =>
      s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const escText = (s: string): string =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const productGlyphHtml =
      p.emoji_id && p.emoji_id.length > 0
        ? `<tg-emoji emoji-id="${escAttr(p.emoji_id)}">${escText(productUnicode)}</tg-emoji>`
        : escText(productUnicode);
    const body = [
      '{title} *Select payment method*',
      '',
      `${PRODUCT_GLYPH_PLACEHOLDER} *${intent.product_name}* × *${intent.qty}*`,
      `{total} *Total:* ${intent.total.toFixed(2)} USDT`,
      '',
      '{verify} Please send the exact amount for verification.',
    ].join('\n');
    const html = renderMdHtml(body, {
      title: 'direct_pay_title',
      total: 'direct_pay_total',
      verify: 'direct_pay_verify',
    }).replace(PRODUCT_GLYPH_PLACEHOLDER, productGlyphHtml);

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(html, {
      parse_mode: 'HTML',
      reply_markup: kb,
    });
  });

  // Step 2 — user picked a network. Branch on provider and either
  // show the Pay ID / address screen, or (for LTC) lock a quote
  // immediately + create the deposit row.
  bot.callbackQuery(/^pdpm:(\d+):(\d+)$/, async (ctx) => {
    const productId = Number(ctx.match[1]);
    const methodId = Number(ctx.match[2]);
    const raw = await getProduct(productId);
    if (!raw) {
      await ctx.answerCallbackQuery({ text: ctx.t('err.unknown_action') });
      return;
    }
    const methods = await listPaymentMethods();
    const m = methods.find((x) => x.id === methodId);
    if (!m) {
      await ctx.answerCallbackQuery({ text: ctx.t('err.unknown_action') });
      return;
    }
    const qty = ctx.session.qty[productId] ?? QTY_MIN;
    const intent = await buildIntent(ctx, raw, qty);

    await ctx.answerCallbackQuery();

    if (
      m.provider === 'usdt_trc20' ||
      m.provider === 'usdt_bep20' ||
      m.provider === 'usdt_ton'
    ) {
      if (!m.address) {
        await ctx.editMessageText(
          renderMdHtml(
            '⚠️ This payment method has no wallet address configured. Please contact support.',
          ),
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard().text(
              btn(ctx.lang, 'back'),
              `pay:direct:${productId}`,
            ),
          },
        );
        return;
      }
      // Lock the flow-open instant the moment the user lands on the
      // address screen. The verifier in `services/depositVerify.ts`
      // anchors its 30-min freshness window on this value so an
      // attacker can't replay an old vendor TXID.
      ctx.session.userFlow = {
        type: 'direct_chain',
        step: 'tx_hash',
        data: {
          method_id: m.id,
          method_name: m.name,
          provider: m.provider,
          address: m.address,
          intent,
          opened_at_ms: Date.now(),
          instruction_message_id: ctx.callbackQuery?.message?.message_id,
        },
      };
      await ctx.editMessageText(
        renderMdHtml(buildChainDirectScreen(m, intent)),
        {
          parse_mode: 'HTML',
          reply_markup: directPayInstructionKeyboard(ctx, m, productId, {
            amount: intent.total,
          }),
        },
      );
      return;
    }

    if (m.provider === 'binance_pay') {
      if (!m.address || !m.pay_name) {
        await ctx.editMessageText(
          renderMdHtml(
            '⚠️ This Binance Pay method has no Pay ID / Pay Name configured. Please pick another network.',
          ),
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard().text(
              btn(ctx.lang, 'back'),
              `pay:direct:${productId}`,
            ),
          },
        );
        return;
      }

      // Anchor the 30-minute acceptance window on a real deposit row,
      // and lock the OrderIntent into it so the verifier can fulfil
      // the order on success instead of crediting the wallet.
      let depId: number;
      try {
        const dep = await createDeposit({
          user_id: ctx.user.telegram_id,
          method: m.name,
          payment_method_id: m.id,
          amount: intent.total,
          note: 'Direct-pay Binance Pay screen opened — awaiting order id',
          order_intent: intent,
        });
        depId = dep.id;
      } catch (err) {
        logger.error({ err }, 'direct-pay Binance Pay deposit insert failed');
        await ctx.editMessageText(
          '⚠️ Could not start the Binance Pay payment. Please try again or pick another network.',
        );
        return;
      }

      ctx.session.userFlow = {
        type: 'direct_binance',
        step: 'order_id',
        data: {
          method_id: m.id,
          method_name: m.name,
          pay_id: m.address,
          pay_name: m.pay_name,
          deposit_id: depId,
          intent,
          // Lock the flow-open instant — anchors the 30-min Binance
          // Pay window in `services/depositVerify.ts` so an old
          // Order ID can't be replayed.
          opened_at_ms: Date.now(),
          instruction_message_id: ctx.callbackQuery?.message?.message_id,
        },
      };

      await ctx.editMessageText(
        renderMdHtml(buildBinanceDirectScreen(m, intent, depId)),
        {
          parse_mode: 'HTML',
          reply_markup: directPayInstructionKeyboard(ctx, m, productId, {
            amount: intent.total,
            depositId: depId,
          }),
        },
      );
      return;
    }

    if (m.provider === 'cryptobot') {
      let depId: number | undefined;
      try {
        const dep = await createDeposit({
          user_id: ctx.user.telegram_id,
          method: m.name,
          payment_method_id: m.id,
          amount: intent.total,
          note: 'Direct-pay CryptoBot invoice awaiting payment',
          order_intent: intent,
        });
        depId = dep.id;
        const invoiceResult = await createInvoice({
          amount: intent.total,
          payload: String(dep.id),
          expiresIn: 1800,
        });
        if (!invoiceResult.ok || !invoiceResult.invoice.bot_invoice_url) {
          await setDepositStatus(dep.id, 'rejected').catch(() => undefined);
          await ctx.editMessageText(
            renderMdHtml(
              ctx.t('topup.cryptobot.invoice_failed'),
            ),
            {
              parse_mode: 'HTML',
              reply_markup: new InlineKeyboard().text(
                btn(ctx.lang, 'back'),
                `pay:direct:${productId}`,
              ),
            },
          );
          return;
        }
        const invoiceId = String(invoiceResult.invoice.invoice_id);
        await setCryptoPayInvoiceId(dep.id, invoiceId);
        const keyboard = new InlineKeyboard()
          .url(
            ctx.t('topup.cryptobot.open_invoice'),
            invoiceResult.invoice.bot_invoice_url,
          )
          .row()
          .text(ctx.t('topup.cryptobot.check'), `cryptopay:check:${dep.id}`)
          .row()
          .text(btn(ctx.lang, 'back'), `pay:direct:${productId}`);
        await ctx.editMessageText(
          renderMdHtml(
            `${PE.usdt_title} ${ctx.t('directpay.cryptobot.invoice_ready', {
              amount: Number(intent.total).toFixed(2),
            })}`,
          ),
          { parse_mode: 'HTML', reply_markup: keyboard },
        );
        await setCryptoPayNotificationMessage(
          dep.id,
          ctx.chat!.id,
          ctx.callbackQuery!.message!.message_id,
        ).catch((err) =>
          logger.warn(
            {
              err,
              depositId: dep.id,
              messageId: ctx.callbackQuery!.message!.message_id,
            },
            'Direct Crypto Pay invoice message persistence failed',
          ),
        );
      } catch (err) {
        logger.error({ err, depId }, 'Direct Crypto Pay invoice setup failed');
        if (depId) await setDepositStatus(depId, 'rejected').catch(() => undefined);
        await ctx.editMessageText(
          renderMdHtml(ctx.t('topup.cryptobot.invoice_failed')),
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard().text(
              btn(ctx.lang, 'back'),
              `pay:direct:${productId}`,
            ),
          },
        );
      }
      return;
    }

    if (m.provider === 'bybit_pay') {
      if (!m.address) {
        await ctx.editMessageText(
          renderMdHtml(
            'Warning: This Bybit Pay method has no Bybit UID / ID configured. Please pick another method.',
          ),
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard().text(
              btn(ctx.lang, 'back'),
              `pay:direct:${productId}`,
            ),
          },
        );
        return;
      }

      let depId: number;
      try {
        const dep = await createDeposit({
          user_id: ctx.user.telegram_id,
          method: m.name,
          payment_method_id: m.id,
          amount: intent.total,
          note: 'Direct-pay Bybit Pay screen opened - awaiting internal transfer txid',
          order_intent: intent,
        });
        depId = dep.id;
      } catch (err) {
        logger.error({ err }, 'direct-pay Bybit Pay deposit insert failed');
        await ctx.editMessageText(
          'Warning: Could not start the Bybit Pay payment. Please try again or pick another method.',
        );
        return;
      }

      ctx.session.userFlow = {
        type: 'direct_bybit',
        step: 'tx_id',
        data: {
          method_id: m.id,
          method_name: m.name,
          bybit_id: m.address,
          bybit_name: m.pay_name,
          deposit_id: depId,
          intent,
          opened_at_ms: Date.now(),
          instruction_message_id: ctx.callbackQuery?.message?.message_id,
        },
      };

      await ctx.editMessageText(
        renderMdHtml(buildBybitDirectScreen(m, intent, depId)),
        {
          parse_mode: 'HTML',
          reply_markup: directPayInstructionKeyboard(ctx, m, productId, {
            amount: intent.total,
            depositId: depId,
          }),
        },
      );
      return;
    }

    if (m.provider === 'ltc') {
      if (!m.address) {
        await ctx.editMessageText(
          renderMdHtml(
            '⚠️ This payment method has no Litecoin address configured. Please contact support.',
          ),
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard().text(
              btn(ctx.lang, 'back'),
              `pay:direct:${productId}`,
            ),
          },
        );
        return;
      }
      let rate: number;
      try {
        rate = await fetchLtcUsdRate();
      } catch (err) {
        logger.warn({ err }, 'LTC rate fetch failed for direct-pay');
        await ctx.editMessageText(
          renderMdHtml(
            '⚠️ Could not fetch the LTC/USD rate right now. Please pick another network or try again in a minute.',
          ),
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard().text(
              btn(ctx.lang, 'back'),
              `pay:direct:${productId}`,
            ),
          },
        );
        return;
      }
      const { ltcAmount, expiresAt } = quoteLtc(intent.total, rate);
      const expiresAtMs = expiresAt.getTime();

      let depId: number;
      try {
        const dep = await createDeposit({
          user_id: ctx.user.telegram_id,
          method: m.name,
          payment_method_id: m.id,
          amount: intent.total,
          expected_amount: ltcAmount,
          quote_expires_at: expiresAt.toISOString(),
          note: `Direct-pay LTC quote: $${intent.total} = ${ltcAmount} LTC @ $${rate}/LTC`,
          order_intent: intent,
        });
        depId = dep.id;
      } catch (err) {
        logger.error({ err }, 'direct-pay LTC deposit insert failed');
        await ctx.editMessageText(
          renderMdHtml(
            '⚠️ Could not lock the LTC quote. Please try again or contact support.',
          ),
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard().text(
              btn(ctx.lang, 'back'),
              `pay:direct:${productId}`,
            ),
          },
        );
        return;
      }

      ctx.session.userFlow = {
        type: 'direct_ltc',
        step: 'tx_hash',
        data: {
          method_id: m.id,
          method_name: m.name,
          address: m.address,
          deposit_id: depId,
          usd_amount: intent.total,
          ltc_amount: ltcAmount,
          ltc_rate: rate,
          expires_at_ms: expiresAtMs,
          intent,
          // Lock the flow-open instant — anchors the 30-min LTC
          // freshness window. Separate from `expires_at_ms` (which
          // governs how long the locked LTC/USD quote is valid).
          opened_at_ms: Date.now(),
          instruction_message_id: ctx.callbackQuery?.message?.message_id,
        },
      };

      await ctx.editMessageText(
        renderMdHtml(
          renderPaymentInvoice({
            ...invoiceSpecFor(m, {
              amount: intent.total,
              depositId: depId,
              subtitle: `${intent.product_name} × ${intent.qty}`,
              expiryMinutes: LTC_QUOTE_TTL_MIN,
            }),
            fields: [
              {
                emoji: '💰',
                label: 'Send Exactly',
                value: `${ltcAmount} LTC`,
              },
              { emoji: '📥', label: 'Address', value: m.address },
              { emoji: '🧾', label: 'Deposit ID', value: `DEP-${String(depId).padStart(6, '0')}` },
              { emoji: '⏳', label: 'Expires', value: `${LTC_QUOTE_TTL_MIN} Minutes` },
              {
                emoji: '💵',
                label: 'Order Total',
                value: invoiceAmount(intent.total, 'USD'),
              },
            ],
            copies: [
              { label: '📋 Copy Address', value: m.address },
              { label: '💰 Copy Amount', value: String(ltcAmount) },
            ],
          }),
        ),
        {
          parse_mode: 'HTML',
          reply_markup: directPayInstructionKeyboard(ctx, m, productId, {
            amount: Number(ltcAmount),
            currency: 'LTC',
            depositId: depId,
          }),
        },
      );
      return;
    }

    // Defensive: unknown provider — should never happen because the
    // picker filters out 'manual' and only auto-verify providers
    // exist in the constraint, but keep a graceful fallback.
    await ctx.editMessageText(
      renderMdHtml(
        '⚠️ Direct-pay is not available for this payment method. Please pick another.',
      ),
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text(
          btn(ctx.lang, 'back'),
          `pay:direct:${productId}`,
        ),
      },
    );
  });

  // ---- Per-payment-method tutorial card ("Where TXID? / Where Order
  // ID?") for the direct-pay flow. Surfaced under each chain /
  // Binance / LTC instruction screen and rendered as a brand-new
  // HTML message (not an edit) so the buyer's instruction screen —
  // with the Pay ID / address / locked LTC quote — stays visible
  // above the tutorial. The Back row navigates back to
  // `pay:direct:<productId>` (same target as the screen's own Back
  // button) so the buyer returns to the network picker for the same
  // product without losing the OrderIntent. Body text + optional
  // photo / video / document + optional URL button are
  // admin-editable from /admin → Payment Methods → "📘 #N Tutorial".
  bot.callbackQuery(/^paytut:dp:(\d+):(\d+)$/, async (ctx) => {
    const productId = Number(ctx.match[1]);
    const id = Number(ctx.match[2]);
    const methods = await listPaymentMethods();
    const m = methods.find((x) => x.id === id);
    if (!m) {
      await ctx.answerCallbackQuery({ text: ctx.t('err.unknown_action') });
      return;
    }
    await renderPaymentMethodTutorial(
      ctx,
      m.id,
      m.name,
      `pay:direct:${productId}`,
    );
  });

  // Step 4 — text submissions for in-flight direct-pay flows.
  bot.on('message:text', async (ctx, next) => {
    const flow = ctx.session.userFlow;
    if (!flow) return next();

    const text = ctx.message.text.trim();
    if (text === '/cancel' || text.startsWith('/')) {
      ctx.session.userFlow = undefined;
      return next();
    }

    if (flow.type === 'direct_chain') {
      await handleChainDirectSubmit(ctx, flow, text);
      return;
    }
    if (flow.type === 'direct_ltc') {
      await handleLtcDirectSubmit(ctx, flow, text);
      return;
    }
    if (flow.type === 'direct_binance') {
      await handleBinanceDirectSubmit(ctx, flow, text);
      return;
    }
    if (flow.type === 'direct_bybit') {
      await handleBybitDirectSubmit(ctx, flow, text);
      return;
    }
    return next();
  });
}

// ----- Binance Pay direct -------------------------------------------------

async function handleBinanceDirectSubmit(
  ctx: AppCtx,
  flow: Extract<
    NonNullable<AppCtx['session']['userFlow']>,
    { type: 'direct_binance' }
  >,
  text: string,
): Promise<void> {
  const cleaned = text.replace(/\s+/g, '');
  if (!/^\d{6,}$/.test(cleaned)) {
    // Bot-owner spec: unrecognised Order ID = instant cancel. We
    // tear down the in-flight flow and surface the short red
    // "Transaction Cancelled." card so the buyer doesn't get
    // stuck on a wall-of-text validator hint.
    ctx.session.userFlow = undefined;
    await sendTxCancelled(ctx, flow.data.intent.product_id);
    return;
  }
  const orderId = cleaned;
  const depId = flow.data.deposit_id;

  // Rate-limit per user (shares the same key namespace as topup so
  // a single user can't probe via both flows in parallel).
  const rl = consume(`binance_pay:${ctx.user.telegram_id}`, 5, 60_000);
  if (!rl.ok) {
    await ctx.reply(
      renderMdHtml(
        `⏱ Too many Order ID attempts. Please try again in ${formatRetryAfter(rl.retryAfterMs)}.`,
      ),
      { parse_mode: 'HTML' },
    );
    return;
  }
  ctx.session.userFlow = undefined;

  const dep = await getDeposit(depId);
  if (!dep) {
    await ctx.reply('⚠️ Internal error: deposit row missing. Please reopen the screen.');
    return;
  }
  if (dep.status !== 'pending') {
    await ctx.reply(
      renderMdHtml(
        `⚠️ This deposit has already been ${dep.status}. Open a fresh direct-pay screen if you want to pay again.`,
      ),
      { parse_mode: 'HTML' },
    );
    return;
  }
  try {
    await setDepositNote(depId, `Direct-pay Binance Pay order id submitted: ${orderId}`);
  } catch {
    /* noop */
  }

  const verifying = await startVerifyingMessage({
    api: ctx.api,
    chatId: ctx.chat!.id,
    txId: orderId,
  });

  let result;
  try {
    result = await verifyAndCreditDeposit({
      api: ctx.api,
      deposit: dep,
      submission: { orderId },
      openedAtMs: flow.data.opened_at_ms,
      logUser: {
        telegram_id: ctx.user.telegram_id,
        username: ctx.user.username ?? null,
        first_name: ctx.user.first_name ?? null,
        email: ctx.user.email ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, depId, orderId }, 'direct binance auto-verify threw');
    result = {
      ok: false as const,
      reason: 'verifier crashed — admin will check manually',
    };
  }

  if (result.ok) {
    // Bot-owner spec: after Order Delivered the buyer should land
    // back on the product detail / qty page when they tap Back on
    // the verified card — instead of going to the main menu — so
    // they can keep shopping without hunting through the menu.
    // We do NOT send a fresh product page below; the in-place
    // Back navigation re-renders the qty screen on demand.
    await verifying.done({
      text: [
        `✅ *Direct-pay verified (deposit #${depId}).*`,
        '',
        `Order ID: \`${orderId}\``,
        `Charged: *$${Number(result.amount).toFixed(3)}*`,
      ].join('\n'),
      reply_markup: successKeyboard(
        ctx.lang,
        `prod:${flow.data.intent.product_id}`,
      ),
    });
    if (flow.data.instruction_message_id) {
      ctx.api.deleteMessage(ctx.chat!.id, flow.data.instruction_message_id).catch(() => {});
    }
  } else {
    const klass = classifyReason(result.reason);
    try {
      await setDepositNote(
        depId,
        `auto-verify failed: ${result.reason} (order id ${orderId})`,
      );
    } catch {
      /* noop */
    }
    if (klass === 'duplicate') {
      await verifying.done({
        text: [
          `❌ *Already-used order (#${depId}).*`,
          '',
          `Order ID: \`${orderId}\``,
          '_This Binance Pay order has already been used to credit a previous deposit. Each order can only be used once._',
        ].join('\n'),
        reply_markup: successKeyboard(ctx.lang),
      });
    } else if (klass === 'reject') {
      await setDepositStatus(depId, 'rejected').catch(() => undefined);
      await verifying.done({
        text: [
          `❌ *Disapproved (#${depId}).*`,
          '',
          `Order ID: \`${orderId}\``,
          `_${friendlyReason(result.reason)}_`,
          '',
          'This order did not match our records. If you believe this is a mistake, tap *Admin Help* below.',
        ].join('\n'),
        reply_markup: rejectionKeyboard(ctx.lang, depId, orderId, result.reason),
      });
    } else {
      await verifying.done({
        text: [
          `⏳ *Submitted (#${depId}) — pending admin review.*`,
          '',
          `Order ID: \`${orderId}\``,
          `_${friendlyReason(result.reason)}_`,
          '',
          'Your order will be delivered as soon as admin verifies the payment manually.',
        ].join('\n'),
        reply_markup: manualReviewKeyboard(ctx.lang, depId, orderId),
      });
      void adminLog.logTopupSubmitted(ctx.api, {
        user: {
          telegram_id: ctx.user.telegram_id,
          username: ctx.user.username ?? null,
          first_name: ctx.user.first_name ?? null,
          email: ctx.user.email ?? null,
        },
        depositDbId: depId,
        method: flow.data.method_name,
        reference: orderId,
        reason: result.reason,
      });
    }
  }
}

// ----- Bybit Pay direct ---------------------------------------------------

async function handleBybitDirectSubmit(
  ctx: AppCtx,
  flow: Extract<
    NonNullable<AppCtx['session']['userFlow']>,
    { type: 'direct_bybit' }
  >,
  text: string,
): Promise<void> {
  const cleaned = text.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9_-]{6,100}$/.test(cleaned)) {
    ctx.session.userFlow = undefined;
    await sendTxCancelled(ctx, flow.data.intent.product_id);
    return;
  }
  const txId = cleaned;
  const depId = flow.data.deposit_id;

  const rl = consume(`bybit_pay:${ctx.user.telegram_id}`, 5, 60_000);
  if (!rl.ok) {
    await ctx.reply(
      renderMdHtml(
        `⏱ Too many Bybit TXID attempts. Please try again in ${formatRetryAfter(rl.retryAfterMs)}.`,
      ),
      { parse_mode: 'HTML' },
    );
    return;
  }
  ctx.session.userFlow = undefined;

  const dep = await getDeposit(depId);
  if (!dep) {
    await ctx.reply('Warning: deposit row missing. Please reopen the direct-pay screen.');
    return;
  }
  if (dep.status !== 'pending') {
    await ctx.reply(
      renderMdHtml(
        `Warning: This deposit has already been ${dep.status}. Open a fresh direct-pay screen if you want to pay again.`,
      ),
      { parse_mode: 'HTML' },
    );
    return;
  }
  await setDepositNote(depId, `Direct-pay Bybit internal transfer TXID submitted: ${txId}`).catch(() => undefined);

  const verifying = await startVerifyingMessage({
    api: ctx.api,
    chatId: ctx.chat!.id,
    txId,
  });

  let result;
  try {
    result = await verifyAndCreditDeposit({
      api: ctx.api,
      deposit: dep,
      submission: { orderId: txId },
      openedAtMs: flow.data.opened_at_ms,
      logUser: {
        telegram_id: ctx.user.telegram_id,
        username: ctx.user.username ?? null,
        first_name: ctx.user.first_name ?? null,
        email: ctx.user.email ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, depId, txId }, 'direct bybit auto-verify threw');
    result = {
      ok: false as const,
      reason: `verifier crashed: ${(err as Error)?.message ?? String(err)}`,
    };
  }

  if (result.ok) {
    await verifying.done({
      text: [
        `✅ *Direct-pay verified (deposit #${depId}).*`,
        '',
        `Bybit TXID: \`${txId}\``,
        `Charged: *$${Number(result.amount).toFixed(3)}*`,
      ].join('\n'),
      reply_markup: successKeyboard(ctx.lang, `prod:${flow.data.intent.product_id}`),
    });
    if (flow.data.instruction_message_id) {
      ctx.api.deleteMessage(ctx.chat!.id, flow.data.instruction_message_id).catch(() => {});
    }
    return;
  }

  const klass = classifyReason(result.reason);
  await setDepositNote(
    depId,
    `auto-verify failed: ${result.reason} (bybit txid ${txId})`,
  ).catch(() => undefined);
  if (klass === 'duplicate') {
    await verifying.done({
      text: [
        `❌ *Already-used Bybit TXID (#${depId}).*`,
        '',
        `Bybit TXID: \`${txId}\``,
        '_This Bybit transfer has already been used to credit a previous deposit. Each TXID can only be used once._',
      ].join('\n'),
      reply_markup: successKeyboard(ctx.lang, `prod:${flow.data.intent.product_id}`),
    });
  } else if (klass === 'reject') {
    await setDepositStatus(depId, 'rejected').catch(() => undefined);
    await verifying.done({
      text: [
        `❌ *Disapproved (#${depId}).*`,
        '',
        `Bybit TXID: \`${txId}\``,
        `_${friendlyReason(result.reason)}_`,
        '',
        'This transfer did not match our records. If you believe this is a mistake, tap *Admin Help* below.',
      ].join('\n'),
      reply_markup: rejectionKeyboard(
        ctx.lang,
        depId,
        txId,
        result.reason,
        `prod:${flow.data.intent.product_id}`,
      ),
    });
  } else {
    await verifying.done({
      text: [
        `⏳ *Submitted (#${depId}) - pending admin review.*`,
        '',
        `Bybit TXID: \`${txId}\``,
        `_${friendlyReason(result.reason)}_`,
        '',
        'Your order will be delivered as soon as admin verifies the payment manually.',
      ].join('\n'),
      reply_markup: manualReviewKeyboard(
        ctx.lang,
        depId,
        txId,
        `prod:${flow.data.intent.product_id}`,
      ),
    });
    void adminLog.logTopupSubmitted(ctx.api, {
      user: {
        telegram_id: ctx.user.telegram_id,
        username: ctx.user.username ?? null,
        first_name: ctx.user.first_name ?? null,
        email: ctx.user.email ?? null,
      },
      depositDbId: depId,
      method: flow.data.method_name,
      reference: txId,
      reason: result.reason,
    });
  }
}

// ----- USDT chain direct (BEP20 / TRC20 / TON) ---------------------------

async function handleChainDirectSubmit(
  ctx: AppCtx,
  flow: Extract<
    NonNullable<AppCtx['session']['userFlow']>,
    { type: 'direct_chain' }
  >,
  text: string,
): Promise<void> {
  // Rate-limit on-chain TX hash submissions per user to prevent
  // brute-force probing — same envelope as `handleChainTopupSubmit`
  // (10 attempts / 60s) and shares the bucket with top-up so a buyer
  // bouncing between the two flows can't double their throughput.
  const rl = consume(`chain_tx:${ctx.user.telegram_id}`, 10, 60_000);
  if (!rl.ok) {
    await ctx.reply(
      renderMdHtml(
        `⏱ Too many TX hash attempts. Please try again in ${formatRetryAfter(rl.retryAfterMs)}.`,
      ),
      { parse_mode: 'HTML' },
    );
    return;
  }

  const cleaned = text.replace(/\s+/g, '');
  const provider = flow.data.provider;
  let txHash: string;

  // Bot-owner spec: any unrecognised tx hash = instant cancel. We
  // collapse the previous per-chain validator hints into a single
  // short red "Transaction Cancelled." card so a mistype doesn't
  // leave the buyer stuck reading a long format explainer. Each
  // branch only stays here long enough to normalise the hash for
  // downstream `verifyAndCreditDeposit` (lower-case TRON / BSC,
  // pass-through TON).
  if (provider === 'usdt_trc20') {
    const stripped = cleaned.replace(/^0x/i, '');
    if (!/^[0-9a-fA-F]{64}$/.test(stripped)) {
      ctx.session.userFlow = undefined;
      await sendTxCancelled(ctx, flow.data.intent.product_id);
      return;
    }
    txHash = stripped.toLowerCase();
  } else if (provider === 'usdt_bep20') {
    const stripped = cleaned.replace(/^0x/i, '');
    if (!/^[0-9a-fA-F]{64}$/.test(stripped)) {
      ctx.session.userFlow = undefined;
      await sendTxCancelled(ctx, flow.data.intent.product_id);
      return;
    }
    txHash = '0x' + stripped.toLowerCase();
  } else {
    if (
      !/^[0-9a-fA-F]{64}$/.test(cleaned) &&
      !/^[A-Za-z0-9+/=_-]{43,44}$/.test(cleaned)
    ) {
      ctx.session.userFlow = undefined;
      await sendTxCancelled(ctx, flow.data.intent.product_id);
      return;
    }
    txHash = cleaned;
  }

  const intent = flow.data.intent;
  let depId: number;
  let isReverify = false;

  // 15-minute re-verify window — see matching block in
  // `handleChainTopupSubmit`. Lets a buyer whose first attempt was
  // deferred to admin (transient API hiccup, indexer lag, etc.)
  // re-paste the same hash and have the verifier run again on the
  // existing pending row instead of dead-ending on "Already used".
  const existingByHash = await findDepositByTxHash(txHash).catch(() => null);
  if (existingByHash) {
    const ageMs = Date.now() - new Date(existingByHash.created_at).getTime();
    const sameUser = existingByHash.user_id === ctx.user.telegram_id;
    const reverifyOk =
      sameUser &&
      existingByHash.status === 'pending' &&
      Number.isFinite(ageMs) &&
      ageMs >= 0 &&
      ageMs < REVERIFY_WINDOW_MS;
    if (reverifyOk) {
      depId = existingByHash.id;
      isReverify = true;
      logger.info(
        { depId, ageMs, txHash },
        'directPay: reusing pending deposit for re-verification',
      );
    } else {
      await ctx.reply(
        renderMdHtml(
          '❌ *Already-used transaction.*\n\nThis transaction hash has already been used to credit a previous deposit. Each transaction can only be used once.',
        ),
        { parse_mode: 'HTML' },
      );
      ctx.session.userFlow = undefined;
      return;
    }
  } else {
    try {
      const dep = await createDeposit({
        user_id: ctx.user.telegram_id,
        method: flow.data.method_name,
        payment_method_id: flow.data.method_id,
        amount: intent.total,
        reference: txHash,
        note: 'Direct-pay on-chain tx submitted via auto-verify',
        tx_hash: txHash,
        order_intent: intent,
      });
      depId = dep.id;
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? '';
      if (/23505|duplicate/i.test(msg)) {
        await ctx.reply(
          renderMdHtml(
            '❌ *Already-used transaction.*\n\nThis transaction hash has already been used to credit a previous deposit. Each transaction can only be used once.',
          ),
          { parse_mode: 'HTML' },
        );
        ctx.session.userFlow = undefined;
        return;
      }
      logger.error({ err }, 'Direct-pay chain deposit insert failed');
      await ctx.reply(
        '⚠️ Could not record your payment. Please try again or contact support.',
      );
      ctx.session.userFlow = undefined;
      return;
    }
  }
  ctx.session.userFlow = undefined;

  const dep = await getDeposit(depId);
  if (!dep) {
    await ctx.reply('⚠️ Internal error: deposit row missing right after insert.');
    return;
  }
  const verifying = await startVerifyingMessage({
    api: ctx.api,
    chatId: ctx.chat!.id,
    txId: txHash,
  });

  let result;
  try {
    result = await verifyAndCreditDeposit({
      api: ctx.api,
      deposit: dep,
      submission: { txHash },
      openedAtMs: flow.data.opened_at_ms,
      isReverify,
      logUser: {
        telegram_id: ctx.user.telegram_id,
        username: ctx.user.username ?? null,
        first_name: ctx.user.first_name ?? null,
        email: ctx.user.email ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, depId, txHash }, 'direct chain auto-verify threw');
    result = {
      ok: false as const,
      reason: `verifier crashed: ${(err as Error)?.message ?? String(err)}`,
    };
  }

  if (result.ok) {
    // Bot-owner spec: post-delivery Back lands on the qty page
    // in-place. See matching comment in `handleBinanceDirectSubmit`.
    await verifying.done({
      text: [
        `✅ *Direct-pay verified (deposit #${depId}).*`,
        '',
        `Tx: \`${txHash}\``,
        `Charged: *$${result.amount.toFixed(2)}*`,
      ].join('\n'),
      reply_markup: successKeyboard(ctx.lang, `prod:${intent.product_id}`),
    });
    if (flow.data.instruction_message_id) {
      ctx.api.deleteMessage(ctx.chat!.id, flow.data.instruction_message_id).catch(() => {});
    }
  } else {
    const klass = classifyReason(result.reason);
    try {
      await setDepositNote(depId, `auto-verify failed: ${result.reason}`);
    } catch {
      /* noop */
    }
    if (klass === 'duplicate') {
      await verifying.done({
        text: [
          `❌ *Already-used transaction (#${depId}).*`,
          '',
          `Tx: \`${txHash}\``,
          '_This transaction has already been used to credit a previous deposit. Each transaction can only be used once._',
        ].join('\n'),
        reply_markup: successKeyboard(ctx.lang),
      });
    } else if (klass === 'reject') {
      await setDepositStatus(depId, 'rejected').catch(() => undefined);
      await verifying.done({
        text: [
          `❌ *Disapproved (#${depId}).*`,
          '',
          `Tx: \`${txHash}\``,
          `_${friendlyReason(result.reason)}_`,
          '',
          'This transaction did not match our records. If you believe this is a mistake, tap *Admin Help* below.',
        ].join('\n'),
        reply_markup: rejectionKeyboard(ctx.lang, depId, txHash, result.reason),
      });
    } else {
      await verifying.done({
        text: [
          `⏳ *Submitted (#${depId}) — pending admin review.*`,
          '',
          `Tx: \`${txHash}\``,
          `_${friendlyReason(result.reason)}_`,
          '',
          'Your order will be delivered as soon as admin verifies the payment manually.',
        ].join('\n'),
        reply_markup: manualReviewKeyboard(ctx.lang, depId, txHash),
      });
      void adminLog.logTopupSubmitted(ctx.api, {
        user: {
          telegram_id: ctx.user.telegram_id,
          username: ctx.user.username ?? null,
          first_name: ctx.user.first_name ?? null,
          email: ctx.user.email ?? null,
        },
        depositDbId: depId,
        method: flow.data.method_name,
        reference: txHash,
        reason: result.reason,
      });
    }
  }
}

// ----- LTC direct ---------------------------------------------------------

async function handleLtcDirectSubmit(
  ctx: AppCtx,
  flow: Extract<
    NonNullable<AppCtx['session']['userFlow']>,
    { type: 'direct_ltc' }
  >,
  text: string,
): Promise<void> {
  const cleaned = text.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(cleaned)) {
    // Bot-owner spec: instant cancel on unrecognised tx hash.
    // Single short red card replaces the previous validator hint.
    ctx.session.userFlow = undefined;
    await sendTxCancelled(ctx, flow.data.intent.product_id);
    return;
  }
  if (Date.now() > flow.data.expires_at_ms) {
    await ctx.reply(
      renderMdHtml(
        '⏰ Your LTC quote expired. Tap *Pay Directly* on the product page again to get a fresh rate.',
      ),
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text(btn(ctx.lang, 'back'), 'main:open'),
      },
    );
    ctx.session.userFlow = undefined;
    return;
  }

  ctx.session.userFlow = undefined;
  const depId = flow.data.deposit_id;

  const dep = await getDeposit(depId);
  if (!dep) {
    await ctx.reply('⚠️ Internal error: deposit row missing.');
    return;
  }
  const verifying = await startVerifyingMessage({
    api: ctx.api,
    chatId: ctx.chat!.id,
    txId: cleaned,
  });

  let result;
  try {
    result = await verifyAndCreditDeposit({
      api: ctx.api,
      deposit: dep,
      submission: { txHash: cleaned },
      openedAtMs: flow.data.opened_at_ms,
      logUser: {
        telegram_id: ctx.user.telegram_id,
        username: ctx.user.username ?? null,
        first_name: ctx.user.first_name ?? null,
        email: ctx.user.email ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, depId }, 'direct LTC auto-verify threw');
    result = {
      ok: false as const,
      reason: `verifier crashed: ${(err as Error)?.message ?? String(err)}`,
    };
  }

  if (result.ok) {
    // Bot-owner spec: post-delivery Back lands on the qty page
    // in-place. See matching comment in `handleBinanceDirectSubmit`.
    await verifying.done({
      text: [
        `✅ *Direct-pay verified (deposit #${depId}).*`,
        '',
        `Tx: \`${cleaned}\``,
        `Charged: *$${result.amount.toFixed(2)}*`,
      ].join('\n'),
      reply_markup: successKeyboard(
        ctx.lang,
        `prod:${flow.data.intent.product_id}`,
      ),
    });
    if (flow.data.instruction_message_id) {
      ctx.api.deleteMessage(ctx.chat!.id, flow.data.instruction_message_id).catch(() => {});
    }
  } else {
    const klass = classifyReason(result.reason);
    try {
      await setDepositNote(depId, `auto-verify failed: ${result.reason}`);
    } catch {
      /* noop */
    }
    if (klass === 'duplicate') {
      await verifying.done({
        text: [
          `❌ *Already-used transaction (#${depId}).*`,
          '',
          `Tx: \`${cleaned}\``,
          '_This transaction has already been used to credit a previous deposit. Each transaction can only be used once._',
        ].join('\n'),
        reply_markup: successKeyboard(ctx.lang),
      });
    } else if (klass === 'reject') {
      await setDepositStatus(depId, 'rejected').catch(() => undefined);
      await verifying.done({
        text: [
          `❌ *Disapproved (#${depId}).*`,
          '',
          `Tx: \`${cleaned}\``,
          `_${friendlyReason(result.reason)}_`,
          '',
          'This transaction did not match our records. If you believe this is a mistake, tap *Admin Help* below.',
        ].join('\n'),
        reply_markup: rejectionKeyboard(ctx.lang, depId, cleaned, result.reason),
      });
    } else {
      await verifying.done({
        text: [
          `⏳ *Submitted (#${depId}) — pending admin review.*`,
          '',
          `Tx: \`${cleaned}\``,
          `_${friendlyReason(result.reason)}_`,
          '',
          'Your order will be delivered as soon as admin verifies the payment manually.',
        ].join('\n'),
        reply_markup: manualReviewKeyboard(ctx.lang, depId, cleaned),
      });
      void adminLog.logTopupSubmitted(ctx.api, {
        user: {
          telegram_id: ctx.user.telegram_id,
          username: ctx.user.username ?? null,
          first_name: ctx.user.first_name ?? null,
          email: ctx.user.email ?? null,
        },
        depositDbId: depId,
        method: flow.data.method_name,
        reference: cleaned,
        reason: result.reason,
      });
    }
  }
}

// ----- Screen builders ----------------------------------------------------

function directCtx(
  intent: OrderIntent,
  depositId?: number | null,
): { amount: number; depositId: number | null; subtitle: string } {
  return {
    amount: intent.total,
    depositId: depositId ?? null,
    subtitle: `${intent.product_name} × ${intent.qty}`,
  };
}

function buildBinanceDirectScreen(
  m: DBPaymentMethod,
  intent: OrderIntent,
  depositId?: number | null,
): string {
  return renderPaymentInvoice(invoiceSpecFor(m, directCtx(intent, depositId)));
}

function buildBybitDirectScreen(
  m: DBPaymentMethod,
  intent: OrderIntent,
  depositId?: number | null,
): string {
  return renderPaymentInvoice(invoiceSpecFor(m, directCtx(intent, depositId)));
}

function buildChainDirectScreen(
  m: DBPaymentMethod,
  intent: OrderIntent,
  depositId?: number | null,
): string {
  return renderPaymentInvoice(invoiceSpecFor(m, directCtx(intent, depositId)));
}
