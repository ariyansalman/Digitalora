import type http from 'node:http';
import type { Api } from 'grammy';
import {
  ApiError,
  apiBaseUrl,
  authenticateApiKey,
  getApiStatus,
  listApiProducts,
  placeApiOrder,
} from './resellerApi.js';
import { allowHttpRequest, applySecurityHeaders, rejectRateLimit } from './httpSecurity.js';
import { env } from '../env.js';

const BODY_LIMIT_BYTES = 64 * 1024;
let runtimeReady = false;

type JsonRecord = Record<string, unknown>;

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: JsonRecord,
): void {
  applySecurityHeaders(res);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,x-api-key',
  });
  res.end(JSON.stringify(body, null, 2));
}

function sendText(res: http.ServerResponse, status: number, body: string): void {
  applySecurityHeaders(res);
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'access-control-allow-origin': '*',
  });
  res.end(body);
}

function readApiKey(req: http.IncomingMessage, url: URL): string {
  const auth = req.headers.authorization ?? '';
  const bearer = Array.isArray(auth) ? auth[0] : auth;
  if (bearer.toLowerCase().startsWith('bearer ')) return bearer.slice(7).trim();
  const header = req.headers['x-api-key'];
  if (Array.isArray(header)) return header[0]?.trim() ?? '';
  if (typeof header === 'string') return header.trim();
  if (env.ALLOW_LEGACY_QUERY_API_KEY) {
    return url.searchParams.get('api_key')?.trim() ?? '';
  }
  return '';
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > BODY_LIMIT_BYTES) {
      throw new ApiError(413, 'body_too_large', 'Request body is too large.');
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJsonBody(req: http.IncomingMessage): Promise<JsonRecord> {
  const raw = await readBody(req);
  if (!raw.trim()) return {};
  const contentType = String(req.headers['content-type'] ?? '').toLowerCase();
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw).entries());
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as JsonRecord)
      : {};
  } catch {
    throw new ApiError(400, 'invalid_json', 'Request body must be JSON.');
  }
}

function docsBody(): JsonRecord {
  const base = apiBaseUrl();
  return {
    ok: true,
    name: 'Digitalora Reseller API',
    auth: 'Send your key as Authorization: Bearer YOUR_KEY or x-api-key: YOUR_KEY.',
    endpoints: {
      products: `GET ${base}/products`,
      balance: `GET ${base}/balance`,
      order: `POST ${base}/order`,
      legacy_products: `GET ${base}?action=products`,
      legacy_balance: `GET ${base}?action=balance`,
      legacy_order: `POST ${base}?action=order`,
    },
    order_body: {
      product_id: 123,
      quantity: 1,
      request_id: 'optional-unique-id',
      external_order_id: 'optional-unique-id-alias',
    },
  };
}

function isApiPath(url: URL): boolean {
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return true;
  return url.pathname === '/' && Boolean(url.searchParams.get('action'));
}

function actionFrom(url: URL): string {
  if (url.pathname.startsWith('/api/')) return url.pathname.slice('/api/'.length).replace(/\/+$/, '');
  return url.searchParams.get('action')?.trim().toLowerCase() ?? '';
}

export async function handleResellerApiRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  api: Api,
): Promise<boolean> {
  const host = req.headers.host ?? 'localhost';
  const url = new URL(req.url ?? '/', `http://${host}`);
  if (!isApiPath(url)) return false;

  if (!allowHttpRequest(req, 'reseller-api', 120)) {
    rejectRateLimit(res);
    return true;
  }

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return true;
  }

  try {
    const action = actionFrom(url);
    if ((url.pathname === '/api' || url.pathname === '/') && !action) {
      sendJson(res, 200, docsBody());
      return true;
    }

    const keyValue = readApiKey(req, url);
    if (!keyValue) throw new ApiError(401, 'missing_api_key', 'API key is required.');
    const auth = await authenticateApiKey(keyValue);

    if (req.method === 'GET' && action === 'products') {
      const limit = Number(url.searchParams.get('limit') ?? undefined);
      const offset = Number(url.searchParams.get('offset') ?? undefined);
      const data = await listApiProducts({
        userId: auth.user.telegram_id,
        limit: Number.isFinite(limit) ? limit : undefined,
        offset: Number.isFinite(offset) ? offset : undefined,
      });
      sendJson(res, 200, { ok: true, ...data });
      return true;
    }

    if (req.method === 'GET' && action === 'balance') {
      const status = await getApiStatus(auth.user.telegram_id);
      sendJson(res, 200, {
        ok: true,
        balance: status.balance,
        currency: 'USDT',
        orders: status.orders,
        total_spent: status.totalSpent,
        recent_spent: status.recentSpent,
      });
      return true;
    }

    if (req.method === 'POST' && action === 'order') {
      const body = await readJsonBody(req);
      const productId = Number(body.product_id ?? body.productId ?? body.id);
      const qty = Number(body.quantity ?? body.qty ?? 1);
      const requestId = typeof body.request_id === 'string'
        ? body.request_id
        : typeof body.requestId === 'string'
          ? body.requestId
          : typeof body.external_order_id === 'string'
            ? body.external_order_id
            : typeof body.externalOrderId === 'string'
              ? body.externalOrderId
              : null;
      const order = await placeApiOrder({
        api,
        apiKeyId: auth.key.id,
        user: auth.user,
        productId,
        qty,
        requestId,
      });
      sendJson(res, 200, { ok: true, order });
      return true;
    }

    throw new ApiError(404, 'unknown_endpoint', 'Unknown API endpoint.');
  } catch (err) {
    if (err instanceof ApiError) {
      sendJson(res, err.status, { ok: false, error: err.code, message: err.message });
      return true;
    }
    sendJson(res, 500, {
      ok: false,
      error: 'internal_error',
      message: 'Internal API error.',
    });
    return true;
  }
}

export function handleHealthRequest(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const host = req.headers.host ?? 'localhost';
  const url = new URL(req.url ?? '/', `http://${host}`);
  if (url.pathname === '/readyz') {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendText(res, 405, 'method_not_allowed');
      return true;
    }
    applySecurityHeaders(res);
    const status = runtimeReady ? 200 : 503;
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    if (req.method === 'HEAD') res.end();
    else res.end(JSON.stringify({
      ok: runtimeReady,
      service: 'digitalora',
      status: runtimeReady ? 'ready' : 'starting',
      uptime_seconds: Math.floor(process.uptime()),
    }));
    return true;
  }
  if (url.pathname !== '/healthz') return false;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'method_not_allowed');
    return true;
  }
  applySecurityHeaders(res);
  res.writeHead(200, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  if (req.method === 'HEAD') res.end();
  else res.end('ok');
  return true;
}

export function setRuntimeReady(ready: boolean): void {
  runtimeReady = ready;
}
