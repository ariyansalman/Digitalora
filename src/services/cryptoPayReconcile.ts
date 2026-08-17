import type { Api } from 'grammy';
import { listPendingCryptoPayDeposits, setDepositStatus } from '../db/queries.js';
import { logger } from '../logger.js';
import { getInvoices } from './cryptoPay.js';
import { processCryptoPayPaidInvoice } from './cryptoPayDeposit.js';

const DEFAULT_INTERVAL_MS = 3 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

function intervalMs(): number {
  const raw = Number(process.env.CRYPTOBOT_RECONCILE_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
  return Number.isFinite(raw) && raw >= 60_000 ? Math.floor(raw) : DEFAULT_INTERVAL_MS;
}

export async function reconcileCryptoPayOnce(api: Api): Promise<void> {
  if (running) return;
  running = true;
  try {
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const deposits = await listPendingCryptoPayDeposits(cutoff);
    const ids = deposits
      .map((d) => d.tx_hash?.replace(/^cryptopay:/, ''))
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) return;
    const result = await getInvoices(ids);
    if (!result.ok) {
      logger.warn({ reason: result.reason }, 'Crypto Pay reconciliation lookup failed');
      return;
    }
    const byId = new Map(result.invoices.map((invoice) => [String(invoice.invoice_id), invoice]));
    for (const deposit of deposits) {
      const invoiceId = deposit.tx_hash?.replace(/^cryptopay:/, '');
      const invoice = invoiceId ? byId.get(invoiceId) : undefined;
      if (!invoice) continue;
      if (invoice.status === 'paid') {
        await processCryptoPayPaidInvoice(api, deposit.id, invoice);
      } else if (invoice.status === 'expired') {
        await setDepositStatus(deposit.id, 'rejected');
      }
    }
  } finally {
    running = false;
  }
}

export function stopCryptoPayReconciliationLoop(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  logger.info('Crypto Pay reconciliation loop stopped');
}

export function startCryptoPayReconciliationLoop(api: Api): void {
  if (timer) return;
  const ms = intervalMs();
  timer = setInterval(() => {
    void reconcileCryptoPayOnce(api).catch((err) => {
      logger.error({ err }, 'Crypto Pay reconciliation run failed');
    });
  }, ms);
  timer.unref?.();
  const firstRun = setTimeout(() => {
    void reconcileCryptoPayOnce(api).catch((err) => {
      logger.error({ err }, 'Crypto Pay reconciliation initial run failed');
    });
  }, 30_000);
  firstRun.unref?.();
  logger.info({ intervalMs: ms }, 'Crypto Pay reconciliation loop started');
}
