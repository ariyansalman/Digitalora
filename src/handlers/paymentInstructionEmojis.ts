/**
 * Premium custom-emoji markers used by the payment-instruction screens
 * (top-up + direct-pay), supplied by the bot owner. Each entry is a
 * `{{ce:<custom_emoji_id>|<unicode-fallback>}}` marker recognised by
 * `services/premium.ts → renderMdHtml` — Telegram premium subscribers
 * see the animated/styled glyph, free users see the unicode fallback.
 *
 * Defined in one place so the top-up and direct-pay layouts stay in
 * sync. If the bot owner ever swaps an emoji, only this map changes.
 *
 * NOTE: when picking unicode fallbacks, prefer the closest matching
 * single-codepoint glyph that survives across iOS / Android / Desktop
 * Telegram clients without VS-16 quirks.
 */

const ce = (id: string, unicode: string): string =>
  `{{ce:${id}|${unicode}}}`;

export const PE = {
  /** Yellow Binance-style logo glyph in front of the "Binance Pay Deposit" header. */
  binance_title: ce('5875443023873053217', '🟡'),
  /** USDT/coin glyph used for the BEP-20 / TRC-20 deposit headers. */
  usdt_title: ce('5431647832748612816', '💵'),
  /** TON-network gem glyph used for the "TON Network Deposit" header. */
  ton_title: ce('5265151230790884988', '💎'),
  /** Step bullet: "Send <X> to the address above" instructions. */
  bullet_send: ce('5794164805065514131', '✅'),
  /** Step bullet: "Paste your TXID / Order ID below" instructions. */
  bullet_paste: ce('5794085322400733645', '📝'),
  /** Inline "decimal-precision" / advisory note (less alarming than ⚠️). */
  note: ce('6008233706039284019', '⚠️'),
  /** Conversion-rate notice: "TRX/TON coins are auto-converted to USDT". */
  convert: ce('6023761060786346622', '🔄'),
} as const;

export type PaymentInstructionEmojiKey = keyof typeof PE;
