/**
 * Exchange-transfer providers: Binance Pay and Bybit Pay.
 *
 * Both are genuinely automatic: the user pastes a provider reference
 * (Binance Pay Order ID / Bybit internal transfer TXID) and the
 * existing verifier queries the provider API, checks receiver, asset,
 * amount and time window, then credits atomically. If credentials are
 * missing the method is reported UNAVAILABLE and every submission is
 * routed to manual review instead of being confirmed.
 */
import type { PaymentProvider } from '../../types.js';
import { BasePaymentService } from '../basePaymentService.js';
import type { VerifyPaymentInput, VerifyPaymentResult } from '../types.js';

export class BinancePayService extends BasePaymentService {
  readonly provider: PaymentProvider = 'binance_pay';

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    if (!input.submission.orderId?.trim()) {
      return { status: 'rejected', reason: 'binance pay order id is required' };
    }
    return this.verifyViaDepositVerifier(input);
  }
}

export class BybitPayService extends BasePaymentService {
  readonly provider: PaymentProvider = 'bybit_pay';

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const ref = input.submission.orderId?.trim() ?? input.submission.txHash?.trim();
    if (!ref) {
      return { status: 'rejected', reason: 'bybit internal transfer txid is required' };
    }
    return this.verifyViaDepositVerifier(input);
  }
}
