/**
 * Runtime settings cache. The bot reads admin-editable values
 * (texts, colors, emojis) from this in-memory cache. Reload after
 * changes by calling `refreshSettings()`.
 */
import { deleteSetting, getAllSettings, setSetting } from '../db/queries.js';
import type { ColorMode, EmojiSpec } from '../../config/index.js';
import { COLOR_PREFIX, DEFAULT_BUTTON_COLORS, EMOJI } from '../../config/index.js';

let cache = new Map<string, unknown>();
let loaded = false;

export async function refreshSettings(): Promise<void> {
  cache = await getAllSettings();
  loaded = true;
}

export async function ensureLoaded(): Promise<void> {
  if (!loaded) await refreshSettings();
}

/** Override a text by i18n key â€” `text.<key>` in settings table. */
export function getTextOverride(key: string): string | undefined {
  const v = cache.get(`text.${key}`);
  return typeof v === 'string' ? v : undefined;
}

/** Get color mode for a button key. Falls back to the default. */
export function getButtonColor(key: keyof typeof DEFAULT_BUTTON_COLORS): ColorMode {
  const v = cache.get(`color.${key}`);
  if (typeof v === 'string' && v in COLOR_PREFIX) return v as ColorMode;
  return DEFAULT_BUTTON_COLORS[key];
}

/**
 * Look up the prefix glyph for a color mode. Admins can override the
 * built-in glyph (ðŸ”µðŸŸ¢ðŸ”´ðŸŸ¡) with any custom string via the
 * `color.prefix.<mode>` setting â€” useful for picking different
 * symbols, alternative shapes, or suppressing the glyph entirely
 * (set to an empty string) without losing the underlying Bot API 9.4
 * style.
 */
export function getColorPrefix(mode: ColorMode): string {
  const v = cache.get(`color.prefix.${mode}`);
  if (typeof v === 'string') return v;
  return COLOR_PREFIX[mode];
}

export async function setColorPrefix(
  mode: ColorMode,
  glyph: string,
  updated_by?: number,
): Promise<void> {
  const key = `color.prefix.${mode}`;
  await setSetting(key, glyph, updated_by);
  cache.set(key, glyph);
}

export async function clearColorPrefix(mode: ColorMode): Promise<void> {
  const key = `color.prefix.${mode}`;
  await deleteSetting(key);
  cache.delete(key);
}

/** Get color mode for a state-based key like in_stock / out_of_stock. */
export function getStateColor(key: 'in_stock' | 'out_of_stock'): ColorMode {
  const v = cache.get(`color.${key}`);
  if (typeof v === 'string' && v in COLOR_PREFIX) return v as ColorMode;
  return key === 'in_stock' ? 'blue' : 'red';
}

/**
 * Per-category button color (admin-editable via the Set Color picker).
 * Stored under `color.category.<id>`. Falls back to `'none'` so the
 * product list's normal in-stock blue stays the default until the
 * admin paints a specific category.
 */
export function getCategoryColor(id: number): ColorMode {
  const v = cache.get(`color.category.${id}`);
  if (typeof v === 'string' && v in COLOR_PREFIX) return v as ColorMode;
  return 'none';
}

export function getCategoryDefaultColor(): ColorMode {
  const def = cache.get('color.category.default');
  if (typeof def === 'string' && def in COLOR_PREFIX) return def as ColorMode;
  return 'none';
}

export async function setCategoryColor(
  id: number,
  color: ColorMode,
  updated_by?: number,
): Promise<void> {
  const key = `color.category.${id}`;
  await setSetting(key, color, updated_by);
  cache.set(key, color);
}

export async function setCategoryDefaultColor(
  color: ColorMode,
  updated_by?: number,
): Promise<void> {
  const key = 'color.category.default';
  await setSetting(key, color, updated_by);
  cache.set(key, color);
}

/** Optional per-product catalog button color override. */
export function getProductColor(id: number): ColorMode | undefined {
  const v = cache.get(`color.product.${id}`);
  return typeof v === 'string' && v in COLOR_PREFIX ? (v as ColorMode) : undefined;
}

export async function setProductColor(
  id: number,
  color: ColorMode,
  updated_by?: number,
): Promise<void> {
  const key = `color.product.${id}`;
  await setSetting(key, color, updated_by);
  cache.set(key, color);
}

export async function clearProductColor(id: number): Promise<void> {
  const key = `color.product.${id}`;
  await deleteSetting(key);
  cache.delete(key);
}

export function getEmoji(key: string): EmojiSpec {
  const v = cache.get(`emoji.${key}`);
  if (
    v &&
    typeof v === 'object' &&
    'unicode' in (v as Record<string, unknown>) &&
    'custom_emoji_id' in (v as Record<string, unknown>)
  ) {
    return v as { unicode: string; custom_emoji_id: string };
  }
  if (typeof v === 'string') return v;
  return EMOJI[key] ?? key;
}

export async function setText(key: string, value: string, updated_by?: number): Promise<void> {
  await setSetting(`text.${key}`, value, updated_by);
  cache.set(`text.${key}`, value);
}

export async function setColor(
  key: string,
  color: ColorMode,
  updated_by?: number,
): Promise<void> {
  await setSetting(`color.${key}`, color, updated_by);
  cache.set(`color.${key}`, color);
}

export async function setEmoji(
  key: string,
  unicode: string,
  custom_emoji_id?: string,
  updated_by?: number,
): Promise<void> {
  const value: EmojiSpec = custom_emoji_id ? { unicode, custom_emoji_id } : unicode;
  await setSetting(`emoji.${key}`, value, updated_by);
  cache.set(`emoji.${key}`, value);
}

/** Drop an emoji override so the key falls back to its default. */
export async function clearEmoji(key: string): Promise<void> {
  await deleteSetting(`emoji.${key}`);
  cache.delete(`emoji.${key}`);
}

/**
 * Per-BUTTON premium-emoji icon override (Bot API 9.4
 * `icon_custom_emoji_id`). Stored under its own `btnicon.<key>`
 * namespace â€” separate from the shared `emoji.<key>` map â€” so
 * accidentally-bad `custom_emoji_id` values (e.g. emoji not owned by
 * the bot's owner) can't break the keyboard render path globally.
 *
 * Returns `undefined` when no override is set or the stored value
 * has no premium id (icons require a real `custom_emoji_id`).
 */
export function getButtonIcon(key: string): { unicode: string; custom_emoji_id: string } | undefined {
  const v = cache.get(`btnicon.${key}`);
  if (
    v &&
    typeof v === 'object' &&
    'unicode' in (v as Record<string, unknown>) &&
    'custom_emoji_id' in (v as Record<string, unknown>)
  ) {
    const obj = v as { unicode: string; custom_emoji_id: string };
    if (obj.custom_emoji_id && obj.custom_emoji_id.length > 0) return obj;
  }
  return undefined;
}

export async function setButtonIcon(
  key: string,
  unicode: string,
  custom_emoji_id: string,
  updated_by?: number,
): Promise<void> {
  const value = { unicode, custom_emoji_id };
  await setSetting(`btnicon.${key}`, value, updated_by);
  cache.set(`btnicon.${key}`, value);
}

export async function clearButtonIcon(key: string): Promise<void> {
  await deleteSetting(`btnicon.${key}`);
  cache.delete(`btnicon.${key}`);
}

export function clearLocalCache(): void {
  cache.clear();
  loaded = false;
}

/** Channel URL shown as a direct-join button in the main menu. */
export function getChannelUrl(): string | undefined {
  const v = cache.get('channel.url');
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export async function setChannelUrl(url: string, updated_by?: number): Promise<void> {
  await setSetting('channel.url', url, updated_by);
  cache.set('channel.url', url);
}

export async function clearChannelUrl(updated_by?: number): Promise<void> {
  await setSetting('channel.url', '', updated_by);
  cache.set('channel.url', '');
}

export function getForceJoinEnabled(): boolean {
  const v = cache.get('force_join.enabled');
  if (v === undefined) return true;
  return v === true || v === 'true';
}

export async function setForceJoinEnabled(enabled: boolean, updated_by?: number): Promise<void> {
  await setSetting('force_join.enabled', enabled, updated_by);
  cache.set('force_join.enabled', enabled);
}

export function getApiPriceAlertsEnabled(): boolean {
  const v = cache.get('api_price_alerts.enabled');
  if (v === undefined) return true;
  return v === true || v === 'true';
}

export async function setApiPriceAlertsEnabled(
  enabled: boolean,
  updated_by?: number,
): Promise<void> {
  await setSetting('api_price_alerts.enabled', enabled, updated_by);
  cache.set('api_price_alerts.enabled', enabled);
}

/**
 * Public URL of the email-explanation PDF. When set, the Why Email
 * "Know More" button becomes a URL button that opens the PDF in
 * Telegram's in-app browser. Falls back to env var `EMAIL_PDF_URL`
 * so a sane default can be baked in at deploy time.
 *
 * Admins can set this at runtime via /settext key=`email.pdf_url`.
 */
export function getEmailPdfUrl(): string | null {
  const v = cache.get('email.pdf_url');
  if (typeof v === 'string' && v.length > 0) return v;
  const env = process.env.EMAIL_PDF_URL;
  return env && env.length > 0 ? env : null;
}

/**
 * Direct-message URL for the admin / shop owner. Used by:
 *   - Settings â†’ Redeem Gift Code â†’ "Buy Code" button
 *   - any other screen that wants a 1-tap "contact admin" hop.
 *
 * Resolution order:
 *   1. settings.admin.contact_url (admin-editable via /settext)
 *   2. env ADMIN_CONTACT_URL
 *   3. https://t.me/digitalora as the documented default.
 */
export function getAdminContactUrl(): string {
  const v = cache.get('admin.contact_url');
  if (typeof v === 'string' && v.length > 0) return v;
  const env = process.env.ADMIN_CONTACT_URL;
  if (env && env.length > 0) return env;
  return 'https://t.me/digitalora';
}

/**
 * Same as `getAdminContactUrl` but with a `?text=...` param appended
 * so Telegram pre-fills the admin DM's input bar with the given text
 * the moment the user lands in the chat.
 */
export function getAdminContactUrlWithPrefill(text: string): string {
  const base = getAdminContactUrl();
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}text=${encodeURIComponent(text)}`;
}

// ---------------------------------------------------------------------------
//  Bot Tutorial (Settings â†’ Bot Tutorial)
//  Stored under the `bot_tutorial.*` namespace so the admin can edit
//  it via /setsetting (or the dedicated admin flow). Each piece is
//  independently optional â€” a tutorial may be text-only, file-only,
//  or any mix of the four fields.
// ---------------------------------------------------------------------------

export interface BotTutorial {
  text: string | null;
  file_id: string | null;
  file_type: 'photo' | 'video' | 'document' | null;
  url: string | null;
}

function readString(key: string): string | null {
  const v = cache.get(key);
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function getBotTutorial(): BotTutorial {
  const fileType = readString('bot_tutorial.file_type');
  const file_type =
    fileType === 'photo' || fileType === 'video' || fileType === 'document'
      ? fileType
      : null;
  return {
    text: readString('bot_tutorial.text'),
    file_id: readString('bot_tutorial.file_id'),
    file_type,
    url: readString('bot_tutorial.url'),
  };
}

export async function setBotTutorialField(
  field: keyof BotTutorial,
  value: string | null,
  updated_by?: number,
): Promise<void> {
  const key = `bot_tutorial.${field}`;
  if (value === null || value === '') {
    await deleteSetting(key);
    cache.delete(key);
    return;
  }
  await setSetting(key, value, updated_by);
  cache.set(key, value);
}

// ---------------------------------------------------------------------------
//  Per-payment-method tutorial (admin-editable "Where TXID? / Where Order ID?"
//  card surfaced under every chain/Binance/LTC instruction screen). Stored
//  under the `pay_tutorial.<method_id>.*` namespace so each row in
//  payment_methods carries its own tutorial. Same shape as `BotTutorial`
//  so the rendering helpers can be reused.
// ---------------------------------------------------------------------------

export type PaymentMethodTutorial = BotTutorial;

function methodTutorialKey(methodId: number, field: keyof BotTutorial): string {
  return `pay_tutorial.${methodId}.${field}`;
}

export function getPaymentMethodTutorial(methodId: number): PaymentMethodTutorial {
  const fileType = readString(methodTutorialKey(methodId, 'file_type'));
  const file_type =
    fileType === 'photo' || fileType === 'video' || fileType === 'document'
      ? fileType
      : null;
  return {
    text: readString(methodTutorialKey(methodId, 'text')),
    file_id: readString(methodTutorialKey(methodId, 'file_id')),
    file_type,
    url: readString(methodTutorialKey(methodId, 'url')),
  };
}

export async function setPaymentMethodTutorialField(
  methodId: number,
  field: keyof BotTutorial,
  value: string | null,
  updated_by?: number,
): Promise<void> {
  const key = methodTutorialKey(methodId, field);
  if (value === null || value === '') {
    await deleteSetting(key);
    cache.delete(key);
    return;
  }
  await setSetting(key, value, updated_by);
  cache.set(key, value);
}

/**
 * Drop ALL `pay_tutorial.<methodId>.*` keys when a payment method is
 * deleted by the admin. Keeps the settings table clean.
 */
export async function clearPaymentMethodTutorial(methodId: number): Promise<void> {
  const fields: (keyof BotTutorial)[] = ['text', 'file_id', 'file_type', 'url'];
  for (const f of fields) {
    const key = methodTutorialKey(methodId, f);
    await deleteSetting(key);
    cache.delete(key);
  }
}

export function getPriceListPromoFooter(): string | null {
  return readString('profile.pricelist.promo_footer_override');
}
