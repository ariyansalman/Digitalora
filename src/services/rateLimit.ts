/**
 * Tiny in-memory token-bucket rate limiter, keyed by an arbitrary
 * string (typically `<scope>:<telegram_id>`). Safe for the single-
 * process bot we ship today; if we ever scale to multiple workers
 * this should move to Redis / Postgres.
 *
 * Used to throttle Binance Pay Order ID submissions and on-chain
 * tx-hash submissions so a malicious user can't brute-force the
 * verifier (e.g. iterate through 18-digit candidate orderIds).
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterMs: number };

/**
 * Check + consume one token from the bucket identified by `key`.
 *
 * Bucket capacity is `max` requests per `windowMs` ms. The bucket
 * resets whole-window once `windowMs` has elapsed since the first
 * call in the window, NOT continuously \u2014 this is good enough for
 * abuse-prevention and avoids the cost of a real sliding window.
 */
export function consume(
  key: string,
  max: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: max - 1 };
  }
  if (existing.count >= max) {
    return { ok: false, retryAfterMs: existing.resetAt - now };
  }
  existing.count += 1;
  return { ok: true, remaining: max - existing.count };
}

/**
 * Format `retryAfterMs` for display in a user-facing reply.
 */
export function formatRetryAfter(retryAfterMs: number): string {
  const s = Math.ceil(retryAfterMs / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.ceil(s / 60);
  return `${m}m`;
}
