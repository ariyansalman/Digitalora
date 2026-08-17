import { supabase } from '../db/supabase.js';

/** Charge the user's wallet, throwing if insufficient. Returns new balance. */
export async function charge(
  user_id: number,
  amount: number,
  current_balance: number,
  reference: string | null = null,
): Promise<number> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Invalid charge amount');
  }
  // `current_balance` is retained for API compatibility/UI messaging, but the
  // database transaction below is authoritative and closes the TOCTOU race.
  if (current_balance < amount) {
    throw Object.assign(new Error('insufficient'), { code: 'INSUFFICIENT_FUNDS' });
  }
  const { data, error } = await supabase.rpc('wallet_apply_atomic', {
    p_telegram_id: user_id,
    p_delta: -amount,
    p_type: 'wallet_purchase',
    p_reference: reference,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

/** Credit the user's wallet (e.g. on deposit approval). */
export async function credit(
  user_id: number,
  amount: number,
  reference: string | null = null,
  type: string = 'deposit_credit',
): Promise<number> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Invalid credit amount');
  }
  const { data, error } = await supabase.rpc('wallet_apply_atomic', {
    p_telegram_id: user_id,
    p_delta: amount,
    p_type: type,
    p_reference: reference,
  });
  if (error) throw error;
  return Number(data ?? 0);
}
