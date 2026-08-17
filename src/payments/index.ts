/**
 * Unified, provider-agnostic payment layer.
 *
 * Import surface for the rest of the bot:
 *
 *   import {
 *     getPaymentService,
 *     resolveDepositMethodConfig,
 *     listCheckoutPaymentMethods,
 *   } from '../payments/index.js';
 *
 * Existing provider implementations (binance, bybit, chainVerify,
 * cryptoPay, depositVerify) are untouched and used underneath.
 */
export * from './types.js';
export {
  PROVIDER_DEFAULTS,
  classifyPaymentMethod,
  providerAvailability,
  toPaymentMethodConfig,
} from './config.js';
export { BasePaymentService } from './basePaymentService.js';
export {
  auditPaymentMethods,
  getPaymentMethodConfig,
  getPaymentService,
  getServiceForConfig,
  listCheckoutPaymentMethods,
  listPaymentMethodConfigs,
  resolveDepositMethodConfig,
} from './registry.js';
