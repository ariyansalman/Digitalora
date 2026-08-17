/**
 * Provider registry + resolution helpers.
 *
 * One place decides which implementation handles a payment method, and
 * resolution always goes through the exact `payment_method_id`. Display
 * names are only used as a last-resort fallback for legacy deposit rows
 * created before migration 0055.
 */
import type { DBDeposit, DBPaymentMethod, PaymentProvider } from '../types.js';
import { listAllPaymentMethods } from '../db/repositories/deposits.js';
import { classifyPaymentMethod, toPaymentMethodConfig } from './config.js';
import { ManualPaymentService } from './providers/manual.js';
import { BinancePayService, BybitPayService } from './providers/exchangeTransfer.js';
import {
  LitecoinService,
  UsdtBep20Service,
  UsdtTonService,
  UsdtTrc20Service,
} from './providers/onchain.js';
import { CryptoPayInvoiceService } from './providers/invoice.js';
import type {
  PaymentMethodConfig,
  PaymentMethodStatus,
  PaymentService,
} from './types.js';

const SERVICES: Record<PaymentProvider, PaymentService> = {
  manual: new ManualPaymentService(),
  binance_pay: new BinancePayService(),
  bybit_pay: new BybitPayService(),
  usdt_trc20: new UsdtTrc20Service(),
  usdt_bep20: new UsdtBep20Service(),
  usdt_ton: new UsdtTonService(),
  ltc: new LitecoinService(),
  cryptobot: new CryptoPayInvoiceService(),
};

/** Resolve the service for a provider tag. Unknown tags stay manual. */
export function getPaymentService(provider: PaymentProvider): PaymentService {
  return SERVICES[provider] ?? SERVICES.manual;
}

/** Resolve the service for a normalised configuration. */
export function getServiceForConfig(config: PaymentMethodConfig): PaymentService {
  return getPaymentService(config.provider);
}

/** All configured methods, enabled or not, in a single normalised shape. */
export async function listPaymentMethodConfigs(): Promise<PaymentMethodConfig[]> {
  const rows = await listAllPaymentMethods();
  return rows
    .map((row: DBPaymentMethod) => toPaymentMethodConfig(row))
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

/** Enabled methods only — what customers may choose from. */
export async function listCheckoutPaymentMethods(): Promise<PaymentMethodConfig[]> {
  const configs = await listPaymentMethodConfigs();
  return configs.filter((c) => c.enabled);
}

export async function getPaymentMethodConfig(
  id: number,
): Promise<PaymentMethodConfig | null> {
  const configs = await listPaymentMethodConfigs();
  return configs.find((c) => c.id === id) ?? null;
}

/**
 * Resolve the method a deposit was created with.
 *
 * `payment_method_id` is authoritative. The name fallback exists only
 * for legacy rows and is refused when the name is ambiguous, so a
 * renamed or duplicated method can never redirect verification to the
 * wrong provider.
 */
export async function resolveDepositMethodConfig(
  deposit: DBDeposit,
): Promise<PaymentMethodConfig | null> {
  const configs = await listPaymentMethodConfigs();
  if (deposit.payment_method_id != null) {
    return configs.find((c) => c.id === deposit.payment_method_id) ?? null;
  }
  const matches = configs.filter((c) => c.name === deposit.method);
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

/** Audit view: every method with its operational classification. */
export async function auditPaymentMethods(): Promise<
  Array<{
    config: PaymentMethodConfig;
    status: PaymentMethodStatus;
    reason: string | null;
  }>
> {
  const configs = await listPaymentMethodConfigs();
  return configs.map((config) => ({ config, ...classifyPaymentMethod(config) }));
}
