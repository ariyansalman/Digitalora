import { InlineKeyboard, Keyboard } from 'grammy';
import {
  BUTTON_ICONS,
  BUTTON_KEYS,
  colorModeToStyle,
  type ButtonStyle,
  type ColorMode,
  type Lang,
} from '../../config/index.js';
import {
  getButtonColor,
  getButtonIcon,
  getEmoji,
} from '../services/settings.js';
import { t } from '../i18n/index.js';

/**
 * Decorate a label with the legacy color prefix for the given button key.
 *
 * Historically this function injected a coloured-square glyph (🟢 / 🔵
 * / 🔴 / 🟡 / ⚪️) before the label whenever the admin had set a
 * `ColorMode` for the button. The owner asked for those prefixes to
 * be removed from every user-facing button (premium icons applied via
 * `applyButtonChrome()` cover the same purpose without the visual
 * noise), so this is now a no-op that always returns the label
 * unchanged.
 *
 * The function signature is preserved so existing call sites continue
 * to compile, and the admin "Set Color" / "Custom Color Glyphs"
 * menus stay wired up — they simply have no effect on rendered
 * buttons. `_key` and `_override` are intentionally unused.
 */
export function colored(
  label: string,
  _key: keyof typeof BUTTON_KEYS,
  _override?: ColorMode,
): string {
  return label;
}

/**
 * Resolve the button label, optionally stripping both the leading
 * AND trailing unicode emoji + space when an icon is going to be
 * set on the button object itself (avoids "[premium icon] 🛍 Shop"
 * and "Next ▶️" + animated-play-emoji-icon i.e. duplicate glyphs).
 *
 * Two emoji shapes are matched:
 *   1. A pair of regional-indicator codepoints (country flag like
 *      🇬🇧 / 🇸🇦 / 🇻🇳) — these are NOT in `\p{Extended_Pictographic}`
 *      per Unicode, so they need their own branch.
 *   2. Any single emoji-like grapheme, optionally a ZWJ-sequence,
 *      with an optional VS-16.
 * Optional adjacent space is stripped too.
 */
const LEADING_EMOJI = /^(?:[\u{1F1E6}-\u{1F1FF}]{2}|\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic})*\uFE0F?)\s?/u;
const TRAILING_EMOJI = /\s?(?:[\u{1F1E6}-\u{1F1FF}]{2}|\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic})*\uFE0F?)$/u;
let buttonChromeEnabled = true;

function stripDecorativeEmoji(label: string): string {
  return label.replace(LEADING_EMOJI, '').replace(TRAILING_EMOJI, '');
}

export function btn(lang: Lang, key: keyof typeof BUTTON_KEYS, override?: ColorMode): string {
  // Strip the label's leading + trailing unicode emoji BEFORE applying
  // the color-prefix glyph. Otherwise the icon slot renders one glyph
  // and the unicode in the label renders a duplicate alongside it —
  // e.g. `[premium-play-icon] Next ▶️` or `🛍 Shop` with a premium
  // shop icon to its left.
  const raw = t(lang, BUTTON_KEYS[key]);
  const baseLabel = resolveIconId(key) !== undefined ? stripDecorativeEmoji(raw) : raw;
  return colored(baseLabel, key, override);
}

/**
 * Look up the configured premium-emoji `custom_emoji_id` for a button
 * key.
 *
 * Resolution order:
 *   1. Per-button override stored under the dedicated `btnicon.<key>`
 *      namespace (admin opted-in via the "Set Button Icon" picker).
 *      Stored separately from the shared `emoji.<key>` map so a bad
 *      value can't ripple anywhere else.
 *   2. Compile-time `BUTTON_ICONS` mapping (sensible defaults).
 *
 * Returns `undefined` when neither has a `custom_emoji_id` set
 * (icons in Bot API 9.4 require a real premium emoji id — plain
 * unicode can't be used in the icon slot).
 */
export function resolveIconId(key: keyof typeof BUTTON_KEYS): string | undefined {
  const override = getButtonIcon(key);
  if (override) return override.custom_emoji_id;
  const emojiKey = BUTTON_ICONS[key];
  if (!emojiKey) return undefined;
  const spec = getEmoji(emojiKey);
  return typeof spec === 'object' ? spec.custom_emoji_id : undefined;
}

/**
 * Resolve the Bot API 9.4 `style` for a button key, considering any
 * admin override stored in the `settings` table.
 */
export function resolveStyle(
  key: keyof typeof BUTTON_KEYS,
  override?: ColorMode,
): ButtonStyle | undefined {
  return colorModeToStyle(override ?? getButtonColor(key));
}

export function disableButtonChrome(): void {
  buttonChromeEnabled = false;
}

export function isButtonChromeEnabled(): boolean {
  return buttonChromeEnabled;
}

export function isButtonChromeError(err: unknown): boolean {
  const description =
    (err as { description?: string } | undefined)?.description ??
    (err as { error?: { description?: string } } | undefined)?.error?.description ??
    (err as { message?: string } | undefined)?.message ??
    '';
  return /icon_custom_emoji_id|custom emoji|button style|can't parse inline keyboard button/i.test(
    description,
  );
}

/**
 * Apply the configured premium icon (`icon_custom_emoji_id`) and
 * Bot API 9.4 `style` to the LAST added button on the inline
 * keyboard. Use this right after the button is added with
 * `kb.text(...)` / `kb.url(...)` / `kb.copyText(...)`.
 */
export function applyButtonChrome(
  kb: InlineKeyboard,
  key: keyof typeof BUTTON_KEYS,
  override?: ColorMode,
): InlineKeyboard {
  if (!buttonChromeEnabled) return kb;
  const iconId = resolveIconId(key);
  if (iconId !== undefined) kb.icon(iconId);
  const style = resolveStyle(key, override);
  if (style !== undefined) kb.style(style);
  return kb;
}

/**
 * Add a labelled callback button to an inline keyboard, with the
 * configured premium icon + style applied automatically.
 */
export function inlineBtn(
  kb: InlineKeyboard,
  lang: Lang,
  key: keyof typeof BUTTON_KEYS,
  callbackData: string,
  override?: ColorMode,
): InlineKeyboard {
  kb.text(btn(lang, key, override), callbackData);
  return applyButtonChrome(kb, key, override);
}

/**
 * Add a URL button with the configured premium icon + style.
 */
export function inlineUrl(
  kb: InlineKeyboard,
  lang: Lang,
  key: keyof typeof BUTTON_KEYS,
  url: string,
  override?: ColorMode,
): InlineKeyboard {
  kb.url(btn(lang, key, override), url);
  return applyButtonChrome(kb, key, override);
}

/**
 * Add a `copy_text` button (Bot API 9.4) with the configured premium
 * icon + style. Tapping it copies `text` to the user's clipboard
 * client-side; the button is non-callback.
 */
export function inlineCopyText(
  kb: InlineKeyboard,
  lang: Lang,
  key: keyof typeof BUTTON_KEYS,
  text: string,
  override?: ColorMode,
): InlineKeyboard {
  kb.copyText(btn(lang, key, override), text);
  return applyButtonChrome(kb, key, override);
}

/** Build a reply keyboard from a 2D array of button-keys. */
export function makeReplyKeyboard(
  lang: Lang,
  rows: ReadonlyArray<ReadonlyArray<keyof typeof BUTTON_KEYS>>,
): Keyboard {
  const kb = new Keyboard();
  rows.forEach((row, i) => {
    row.forEach((k) => kb.text(btn(lang, k)));
    if (i < rows.length - 1) kb.row();
  });
  return kb.resized();
}

export { InlineKeyboard };
