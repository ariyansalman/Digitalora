/**
 * Durable session storage.
 *
 * grammY's default session storage is a `Map` in the bot process. On
 * Railway every deploy, crash or scale event throws it away, which used
 * to strand users mid-flow: a paste-your-tx-id screen whose flow state
 * no longer exists silently ignores the pasted hash, and a Back button
 * whose origin was remembered only in memory goes to the wrong screen.
 *
 * This adapter writes sessions to `public.bot_sessions` in Supabase, with
 * an in-process cache in front of it so the hot path stays fast. Reads
 * fall back to the cache when Supabase is unavailable, so a database
 * blip degrades to the old in-memory behaviour instead of failing the
 * update.
 *
 * Scope note: this is *UI* state (open flow, current step, prompt message
 * ids). Financial and order-critical state — orders, deposits, carts,
 * wallet balances — is authoritative in its own Supabase tables and is
 * never read back from here.
 */
import type { StorageAdapter } from 'grammy';
import { supabase } from '../db/supabase.js';
import { logger } from '../logger.js';
import { describeError } from '../core/errors.js';

const TABLE = 'bot_sessions';

/** Minimal shape of the Supabase client this adapter needs. */
export type SessionDb = {
  from: (table: string) => unknown;
};

export class SupabaseSessionStorage<T> implements StorageAdapter<T> {
  private readonly cache = new Map<string, T>();
  private readonly db: { from: (table: string) => any };

  /** The client is injectable so the adapter can be tested in isolation. */
  constructor(db: SessionDb = supabase) {
    this.db = db as { from: (table: string) => any };
  }

  async read(key: string): Promise<T | undefined> {
    if (this.cache.has(key)) return this.cache.get(key);
    try {
      const { data, error } = await this.db
        .from(TABLE)
        .select('data')
        .eq('key', key)
        .maybeSingle();
      if (error) throw error;
      const value = (data?.data ?? undefined) as T | undefined;
      if (value !== undefined) this.cache.set(key, value);
      return value;
    } catch (err) {
      logger.warn(
        { err: describeError(err), key },
        'session storage: read failed, using in-memory state',
      );
      return this.cache.get(key);
    }
  }

  async write(key: string, value: T): Promise<void> {
    this.cache.set(key, value);
    try {
      const { error } = await this.db
        .from(TABLE)
        .upsert({ key, data: value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
    } catch (err) {
      logger.warn(
        { err: describeError(err), key },
        'session storage: write failed, state kept in memory only',
      );
    }
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
    try {
      const { error } = await this.db.from(TABLE).delete().eq('key', key);
      if (error) throw error;
    } catch (err) {
      logger.warn({ err: describeError(err), key }, 'session storage: delete failed');
    }
  }
}
