/**
 * Normalisation of `payment_methods` rows into the single
 * `PaymentMethodConfig` model, plus honest status classification.
 *
 * The new columns (display_name, type, currency, network,
 * verification_mode, expiry_minutes, provider_config) are added by
 * migration 0059. Deployments that have not applied it yet still work:
 * every field falls back to a provider-derived default.
 */
import type { DBPaymentMethod, PaymentProvider } from '../types.js';
import { isBinancePayEnabled } from '../services/binance.js';
import { isBybitPayEnabled } from '../services/bybit.js';
import { env } from '../env.js';
import type {
  AvailabilityResult,
  PaymentMethodConfig,
  PaymentMethodStatus,
  PaymentMethodType,
  VerificationMode,
} from './types.js';

type ProviderDefaults = {
  type: PaymentMethodType;
  currency: string;
  network: string | null;
  verification_mode: VerificationMode;
  expiry_minutes: number;
  /** Merchant address/Pay ID is mandatory for automatic verification. */
  requires_address: boolean;
};

/**
 * Per-provider defaults. `verification_mode` here describes what the
 * implementation is actually capable of — not a marketing label.
 */
export const PROVIDER_DEFAULTS: Record<PaymentProvider, ProviderDefaults> = {
  manual: {
    type: 'manual',
    currency: 'USD',
    network: null,
    verification_mode: 'manual',
    expiry_minutes: 60,
    requires_address: false,
  },
  binance_pay: {
    type: 'exchange_transfer',
    currency: 'USDT',
    network: 'BINANCE_PAY',
    verification_mode: 'automatic',
    expiry_minutes: 30,
    requires_address: true,
  },
  bybit_pay: {
    type: 'exchange_transfer',
    currency: 'USDT',
    network: 'BYBIT_INTERNAL',
    verification_mode: 'automatic',
    expiry_minutes: 30,
    requires_address: true,
  },
  usdt_trc20: {
    type: 'onchain',
    currency: 'USDT',
    network: 'TRC20',
    verification_mode: 'automatic',
    expiry_minutes: 30,
    requires_address: true,
  },
  usdt_bep20: {
    type: 'onchain',
    currency: 'USDT',
    network: 'BEP20',
    verification_mode: 'automatic',
    expiry_minutes: 30,
    requires_address: true,
  },
  usdt_ton: {
    type: 'onchain',
    currency: 'USDT',
    network: 'TON',
    verification_mode: 'automatic',
    expiry_minutes: 30,
    requires_address: true,
  },
  ltc: {
    type: 'onchain',
    currency: 'LTC',
    network: 'LITECOIN',
    verification_mode: 'automatic',
    expiry_minutes: 10,
    requires_address: true,
  },
  cryptobot: {
    type: 'invoice',
    currency: 'USDT',
    network: 'CRYPTO_PAY',
    verification_mode: 'automatic',
    expiry_minutes: 30,
    requires_address: false,
  },
};

/** Row shape after migration 0059 (all columns optional at runtime). */
type ExtendedRow = DBPaymentMethod & {
  display_name?: string | null;
  type?: PaymentMethodType | null;
  currency?: string | null;
  network?: string | null;
  verification_mode?: VerificationMode | null;
  enabled?: boolean | null;
  expiry_minutes?: number | null;
  provider_config?: Record<string, unknown> | null;
};

function positiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Normalise one DB row into the unified configuration model. */
export function toPaymentMethodConfig(row: DBPaymentMethod): PaymentMethodConfig {
  const r = row as ExtendedRow;
  const provider: PaymentProvider = r.provider ?? 'manual';
  const defaults = PROVIDER_DEFAULTS[provider] ?? PROVIDER_DEFAULTS.manual;

  // A row may never *claim* automatic verification for a provider that
  // has no automatic implementation. Manual stays manual.
  const declaredMode: VerificationMode =
    r.verification_mode === 'automatic' || r.verification_mode === 'manual'
      ? r.verification_mode
      : defaults.verification_mode;
  const verification_mode: VerificationMode =
    defaults.verification_mode === 'manual' ? 'manual' : declaredMode;

  return {
    id: r.id,
    name: r.name,
    display_name: (r.display_name ?? '').trim() || r.name,
    type: r.type ?? defaults.type,
    currency: (r.currency ?? '').trim() || defaults.currency,
    network: r.network === undefined ? defaults.network : r.network,
    verification_mode,
    enabled: r.enabled ?? r.active ?? false,
    sort_order: Number(r.sort_order ?? 0),
    instructions: r.instructions ?? '',
    expiry_minutes: positiveInt(r.expiry_minutes, defaults.expiry_minutes),
    provider,
    provider_configuration: {
      address: r.address ?? null,
      pay_name: r.pay_name ?? null,
      min_amount: Math.max(0, Number(r.min_amount) || 0),
      extra: (r.provider_config ?? {}) as Record<string, unknown>,
    },
    chrome: {
      color_mode: r.color_mode ?? 'none',
      emoji_unicode: r.emoji_unicode ?? null,
      emoji_id: r.emoji_id ?? null,
    },
  };
}

/**
 * Deployment readiness for a provider. Only checks facts we can prove
 * locally (credentials present, merchant address configured); it never
 * asserts that the remote API is healthy.
 */
export function providerAvailability(config: PaymentMethodConfig): AvailabilityResult {
  const defaults = PROVIDER_DEFAULTS[config.provider] ?? PROVIDER_DEFAULTS.manual;
  if (config.verification_mode === 'manual') return { available: true };

  if (defaults.requires_address && !config.provider_configuration.address) {
    return {
      available: false,
      reason: 'merchant address / pay id is not configured on this payment method',
    };
  }

  switch (config.provider) {
    case 'binance_pay':
      return isBinancePayEnabled()
        ? { available: true }
        : { available: false, reason: 'BINANCE_PAY_API_KEY / SECRET are not set' };
    case 'bybit_pay':
      return isBybitPayEnabled()
        ? { available: true }
        : { available: false, reason: 'BYBIT_API_KEY / SECRET are not set' };
    case 'cryptobot':
      return env.CRYPTOBOT_API_TOKEN
        ? { available: true }
        : { available: false, reason: 'CRYPTOBOT_API_TOKEN is not set' };
    default:
      // Chain verifiers use public RPC/REST endpoints; API keys are
      // optional rate-limit boosters, not hard requirements.
      return { available: true };
  }
}

/** Operational classification used by the audit + admin surfaces. */
export function classifyPaymentMethod(config: PaymentMethodConfig): {
  status: PaymentMethodStatus;
  reason: string | null;
} {
  if (!config.enabled) return { status: 'DISABLED', reason: 'method is switched off' };
  if (config.verification_mode === 'manual') {
    return { status: 'MANUAL', reason: 'admin approval by design' };
  }
  const availability = providerAvailability(config);
  if (!availability.available) {
    return { status: 'UNAVAILABLE', reason: availability.reason };
  }
  return { status: 'AUTOMATIC', reason: null };
}
