import type { Composer } from 'grammy';
import { InlineKeyboard } from 'grammy';
import {
  createDeposit,
  findDepositByTxHash,
  getDeposit,
  listPaymentMethods,
  setCryptoPayInvoiceId,
  setCryptoPayNotificationMessage,
  setDepositNote,
  setDepositStatus,
} from '../db/queries.js';
import { btn, inlineBtn, inlineUrl } from '../keyboards/helpers.js';
import { paymentMethodsKeyboard } from '../keyboards/payMethods.js';
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
import { logger } from '../logger.js';
import * as adminLog from '../services/adminLog.js';
import type { DBPaymentMethod, PaymentProvider } from '../types.js';
import { getAdminContactUrlWithPrefill } from '../services/settings.js';
import { renderPaymentMethodTutorial } from '../services/payMethodTutorialView.js';
import { PE } from './paymentInstructionEmojis.js';
import {
  paymentInvoiceKeyboard,
  renderPaymentInvoice,
} from '../ui/paymentInvoice.js';
import { invoiceSpecFor } from '../ui/paymentInvoiceSpecs.js';
import { createInvoice, getInvoices } from '../services/cryptoPay.js';
import { processCryptoPayPaidInvoice } from '../services/cryptoPayDeposit.js';
import { formatPriceWithCurrency } from '../../config/currencies.js';

const LTC_QUOTE_TTL_MIN = 10;

/**
 * If the same user re-pastes the same TX hash for an *already-pending*
 * deposit within this window, we reuse the existing deposit row and
 * re-run the verifier instead of rejecting them as "already used". An
 * approved deposit (or an older pending one) still falls through to the
 * "Already used" reject so the dedupe / replay protection stays intact.
 */
const REVERIFY_WINDOW_MS = 15 * 60 * 1000;

/**
 * Resolve the callback that takes the user back to the top-up root
 * menu. When the session was opened via the buy-flow's payment-method
 * picker (`pay_topup` button), the suffix is preserved so re-entering
 * the root keeps the buy-flow context — the root's Back button will
 * then return the user to `buy:<productId>` instead of the main menu.
 */
function topupRootCallback(ctx: AppCtx): string {
  const fromBuy = ctx.session.topupOriginBuyProductId;
  return fromBuy !== undefined ? `topup:open:from:buy:${fromBuy}` : 'topup:open';
}

/**
 * Resolve the callback the top-up root's Back button uses. Returns
 * `buy:<productId>` when the session originated from the buy-flow's
 * payment-method picker (so the user lands back on that picker), or
 * `main:open` otherwise.
 */
function topupExitCallback(ctx: AppCtx): string {
  const fromBuy = ctx.session.topupOriginBuyProductId;
  return fromBuy !== undefined ? `buy:${fromBuy}` : 'main:open';
}

/**
 * Pick the user-facing tutorial button label for a payment method.
 * Binance Pay collects an Order ID (not an on-chain hash), so it gets
 * the "Where Order ID?" CTA; everything else (USDT chains + LTC) gets
 * "Where TXID?". Used by both top-up and direct-pay instruction
 * screens to surface the per-method tutorial card consistently.
 */
function tutButtonKeyFor(
  provider: PaymentProvider,
): 'where_txid' | 'where_order_id' {
  return provider === 'binance_pay' || provider === 'bybit_pay'
    ? 'where_order_id'
    : 'where_txid';
}

/**
 * Build the inline keyboard rendered under each chain / Binance / LTC
 * top-up instruction screen. Adds the per-method tutorial button
 * (`📘 Where TXID? / Where Order ID?`) above the standard Back row.
 * The tutorial callback (`paytut:<methodId>`) opens the admin-editable
 * how-to card sourced from `pay_tutorial.<id>.*`.
 */
function topupInstructionKeyboard(
  ctx: AppCtx,
  m: DBPaymentMethod,
  opts: { depositId?: number | null; amount?: number | null } = {},
): InlineKeyboard {
  const spec = invoiceSpecFor(m, {
    depositId: opts.depositId ?? null,
    amount: opts.amount ?? null,
  });
  const submitLabel =
    m.provider === 'binance_pay' ? '🧾 Submit Order ID' : '🧾 Submit TXID';
  return paymentInvoiceKeyboard({
    copies: spec.copies,
    extra: [
      { label: btn(ctx.lang, tutButtonKeyFor(m.provider)), callbackData: `paytut:${m.id}` },
    ],
    submit: { label: submitLabel, callbackData: `payinv:submit:${m.id}` },
    // Bot-owner spec: every payment-instructions screen exits via a
    // red Cancel button. Callback target is unchanged so the user
    // still lands on the network picker.
    cancel: { label: btn(ctx.lang, 'cancel_pay'), callbackData: topupRootCallback(ctx) },
  });
}

export function registerTopup(bot: Composer<AppCtx>): void {
  // The optional `:from:buy:<productId>` suffix is set when the user
  // entered top-up via the buy-flow payment-method picker — we use
  // it so the Back button returns them to that picker instead of
  // the main menu.
  bot.callbackQuery(/^topup:open(?::from:buy:(\d+))?$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.userFlow = undefined;
    const fromBuyProductId = ctx.match[1] ? Number(ctx.match[1]) : undefined;
    if (fromBuyProductId !== undefined) {
      ctx.session.topupOriginBuyProductId = fromBuyProductId;
    } else {
      ctx.session.topupOriginBuyProductId = undefined;
    }
    await showTopupMenu(ctx, /* asEdit */ true);
  });

  // "Others" payment method — opens a slim "Payment Support" card
  // that mirrors the main Support screen (Contact Admin / Live
  // Support / Back) but is scoped to payment-method requests. The
  // Contact Admin URL deep-links to the admin DM with a prefilled
  // message about another payment method; Live Support reuses the
  // existing single-slot live-chat flow. The :origin suffix tells
  // us which "Back" callback to use (top-up screen vs direct-pay
  // screen).
  bot.callbackQuery(/^pay:others:(topup|direct(?::\d+(?::\d+)?)?)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const origin = ctx.match[1] ?? 'topup';
    const backCallback = origin === 'topup' ? topupRootCallback(ctx) : `pdpm:${origin.replace(/^direct:/, '')}`;
    const contactUrl = getAdminContactUrlWithPrefill(
      'Hey Admin i need help about another payment method for bot payment method name is : ',
    );
    const text = [
      '🆘 *Payment Support*',
      '',
      '_*If the payment method you need isn\'t listed, tap Contact Admin to request it. For real-time help, use Live Support to chat with an admin directly.*_',
    ].join('\n');
    const kb = new InlineKeyboard();
    inlineUrl(kb, ctx.lang, 'support_contact', contactUrl);
    kb.row();
    inlineBtn(kb, ctx.lang, 'support_live', 'support:live:start');
    kb.row();
    inlineBtn(kb, ctx.lang, 'back', backCallback);
    await ctx.editMessageText(renderMdHtml(text), {
      parse_mode: 'HTML',
      reply_markup: kb,
    });
  });

  bot.callbackQuery(/^topup:method:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const methods = await listPaymentMethods();
    const m = methods.find((x) => x.id === id);
    if (!m) {
      await ctx.answerCallbackQuery({ text: ctx.t('err.unknown_action') });
      return;
    }
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
            reply_markup: new InlineKeyboard().text(btn(ctx.lang, 'back'), topupRootCallback(ctx)),
          },
        );
        return;
      }
      // Lock the flow-open instant the moment the user lands on the
      // address screen — anchors the 30-min freshness window in
      // `services/depositVerify.ts` so a stale vendor TXID can't be
      // replayed by re-opening the screen.
      ctx.session.userFlow = {
        type: 'chain_topup',
        step: 'tx_hash',
        data: {
          method_id: m.id,
          method_name: m.name,
          provider: m.provider,
          address: m.address,
          opened_at_ms: Date.now(),
          instruction_message_id: ctx.callbackQuery?.message?.message_id,
        },
      };
      await ctx.editMessageText(renderMdHtml(buildChainTopupScreen(m)), {
        parse_mode: 'HTML',
        reply_markup: topupInstructionKeyboard(ctx, m),
      });
      return;
    }

    if (m.provider === 'binance_pay') {
      if (!m.address || !m.pay_name) {
        await ctx.editMessageText(
          renderMdHtml(
            '⚠️ This Binance Pay method has no Pay ID / Pay Name configured. Please contact support.',
          ),
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard().text(btn(ctx.lang, 'back'), topupRootCallback(ctx)),
          },
        );
        return;
      }
      // Anchor the 30-minute acceptance window on a real deposit row.
      let deposit_id: number;
      try {
        const dep = await createDeposit({
          user_id: ctx.user.telegram_id,
          method: m.name,
          payment_method_id: m.id,
          amount: 0.01,
          note: 'Binance Pay screen opened — awaiting order id',
        });
        deposit_id = dep.id;
      } catch (err) {
        logger.error({ err }, 'Binance Pay: pre-deposit insert failed');
        await ctx.editMessageText(
          '⚠️ Could not start the Binance Pay top-up. Please try again or contact support.',
        );
        return;
      }
      ctx.session.userFlow = {
        type: 'binance_pay_topup',
        step: 'order_id',
        data: {
          method_id: m.id,
          method_name: m.name,
          pay_id: m.address,
          pay_name: m.pay_name,
          deposit_id,
          // Lock the flow-open instant — anchors the 30-min Binance
          // Pay freshness window so an old Order ID can't be replayed.
          opened_at_ms: Date.now(),
          instruction_message_id: ctx.callbackQuery?.message?.message_id,
        },
      };
      await ctx.editMessageText(renderMdHtml(buildBinancePayTopupScreen(m, deposit_id)), {
        parse_mode: 'HTML',
        reply_markup: topupInstructionKeyboard(ctx, m, { depositId: deposit_id }),
      });
      return;
    }

    if (m.provider === 'cryptobot') {
      const minimum = Math.max(0.01, Number(m.min_amount) || 0);
      ctx.session.userFlow = {
        type: 'cryptobot_topup',
        step: 'usd_amount',
        data: {
          method_id: m.id,
          method_name: m.name,
          min_amount: Number(m.min_amount ?? 0),
          instruction_message_id: ctx.callbackQuery?.message?.message_id,
        },
      };
      await ctx.editMessageText(
        renderMdHtml(
          `${PE.usdt_title} ${ctx.t('topup.cryptobot.amount_prompt', {
            min: formatUsdtAmount(minimum),
          })}`,
        ),
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard().text(
            btn(ctx.lang, 'back'),
            topupRootCallback(ctx),
          ),
        },
      );
      return;
    }

    if (m.provider === 'bybit_pay') {
      if (!m.address) {
        await ctx.editMessageText(
          renderMdHtml(
            'Warning: This Bybit Pay method has no Bybit UID / ID configured. Please contact support.',
          ),
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard().text(btn(ctx.lang, 'back'), topupRootCallback(ctx)),
          },
        );
        return;
      }
      let deposit_id: number;
      try {
        const dep = await createDeposit({
          user_id: ctx.user.telegram_id,
          method: m.name,
          payment_method_id: m.id,
          amount: 0.01,
          note: 'Bybit Pay screen opened - awaiting internal transfer txid',
        });
        deposit_id = dep.id;
      } catch (err) {
        logger.error({ err }, 'Bybit Pay: pre-deposit insert failed');
        await ctx.editMessageText(
          'Warning: Could not start the Bybit Pay top-up. Please try again or contact support.',
        );
        return;
      }
      ctx.session.userFlow = {
        type: 'bybit_pay_topup',
        step: 'tx_id',
        data: {
          method_id: m.id,
          method_name: m.name,
          bybit_id: m.address,
          bybit_name: m.pay_name,
          deposit_id,
          opened_at_ms: Date.now(),
          instruction_message_id: ctx.callbackQuery?.message?.message_id,
        },
      };
      await ctx.editMessageText(renderMdHtml(buildBybitPayTopupScreen(m, deposit_id)), {
        parse_mode: 'HTML',
        reply_markup: topupInstructionKeyboard(ctx, m, { depositId: deposit_id }),
      });
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
            reply_markup: new InlineKeyboard().text(btn(ctx.lang, 'back'), topupRootCallback(ctx)),
          },
        );
        return;
      }
      ctx.session.userFlow = {
        type: 'ltc_topup',
        step: 'usd_amount',
        data: {
          method_id: m.id,
          method_name: m.name,
          address: m.address,
          instruction_message_id: ctx.callbackQuery?.message?.message_id,
        },
      };
      // The LTC freshness window's `opened_at_ms` is locked when we
      // transition to the `tx_hash` step inside `handleLtcUsdAmount`
      // (see below) — that's when the verifier becomes reachable.
      await ctx.editMessageText(renderMdHtml(buildLtcUsdAmountScreen(m)), {
        parse_mode: 'HTML',
        reply_markup: topupInstructionKeyboard(ctx, m),
      });
      return;
    }

    // ----- Manual provider (bKash / Nagad / Rocket / other) -----
    // Rendered through the same invoice renderer as every other
    // method, and strictly scoped to the selected wallet: a bKash
    // invoice never shows Nagad or Rocket details, and vice-versa.
    const manualSpec = invoiceSpecFor(m, { expiryMinutes: 60 });
    await ctx.editMessageText(renderMdHtml(renderPaymentInvoice(manualSpec)), {
      parse_mode: 'HTML',
      reply_markup: paymentInvoiceKeyboard({
        copies: manualSpec.copies,
        submit: { label: '🧾 Submit TrxID', callbackData: `topup:request:${m.id}` },
        cancel: {
          label: btn(ctx.lang, 'cancel_pay'),
          callbackData: topupRootCallback(ctx),
        },
      }),
    });
  });

  // ---- Per-payment-method tutorial card ("Where TXID? / Where Order
  // ID?"). Surfaced under each chain / Binance / LTC instruction
  // screen and rendered as a brand-new HTML message (not an edit) so
  // the buyer's instruction screen — with the address / Pay ID /
  // locked LTC quote — stays visible above the tutorial. The Back
  // row navigates to `topup:open` (no side effects, no extra deposit
  // rows). Body text + optional photo / video / document + optional
  // URL button are admin-editable from
  // /admin → Payment Methods → "📘 #N Tutorial".
  // "Submit TXID" on an invoice: the reference is typed into the
  // chat, so the button only reminds the user how to submit. It is a
  // pure UI affordance — no message is sent, no state is changed.
  bot.callbackQuery(/^payinv:submit:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({
      text: 'Paste your TXID / Order ID here in the chat to submit it.',
      show_alert: true,
    });
  });

  bot.callbackQuery(/^paytut:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const methods = await listPaymentMethods();
    const m = methods.find((x) => x.id === id);
    if (!m) {
      await ctx.answerCallbackQuery({ text: ctx.t('err.unknown_action') });
      return;
    }
    await renderPaymentMethodTutorial(ctx, m.id, m.name, topupRootCallback(ctx));
  });

  bot.callbackQuery(/^topup:request:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const methods = await listPaymentMethods();
    const m = methods.find((x) => x.id === id);
    if (!m) {
      await ctx.answerCallbackQuery({ text: ctx.t('err.unknown_action') });
      return;
    }
    const dep = await createDeposit({
      user_id: ctx.user.telegram_id,
      method: m.name,
      payment_method_id: m.id,
      amount: 0,
    });
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(renderMdHtml(ctx.t('topup.requested', { id: dep.id })), {
      parse_mode: 'HTML',
    });
  });

  // ----- Auto-verify top-up flows -----
  bot.on('message:text', async (ctx, next) => {
    const flow = ctx.session.userFlow;
    if (!flow) return next();

    const text = ctx.message.text.trim();
    if (text === '/cancel' || text.startsWith('/')) {
      ctx.session.userFlow = undefined;
      return next();
    }

    if (flow.type === 'chain_topup') {
      await handleChainTopupSubmit(ctx, flow, text);
      return;
    }
    if (flow.type === 'binance_pay_topup') {
      await handleBinancePayOrderId(ctx, flow, text);
      return;
    }
    if (flow.type === 'bybit_pay_topup') {
      await handleBybitPayTxId(ctx, flow, text);
      return;
    }
    if (flow.type === 'ltc_topup') {
      if (flow.step === 'usd_amount') {
        await handleLtcUsdAmount(ctx, flow, text);
        return;
      }
      if (flow.step === 'tx_hash') {
        await handleLtcTxHash(ctx, flow, text);
        return;
      }
    }
    if (flow.type === 'cryptobot_topup' && flow.step === 'usd_amount') {
      await handleCryptoBotUsdAmount(ctx, flow, text);
      return;
    }
    return next();
  });

  bot.callbackQuery(/^cryptopay:check:(\d+)$/, async (ctx) => {
    const depositId = Number(ctx.match[1]);
    const dep = await getDeposit(depositId);
    if (!dep || dep.status !== 'pending' || !dep.tx_hash?.startsWith('cryptopay:')) {
      await ctx.answerCallbackQuery({
        text: ctx.t('topup.cryptobot.check_unavailable'),
      });
      return;
    }
    const invoiceId = dep.tx_hash.slice('cryptopay:'.length);
    const result = await getInvoices([invoiceId]);
    if (!result.ok) {
      await ctx.answerCallbackQuery({
        text: ctx.t('topup.cryptobot.check_failed'),
      });
      return;
    }
    const invoice = result.invoices.find((item) => String(item.invoice_id) === invoiceId);
    if (!invoice || invoice.status !== 'paid') {
      await ctx.answerCallbackQuery({
        text: ctx.t('topup.cryptobot.not_paid'),
      });
      return;
    }
    try {
      const credited = await processCryptoPayPaidInvoice(ctx.api, dep.id, invoice);
      await ctx.answerCallbackQuery({
        text: credited
          ? ctx.t('topup.cryptobot.check_success')
          : ctx.t('topup.cryptobot.already_processed'),
      });
    } catch (err) {
      logger.warn({ err, depositId }, 'Crypto Pay check processing failed');
      await ctx.answerCallbackQuery({
        text: ctx.t('topup.cryptobot.finalize_failed'),
      });
    }
  });
}
// ----- USDT chain flow (BEP20 / TRC20 / TON) -----------------------------

async function handleChainTopupSubmit(
  ctx: AppCtx,
  flow: Extract<NonNullable<AppCtx['session']['userFlow']>, { type: 'chain_topup' }>,
  text: string,
): Promise<void> {
  // Rate-limit on-chain TX hash submissions per user to prevent
  // brute-force probing against the upstream verifier (TonAPI /
  // TronGrid / BscScan). 10 attempts / 60s leaves plenty of headroom
  // for the legitimate "paste, indexer-lag retry" flow while making
  // scripted hash-mining useless.
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

  if (provider === 'usdt_trc20') {
    const stripped = cleaned.replace(/^0x/i, '');
    if (!/^[0-9a-fA-F]{64}$/.test(stripped)) {
      await ctx.reply(
        renderMdHtml(
          "❌ That doesn't look like a TRON tx hash. Paste the 64-character hex transaction id from your wallet.",
        ),
        { parse_mode: 'HTML' },
      );
      return;
    }
    txHash = stripped.toLowerCase();
  } else if (provider === 'usdt_bep20') {
    const stripped = cleaned.replace(/^0x/i, '');
    if (!/^[0-9a-fA-F]{64}$/.test(stripped)) {
      await ctx.reply(
        renderMdHtml(
          "❌ That doesn't look like a BSC tx hash. Paste the `0x…` 66-character transaction id from your wallet.",
        ),
        { parse_mode: 'HTML' },
      );
      return;
    }
    txHash = '0x' + stripped.toLowerCase();
  } else {
    // TON: accept hex (64 chars) or base64 (43-44 chars)
    if (!/^[0-9a-fA-F]{64}$/.test(cleaned) && !/^[A-Za-z0-9+/=_-]{43,44}$/.test(cleaned)) {
      await ctx.reply(
        renderMdHtml(
          "❌ That doesn't look like a TON tx hash. Paste the 64-character hex hash from Tonviewer / Tonscan, or the base64 hash from your wallet.",
        ),
        { parse_mode: 'HTML' },
      );
      return;
    }
    txHash = cleaned;
  }

  let depId: number;
  let isReverify = false;

  // 15-minute re-verify window: if the same user is re-pasting the
  // *same* hash for a still-pending deposit, reuse the existing row
  // instead of either rejecting them as "already used" or creating a
  // duplicate that violates the partial-unique tx_hash index. Any
  // already-approved row, or a stale pending row from a different
  // user / older than 15 minutes, still falls through to the
  // "Already used" path so dedupe / replay protection stays intact.
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
        'topup: reusing pending deposit for re-verification',
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
        amount: 0.01,
        reference: txHash,
        note: 'On-chain tx submitted via auto-verify',
        tx_hash: txHash,
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
      logger.error({ err }, 'Chain top-up deposit insert failed');
      await ctx.reply(
        '⚠️ Could not record your submission. Please try again or contact support.',
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
    logger.error({ err, depId, txHash }, 'chain auto-verify threw');
    result = {
      ok: false as const,
      reason: `verifier crashed: ${(err as Error)?.message ?? String(err)}`,
    };
  }

  if (result.ok) {
    await verifying.done({
      text: [
        `✅ *Auto-verified (#${depId}).*`,
        '',
        `Tx: \`${txHash}\``,
        `Credited: *$${result.amount.toFixed(2)}*`,
        `New balance: *$${Number(result.newBalance).toFixed(2)}*`,
      ].join('\n'),
      reply_markup: successKeyboard(ctx.lang, topupExitCallback(ctx)),
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
        reply_markup: successKeyboard(ctx.lang, topupExitCallback(ctx)),
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
        reply_markup: rejectionKeyboard(
          ctx.lang,
          depId,
          txHash,
          result.reason,
          topupExitCallback(ctx),
        ),
      });
    } else {
      await verifying.done({
        text: [
          `⏳ *Submitted (#${depId}) — pending admin review.*`,
          '',
          `Tx: \`${txHash}\``,
          `_${friendlyReason(result.reason)}_`,
          '',
          'Admin will check your payment manually and credit your wallet shortly.',
        ].join('\n'),
        reply_markup: manualReviewKeyboard(ctx.lang, depId, txHash, topupExitCallback(ctx)),
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

// ----- LTC quote-on-display flow -----------------------------------------

async function handleLtcUsdAmount(
  ctx: AppCtx,
  flow: Extract<NonNullable<AppCtx['session']['userFlow']>, { type: 'ltc_topup'; step: 'usd_amount' }>,
  text: string,
): Promise<void> {
  const usd = Number(text.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(usd) || usd <= 0) {
    await ctx.reply(
      renderMdHtml('❌ Please send a positive USD amount (e.g. `10` or `25.50`).'),
      { parse_mode: 'HTML' },
    );
    return;
  }

  let rate: number;
  try {
    rate = await fetchLtcUsdRate();
  } catch (err) {
    logger.warn({ err }, 'LTC rate fetch failed');
    await ctx.reply(
      renderMdHtml(
        '⚠️ Could not fetch the LTC/USD rate right now. Please try again in a minute, or use a different payment method.',
      ),
      { parse_mode: 'HTML' },
    );
    return;
  }

  const { ltcAmount, expiresAt } = quoteLtc(usd, rate);
  const expiresAtMs = expiresAt.getTime();

  // Insert a pending deposit with the locked quote.
  let depId: number;
  try {
    const dep = await createDeposit({
      user_id: ctx.user.telegram_id,
      method: flow.data.method_name,
      payment_method_id: flow.data.method_id,
      amount: usd,
      expected_amount: ltcAmount,
      quote_expires_at: expiresAt.toISOString(),
      note: `LTC quote: $${usd} = ${ltcAmount} LTC @ $${rate}/LTC`,
    });
    depId = dep.id;
  } catch (err) {
    logger.error({ err }, 'LTC deposit insert failed');
    await ctx.reply(
      '⚠️ Could not lock the LTC quote. Please try again or contact support.',
    );
    ctx.session.userFlow = undefined;
    return;
  }

  ctx.session.userFlow = {
    type: 'ltc_topup',
    step: 'tx_hash',
    data: {
      ...flow.data,
      deposit_id: depId,
      usd_amount: usd,
      ltc_amount: ltcAmount,
      ltc_rate: rate,
      expires_at_ms: expiresAtMs,
      // Lock the flow-open instant for the freshness window — picked
      // here (rather than at `usd_amount`) because the verifier only
      // becomes reachable on the `tx_hash` step. An attacker who
      // pasted an old TXID would still be rejected: the on-chain
      // block timestamp would fall outside the [now-5min, now+30min]
      // window anchored at this instant.
      opened_at_ms: Date.now(),
    },
  };

  const quoteMsg = await ctx.reply(
    renderMdHtml(
      [
        '🟢 *Litecoin Top-Up Quote*',
        '',
        `*Send exactly:* \`${ltcAmount} LTC\``,
        `*To address:* \`${flow.data.address}\``,
        '',
        `_Locked rate:_ $${rate.toFixed(2)} per LTC`,
        `_Quote expires:_ ${LTC_QUOTE_TTL_MIN} min from now`,
        `_Credit on success:_ *$${usd.toFixed(2)}*`,
        '',
        '1️⃣ Send the LTC amount above to the address',
        '2️⃣ Paste your *transaction hash* below',
        '',
        '*Please send your TX hash below:*',
      ].join('\n'),
    ),
    {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text(btn(ctx.lang, 'back'), topupRootCallback(ctx)),
    },
  );
  // Track the quote message so it can be auto-deleted on success.
  const uf = ctx.session.userFlow;
  if (uf && uf.type === 'ltc_topup' && uf.step === 'tx_hash') {
    uf.data.instruction_message_id = quoteMsg.message_id;
  }
}

async function handleLtcTxHash(
  ctx: AppCtx,
  flow: Extract<NonNullable<AppCtx['session']['userFlow']>, { type: 'ltc_topup'; step: 'tx_hash' }>,
  text: string,
): Promise<void> {
  const cleaned = text.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(cleaned)) {
    await ctx.reply(
      renderMdHtml(
        "❌ That doesn't look like a Litecoin tx hash. Paste the 64-character hex transaction id from your wallet.",
      ),
      { parse_mode: 'HTML' },
    );
    return;
  }
  if (Date.now() > flow.data.expires_at_ms) {
    await ctx.reply(
      renderMdHtml(
        '⏰ Your LTC quote expired. Tap *Top-up* again to get a fresh rate.',
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

  // Persist the tx hash on the existing deposit row so dedupe works.
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
    logger.error({ err, depId }, 'LTC auto-verify threw');
    result = {
      ok: false as const,
      reason: `verifier crashed: ${(err as Error)?.message ?? String(err)}`,
    };
  }

  if (result.ok) {
    await verifying.done({
      text: [
        `✅ *Auto-verified (#${depId}).*`,
        '',
        `Tx: \`${cleaned}\``,
        `Credited: *$${result.amount.toFixed(2)}*`,
        `New balance: *$${Number(result.newBalance).toFixed(2)}*`,
      ].join('\n'),
      reply_markup: successKeyboard(ctx.lang, topupExitCallback(ctx)),
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
        reply_markup: successKeyboard(ctx.lang, topupExitCallback(ctx)),
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
        reply_markup: rejectionKeyboard(
          ctx.lang,
          depId,
          cleaned,
          result.reason,
          topupExitCallback(ctx),
        ),
      });
    } else {
      await verifying.done({
        text: [
          `⏳ *Submitted (#${depId}) — pending admin review.*`,
          '',
          `Tx: \`${cleaned}\``,
          `_${friendlyReason(result.reason)}_`,
          '',
          'Admin will check your payment manually and credit your wallet shortly.',
        ].join('\n'),
        reply_markup: manualReviewKeyboard(ctx.lang, depId, cleaned, topupExitCallback(ctx)),
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

// ----- Screen builders ---------------------------------------------------

function buildBinancePayTopupScreen(
  m: DBPaymentMethod,
  depositId?: number | null,
): string {
  return renderPaymentInvoice(invoiceSpecFor(m, { depositId: depositId ?? null }));
}

function buildBybitPayTopupScreen(
  m: DBPaymentMethod,
  depositId?: number | null,
): string {
  return renderPaymentInvoice(invoiceSpecFor(m, { depositId: depositId ?? null }));
}

async function handleBybitPayTxId(
  ctx: AppCtx,
  flow: Extract<
    NonNullable<AppCtx['session']['userFlow']>,
    { type: 'bybit_pay_topup' }
  >,
  text: string,
): Promise<void> {
  const cleaned = text.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9_-]{6,100}$/.test(cleaned)) {
    await ctx.reply(
      renderMdHtml(
        "That doesn't look like a Bybit internal transfer TXID. Paste the full TXID from your Bybit transfer receipt.",
      ),
      { parse_mode: 'HTML' },
    );
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
    await ctx.reply('Warning: deposit row missing. Please reopen the Bybit Pay screen.');
    return;
  }
  if (dep.status !== 'pending') {
    await ctx.reply(
      renderMdHtml(
        `Warning: This deposit has already been ${dep.status}. Open a fresh Bybit Pay screen to submit a new TXID.`,
      ),
      { parse_mode: 'HTML' },
    );
    return;
  }
  await setDepositNote(depId, `Bybit internal transfer TXID submitted: ${txId}`).catch(() => undefined);

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
    logger.error({ err, depId, txId }, 'bybit_pay auto-verify threw');
    result = {
      ok: false as const,
      reason: `verifier crashed: ${(err as Error)?.message ?? String(err)}`,
    };
  }

  if (result.ok) {
    await verifying.done({
      text: [
        `✅ *Bybit Payment Confirmed!* (#${depId})`,
        '',
        `Bybit TXID: \`${txId}\``,
        `Credited: *$${result.amount.toFixed(3)}*`,
        `New balance: *$${Number(result.newBalance).toFixed(2)}*`,
      ].join('\n'),
      reply_markup: successKeyboard(ctx.lang, topupExitCallback(ctx)),
    });
    if (flow.data.instruction_message_id) {
      ctx.api.deleteMessage(ctx.chat!.id, flow.data.instruction_message_id).catch(() => {});
    }
    return;
  }

  const klass = classifyReason(result.reason);
  await setDepositNote(depId, `auto-verify failed: ${result.reason} (bybit txid ${txId})`).catch(() => undefined);
  if (klass === 'duplicate') {
    await verifying.done({
      text: [
        `❌ *Already-used Bybit TXID (#${depId}).*`,
        '',
        `Bybit TXID: \`${txId}\``,
        '_This Bybit transfer has already been used to credit a previous deposit. Each TXID can only be used once._',
      ].join('\n'),
      reply_markup: successKeyboard(ctx.lang, topupExitCallback(ctx)),
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
        topupExitCallback(ctx),
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
        'Admin will check your payment manually and credit your wallet shortly.',
      ].join('\n'),
      reply_markup: manualReviewKeyboard(ctx.lang, depId, txId, topupExitCallback(ctx)),
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

async function handleBinancePayOrderId(
  ctx: AppCtx,
  flow: Extract<
    NonNullable<AppCtx['session']['userFlow']>,
    { type: 'binance_pay_topup' }
  >,
  text: string,
): Promise<void> {
  const cleaned = text.replace(/\s+/g, '');
  if (!/^\d{6,}$/.test(cleaned)) {
    await ctx.reply(
      renderMdHtml(
        "❌ That doesn't look like a Binance Pay Order ID. It should be the 18-digit numeric ID shown on the Binance Pay receipt (e.g. `430098765432109876`).",
      ),
      { parse_mode: 'HTML' },
    );
    return;
  }
  const orderId = cleaned;
  const depId = flow.data.deposit_id;

  // Rate-limit Binance Pay order-id submissions per user to prevent
  // brute-force lookups. 5 attempts / 60s is generous for a real
  // user (one paste per deposit) and tight enough to make scripted
  // probing useless.
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
        `⚠️ This deposit has already been ${dep.status}. Open a fresh Binance Pay screen to submit a new order id.`,
      ),
      { parse_mode: 'HTML' },
    );
    return;
  }
  // Persist the user-pasted order id on the deposit row's reference
  // for admin-side traceability. The verifier will overwrite tx_hash
  // with the Binance internal transactionId on success.
  try {
    await setDepositNote(depId, `Binance Pay order id submitted: ${orderId}`);
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
    logger.error({ err, depId, orderId }, 'binance_pay auto-verify threw');
    result = {
      ok: false as const,
      reason: `verifier crashed: ${(err as Error)?.message ?? String(err)}`,
    };
  }

  if (result.ok) {
    await verifying.done({
      text: [
        `✅ *Transaction Confirmed!* (#${depId})`,
        '',
        `Order ID: \`${orderId}\``,
        `Credited: *$${result.amount.toFixed(3)}*`,
        `New balance: *$${Number(result.newBalance).toFixed(2)}*`,
      ].join('\n'),
      reply_markup: successKeyboard(ctx.lang, topupExitCallback(ctx)),
    });
    if (flow.data.instruction_message_id) {
      ctx.api.deleteMessage(ctx.chat!.id, flow.data.instruction_message_id).catch(() => {});
    }
  } else {
    const klass = classifyReason(result.reason);
    try {
      await setDepositNote(depId, `auto-verify failed: ${result.reason} (order id ${orderId})`);
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
        reply_markup: successKeyboard(ctx.lang, topupExitCallback(ctx)),
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
        reply_markup: rejectionKeyboard(
          ctx.lang,
          depId,
          orderId,
          result.reason,
          topupExitCallback(ctx),
        ),
      });
    } else {
      await verifying.done({
        text: [
          `⏳ *Submitted (#${depId}) — pending admin review.*`,
          '',
          `Order ID: \`${orderId}\``,
          `_${friendlyReason(result.reason)}_`,
          '',
          'Admin will check your payment manually and credit your wallet shortly.',
        ].join('\n'),
        reply_markup: manualReviewKeyboard(ctx.lang, depId, orderId, topupExitCallback(ctx)),
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

function buildChainTopupScreen(m: DBPaymentMethod): string {
  return renderPaymentInvoice(invoiceSpecFor(m));
}

function buildLtcUsdAmountScreen(m: DBPaymentMethod): string {
  return [
    '⚪ *Litecoin Top-Up*',
    '',
    `*Receiving address:* \`${m.address ?? '(not configured)'}\``,
    '',
    'Litecoin is a volatile coin, so we lock a USD↔LTC rate for *10 minutes* before you send.',
    '',
    '*How much (in USD) do you want to top up?*',
    '_Reply with just the amount, e.g._ `10` _or_ `25.50`',
  ].join('\n');
}

function formatUsdtAmount(amount: number): string {
  return `${Number(amount).toFixed(2)} USDT`;
}

export function parseCryptoPayAmount(
  text: string,
  configuredMinimum: number,
): number | null {
  let cleaned = text
    .trim()
    .replace(/\s+/g, '')
    .replace(/^(?:usdt|usd)/i, '')
    .replace(/(?:usdt|usd)$/i, '')
    .replace(/^[$€₮]/, '')
    .replace(/[$€₮]$/, '');
  if (!cleaned) return null;
  const comma = cleaned.lastIndexOf(',');
  const dot = cleaned.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.';
    const grouping = decimal === ',' ? '.' : ',';
    cleaned = cleaned.split(grouping).join('').replace(decimal, '.');
  } else {
    cleaned = cleaned.replace(',', '.');
  }
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const amount = Number(cleaned);
  const minimum = Math.max(0.01, Number(configuredMinimum) || 0);
  if (!Number.isFinite(amount) || amount < minimum) return null;
  return Number(amount.toFixed(2));
}

async function handleCryptoBotUsdAmount(
  ctx: AppCtx,
  flow: Extract<
    NonNullable<AppCtx['session']['userFlow']>,
    { type: 'cryptobot_topup'; step: 'usd_amount' }
  >,
  text: string,
): Promise<void> {
  const userMessageId = ctx.message?.message_id;
  if (userMessageId !== undefined && ctx.chat) {
    void ctx.api.deleteMessage(ctx.chat.id, userMessageId).catch((err) =>
      logger.warn(
        { err, messageId: userMessageId },
        'Crypto Pay amount message delete failed',
      ),
    );
  }
  const minimum = Math.max(0.01, Number(flow.data.min_amount) || 0);
  const amount = parseCryptoPayAmount(text, minimum);
  if (amount === null) {
    await ctx.reply(
      renderMdHtml(
        ctx.t('topup.cryptobot.invalid_amount', {
          min: formatUsdtAmount(minimum),
        }),
      ),
      { parse_mode: 'HTML' },
    );
    return;
  }
  if (ctx.chat && flow.data.instruction_message_id) {
    void ctx.api
      .deleteMessage(ctx.chat.id, flow.data.instruction_message_id)
      .catch((err) =>
        logger.warn(
          { err, messageId: flow.data.instruction_message_id },
          'Crypto Pay amount prompt delete failed',
        ),
      );
  }
  const rounded = Number(amount.toFixed(2));
  let dep;
  try {
    dep = await createDeposit({
      user_id: ctx.user.telegram_id,
      method: flow.data.method_name,
      payment_method_id: flow.data.method_id,
      amount: rounded,
      note: 'Crypto Pay USDT invoice awaiting payment',
    });
  } catch (err) {
    logger.error({ err }, 'Crypto Pay deposit insert failed');
    await ctx.reply(renderMdHtml(ctx.t('topup.cryptobot.start_failed')), { parse_mode: 'HTML' });
    ctx.session.userFlow = undefined;
    return;
  }

  const invoiceResult = await createInvoice({
    amount: rounded,
    payload: String(dep.id),
    expiresIn: 1800,
  });
  if (!invoiceResult.ok || !invoiceResult.invoice.bot_invoice_url) {
    await setDepositStatus(dep.id, 'rejected').catch(() => undefined);
    logger.warn({ reason: invoiceResult.ok ? 'missing invoice URL' : invoiceResult.reason }, 'Crypto Pay invoice creation failed');
    await ctx.reply(renderMdHtml(ctx.t('topup.cryptobot.invoice_failed')), { parse_mode: 'HTML' });
    ctx.session.userFlow = undefined;
    return;
  }

  const invoiceId = String(invoiceResult.invoice.invoice_id);
  try {
    await setCryptoPayInvoiceId(dep.id, invoiceId);
  } catch (err) {
    await setDepositStatus(dep.id, 'rejected').catch(() => undefined);
    logger.error({ err, depositId: dep.id, invoiceId }, 'Crypto Pay invoice persistence failed');
    await ctx.reply(renderMdHtml(ctx.t('topup.cryptobot.invoice_failed')), { parse_mode: 'HTML' });
    ctx.session.userFlow = undefined;
    return;
  }

  ctx.session.userFlow = {
    type: 'cryptobot_topup',
    step: 'awaiting_payment',
    data: {
      method_id: flow.data.method_id,
      method_name: flow.data.method_name,
      deposit_id: dep.id,
      invoice_id: invoiceId,
      amount: rounded,
      invoice_url: invoiceResult.invoice.bot_invoice_url,
    },
  };
  const keyboard = new InlineKeyboard()
    .url(ctx.t('topup.cryptobot.open_invoice'), invoiceResult.invoice.bot_invoice_url)
    .row()
    .text(ctx.t('topup.cryptobot.check'), `cryptopay:check:${dep.id}`)
    .row()
    .text(btn(ctx.lang, 'back'), topupRootCallback(ctx));
  const message = await ctx.reply(
    renderMdHtml(
      `${PE.usdt_title} ${ctx.t('topup.cryptobot.invoice_ready', {
        amount: formatUsdtAmount(rounded),
      })}`,
    ),
    { parse_mode: 'HTML', reply_markup: keyboard },
  );
  await setCryptoPayNotificationMessage(dep.id, ctx.chat!.id, message.message_id).catch((err) =>
    logger.warn(
      { err, depositId: dep.id, messageId: message.message_id },
      'Crypto Pay invoice message persistence failed',
    ),
  );
  const current = ctx.session.userFlow;
  if (current?.type === 'cryptobot_topup' && current.step === 'awaiting_payment') {
    current.data.instruction_message_id = message.message_id;
  }
}

export async function showTopupMenu(ctx: AppCtx, asEdit = false) {
  const methods = await listPaymentMethods();
  if (methods.length === 0) {
    const text = renderMdHtml(ctx.t('topup.no_methods'));
    if (asEdit) await ctx.editMessageText(text, { parse_mode: 'HTML' });
    else await ctx.reply(text);
    return;
  }
  const kb = paymentMethodsKeyboard(
    ctx.lang,
    methods,
    (id) => `topup:method:${id}`,
    'pay:others:topup',
    // When the user opened top-up via the buy-flow's payment-method
    // picker, navigate Back to that picker (`buy:<productId>`) so
    // they don't lose the in-flight purchase context.
    topupExitCallback(ctx),
  );
  // `topup.choose_method` is now the user-facing heading
  // ("👛 Top Up Wallet") — no need to prepend the legacy title key
  // since the locale already includes the wallet emoji.
  const walletBalance = formatPriceWithCurrency(
    Number(ctx.user.balance ?? 0),
    ctx.user.currency,
  );
  const text = [
    ctx.t('topup.choose_method'),
    '',
    ctx.t('topup.wallet_summary', { balance: walletBalance }),
    ctx.t('topup.security_note'),
  ].join('\n');
  const html = renderMdHtml(text);
  if (asEdit) {
    await ctx.editMessageText(html, { parse_mode: 'HTML', reply_markup: kb });
  } else {
    await ctx.reply(html, { parse_mode: 'HTML', reply_markup: kb });
  }
}
