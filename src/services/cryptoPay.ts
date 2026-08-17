import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { env } from '../env.js';
import { logger } from '../logger.js';

export type CryptoPayInvoice = {
  invoice_id: number | string;
  status: 'active' | 'paid' | 'expired';
  amount: string;
  asset: string;
  payload?: string;
  bot_invoice_url?: string;
  expiration_date?: number;
  paid_at?: number;
};

type CryptoPayResponse<T> = { ok: true; result: T } | { ok: false; error?: string };

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; data: T } | { ok: false; reason: string }> {
  const token = env.CRYPTOBOT_API_TOKEN;
  if (!token) return { ok: false, reason: 'cryptobot api token is not configured' };
  try {
    const response = await fetch(`${env.CRYPTOBOT_API_BASE_URL.replace(/\/+$/, '')}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'Crypto-Pay-API-Token': token,
        ...(init.headers ?? {}),
      },
    });
    const body = (await response.json()) as CryptoPayResponse<T>;
    if (!response.ok || !body.ok) {
      return { ok: false, reason: body.ok ? `Crypto Pay HTTP ${response.status}` : body.error ?? 'Crypto Pay API error' };
    }
    return { ok: true, data: body.result };
  } catch (err) {
    logger.warn({ err }, 'Crypto Pay API request failed');
    return { ok: false, reason: err instanceof Error ? err.message : 'Crypto Pay request failed' };
  }
}

export async function createInvoice(args: {
  amount: number;
  payload: string;
  expiresIn?: number;
}): Promise<{ ok: true; invoice: CryptoPayInvoice } | { ok: false; reason: string }> {
  const result = await request<CryptoPayInvoice>('/api/createInvoice', {
    method: 'POST',
    body: JSON.stringify({
      asset: 'USDT',
      amount: args.amount.toFixed(2),
      payload: args.payload,
      expires_in: args.expiresIn ?? 1800,
    }),
  });
  return result.ok ? { ok: true, invoice: result.data } : result;
}

export async function getInvoices(
  invoiceIds: string[],
): Promise<{ ok: true; invoices: CryptoPayInvoice[] } | { ok: false; reason: string }> {
  if (invoiceIds.length === 0) return { ok: true, invoices: [] };
  const params = new URLSearchParams({ invoice_ids: invoiceIds.join(',') });
  const result = await request<{ items: CryptoPayInvoice[] }>(`/api/getInvoices?${params}`);
  return result.ok ? { ok: true, invoices: result.data.items ?? [] } : result;
}

export function verifyCryptoPaySignature(rawBody: string | Buffer, signature: string | undefined): boolean {
  if (!env.CRYPTOBOT_API_TOKEN || !signature) return false;
  const secret = createHash('sha256').update(env.CRYPTOBOT_API_TOKEN).digest();
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const actual = signature.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(actual)) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'));
}
