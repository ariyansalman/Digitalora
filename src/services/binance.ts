/**
 * Binance Pay personal-account verifier client.
 *
 * Wraps the read-only `GET /sapi/v1/pay/transactions` endpoint that
 * exposes the API-key-owner's Binance Pay transaction history. The
 * deposit verifier uses this to look up a user-pasted Order ID and
 * confirm:
 *
 *   - the order was paid into the configured merchant Pay ID,
 *   - in the expected currency (USDT),
 *   - within the deposit's accepted time window.
 *
 * Binance can return HTTP 451 from many cloud/VPN regions. This
 * client therefore rotates across Binance's documented API hosts and
 * every configured proxy route before it gives up.
 */
import crypto from 'node:crypto';
import { ProxyAgent, fetch, type Response } from 'undici';
import { env } from '../env.js';
import { logger } from '../logger.js';

const DEFAULT_BASE_URLS = [
  'https://api.binance.com',
  'https://api-gcp.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
  'https://api4.binance.com',
] as const;
const ENDPOINT = '/sapi/v1/pay/transactions';
const RECV_WINDOW_MS = 5000;

type ProxyRoute = {
  label: string;
  dispatcher?: ProxyAgent;
  initError?: string;
};

type AttemptFailure = {
  route: string;
  status?: number;
  reason: string;
};

/** Single Pay transaction returned by the API. */
export type BinancePayTransaction = {
  /** UID of the API-key owner. */
  uid: number;
  /** UID of the other party (sender for incoming, receiver for outgoing). */
  counterpartyId: number;
  /** Public order id: the value the user pastes in the bot. */
  orderId: string;
  /** Optional payer-supplied note, often empty. */
  note: string;
  /**
   * Type of Pay flow:
   * - `C2C`: peer-to-peer transfer, which is what the top-up screen uses.
   * - `PAY`: merchant pay request.
   * - `PAY_REFUND`: refund of a `PAY` order.
   * - `CRYPTO_BOX`: red-packet send/claim.
   * - `FIAT_PAYMENT`: fiat checkout.
   * - `FIAT_REFUND`: fiat refund.
   * - `XOXO_TRANSFER`: gift transfer.
   */
  orderType: string;
  /** Internal Binance transaction id, used for repo-wide dedupe. */
  transactionId: string;
  /** Transaction completion time in epoch milliseconds. */
  transactionTime: number;
  /** Crypto amount as a decimal string. */
  amount: string;
  /** Asset symbol, e.g. `USDT`. */
  currency: string;
  walletType: number;
  walletTypes: string[];
  fundsDetail: {
    currency: string;
    amount: string;
    walletAssetCost?: unknown;
  };
  /** Sender info: present on incoming C2C transfers. */
  payerInfo?: {
    name?: string;
    type?: string;
    binanceId: number;
    unmaskData?: boolean;
  };
  /** Recipient info: present on outgoing transfers. */
  receiverInfo?: {
    name?: string;
    type?: string;
    binanceId: number;
    unmaskData?: boolean;
  };
  totalPaymentFee: string;
};

type BinanceApiOk<T> = { ok: true; data: T };
type BinanceApiErr = { ok: false; reason: string };
type BinanceApiResult<T> = BinanceApiOk<T> | BinanceApiErr;

function readCreds(): { apiKey: string; apiSecret: string } | null {
  const apiKey = env.BINANCE_PAY_API_KEY;
  const apiSecret = env.BINANCE_PAY_API_SECRET;
  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret };
}

function signQuery(query: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(query).digest('hex');
}

function splitEnvList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function uniq(xs: string[]): string[] {
  return [...new Set(xs)];
}

function formatProxyLabel(value: string): string {
  try {
    const parsed = new URL(value);
    const port = parsed.port ? `:${parsed.port}` : '';
    return `${parsed.protocol}//${parsed.hostname}${port}`;
  } catch {
    return 'invalid-proxy-url';
  }
}

function readBaseUrls(): string[] {
  const configured = splitEnvList(env.BINANCE_API_BASE_URLS);
  const raw = configured.length > 0 ? configured : [...DEFAULT_BASE_URLS];
  const valid = uniq(raw)
    .map((value) => value.replace(/\/+$/, ''))
    .filter((value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === 'https:';
      } catch {
        logger.warn({ value }, 'binance: ignoring invalid BINANCE_API_BASE_URLS entry');
        return false;
      }
    });
  return valid.length > 0 ? valid : [...DEFAULT_BASE_URLS];
}

function readProxyRoutes(): ProxyRoute[] {
  const configured = uniq([
    ...splitEnvList(env.BINANCE_PROXY_URLS),
    ...splitEnvList(env.BINANCE_PROXY_URL),
  ]);
  const routes: ProxyRoute[] = [];
  for (const proxyUrl of configured) {
    const label = formatProxyLabel(proxyUrl);
    try {
      routes.push({ label, dispatcher: new ProxyAgent(proxyUrl) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ err, proxy: label }, 'binance: invalid proxy URL');
      routes.push({ label, initError: message });
    }
  }
  routes.push({ label: 'direct' });
  return routes;
}

function routeLabel(baseUrl: string, proxy: ProxyRoute): string {
  return proxy.dispatcher ? `${baseUrl} via ${proxy.label}` : `${baseUrl} direct`;
}

function summarizeFailures(failures: AttemptFailure[]): string {
  const tried = failures.map((f) => f.route).join(', ');
  const initErrors = failures.filter((f) => f.reason.startsWith('proxy misconfigured'));
  const regionBlocked = failures.filter(
    (f) => f.status === 451 || f.reason.includes('451') || f.reason.includes('region-blocked'),
  );
  if (regionBlocked.length === failures.length) {
    return (
      'binance returned 451 — every tried direct/proxy route is region-blocked. ' +
      'Set BINANCE_PROXY_URL or BINANCE_PROXY_URLS to a Binance-allowed proxy/VPN exit. ' +
      `Tried: ${tried}`
    );
  }
  if (initErrors.length > 0 && initErrors.length === failures.length) {
    return `binance proxy misconfigured: ${initErrors.map((f) => f.reason).join('; ')}`;
  }
  const compact = failures
    .slice(0, 4)
    .map((f) => `${f.route}: ${f.reason}`)
    .join('; ');
  return `binance unavailable after ${failures.length} route(s): ${compact}`;
}

/**
 * Fetch the API-key owner's recent Binance Pay transactions in the
 * given time window. The endpoint caps results at 100 per call and
 * accepts an optional `[startTime, endTime]` range (epoch ms).
 */
export async function listPayTransactions(opts: {
  startTime?: number;
  endTime?: number;
  limit?: number;
} = {}): Promise<BinanceApiResult<BinancePayTransaction[]>> {
  const creds = readCreds();
  if (!creds) {
    return { ok: false, reason: 'binance api credentials missing' };
  }

  const staticParams = new URLSearchParams();
  if (opts.startTime !== undefined) staticParams.set('startTime', String(opts.startTime));
  if (opts.endTime !== undefined) staticParams.set('endTime', String(opts.endTime));
  if (opts.limit !== undefined) staticParams.set('limit', String(opts.limit));

  const failures: AttemptFailure[] = [];
  const baseUrls = readBaseUrls();
  const proxyRoutes = readProxyRoutes();

  for (const proxy of proxyRoutes) {
    for (const baseUrl of baseUrls) {
      const route = routeLabel(baseUrl, proxy);
      if (proxy.initError) {
        failures.push({
          route,
          reason: `proxy misconfigured: ${proxy.initError}`,
        });
        continue;
      }

      const params = new URLSearchParams(staticParams);
      params.set('timestamp', String(Date.now()));
      params.set('recvWindow', String(RECV_WINDOW_MS));
      const query = params.toString();
      const sig = signQuery(query, creds.apiSecret);
      const url = `${baseUrl}${ENDPOINT}?${query}&signature=${sig}`;
      let resp: Response;
      try {
        resp = await fetch(url, {
          headers: { 'X-MBX-APIKEY': creds.apiKey },
          ...(proxy.dispatcher ? { dispatcher: proxy.dispatcher } : {}),
        });
      } catch (err) {
        const reason = `fetch failed: ${(err as Error)?.message ?? String(err)}`;
        logger.warn({ err, route }, 'binance: fetch threw, trying next route');
        failures.push({ route, reason });
        continue;
      }

      const bodyText = await resp.text();
      if (resp.status === 451) {
        failures.push({ route, status: resp.status, reason: 'http 451 region-blocked' });
        continue;
      }
      if (resp.status !== 200) {
        logger.warn(
          { status: resp.status, body: bodyText.slice(0, 400), route },
          'binance: non-200 from /sapi/v1/pay/transactions',
        );
        failures.push({
          route,
          status: resp.status,
          reason: `http ${resp.status}${bodyText ? ` ${bodyText.slice(0, 160)}` : ''}`,
        });
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        failures.push({ route, reason: 'returned non-JSON body' });
        continue;
      }
      const obj = parsed as {
        code?: string;
        success?: boolean;
        data?: BinancePayTransaction[];
        msg?: string;
      };
      if (obj.code !== '000000' || obj.success !== true || !Array.isArray(obj.data)) {
        logger.warn(
          { code: obj.code, msg: obj.msg, route },
          'binance: API returned non-success envelope',
        );
        failures.push({
          route,
          reason: `api error ${obj.code ?? '?'}${obj.msg ? `: ${obj.msg}` : ''}`,
        });
        continue;
      }
      if (failures.length > 0) {
        logger.info(
          { route, priorFailures: failures.map((f) => ({ route: f.route, reason: f.reason })) },
          'binance: verifier succeeded after route fallback',
        );
      }
      return { ok: true, data: obj.data };
    }
  }

  const reason = summarizeFailures(failures);
  logger.warn({ failures }, 'binance: all verifier routes failed');
  return { ok: false, reason };
}

/**
 * Look up a single Pay transaction by its public Order ID inside the
 * given time window. Returns `null` (with `ok: true`) when the API
 * succeeded but no matching order was found, so callers can
 * distinguish "user pasted a bad ID" from "binance is down".
 */
export async function findPayTransactionByOrderId(
  orderId: string,
  opts: { startTime?: number; endTime?: number } = {},
): Promise<BinanceApiResult<BinancePayTransaction | null>> {
  const result = await listPayTransactions({ ...opts, limit: 100 });
  if (!result.ok) return result;
  const trimmed = orderId.trim();
  const found = result.data.find((t) => String(t.orderId) === trimmed) ?? null;
  return { ok: true, data: found };
}

/** Whether the Binance Pay verifier is enabled (both env vars set). */
export function isBinancePayEnabled(): boolean {
  return readCreds() !== null;
}
