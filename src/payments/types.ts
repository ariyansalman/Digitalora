/**
 * Provider-agnostic payment architecture — shared contracts.
 *
 * This module defines the ONE configuration model every payment
 * method is normalised into, and the ONE service interface every
 * provider implementation must satisfy.
 *
 * Rules encoded here:
 *   - A method is only ever labelled AUTOMATIC when a real provider
 *     verification path exists AND its credentials/config are present.
 *   - Manual methods are always reported as MANUAL. There is no
 *     synthetic "auto approve" anywhere in this layer.
 *   - Deposits are always linked to the exact `payment_method_id`.
 */
import type { DBDeposit, OrderIntent, PaymentProvider } from '../types.js';

/** Broad family of a payment method (UI + reporting grouping). */
export type PaymentMethodType =
  | 'manual'
  | 'exchange_transfer'
  | 'onchain'
  | 'invoice';

/**
 * How a payment is confirmed.
 *
 *   - `automatic`  A real provider/chain API confirms the payment.
 *   - `manual`     A human admin approves or rejects the deposit.
 */
export type VerificationMode = 'automatic' | 'manual';

/**
 * Operational classification of a configured payment method.
 *
 *   - AUTOMATIC    Automatic verification path exists and is usable.
 *   - MANUAL       Admin-approved by design.
 *   - DISABLED     Row exists but is switched off (`enabled = false`).
 *   - UNAVAILABLE  Declared automatic, but the deployment is missing
 *                  credentials or required provider configuration, so
 *                  automatic verification cannot run right now.
 */
export type PaymentMethodStatus =
  | 'AUTOMATIC'
  | 'MANUAL'
  | 'DISABLED'
  | 'UNAVAILABLE';

/** Provider-specific configuration, normalised into one shape. */
export type ProviderConfiguration = {
  /** Merchant wallet address / Pay ID / UID, when the provider needs one. */
  address: string | null;
  /** Human-readable payee name shown next to the address/Pay ID. */
  pay_name: string | null;
  /** Minimum accepted top-up amount, in the method currency. */
  min_amount: number;
  /** Free-form provider extras persisted as JSONB (never secrets). */
  extra: Record<string, unknown>;
};

/**
 * The single configuration model for every payment method.
 * Anything user-facing or verification-related must read from here.
 */
export type PaymentMethodConfig = {
  id: number;
  /** Internal name (unique-ish operator label). */
  name: string;
  /** Customer-facing label. Falls back to `name`. */
  display_name: string;
  type: PaymentMethodType;
  /** Settlement currency code, e.g. 'USDT', 'LTC'. */
  currency: string;
  /** Settlement network, e.g. 'TRC20', 'BEP20', 'TON', null for off-chain. */
  network: string | null;
  verification_mode: VerificationMode;
  enabled: boolean;
  sort_order: number;
  /** Customer-facing payment instructions. */
  instructions: string;
  /** Payment window in minutes after the payment screen is opened. */
  expiry_minutes: number;
  /** Underlying implementation tag. */
  provider: PaymentProvider;
  provider_configuration: ProviderConfiguration;
  /** Presentation chrome (kept out of the verification path). */
  chrome: {
    color_mode: 'none' | 'blue' | 'green' | 'red' | 'yellow';
    emoji_unicode: string | null;
    emoji_id: string | null;
  };
};

/** Result of checking whether a provider can run right now. */
export type AvailabilityResult =
  | { available: true }
  | { available: false; reason: string };

export type CreatePaymentInput = {
  config: PaymentMethodConfig;
  user_id: number;
  /** Amount in the method currency. Providers may re-quote. */
  amount: number;
  reference?: string;
  note?: string;
  tx_hash?: string;
  expected_amount?: number;
  quote_expires_at?: string;
  order_intent?: OrderIntent;
  notify_chat_id?: number;
  notify_message_id?: number;
};

export type CreatePaymentResult =
  | {
      ok: true;
      deposit: DBDeposit;
      /** Instant the payment window opened (ms since epoch). */
      opened_at_ms: number;
      /** Instant the payment window closes (ms since epoch). */
      expires_at_ms: number;
    }
  | { ok: false; reason: string };

export type VerifyPaymentInput = {
  config: PaymentMethodConfig;
  deposit: DBDeposit;
  /** User-submitted proof. Shape depends on the provider. */
  submission: { txHash?: string; orderId?: string };
  opened_at_ms?: number;
  is_reverify?: boolean;
  /** grammY Api instance used for user/admin notifications. */
  api: unknown;
  log_user?: {
    telegram_id: number;
    username: string | null;
    first_name: string | null;
    email: string | null;
  };
};

export type VerifyPaymentResult =
  | {
      status: 'approved';
      amount: number;
      new_balance: number;
      sender?: string | null;
      order_public_id?: string | null;
    }
  /** Provider could not confirm — a human decides. Never auto-credit. */
  | { status: 'manual_review'; reason: string }
  /** Provider actively refused the submission. */
  | { status: 'rejected'; reason: string };

export type ExpirePaymentInput = {
  config: PaymentMethodConfig;
  deposit: DBDeposit;
  reason?: string;
};

export type ResolvePaymentInput = {
  config: PaymentMethodConfig;
  deposit: DBDeposit;
  /** Admin telegram id performing the action, when applicable. */
  actor_id?: number;
  /** Final settled amount, when the admin adjusts it. */
  amount?: number;
  reason?: string;
};

export type MutationResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: string };

export type ReconcileResult =
  | { ok: true; supported: false; reason: string }
  | {
      ok: true;
      supported: true;
      /** Counts are reported when the provider sweep exposes them. */
      checked?: number;
      settled?: number;
      expired?: number;
    }
  | { ok: false; reason: string };

/**
 * The unified payment interface. Every provider implements all six
 * operations; providers without a real automatic path report that
 * honestly instead of faking a confirmation.
 */
export interface PaymentService {
  readonly provider: PaymentProvider;
  readonly type: PaymentMethodType;
  readonly verification_mode: VerificationMode;

  /** Deployment-level readiness (credentials, merchant address, ...). */
  isAvailable(config: PaymentMethodConfig): AvailabilityResult;

  /** Open a payment: persists a deposit bound to `payment_method_id`. */
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;

  /** Confirm a payment with the provider. Never fabricates success. */
  verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult>;

  /** Close an unpaid payment once its window elapses. */
  expirePayment(input: ExpirePaymentInput): Promise<MutationResult>;

  /** Admin approval path (atomic credit / order fulfilment). */
  approve(input: ResolvePaymentInput): Promise<MutationResult>;

  /** Admin rejection path. */
  reject(input: ResolvePaymentInput): Promise<MutationResult>;

  /** Background settlement sweep, where the provider supports it. */
  reconcile(input: { api: unknown }): Promise<ReconcileResult>;
}
