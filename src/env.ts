import 'dotenv/config';
import { z } from 'zod';

// Accept either TELEGRAM_BOT_TOKEN (preferred) or BOT_TOKEN (legacy alias).
if (!process.env.TELEGRAM_BOT_TOKEN && process.env.BOT_TOKEN) {
  process.env.TELEGRAM_BOT_TOKEN = process.env.BOT_TOKEN;
}

// Same idea for SMTP — the production deploy uses generic SMTP_*
// names, but Devin's saved-secret manager stores the mailbox password
// under the more specific `DIGITALORA_SMTP_PASS` so it can be reused
// for other tooling. Either name works at runtime.
if (!process.env.SMTP_PASS && process.env.DIGITALORA_SMTP_PASS) {
  process.env.SMTP_PASS = process.env.DIGITALORA_SMTP_PASS;
}

/**
 * Shared transformer for the `LOG_CHAT_ID` family of env vars. Each
 * one accepts the same input shapes — `@channelusername` (with or
 * without `@`), numeric `-100…` id, or an opt-out marker — and
 * resolves to a value the grammY API can use directly. Unconfigured
 * channels remain disabled so a deployment cannot accidentally send
 * operational data to a channel owned by another environment.
 */
function logChannelTransformer() {
  return (value: string | undefined): number | string | undefined => {
    if (value === undefined) return undefined;
    const cleaned = value.replace(/^["']|["']$/g, '').trim();
    if (cleaned === '') return undefined;
    if (/^(0|off|none|disabled)$/i.test(cleaned)) return undefined;
    if (/^-?\d+$/.test(cleaned)) return Number(cleaned);
    return cleaned.startsWith('@') ? cleaned : `@${cleaned}`;
  };
}

const booleanFromEnv = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
    return value;
  },
  z.boolean().default(false),
);

const schema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(10, 'TELEGRAM_BOT_TOKEN (or BOT_TOKEN) missing'),
  ADMIN_USER_ID: z.coerce.number().int().positive(),
  BOT_USERNAME: z.string().min(3),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  BOT_MODE: z.enum(['polling', 'webhook']).default('polling'),
  WEBHOOK_URL: z.string().url().optional().or(z.literal('')),
  WEBHOOK_SECRET: z.string().optional().or(z.literal('')),
  PUBLIC_BASE_URL: z.string().url().optional().or(z.literal('')),
  PORT: z.coerce.number().int().default(3000),
  // Query-string API keys leak through browser history, proxy logs, and
  // referrer headers. Keep legacy compatibility available only when an
  // existing client explicitly opts into the weaker transport.
  ALLOW_LEGACY_QUERY_API_KEY: booleanFromEnv,

  DEFAULT_LANG: z.enum(['en', 'ar', 'vi']).default('en'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  OPENAI_API_KEY: z.string().optional().or(z.literal('')),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  // ----------------------------------------------------------------
  //  Outbound email (welcome / receipts / password-style notices)
  // ----------------------------------------------------------------
  // When all four SMTP_* values are present, the bot sends a
  // professionally written welcome email (with the Why-Email PDF
  // attached) the moment a user saves an address through the
  // Settings → Email Settings flow. If anything is missing the bot
  // silently skips the send and just logs a warning at startup.
  SMTP_HOST: z.string().optional().or(z.literal('')),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional().or(z.literal('')),
  SMTP_PASS: z.string().optional().or(z.literal('')),
  // Defaults to SMTP_USER when unset. Lets you send as
  // "Digitalora <shopbot@digitalora.com>" while authenticating
  // as the same mailbox.
  SMTP_FROM: z.string().optional().or(z.literal('')),
  SMTP_FROM_NAME: z.string().default('Digitalora'),

  // ----------------------------------------------------------------
  //  Resend (HTTPS API) — preferred transport on cloud platforms
  //  that block raw SMTP egress (Railway, Heroku, Fly, Vercel...).
  // ----------------------------------------------------------------
  // When RESEND_API_KEY is set, the mailer uses Resend's HTTPS API
  // instead of nodemailer. This bypasses the SMTP-port firewall on
  // cloud platforms while preserving the same "From: shopbot@digitalora.com"
  // identity (provided the digitalora.com domain has been verified
  // in the Resend dashboard via DKIM + SPF DNS records).
  RESEND_API_KEY: z.string().optional().or(z.literal('')),
  // Defaults to "shopbot@digitalora.com" if both this and SMTP_USER
  // are unset. Must be an address whose domain is verified in Resend.
  RESEND_FROM: z.string().optional().or(z.literal('')),

  // ----------------------------------------------------------------
  //  Deep-detail log channel
  // ----------------------------------------------------------------
  // Telegram chat to receive every "deep details" notification
  // emitted by `services/adminLog.ts` (orders, top-ups, support
  // sessions, support transcripts, PDF sends, language /
  // notification toggles, etc.). Accepts either:
  //
  //   - `@channelusername` for a public channel (e.g.
  //     `@safhubhaijan012826`), OR
  //   - a numeric chat id starting with `-100…` for a private
  //     channel/supergroup (forward any message from it to
  //     @userinfobot to read the id).
  //
  // Defaults to `@safhubhaijan012826` (the bot owner's log
  // channel) so a fresh deployment routes deep-detail notifications
  // to the channel without needing any env wiring. Set
  // `LOG_CHAT_ID=0` (or `off` / `none` / `disabled`) to opt out and
  // fall back to the admin DM. The bot must be added to the
  // channel as an admin with "Post Messages" + "Send Documents"
  // permission for transcripts to land.
  LOG_CHAT_ID: z
    .string()
    .trim()
    .optional()
    .transform(logChannelTransformer()),

  // ----------------------------------------------------------------
  //  Orders log channel
  // ----------------------------------------------------------------
  // Telegram chat that receives only product-order notifications
  // (`logOrderCreated`). Kept separate from `LOG_CHAT_ID` so the
  // owner can pin the orders channel for at-a-glance "what just
  // sold" visibility while leaving the noisier sales / support /
  // settings feed elsewhere. Same input shapes as `LOG_CHAT_ID`
  // (`@username`, numeric `-100…`, or `0` to opt out). When
  // `ORDER_LOG_CHAT_ID` is opted out, orders fall back to the main
  // `LOG_CHAT_ID` channel — and only after that, the admin DM.
  ORDER_LOG_CHAT_ID: z
    .string()
    .trim()
    .optional()
    .transform(logChannelTransformer()),

  // ----------------------------------------------------------------
  //  Referral notifications channel
  // ----------------------------------------------------------------
  // Telegram chat that receives new referral notifications.
  // Same input shapes as `LOG_CHAT_ID` (`@username`, numeric `-100…`).
  BOT_REFERS_CHANNEL: z
    .string()
    .trim()
    .optional()
    .transform(logChannelTransformer()),

  // Public shop feed / watcher group (sold, stock and announcement cards).
  PUBLIC_FEED_CHAT_ID: z
    .string()
    .trim()
    .optional()
    .transform(logChannelTransformer()),

  // Public sales/chat group for lightweight buyer activity and optional
  // broadcast mirrors. Use a public @username or a private -100... chat id.
  PUBLIC_SALES_CHAT_ID: z
    .string()
    .trim()
    .optional()
    .transform(logChannelTransformer()),

  // ----------------------------------------------------------------
  //  Required Join Channels (force users to join before using bot)
  // ----------------------------------------------------------------
  // Comma-separated list of channel usernames or IDs that users must join.
  // Example: "@mychannel,-1001234567890,@anotherchannel"
  REQUIRED_JOIN_CHANNELS: z
    .string()
    .trim()
    .optional()
    .transform((val) => {
      if (!val || val.trim() === '') return [];
      return val.split(',').map((s) => s.trim()).filter(Boolean);
    }),

  // ----------------------------------------------------------------
  //  TonCenter (TON USDT jetton verification)
  // ----------------------------------------------------------------
  // Optional API key for https://toncenter.com . Without it the
  // free-tier rate limit (1 req/sec) still works, but a key buys
  // higher throughput and avoids 429 throttles when many users
  // submit TON top-ups in parallel.
  TONCENTER_API_KEY: z.string().optional().or(z.literal('')),

  // ----------------------------------------------------------------
  //  TronGrid (USDT TRC20 verification)
  // ----------------------------------------------------------------
  // Optional API key for https://www.trongrid.io . The verifier
  // works without one but rate-limits aggressively under load.
  TRONGRID_API_KEY: z.string().optional().or(z.literal('')),

  // ----------------------------------------------------------------
  //  BlockCypher (LTC verification)
  // ----------------------------------------------------------------
  // Optional API token for https://www.blockcypher.com . The free
  // tier allows ~3 req/sec which is fine for low-volume bots; set
  // this when you start seeing 429 responses from the verifier.
  BLOCKCYPHER_TOKEN: z.string().optional().or(z.literal('')),

  // ----------------------------------------------------------------
  //  CoinGecko (LTC/USD rate quote)
  // ----------------------------------------------------------------
  // Optional API key for https://www.coingecko.com . The free
  // public endpoint works without one but is rate-limited to a few
  // requests per minute. Set this on production so the LTC quote
  // never fails to fetch when many users open the LTC top-up
  // screen at once.
  COINGECKO_API_KEY: z.string().optional().or(z.literal('')),

  // ----------------------------------------------------------------
  //  Binance Pay auto-verify (personal-account Spot API)
  // ----------------------------------------------------------------
  // Read-only API key + secret pair generated from
  // https://www.binance.com/en/my/settings/api-management . The
  // Binance Pay top-up screen polls the personal-account
  // `GET /sapi/v1/pay/transactions` endpoint, matches the user's
  // pasted Order ID against the merchant's incoming Pay history,
  // and credits on a clean match. Only the `Reading` permission is
  // required — Trade and Withdraw must stay OFF for safety.
  //
  // Both env vars are OPTIONAL. When either is unset the
  // `binance_pay` admin wizard still works but the verifier
  // gracefully falls back to manual admin approval (same as if the
  // user pasted an unrelated order ID).
  //
  // NOTE: `api.binance.com` returns HTTP 451 from many cloud
  // regions (Azure / Railway included). This integration assumes
  // outbound traffic from the bot host is routed through a VPN to
  // an exit IP Binance allows (e.g. ProtonVPN Netherlands).
  BINANCE_PAY_API_KEY: z.string().optional().or(z.literal('')),
  BINANCE_PAY_API_SECRET: z.string().optional().or(z.literal('')),
  // Optional comma-separated Binance REST base URLs. Defaults to the
  // official api/api-gcp/api1-api4 rotation when unset.
  BINANCE_API_BASE_URLS: z.string().optional().or(z.literal('')),
  // Optional proxy used ONLY for Binance Pay API requests. Use an
  // HTTP(S) proxy URL (e.g. http://proxy.example.com:8080). Leave
  // blank to connect directly.
  BINANCE_PROXY_URL: z.string().url().optional().or(z.literal('')),
  // Optional comma-separated failover list. When set, Binance Pay
  // verification tries each proxy first, then falls back to direct.
  BINANCE_PROXY_URLS: z.string().optional().or(z.literal('')),

  // ----------------------------------------------------------------
  //  Bybit internal-transfer auto-verify
  // ----------------------------------------------------------------
  // Users send USDT inside Bybit to the configured Bybit UID / ID,
  // then paste the internal transfer TXID. The bot checks
  // GET /v5/asset/deposit/query-internal-record against the API-key
  // owner's deposit records. Requires an API key with asset/wallet
  // read access.
  BYBIT_API_KEY: z.string().optional().or(z.literal('')),
  BYBIT_API_SECRET: z.string().optional().or(z.literal('')),
  // Optional comma-separated Bybit REST base URLs. Defaults to
  // https://api.bybit.com and https://api.bytick.com.
  BYBIT_API_BASE_URL: z.string().url().optional().or(z.literal('')),
  BYBIT_API_BASE_URLS: z.string().optional().or(z.literal('')),
  // Optional proxy URL used ONLY for Bybit Pay API calls. Use this
  // when Bybit/CloudFront blocks Railway's direct country/IP.
  BYBIT_PROXY_URL: z.string().url().optional().or(z.literal('')),
  // Optional comma-separated failover proxies. The bot tries these
  // first, then BYBIT_PROXY_URL, then direct.
  BYBIT_PROXY_URLS: z.string().optional().or(z.literal('')),

  // ----------------------------------------------------------------
  //  Telegram Crypto Pay auto-verify (USDT wallet top-ups)
  // ----------------------------------------------------------------
  CRYPTOBOT_API_TOKEN: z.string().optional().or(z.literal('')),
  CRYPTOBOT_API_BASE_URL: z.string().url().default('https://pay.crypt.bot'),
});

// Provide a stable alias `BOT_TOKEN` on the parsed env for consumers.
export type EnvWithAlias = z.infer<typeof schema> & { BOT_TOKEN: string };

export type Env = EnvWithAlias;

export const env: Env = (() => {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return { ...parsed.data, BOT_TOKEN: parsed.data.TELEGRAM_BOT_TOKEN };
})();
