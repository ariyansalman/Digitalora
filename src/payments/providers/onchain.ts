/**
 * On-chain providers: USDT TRC20 / BEP20 / TON and native LTC.
 *
 * Verification is real chain lookup (TronGrid / BSC RPC / TonCenter /
 * BlockCypher) performed by the existing `chainVerify` implementations
 * through the shared deposit verifier. Nothing is approved without a
 * matching recipient, amount and freshness check.
 */
import type { PaymentProvider } from '../../types.js';
import { BasePaymentService } from '../basePaymentService.js';
import type { VerifyPaymentInput, VerifyPaymentResult } from '../types.js';

abstract class OnchainPaymentService extends BasePaymentService {
  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    if (!input.submission.txHash?.trim()) {
      return { status: 'rejected', reason: 'transaction hash is required' };
    }
    if (!input.config.provider_configuration.address) {
      return {
        status: 'manual_review',
        reason: 'merchant wallet address is not configured on this payment method',
      };
    }
    return this.verifyViaDepositVerifier(input);
  }
}

export class UsdtTrc20Service extends OnchainPaymentService {
  readonly provider: PaymentProvider = 'usdt_trc20';
}

export class UsdtBep20Service extends OnchainPaymentService {
  readonly provider: PaymentProvider = 'usdt_bep20';
}

export class UsdtTonService extends OnchainPaymentService {
  readonly provider: PaymentProvider = 'usdt_ton';
}

export class LitecoinService extends OnchainPaymentService {
  readonly provider: PaymentProvider = 'ltc';

  /**
   * LTC top-ups carry a locked USD→LTC quote. Once the quote window
   * lapses the payment must not be auto-confirmed against a stale rate.
   */
  override async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const expiresAt = input.deposit.quote_expires_at;
    if (expiresAt) {
      const ms = new Date(expiresAt).getTime();
      if (Number.isFinite(ms) && Date.now() > ms) {
        return {
          status: 'manual_review',
          reason: 'LTC rate quote expired — admin review required',
        };
      }
    }
    return super.verifyPayment(input);
  }
}
