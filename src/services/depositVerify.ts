/**
 * Unified deposit auto-verification.
 *
 * The user-facing top-up flow calls into `verifyAndCreditDeposit()`.
 * It:
 *   1. Looks at the deposit's payment method to pick a verifier
 *      (Binance Pay / TRC20 / BEP20 / TON / LTC).
 *   2. Calls the verifier with the user-submitted tx hash or
 *      Binance Pay Order ID.
 *   3. On success, atomically updates the deposit's amount + status
 *      to `approved`, persists the tx hash for dedupe, and credits
 *      the user's wallet via the existing `credit()` helper.
 *   4. Returns a structured result the caller can show to the user.
 *
 * Manual-only providers (`provider === 'manual'`) skip auto-verify
 * entirely so the existing admin-approval UX is preserved.
 */
import type { Api } from 'grammy';
import { logger } from '../logger.js';
import { findDepositByTxHash, findDepositByReference, listPaymentMethods, finishDirectPayFulfillment } from '../db/repositories/deposits.js';
import type { DBDeposit, DBPaymentMethod } from '../types.js';
import { credit } from './wallet.js';
import { supabase } from '../db/supabase.js';
import * as adminLog from './adminLog.js';
import {
  verifyTrc20Tx,
  verifyBep20Tx,
  verifyTonUsdtTx,
  verifyLtcTx,
} from './chainVerify.js';
import { findPayTransactionByOrderId, isBinancePayEnabled } from './binance.js';
import { isBybitPayEnabled, verifyBybitInternalDeposit } from './bybit.js';
import { fulfilOrderForDeposit } from './orderFulfill.js';

/**
 * How long after the user opens a payment screen can their on-chain
 * tx (or Binance Pay Order ID) still be auto-credited. Matches the
 * in-bot copy: "Only payments started after opening this screen and
 * completed within 30 minutes will be credited."
 *
 * The window is now anchored on a session-level `opened_at_ms`
 * captured the moment the user opens the pay screen — *not* on
 * `deposits.created_at` (which for chain providers is created only
 * after the user pastes a tx hash and would let an attacker submit
 * an old vendor TXID and still pass the window check).
 */
const PAY_WINDOW_MS = 30 * 60 * 1000;

/**
 * Lenient pre-window slack — the upstream provider's tx time may
 * land a few seconds before the user's `opened_at_ms` because of
 * clock skew, so we accept anything within a 5-minute pre-window.
 */
const PAY_PRE_WINDOW_SLACK_MS = 5 * 60 * 1000;

/**
 * Extra backward slack used *only* on a "re-verify" attempt — i.e.
 * the user pasted the same TX hash again within `REVERIFY_WINDOW_MS`
 * because the first verifier attempt deferred to admin / hit a
 * transient API hiccup. The original submission has already passed
 * the strict 30-min freshness gate, so we widen the window backward
 * by an extra 30 minutes to keep that previously-accepted on-chain
 * timestamp inside the bounds for the retry. Forward bound is
 * unchanged.
 */
const REVERIFY_BACKWARD_SLACK_MS = 30 * 60 * 1000;

/** Truncate a decimal value to 3 places (matches the Loguetown UX). */
function truncate3(n: number): number {
  return Math.floor(n * 1000) / 1000;
}

export type AutoVerifyResult =
  | {
      ok: true;
      /**
       * Amount processed in USD. For LTC deposits this is the
       * locked-in USD quote (NOT the on-chain LTC value).
       */
      amount: number;
      /**
       * Wallet balance after credit. Only meaningful when the
       * deposit was a wallet top-up OR when a direct-pay deposit
       * fell back to a wallet refund (e.g. out-of-stock). For a
       * delivered direct-pay order this is the user's existing
       * balance (untouched).
       */
      newBalance: number;
      sender?: string | null;
      provider: DBPaymentMethod['provider'];
      /**
       * When the deposit was a per-order direct-pay and the order
       * was delivered, the public order ID for the user-facing
       * confirmation message. Null for plain wallet top-ups and for
       * direct-pay orders that fell back to a wallet refund.
       */
      orderPublicId?: string | null;
    }
  | { ok: false; reason: string };

/**
 * Resolve the exact payment method used for a deposit.
 *
 * New deposits persist `payment_method_id`, so renamed/duplicate display
 * names can never redirect verification to the wrong provider. Legacy
 * rows without the linkage fall back to the historical name lookup.
 */
async function resolveMethod(deposit: DBDeposit): Promise<DBPaymentMethod | null> {
  const methods = await listPaymentMethods();
  if (deposit.payment_method_id != null) {
    return methods.find((m) => m.id === deposit.payment_method_id) ?? null;
  }
  return methods.find((m) => m.name === deposit.method) ?? null;
}

export async function verifyAndCreditDeposit(args: {
  api: Api;
  deposit: DBDeposit;
  submission: { txHash?: string; orderId?: string };
  /**
   * Wall-clock instant (ms since epoch) when the user first opened
   * the payment screen for *this* attempt. Captured on the bot side
   * the moment the user lands on the address / Pay-ID / quote card
   * and stashed in the in-flight session. The verifier rejects any
   * payment whose on-chain time-stamp falls outside
   * `[openedAtMs - 5min, openedAtMs + 30min]` so a buyer can't
   * replay an old vendor TXID. Falls back to `deposits.created_at`
   * for backwards compatibility with legacy flows that didn't lock
   * a session-level timestamp.
   */
  openedAtMs?: number;
  /**
   * Set when the user is re-pasting the *same* TX hash for an
   * existing pending deposit (within the application-level
   * 15-minute re-verify window). Widens the backward freshness
   * gate by 30 extra minutes so a payment that was already inside
   * the original 30-min window doesn't fall outside the bounds on
   * the retry. The forward bound and all other security checks
   * (recipient, amount, jetton master, dedupe) stay strict.
   */
  isReverify?: boolean;
  logUser?: {
    telegram_id: number;
    username: string | null;
    first_name: string | null;
    email: string | null;
  };
}): Promise<AutoVerifyResult> {
  const { deposit, submission } = args;
  if (deposit.status !== 'pending') {
    return { ok: false, reason: `deposit already ${deposit.status}` };
  }
  const method = await resolveMethod(deposit);
  if (!method) {
    return { ok: false, reason: 'payment method not found' };
  }
  const provider = method.provider;
  if (provider === 'manual') {
    return { ok: false, reason: 'manual provider — no auto-verify' };
  }

  // Anchor for the 30-min acceptance window. Prefer the session-
  // captured `openedAtMs` (locked the moment the user opened the
  // screen) so an attacker can't widen the window by submitting an
  // old TXID just before re-opening the flow. Fall back to
  // `deposits.created_at` for legacy code paths.
  const depositCreatedAt = new Date(deposit.created_at).getTime();
  const windowAnchorMs =
    typeof args.openedAtMs === 'number' && Number.isFinite(args.openedAtMs)
      ? args.openedAtMs
      : depositCreatedAt;
  if (!Number.isFinite(windowAnchorMs)) {
    return { ok: false, reason: 'deposit created_at unparseable' };
  }
  const backwardSlack =
    PAY_PRE_WINDOW_SLACK_MS +
    (args.isReverify ? REVERIFY_BACKWARD_SLACK_MS : 0);
  const windowStart = windowAnchorMs - backwardSlack;
  const windowEnd = windowAnchorMs + PAY_WINDOW_MS;

  // ----- Binance Pay (personal-account /sapi/v1/pay/transactions) -----
  if (provider === 'binance_pay') {
    const orderId = submission.orderId?.trim();
    if (!orderId) return { ok: false, reason: 'binance pay order id required' };
    if (!method.address) {
      return { ok: false, reason: 'merchant pay id not configured on payment method' };
    }
    if (!isBinancePayEnabled()) {
      return {
        ok: false,
        reason: 'binance api credentials not set on this deployment',
      };
    }
    // Strict reference-id format gate. Binance Pay Order IDs are
    // 18-digit numerics on the receipt — accept 17–20 digits as a
    // small safety margin for legacy receipts without weakening the
    // gate to "anything 6+". Keeps the verifier from even paging
    // Binance with a malformed id.
    if (!/^\d{17,20}$/.test(orderId)) {
      return {
        ok: false,
        reason: 'binance pay order id format invalid (expected 18-digit numeric)',
      };
    }

    // Acceptance window comes from `windowAnchorMs` above. We
    // forward the same `[start, end]` to the Binance API call so
    // the upstream history search is bounded too.
    const startTime = windowStart;
    const endTime = windowEnd;

    const result = await findPayTransactionByOrderId(orderId, { startTime, endTime });
    if (!result.ok) return { ok: false, reason: result.reason };
    const tx = result.data;
    if (!tx) {
      return {
        ok: false,
        reason:
          'order id not found in your Binance Pay history within the 30-minute window',
      };
    }

    if (tx.orderType !== 'C2C') {
      return {
        ok: false,
        reason: `unsupported binance pay order type: ${tx.orderType}`,
      };
    }
    if (tx.currency !== 'USDT') {
      return {
        ok: false,
        reason: `only USDT binance pay deposits are auto-verified (got ${tx.currency})`,
      };
    }
    const receiverPayId = tx.receiverInfo?.binanceId;
    if (receiverPayId === undefined || String(receiverPayId) !== String(method.address)) {
      return {
        ok: false,
        reason:
          "order receiver doesn't match the merchant pay id — transaction belongs to another account",
      };
    }

    const txTime = Number(tx.transactionTime);
    if (!Number.isFinite(txTime)) {
      return { ok: false, reason: 'binance returned non-numeric transactionTime' };
    }
    if (txTime < windowStart) {
      return {
        ok: false,
        reason: 'order was paid before this deposit screen was opened',
      };
    }
    if (txTime > windowEnd) {
      return {
        ok: false,
        reason: 'order was paid more than 30 minutes after this deposit screen was opened',
      };
    }

    const rawAmount = Number(tx.amount);
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      return { ok: false, reason: `binance returned non-positive amount: ${tx.amount}` };
    }
    const amount = truncate3(rawAmount);
    if (!deposit.order_intent) {
      const minimum = Math.max(0.01, Number(method.min_amount) || 0);
      if (amount + 0.000001 < minimum) {
        return {
          ok: false,
          reason: `paid amount $${amount.toFixed(3)} is below the minimum top-up of $${minimum.toFixed(2)}`,
        };
      }
    }

    // Direct-pay amount guard. When the deposit carries an order
    // intent, the user is paying for a *specific* product —
    // anything less than the locked total must defer so we never
    // fulfil an order for less than its price. Allow a tiny epsilon
    // for floating-point rounding.
    if (deposit.order_intent) {
      const required = Number(deposit.order_intent.total);
      if (Number.isFinite(required) && amount + 0.005 < required) {
        return {
          ok: false,
          reason: `paid amount $${amount.toFixed(3)} is less than order total $${required.toFixed(2)}`,
        };
      }
    }

    // Dedupe on the Binance internal transactionId. Stored in the
    // existing `tx_hash` column whose partial-unique index already
    // prevents double-credit across providers.
    const txId = String(tx.transactionId);
    const dedupeOk = await checkDedupe(txId, deposit.id);
    if (!dedupeOk.ok) return dedupeOk;

    return finalizeApproval({
      api: args.api,
      deposit,
      method,
      amount,
      txHash: txId,
      sender: tx.payerInfo?.name ?? null,
      // `tx.transactionTime` is already in ms-since-epoch from
      // Binance's API and was just validated above to fall inside
      // the acceptance window — surface it to the admin log so the
      // VERIFIED stamp carries the on-chain (Binance ledger) time.
      onChainTimestampMs: txTime,
      logUser: args.logUser,
    });
  }

  // ----- Bybit internal transfer (/v5/asset/deposit/query-internal-record) -----
  if (provider === 'bybit_pay') {
    const txIdInput = submission.orderId?.trim() ?? submission.txHash?.trim();
    if (!txIdInput) return { ok: false, reason: 'bybit internal transfer txid required' };
    if (!method.address) {
      return { ok: false, reason: 'bybit uid/id not configured on payment method' };
    }
    if (!isBybitPayEnabled()) {
      return {
        ok: false,
        reason: 'bybit api credentials not set on this deployment',
      };
    }
    if (!/^[A-Za-z0-9_-]{6,100}$/.test(txIdInput)) {
      return {
        ok: false,
        reason: 'bybit internal transfer txid format invalid',
      };
    }

    const result = await verifyBybitInternalDeposit({
      txID: txIdInput,
      deposit,
    });
    if (!result.ok) return { ok: false, reason: result.reason };

    if (result.paidAtMs === null) {
      return {
        ok: false,
        reason: 'bybit transfer timestamp unavailable - admin will verify manually',
      };
    }
    if (result.paidAtMs < windowStart) {
      return {
        ok: false,
        reason: 'bybit transfer was paid before this deposit screen was opened',
      };
    }
    if (result.paidAtMs > windowEnd) {
      return {
        ok: false,
        reason: 'bybit transfer was paid more than 30 minutes after this deposit screen was opened',
      };
    }

    const amount = truncate3(result.amount);
    if (!deposit.order_intent) {
      const minimum = Math.max(0.01, Number(method.min_amount) || 0);
      if (amount + 0.000001 < minimum) {
        return {
          ok: false,
          reason: `paid amount $${amount.toFixed(3)} is below the minimum top-up of $${minimum.toFixed(2)}`,
        };
      }
    }
    if (deposit.order_intent) {
      const required = Number(deposit.order_intent.total);
      if (Number.isFinite(required) && amount + 0.005 < required) {
        return {
          ok: false,
          reason: `paid amount $${amount.toFixed(3)} is less than order total $${required.toFixed(2)}`,
        };
      }
    }

    const dedupeOk = await checkDedupe(result.txId, deposit.id);
    if (!dedupeOk.ok) return dedupeOk;

    return finalizeApproval({
      api: args.api,
      deposit,
      method,
      amount,
      txHash: result.txId,
      sender: result.sender,
      onChainTimestampMs: result.paidAtMs,
      logUser: args.logUser,
    });
  }

  // ----- USDT chain providers (TRC20 / BEP20 / TON) -----
  if (
    provider === 'usdt_trc20' ||
    provider === 'usdt_bep20' ||
    provider === 'usdt_ton'
  ) {
    const txHash = submission.txHash?.trim();
    if (!txHash) return { ok: false, reason: 'tx hash required' };
    if (!method.address) return { ok: false, reason: 'wallet address not set' };

    // Strict reference-id (TX hash) format gate per provider —
    // refuse to even hit the upstream RPC if the hash isn't shaped
    // right. Belt-and-suspenders check after the handler-level
    // validation in `handlers/directPay.ts` / `handlers/topup.ts`
    // so a future caller can't bypass.
    if (provider === 'usdt_trc20') {
      const stripped = txHash.replace(/^0x/i, '');
      if (!/^[0-9a-fA-F]{64}$/.test(stripped)) {
        return { ok: false, reason: 'tx hash format invalid (expected 64 hex chars)' };
      }
    } else if (provider === 'usdt_bep20') {
      if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
        return { ok: false, reason: 'tx hash format invalid (expected 0x + 64 hex chars)' };
      }
    } else {
      // TON accepts hex (64) or base64 (43-44).
      if (
        !/^[0-9a-fA-F]{64}$/.test(txHash) &&
        !/^[A-Za-z0-9+/=_-]{43,44}$/.test(txHash)
      ) {
        return { ok: false, reason: 'tx hash format invalid (expected hex or base64)' };
      }
    }

    const dedupeOk = await checkDedupe(txHash, deposit.id);
    if (!dedupeOk.ok) return dedupeOk;

    const expectedAddress = method.address;
    const configuredMinimum = Math.max(0.01, Number(method.min_amount) || 0);
    const minAmount = deposit.order_intent
      ? Math.max(configuredMinimum, Number(deposit.order_intent.total) || 0)
      : configuredMinimum;

    let result;
    if (provider === 'usdt_trc20') {
      result = await verifyTrc20Tx({ txHash, expectedAddress, minAmount });
    } else if (provider === 'usdt_bep20') {
      result = await verifyBep20Tx({ txHash, expectedAddress, minAmount });
    } else {
      result = await verifyTonUsdtTx({ txHash, expectedAddress, minAmount });
    }
    if (!result.ok) return { ok: false, reason: result.reason };

    // Freshness gate. Reject any tx whose on-chain block time is
    // outside `[windowStart, windowEnd]` so a buyer can't reuse a
    // vendor TXID from yesterday. `paidAtMs === null` means the
    // upstream provider didn't surface a timestamp — defer to admin
    // review rather than approve blindly.
    if (result.paidAtMs === null) {
      return {
        ok: false,
        reason:
          'on-chain block timestamp unavailable — admin will verify this transaction manually',
      };
    }
    if (result.paidAtMs < windowStart) {
      return {
        ok: false,
        reason:
          'this is an old transaction — only payments made within 30 minutes of opening this screen are auto-credited',
      };
    }
    if (result.paidAtMs > windowEnd) {
      return {
        ok: false,
        reason:
          'transaction was confirmed more than 30 minutes after this screen was opened',
      };
    }

    // Direct-pay amount guard. Same logic as the binance_pay branch:
    // never fulfil an order if the user paid less than the locked
    // total. The chain verifiers report the on-chain USDT amount,
    // which is 1:1 with USD for our purposes.
    if (deposit.order_intent) {
      const required = Number(deposit.order_intent.total);
      if (
        Number.isFinite(required) &&
        Number(result.amount) + 0.01 < required
      ) {
        return {
          ok: false,
          reason: `paid amount $${Number(result.amount).toFixed(2)} is less than order total $${required.toFixed(2)}`,
        };
      }
    }

    return finalizeApproval({
      api: args.api,
      deposit,
      method,
      amount: result.amount,
      txHash,
      sender: result.sender,
      // `result.paidAtMs` is the on-chain block timestamp we just
      // validated against the freshness window — surface it so the
      // admin's [VERIFIED ✅] log carries the real on-chain time.
      onChainTimestampMs: result.paidAtMs,
      logUser: args.logUser,
    });
  }

  // ----- LTC native (quote-on-display flow) -----
  if (provider === 'ltc') {
    const txHash = submission.txHash?.trim();
    if (!txHash) return { ok: false, reason: 'tx hash required' };
    if (!method.address) return { ok: false, reason: 'wallet address not set' };
    // Strict format gate — Litecoin tx hashes are 64 lowercase hex.
    if (!/^[0-9a-f]{64}$/i.test(txHash)) {
      return { ok: false, reason: 'tx hash format invalid (expected 64 hex chars)' };
    }

    if (deposit.expected_amount === null || deposit.expected_amount === undefined) {
      return {
        ok: false,
        reason: 'LTC deposit has no locked quote — admin should approve manually',
      };
    }
    if (deposit.quote_expires_at) {
      const exp = new Date(deposit.quote_expires_at).getTime();
      if (Number.isFinite(exp) && Date.now() > exp) {
        return {
          ok: false,
          reason: 'LTC quote expired — admin should approve manually',
        };
      }
    }

    const dedupeOk = await checkDedupe(txHash, deposit.id);
    if (!dedupeOk.ok) return dedupeOk;

    const result = await verifyLtcTx({
      txHash,
      expectedAddress: method.address,
      expectedLtcAmount: Number(deposit.expected_amount),
    });
    if (!result.ok) return { ok: false, reason: result.reason };

    // Freshness gate (same shape as the chain branch — see comment
    // above). Mempool txs return `null` and defer to admin review.
    if (result.paidAtMs === null) {
      return {
        ok: false,
        reason:
          'on-chain block timestamp unavailable — admin will verify this transaction manually',
      };
    }
    if (result.paidAtMs < windowStart) {
      return {
        ok: false,
        reason:
          'this is an old transaction — only payments made within 30 minutes of opening this screen are auto-credited',
      };
    }
    if (result.paidAtMs > windowEnd) {
      return {
        ok: false,
        reason:
          'transaction was confirmed more than 30 minutes after this screen was opened',
      };
    }

    // Credit the locked-in USD amount, not the on-chain LTC value.
    const usdToCredit = Number(deposit.amount);
    return finalizeApproval({
      api: args.api,
      deposit,
      method,
      amount: usdToCredit,
      txHash,
      sender: result.sender,
      logUser: args.logUser,
    });
  }

  return { ok: false, reason: `unsupported provider: ${provider as string}` };
}

async function checkDedupe(
  txHash: string,
  depositId: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  // Cross-check the submitted hash against *both* dedupe columns —
  // some legacy / direct-pay rows store the hash in `reference`
  // before the verifier persists it to `tx_hash`, so a vendor's
  // already-credited TXID could otherwise be re-used by submitting
  // it through a different flow. We treat any prior approved /
  // pending row owning this hash as a dedupe hit.
  const [byTxHash, byReference] = await Promise.all([
    findDepositByTxHash(txHash),
    findDepositByReference(txHash),
  ]);
  for (const existing of [byTxHash, byReference]) {
    if (existing && existing.id !== depositId) {
      return {
        ok: false,
        reason: `tx already used by deposit #${existing.id}`,
      };
    }
  }
  return { ok: true };
}

async function finalizeApproval(args: {
  api: Api;
  deposit: DBDeposit;
  method: DBPaymentMethod;
  amount: number;
  txHash: string;
  sender: string | null;
  /**
   * On-chain ledger / block timestamp (ms since epoch) for the
   * verified transaction. Threaded through to the admin notification
   * so the [VERIFIED ✅] stamp on the approval log carries the real
   * payment time, not just the bot's wall clock. Optional because
   * legacy callers may not surface it.
   */
  onChainTimestampMs?: number | null;
  logUser?: {
    telegram_id: number;
    username: string | null;
    first_name: string | null;
    email: string | null;
  };
}): Promise<AutoVerifyResult> {
  const { api, deposit, method } = args;
  // Approve the deposit and, for wallet top-ups, credit the wallet in ONE
  // database transaction. This removes the old SELECT/check/update/credit
  // race where two concurrent verifier requests could both credit the same TX.
  const { data: approval, error: approvalError } = await supabase.rpc(
    'approve_deposit_atomic',
    {
      p_deposit_id: deposit.id,
      p_tx_hash: args.txHash,
      p_amount: args.amount,
    },
  );
  if (approvalError) {
    logger.error({ err: approvalError, deposit_id: deposit.id }, 'deposit atomic approval failed');
    throw approvalError;
  }
  const result = Array.isArray(approval) ? approval[0] : approval;
  if (!result?.approved) {
    return { ok: false, reason: `deposit already ${deposit.status}` };
  }
  const approvedBalance = result.new_balance == null ? null : Number(result.new_balance);

  // ----- Direct-pay branch (per-order) -----
  // When the deposit carries an `order_intent`, we deliver the order
  // directly instead of crediting the wallet. fulfilOrderForDeposit
  // refunds to the wallet when the product is gone / out of stock,
  // so the user is never out of money.
  if (deposit.order_intent) {
    const intent = deposit.order_intent;
    let orderPublicId: string | null = null;
    let refundedToWallet = false;
    try {
      const result = await fulfilOrderForDeposit({
        api,
        deposit,
        intent,
        provider: method.provider,
        methodName: method.name,
      });
      if (result.ok) {
        orderPublicId = result.orderPublicId;
      } else if (result.refundedToWallet) {
        refundedToWallet = true;
      }
    } catch (err) {
      logger.error(
        { err, deposit_id: deposit.id },
        'finalizeApproval: direct-pay fulfilment threw — refunding to wallet',
      );
      await finishDirectPayFulfillment(deposit.id, 'failed', (err as Error)?.message ?? String(err)).catch((stateErr) =>
        logger.warn({ err: stateErr, deposit_id: deposit.id }, 'direct-pay failed-state update failed'),
      );
      await credit(
        deposit.user_id,
        Number(intent.total),
        `deposit:${deposit.id}:fulfil_error`,
        'deposit_credit',
      );
      refundedToWallet = true;
      await finishDirectPayFulfillment(deposit.id, 'refunded', 'fulfilment failed; refunded to wallet').catch((stateErr) =>
        logger.warn({ err: stateErr, deposit_id: deposit.id }, 'direct-pay refunded-state update failed'),
      );
    }

    void adminLog
      .logTopupResolved(api, {
        user: args.logUser ?? {
          telegram_id: deposit.user_id,
          username: null,
          first_name: null,
          email: null,
        },
        depositDbId: deposit.id,
        method: deposit.method,
        amount: args.amount,
        status: 'approved',
        balanceAfter: null,
        resolvedBy: 0,
        // Carry the verifier's evidence into the [VERIFIED ✅] log so
        // the admin can audit the on-chain proof for this credit
        // without having to cross-reference the deposit row by hand.
        reference: args.txHash,
        sender: args.sender,
        onChainTimestampMs: args.onChainTimestampMs ?? null,
      })
      .catch((err) => logger.warn({ err }, 'auto-verify: adminLog failed'));

    logger.info(
      {
        deposit_id: deposit.id,
        user: deposit.user_id,
        amount: args.amount,
        provider: method.provider,
        orderPublicId,
        refundedToWallet,
      },
      'Direct-pay deposit auto-approved',
    );

    return {
      ok: true,
      amount: args.amount,
      newBalance: 0,
      sender: args.sender,
      provider: method.provider,
      orderPublicId,
    };
  }

  // ----- Wallet top-up branch (legacy) -----
  const newBalance = approvedBalance ?? Number(deposit.amount) + 0;
  logger.info(
    {
      deposit_id: deposit.id,
      user: deposit.user_id,
      amount: args.amount,
      newBalance,
      provider: method.provider,
    },
    'Deposit auto-approved',
  );

  void adminLog
    .logTopupResolved(api, {
      user: args.logUser ?? {
        telegram_id: deposit.user_id,
        username: null,
        first_name: null,
        email: null,
      },
      depositDbId: deposit.id,
      method: deposit.method,
      amount: args.amount,
      status: 'approved',
      balanceAfter: Number(newBalance.toFixed(3)),
      resolvedBy: 0,
      // Carry the verifier's evidence into the [VERIFIED ✅] log so
      // the admin can audit the on-chain proof for this credit
      // without having to cross-reference the deposit row by hand.
      reference: args.txHash,
      sender: args.sender,
      onChainTimestampMs: args.onChainTimestampMs ?? null,
    })
    .catch((err) => logger.warn({ err }, 'auto-verify: adminLog failed'));

  return {
    ok: true,
    amount: args.amount,
    newBalance,
    sender: args.sender,
    provider: method.provider,
  };
}



