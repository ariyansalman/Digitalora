/**
 * Stable public deposit identifier for user-facing receipts.
 * Keeps the database primary key out of the UI while remaining deterministic.
 */
export function formatDepositPublicId(id: number, createdAt?: string | Date): string {
  const date = createdAt ? new Date(createdAt) : new Date();
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `DEP-${y}${m}${d}-${String(id).padStart(6, '0')}`;
}
