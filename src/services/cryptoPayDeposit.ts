import { formatDepositPublicId } from './publicIds.js';
import type { Api } from 'grammy';
import { formatPriceWithCurrency } from '../../config/currencies.js';
import {
  approveDepositAtomic,
  getUserByTelegramId,
  refundDirectPayOnce,
} from '../db/queries.js';
import { logger } from '../logger.js';
import { t } from '../i18n/index.js';
import { renderMdHtml } from './premium.js';
import * as adminLog from './adminLog.js';
import type { CryptoPayInvoice } from './cryptoPay.js';
import { findDepositByTxHash } from '../db/queries.js';
import { fulfilOrderForDeposit } from './orderFulfill.js';
import { PE } from '../handlers/paymentInstructionEmojis.js';

async function deleteInvoiceMessage(
  api: Api,
  chatId: number | null,
  messageId: number | null,
  depositId: number,
): Promise<void> {
  if (chatId == null || messageId == null) return;
  try {
    await api.deleteMessage(chatId, messageId);
  } catch (err) {
    logger.warn({ err, depositId, chatId, messageId }, 'Crypto Pay invoice message delete failed');
  }
}

export async function processCryptoPayPaidInvoice(
  api: Api,
  depositId: number,
  invoice: CryptoPayInvoice,
): Promise<boolean> {
  if (invoice.status !== 'paid') return false;
  const invoiceId = String(invoice.invoice_id);
  const txHash = `cryptopay:${invoiceId}`;
  const deposit = await findDepositByTxHash(txHash);
  if (!deposit || deposit.id !== depositId) {
    logger.warn({ depositId, invoiceId }, 'Crypto Pay deposit not found for paid invoice');
    return false;
  }
  if (invoice.payload !== undefined && invoice.payload !== String(depositId)) {
    logger.warn({ depositId, invoiceId }, 'Crypto Pay invoice payload mismatch');
    return false;
  }
  if (invoice.asset !== 'USDT') {
    logger.warn({ depositId, invoiceId, asset: invoice.asset }, 'Crypto Pay invoice asset mismatch');
    return false;
  }
  if (deposit.quote_expires_at && new Date().getTime() > new Date(deposit.quote_expires_at).getTime()) {
    logger.warn({ depositId, invoiceId }, 'Crypto Pay invoice paid after quote expiry');
    return false;
  }
  if (Math.abs(Number(invoice.amount) - Number(deposit.amount)) > 0.000001) {
    logger.warn(
      { depositId, invoiceId, expected: deposit.amount, actual: invoice.amount },
      'Crypto Pay invoice amount mismatch',
    );
    return false;
  }

  let result = await approveDepositAtomic(
    deposit.id,
    txHash,
    Number(invoice.amount),
  );
  if (!result.approved) {
    const approved = await findDepositByTxHash(txHash);
    if (!approved || approved.status !== 'approved') return false;
    result = {
      approved: true,
      user_id: approved.user_id,
      amount: Number(approved.amount),
      new_balance: null,
      is_direct: Boolean(approved.order_intent),
    };
  }
  if (result.user_id == null || result.amount == null) return false;

  await deleteInvoiceMessage(
    api,
    deposit.notify_chat_id,
    deposit.notify_message_id,
    deposit.id,
  );

  if (deposit.order_intent) {
    let refundedToWallet = false;
    let orderPublicId: string | null = null;
    try {
      const fulfilment = await fulfilOrderForDeposit({
        api,
        deposit,
        intent: deposit.order_intent,
        provider: 'cryptobot',
        methodName: deposit.method,
      });
      if (fulfilment.ok) orderPublicId = fulfilment.orderPublicId;
      else refundedToWallet = Boolean(fulfilment.refundedToWallet);
    } catch (err) {
      logger.error(
        { err, depositId: deposit.id },
        'Crypto Pay direct-pay fulfilment threw — refunding to wallet',
      );
      await refundDirectPayOnce(
        deposit.id,
        deposit.user_id,
        Number(deposit.order_intent.total),
        (err as Error)?.message ?? String(err),
      ).catch((refundErr) => {
        logger.error({ err: refundErr, depositId: deposit.id }, 'direct-pay durable refund failed');
      });
      refundedToWallet = true;
    }
    const user = await getUserByTelegramId(result.user_id);
    void adminLog
      .logTopupResolved(api, {
        user: user
          ? {
              telegram_id: user.telegram_id,
              username: user.username,
              first_name: user.first_name,
              email: user.email,
            }
          : {
              telegram_id: deposit.user_id,
              username: null,
              first_name: null,
              email: null,
            },
        depositDbId: deposit.id,
        method: deposit.method,
        amount: result.amount,
        status: 'approved',
        balanceAfter: null,
        resolvedBy: 0,
        reference: txHash,
      })
      .catch((err) => logger.warn({ err, depositId: deposit.id }, 'Crypto Pay direct-pay admin log failed'));
    logger.info(
      { depositId: deposit.id, orderPublicId, refundedToWallet },
      'Crypto Pay direct-pay deposit fulfilled',
    );
    return true;
  }

  const user = await getUserByTelegramId(result.user_id);
  if (!user) return false;
  const amount = formatPriceWithCurrency(result.amount, user.currency);
  const balance = formatPriceWithCurrency(result.new_balance ?? 0, user.currency);
  const message = `${PE.usdt_title} ${t(user.language, 'topup.cryptobot.success', {
    amount,
    balance,
    depositId: formatDepositPublicId(deposit.id, deposit.created_at),
  })}`;
  void api
    .sendMessage(user.telegram_id, renderMdHtml(message), { parse_mode: 'HTML' })
    .catch((err) => logger.warn({ err, userId: user.telegram_id }, 'Crypto Pay success DM failed'));

  void adminLog
    .logTopupResolved(api, {
      user: {
        telegram_id: user.telegram_id,
        username: user.username,
        first_name: user.first_name,
        email: user.email,
      },
      depositDbId: deposit.id,
      method: deposit.method,
      amount: result.amount,
      status: 'approved',
      balanceAfter: result.new_balance,
      resolvedBy: 0,
      reference: txHash,
    })
    .catch((err) => logger.warn({ err, depositId: deposit.id }, 'Crypto Pay admin log failed'));
  return true;
}
