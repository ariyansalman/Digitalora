/**
 * Shared implementation of the unified `PaymentService` operations.
 *
 * Everything that is provider-independent lives here:
 *   - createPayment  → one deposit row, always carrying payment_method_id
 *   - approve        → existing atomic approval RPC
 *   - reject/expire  → existing atomic rejection RPC
 *   - reconcile      → unsupported by default (honest, not silent)
 *
 * Provider subclasses only override `verifyPayment` (and `reconcile`
 * where a real settlement sweep exists).
 */
import type { Api } from 'grammy';
import type { PaymentProvider } from '../types.js';
import {
  approveDepositAtomic,
  createDeposit,
  rejectDepositAtomic,
  setDepositNote,
} from '../db/repositories/deposits.js';
import { logger } from '../logger.js';
import { verifyAndCreditDeposit } from '../services/depositVerify.js';
import { providerAvailability, PROVIDER_DEFAULTS } from './config.js';
import type {
  AvailabilityResult,
  CreatePaymentInput,
  CreatePaymentResult,
  ExpirePaymentInput,
  MutationResult,
  PaymentMethodConfig,
  PaymentMethodType,
  PaymentService,
  ReconcileResult,
  ResolvePaymentInput,
  VerificationMode,
  VerifyPaymentInput,
  VerifyPaymentResult,
} from './types.js';

export abstract class BasePaymentService implements PaymentService {
  abstract readonly provider: PaymentProvider;

  get type(): PaymentMethodType {
    return PROVIDER_DEFAULTS[this.provider].type;
  }

  get verification_mode(): VerificationMode {
    return PROVIDER_DEFAULTS[this.provider].verification_mode;
  }

  isAvailable(config: PaymentMethodConfig): AvailabilityResult {
    return providerAvailability(config);
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const { config } = input;
    if (!config.enabled) {
      return { ok: false, reason: 'payment method is disabled' };
    }
    if (config.provider !== this.provider) {
      return { ok: false, reason: 'payment method does not belong to this provider' };
    }
    try {
      const deposit = await createDeposit({
        user_id: input.user_id,
        // Legacy display column kept in sync; verification never uses it.
        method: config.name,
        // Authoritative linkage.
        payment_method_id: config.id,
        amount: input.amount,
        ...(input.reference !== undefined ? { reference: input.reference } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.tx_hash !== undefined ? { tx_hash: input.tx_hash } : {}),
        ...(input.expected_amount !== undefined
          ? { expected_amount: input.expected_amount }
          : {}),
        ...(input.quote_expires_at !== undefined
          ? { quote_expires_at: input.quote_expires_at }
          : {}),
        ...(input.order_intent !== undefined ? { order_intent: input.order_intent } : {}),
        ...(input.notify_chat_id !== undefined
          ? { notify_chat_id: input.notify_chat_id }
          : {}),
        ...(input.notify_message_id !== undefined
          ? { notify_message_id: input.notify_message_id }
          : {}),
      });
      const openedAtMs = Date.now();
      return {
        ok: true,
        deposit,
        opened_at_ms: openedAtMs,
        expires_at_ms: openedAtMs + config.expiry_minutes * 60_000,
      };
    } catch (err) {
      logger.error({ err, provider: this.provider }, 'createPayment failed');
      return {
        ok: false,
        reason: err instanceof Error ? err.message : 'could not create payment',
      };
    }
  }

  abstract verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult>;

  /**
   * Automatic providers share one verification entry point. The
   * per-provider checks (recipient, amount, freshness, dedupe) live in
   * the existing `depositVerify` implementations and are preserved.
   */
  protected async verifyViaDepositVerifier(
    input: VerifyPaymentInput,
  ): Promise<VerifyPaymentResult> {
    const availability = this.isAvailable(input.config);
    if (!availability.available) {
      return { status: 'manual_review', reason: availability.reason };
    }
    const result = await verifyAndCreditDeposit({
      api: input.api as Api,
      deposit: input.deposit,
      submission: input.submission,
      ...(input.opened_at_ms !== undefined ? { openedAtMs: input.opened_at_ms } : {}),
      ...(input.is_reverify !== undefined ? { isReverify: input.is_reverify } : {}),
      ...(input.log_user !== undefined ? { logUser: input.log_user } : {}),
    });
    if (result.ok) {
      return {
        status: 'approved',
        amount: result.amount,
        new_balance: result.newBalance,
        sender: result.sender ?? null,
        order_public_id: result.orderPublicId ?? null,
      };
    }
    return { status: 'manual_review', reason: result.reason };
  }

  async expirePayment(input: ExpirePaymentInput): Promise<MutationResult> {
    const { deposit } = input;
    if (deposit.status !== 'pending') return { ok: true, changed: false };
    try {
      const rejected = await rejectDepositAtomic(deposit.id);
      if (rejected) {
        await setDepositNote(
          deposit.id,
          input.reason ?? `expired after ${input.config.expiry_minutes} minutes`,
        );
      }
      return { ok: true, changed: rejected };
    } catch (err) {
      logger.error({ err, depositId: deposit.id }, 'expirePayment failed');
      return { ok: false, reason: err instanceof Error ? err.message : 'expire failed' };
    }
  }

  async approve(input: ResolvePaymentInput): Promise<MutationResult> {
    const { deposit } = input;
    try {
      const amount = Number.isFinite(input.amount) ? Number(input.amount) : Number(deposit.amount);
      const result = await approveDepositAtomic(
        deposit.id,
        deposit.tx_hash ?? `manual:${deposit.id}`,
        amount,
      );
      return { ok: true, changed: result.approved };
    } catch (err) {
      logger.error({ err, depositId: deposit.id }, 'approve failed');
      return { ok: false, reason: err instanceof Error ? err.message : 'approve failed' };
    }
  }

  async reject(input: ResolvePaymentInput): Promise<MutationResult> {
    const { deposit } = input;
    try {
      const rejected = await rejectDepositAtomic(deposit.id);
      if (rejected && input.reason) await setDepositNote(deposit.id, input.reason);
      return { ok: true, changed: rejected };
    } catch (err) {
      logger.error({ err, depositId: deposit.id }, 'reject failed');
      return { ok: false, reason: err instanceof Error ? err.message : 'reject failed' };
    }
  }

  async reconcile(_input: { api: unknown }): Promise<ReconcileResult> {
    return {
      ok: true,
      supported: false,
      reason: `${this.provider} has no provider-side settlement sweep; pending payments are resolved by user submission or admin review`,
    };
  }
}
