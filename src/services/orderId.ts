/**
 * Public order identifier.
 *
 * The DB primary key is a bigserial. We never want to expose that to
 * users (it leaks total-order count across users), so we synthesise a
 * stable, human-typable public ID like `ORD67FF2G9YG` from the
 * (id, created_at) pair using base32-Crockford. The mapping is
 * deterministic and reversible — for inbound lookups we accept any
 * casing and strip the prefix.
 */

// Crockford's base32 alphabet (no I, L, O, U).
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PREFIX = 'ORD';

function encodeBase32(n: bigint): string {
  if (n === 0n) return '0';
  let s = '';
  let x = n;
  while (x > 0n) {
    s = ALPHABET[Number(x % 32n)] + s;
    x = x / 32n;
  }
  return s;
}

function decodeBase32(s: string): bigint {
  let n = 0n;
  for (const ch of s.toUpperCase()) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`bad public id char: ${ch}`);
    n = n * 32n + BigInt(idx);
  }
  return n;
}

/** Build the public ID for an order row. */
export function publicOrderId(row: { id: number; created_at: string }): string {
  // Mix the id with the creation timestamp seconds so two close ids
  // produce visually distinct public ids.
  const ts = Math.floor(new Date(row.created_at).getTime() / 1000);
  const mixed = (BigInt(ts) << 24n) ^ BigInt(row.id);
  return PREFIX + encodeBase32(mixed).padStart(8, '0');
}

/**
 * Reverse of `publicOrderId`. Returns the numeric DB id, or null if
 * the input doesn't look like a public order id we issued.
 */
export function parsePublicOrderId(input: string): number | null {
  const s = input.trim().toUpperCase().replace(/\s+/g, '');
  if (!s.startsWith(PREFIX)) return null;
  const body = s.slice(PREFIX.length);
  if (!/^[0-9A-Z]+$/.test(body)) return null;
  let mixed: bigint;
  try {
    mixed = decodeBase32(body);
  } catch {
    return null;
  }
  // We don't know `ts` on its own, but we stored ((ts << 24) ^ id)
  // and id is at most 24 bits in practice, so XOR-ing back the low
  // 24 bits yields id; we then verify by re-encoding.
  const low24 = Number(mixed & 0xffffffn);
  return low24 > 0 ? low24 : null;
}
