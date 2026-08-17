/**
 * Tiny in-memory key/value cache with TTLs. Used to avoid hammering
 * the DB for hot reads (categories, product lists). The "Clear Cache"
 * admin button calls `clearAll()`.
 */
type Entry<T> = { value: T; expires: number };

const store = new Map<string, Entry<unknown>>();

export function get<T>(key: string): T | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  if (e.expires < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return e.value as T;
}

export function set<T>(key: string, value: T, ttlMs = 60_000): void {
  store.set(key, { value, expires: Date.now() + ttlMs });
}

export function del(key: string): void {
  store.delete(key);
}

export function clearAll(): void {
  store.clear();
}
