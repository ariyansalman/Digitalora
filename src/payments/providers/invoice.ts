/**
 * Invoice provider: Telegram Crypto Pay (CryptoBot).
 *
 * Payments settle through the signed webhook and the reconciliation
 * sweep, not through a user-pasted reference. `verifyPayment` therefore
 * performs a real invoice lookup and only reports success when Crypto
 * Pay itself reports the invoice as paid.
 */
import type { Api } from 'grammy';
import type { PaymentProvider } from '../../types.js';
import { BasePaymentService } from '../basePaymentService.js';
import { getInvoices } from '../../services/cryptoPay.js';
import { processCryptoPayPaidInvoice } from '../../services/cryptoPayDeposit.js';
import { reconcileCryptoPayOnce } from '../../services/cryptoPayReconcile.js';
import { getDeposit } from '../../db/repositories/deposits.js';
import { getUserByTelegramId } from '../../db/repositories/users.js';
import type {
  ReconcileResult,
  VerifyPaymentInput,
  VerifyPaymentResult,
} from '../types.js';

export class CryptoPayInvoiceService extends BasePaymentService {
  readonly provider: PaymentProvider = 'cryptobot';

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const availability = this.isAvailable(input.config);
    if (!availability.available) {
      return { status: 'manual_review', reason: availability.reason };
    }
    const invoiceId = input.deposit.tx_hash?.replace(/^cryptopay:/, '');
    if (!invoiceId) {
      return { status: 'manual_review', reason: 'no Crypto Pay invoice bound to this deposit' };
    }

    const result = await getInvoices([invoiceId]);
    if (!result.ok) return { status: 'manual_review', reason: result.reason };
    const invoice = result.invoices.find((i) => String(i.invoice_id) === invoiceId);
    if (!invoice) {
      return { status: 'manual_review', reason: 'invoice not found at Crypto Pay' };
    }
    if (invoice.status === 'expired') {
      return { status: 'rejected', reason: 'Crypto Pay invoice expired' };
    }
    if (invoice.status !== 'paid') {
      return { status: 'manual_review', reason: 'Crypto Pay invoice is not paid yet' };
    }

    const credited = await processCryptoPayPaidInvoice(
      input.api as Api,
      input.deposit.id,
      invoice,
    );
    if (!credited) {
      return { status: 'manual_review', reason: 'paid invoice could not be settled automatically' };
    }
    const fresh = await getDeposit(input.deposit.id);
    const user = await getUserByTelegramId(input.deposit.user_id);
    return {
      status: 'approved',
      amount: Number(fresh?.amount ?? input.deposit.amount),
      new_balance: Number(user?.balance ?? 0),
      sender: null,
      order_public_id: null,
    };
  }

  override async reconcile(input: { api: unknown }): Promise<ReconcileResult> {
    try {
      await reconcileCryptoPayOnce(input.api as Api);
      return { ok: true, supported: true };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : 'reconcile failed' };
    }
  }
}
