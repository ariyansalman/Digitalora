/**
 * Manual payment provider.
 *
 * There is no automatic verification here and none is simulated:
 * `verifyPayment` always routes the deposit to human review.
 */
import type { PaymentProvider } from '../../types.js';
import { BasePaymentService } from '../basePaymentService.js';
import type { VerifyPaymentInput, VerifyPaymentResult } from '../types.js';

export class ManualPaymentService extends BasePaymentService {
  readonly provider: PaymentProvider = 'manual';

  async verifyPayment(_input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    return {
      status: 'manual_review',
      reason: 'manual payment method — an admin approves or rejects this deposit',
    };
  }
}
