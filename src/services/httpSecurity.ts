import type http from 'node:http';

const WINDOW_MS = 60_000;
const MAX_BUCKETS = 5_000;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function clientIp(req: http.IncomingMessage): string {
  // Do not trust X-Forwarded-For by default: Railway/proxies can vary.
  // The socket address is stable from the directly connected proxy.
  return req.socket.remoteAddress ?? 'unknown';
}

function prune(now: number): void {
  if (buckets.size <= MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
    if (buckets.size <= MAX_BUCKETS) break;
  }
}

/** Small in-process guard for public HTTP endpoints. It is intentionally
 * conservative and is not a replacement for an edge/WAF rate limiter. */
export function allowHttpRequest(
  req: http.IncomingMessage,
  scope: string,
  limitPerMinute: number,
): boolean {
  const now = Date.now();
  const key = `${scope}:${clientIp(req)}`;
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    prune(now);
    return true;
  }
  if (current.count >= limitPerMinute) return false;
  current.count += 1;
  return true;
}

export function applySecurityHeaders(res: http.ServerResponse): void {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('cache-control', 'no-store');
}

export function rejectRateLimit(res: http.ServerResponse): void {
  res.writeHead(429, {
    'content-type': 'application/json; charset=utf-8',
    'retry-after': '60',
  });
  res.end(JSON.stringify({ ok: false, error: 'rate_limited' }));
}
