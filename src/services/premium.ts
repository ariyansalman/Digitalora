/**
 * Helpers for rendering text containing premium emojis.
 *
 * Telegram allows bots (whose username was purchased on Fragment) to
 * send `MessageEntity` of type `custom_emoji` referencing a
 * `custom_emoji_id` from a Telegram premium emoji pack. Telegram
 * premium subscribers see the animated/styled glyph; non-premium
 * users see the unicode fallback.
 *
 * This module provides two render paths:
 *
 *   1) `renderPremium(template, map?)` — entity-based. Replaces
 *      `{key}` tokens in the template with the configured unicode
 *      glyph and attaches `custom_emoji` entities. Plain text only —
 *      no Markdown / HTML formatting allowed in the template (since
 *      Telegram ignores `parse_mode` when entities are passed).
 *
 *   2) `renderPremiumHtml(template, map?)` — HTML-based. Same `{key}`
 *      tokens, but emits `<tg-emoji emoji-id="…">unicode</tg-emoji>`
 *      tags, suitable for `parse_mode: 'HTML'`. Lets you mix premium
 *      emojis with `<b>bold</b>`, `<code>` etc.
 *
 *   3) `renderMdHtml(template, map?)` — convenience: accepts the
 *      project's existing single-asterisk Markdown style (`*bold*`,
 *      `_italic_`, `` `code` ``, ``` ```code blocks``` ```), converts
 *      it to HTML, replaces `{key}` tokens with `<tg-emoji>` tags,
 *      AND auto-scans any remaining unicode emojis for premium
 *      mappings. Use this for nearly any user-facing reply that was
 *      previously sent with `parse_mode: 'Markdown'`.
 *
 * Usage:
 *   const { text, entities } = renderPremium('Hi {fire}!', { fire: 'fire' });
 *   await ctx.reply(text, { entities });
 *
 *   const html = renderMdHtml('*Welcome* {tiger}!');
 *   await ctx.reply(html, { parse_mode: 'HTML' });
 */
import type { MessageEntity } from 'grammy/types';
import { getEmoji } from './settings.js';
import { EMOJI } from '../../config/index.js';

const TOKEN = /\{([\w.]+)\}/g;

export function renderPremium(
  template: string,
  map: Record<string, string> = {},
): { text: string; entities: MessageEntity[] } {
  const entities: MessageEntity[] = [];
  let out = '';
  let lastIndex = 0;

  for (const match of template.matchAll(TOKEN)) {
    const [whole, key] = match;
    const idx = match.index ?? 0;
    out += template.slice(lastIndex, idx);
    lastIndex = idx + whole.length;

    const emojiKey = map[key!] ?? key!;
    const spec = getEmoji(emojiKey);
    if (typeof spec === 'string') {
      out += spec;
    } else {
      // Telegram entity offsets/lengths are counted in UTF-16 code
      // units (matching JavaScript's `String.prototype.length`), NOT
      // Unicode code points. Non-BMP emojis like 📊 occupy 2 code
      // units each, so spreading into an array (which yields code
      // points) under-counts and Telegram rejects or misplaces the
      // custom_emoji entities.
      const offset = out.length;
      const unicode = spec.unicode;
      out += unicode;
      entities.push({
        type: 'custom_emoji',
        offset,
        length: unicode.length,
        custom_emoji_id: spec.custom_emoji_id,
      });
    }
  }
  out += template.slice(lastIndex);
  return { text: out, entities };
}

// ---------------------------------------------------------------------
// HTML rendering
// ---------------------------------------------------------------------

const HTML_ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => HTML_ESC[c]!);
}

function escapeHtmlAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

/**
 * Wrap an emoji unicode glyph as a `<tg-emoji>` tag if a premium
 * `custom_emoji_id` is configured for the given key; otherwise just
 * return the unicode (already HTML-escaped).
 */
function tgEmojiTag(unicode: string, customEmojiId?: string): string {
  const safeUnicode = escapeHtml(unicode);
  if (!customEmojiId) return safeUnicode;
  return `<tg-emoji emoji-id="${escapeHtmlAttr(customEmojiId)}">${safeUnicode}</tg-emoji>`;
}

/** Replace `{key}` tokens with their (premium-aware) HTML rendering. */
function replaceTokensHtml(template: string, map: Record<string, string>): string {
  return template.replace(TOKEN, (whole, key: string) => {
    const emojiKey = map[key] ?? key;
    const spec = getEmoji(emojiKey);
    if (typeof spec === 'string') return escapeHtml(spec);
    return tgEmojiTag(spec.unicode, spec.custom_emoji_id);
  });
}

/**
 * Build a reverse map from unicode glyph → custom_emoji_id, taken
 * from the live settings cache (admin overrides) on top of the
 * compile-time `EMOJI` config. Computed lazily on every call so any
 * runtime override takes effect instantly.
 */
function buildPremiumIndex(): Map<string, string> {
  const idx = new Map<string, string>();
  // First the compile-time defaults — overridden below by any
  // runtime-stored values via `getEmoji`.
  for (const key of Object.keys(EMOJI)) {
    const spec = getEmoji(key);
    if (typeof spec === 'object' && spec.custom_emoji_id) {
      idx.set(spec.unicode, spec.custom_emoji_id);
    }
  }
  return idx;
}

/**
 * A regex matching ANY emoji-like unicode glyph. Built from a coarse
 * union of the most common emoji code-point ranges. We don't need
 * laser precision: any non-emoji char that sneaks in simply won't
 * match an entry in the premium index and will be left unchanged.
 *
 * NOTE: emoji that occupy two code points (e.g. 🇺🇸 country flags
 * built from regional indicators, or ZWJ-joined sequences like 👨‍👩‍👧)
 * are matched character-by-character. The reverse-index lookup is
 * keyed on the *exact* unicode string of each configured emoji, so
 * single-codepoint glyphs (the vast majority used in this bot) work
 * out of the box. Multi-codepoint emojis still need to be added
 * manually as `{token}` placeholders.
 */
const EMOJI_LIKE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F1FF}\u{1F200}-\u{1F2FF}]\u{FE0F}?/gu;

/**
 * Walk an HTML-safe string and wrap any unicode emoji that has a
 * configured premium custom_emoji_id with a `<tg-emoji>` tag. We must
 * be careful not to touch text inside existing tags — but because we
 * only ever insert tags after this scan, the input is plain text +
 * already-HTML-escaped user content, so a simple "skip inside `<…>`"
 * state machine is enough.
 */
function autoScanPremiumEmojis(html: string): string {
  const idx = buildPremiumIndex();
  if (idx.size === 0) return html;
  let out = '';
  let i = 0;
  let tgEmojiDepth = 0;
  while (i < html.length) {
    const ch = html[i]!;
    if (ch === '<') {
      const end = html.indexOf('>', i);
      if (end === -1) {
        out += html.slice(i);
        break;
      }
      const tagBody = html.slice(i + 1, end).trim();
      const isClosing = tagBody.startsWith('/');
      const tagName = tagBody.replace(/^\/\s*/, '').split(/\s+/, 1)[0]?.toLowerCase();
      if (tagName === 'tg-emoji') {
        tgEmojiDepth += isClosing ? -1 : 1;
        if (tgEmojiDepth < 0) tgEmojiDepth = 0;
      }
      out += html.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (tgEmojiDepth > 0) {
      out += ch;
      i += 1;
      continue;
    }
    EMOJI_LIKE.lastIndex = i;
    const m = EMOJI_LIKE.exec(html);
    if (m && m.index === i) {
      const glyph = m[0];
      // Strip optional VS-16 (U+FE0F) variation selector when looking
      // up: configured emojis usually omit it.
      const bare = glyph.replace(/\uFE0F$/, '');
      const id = idx.get(glyph) ?? idx.get(bare);
      if (id) {
        out += `<tg-emoji emoji-id="${escapeHtmlAttr(id)}">${glyph}</tg-emoji>`;
      } else {
        out += glyph;
      }
      i += glyph.length;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Convert the project's lightweight Markdown to HTML. We only handle
 * the subset actually used in the locales:
 *   - ``` ```code blocks``` ``` → `<pre>code</pre>`
 *   - `` `code` ``               → `<code>code</code>`
 *   - `*bold*`                   → `<b>bold</b>`
 *   - `_italic_`                 → `<i>italic</i>`
 *   - `~~strike~~`               → `<s>strike</s>`
 *
 * The implementation goes in that order so backticks "win" over
 * `*`/`_`/`~~`.
 */
function mdToHtml(md: string): string {
  // 1) HTML-escape the whole input first.
  let s = escapeHtml(md);

  // 2) Triple-backtick code blocks (greedy across newlines).
  s = s.replace(/```([\s\S]+?)```/g, (_m, body: string) => `<pre>${body}</pre>`);

  // 3) Inline backtick code.
  s = s.replace(/`([^`\n]+?)`/g, (_m, body: string) => `<code>${body}</code>`);

  // 4) Strikethrough ~~text~~ — runs before bold/italic so the
  //    enclosed `*` / `_` chars don't accidentally get matched as
  //    formatting markers. Non-greedy, single-line.
  s = s.replace(/~~([^~\n]+?)~~/g, (_m, body: string) => `<s>${body}</s>`);

  // 5) Bold *text* — non-greedy, doesn't span newlines, requires
  //    at least one non-whitespace char inside.
  s = s.replace(/(^|[^*\w])\*([^*\n]+?)\*(?=$|[^*\w])/g, (_m, lead: string, body: string) =>
    `${lead}<b>${body}</b>`,
  );

  // 6) Italic _text_ — same heuristics as bold.
  s = s.replace(/(^|[^_\w])_([^_\n]+?)_(?=$|[^_\w])/g, (_m, lead: string, body: string) =>
    `${lead}<i>${body}</i>`,
  );

  // 6) Blockquotes — collapse runs of `&gt; …` lines into a single
  //    `<blockquote>…</blockquote>` block. Empty `&gt;` lines become
  //    a blank line inside the quote so consecutive entries stay
  //    visually grouped.
  s = s.replace(
    /(?:^|\n)((?:&gt;[^\n]*(?:\n|$))+)/g,
    (m, block: string) => {
      const inner = block
        .split('\n')
        .filter((l) => l.length > 0)
        .map((l) => l.replace(/^&gt;\s?/, ''))
        .join('\n');
      const lead = m.startsWith('\n') ? '\n' : '';
      return `${lead}<blockquote>${inner}</blockquote>\n`;
    },
  );

  // 7) Markdown links [label](url) — only http(s) and tg:// URLs.
  // The URL is already HTML-escaped (escapeHtml ran on the whole input),
  // but escapeHtml doesn't touch `"`. Escape it here so a quote inside
  // the URL can never break out of the href attribute.
  s = s.replace(
    /\[([^\]\n]+?)\]\(((?:https?:\/\/|tg:\/\/)[^\s)]+)\)/g,
    (_m, label: string, url: string) =>
      `<a href="${url.replace(/"/g, '&quot;')}">${label}</a>`,
  );

  return s;
}

type HtmlTagSpec = { open: string; close: string; length: number; priority: number };

export const HTML_ENTITY_TYPES = new Set<MessageEntity['type']>([
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'spoiler',
  'blockquote',
  'expandable_blockquote',
  'code',
  'pre',
  'text_link',
  'text_mention',
  'url',
  'custom_emoji',
]);

export const FORMAT_ENTITY_TYPES = new Set<MessageEntity['type']>([
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'spoiler',
  'blockquote',
  'expandable_blockquote',
  'code',
  'pre',
  'text_link',
  'text_mention',
  'url',
  'custom_emoji',
]);

function entityToHtmlTag(entity: MessageEntity, source: string): HtmlTagSpec | null {
  switch (entity.type) {
    case 'bold':
      return { open: '<b>', close: '</b>', length: entity.length, priority: 20 };
    case 'italic':
      return { open: '<i>', close: '</i>', length: entity.length, priority: 20 };
    case 'underline':
      return { open: '<u>', close: '</u>', length: entity.length, priority: 20 };
    case 'strikethrough':
      return { open: '<s>', close: '</s>', length: entity.length, priority: 20 };
    case 'spoiler':
      return { open: '<tg-spoiler>', close: '</tg-spoiler>', length: entity.length, priority: 20 };
    case 'blockquote':
      return { open: '<blockquote>', close: '</blockquote>', length: entity.length, priority: 0 };
    case 'expandable_blockquote':
      return { open: '<blockquote expandable>', close: '</blockquote>', length: entity.length, priority: 0 };
    case 'code':
      return { open: '<code>', close: '</code>', length: entity.length, priority: 30 };
    case 'pre':
      return { open: '<pre>', close: '</pre>', length: entity.length, priority: 10 };
    case 'text_link':
      return {
        open: `<a href="${escapeHtmlAttr(entity.url ?? '')}">`,
        close: '</a>',
        length: entity.length,
        priority: 15,
      };
    case 'text_mention':
      return {
        open: `<a href="tg://user?id=${escapeHtmlAttr(String(entity.user?.id ?? ''))}">`,
        close: '</a>',
        length: entity.length,
        priority: 15,
      };
    case 'url': {
      const url = source.slice(entity.offset, entity.offset + entity.length);
      return {
        open: `<a href="${escapeHtmlAttr(url)}">`,
        close: '</a>',
        length: entity.length,
        priority: 15,
      };
    }
    case 'custom_emoji':
      return {
        open: `<tg-emoji emoji-id="${escapeHtmlAttr(entity.custom_emoji_id ?? '')}">`,
        close: '</tg-emoji>',
        length: entity.length,
        priority: 40,
      };
    default:
      return null;
  }
}

export function entitiesToHtml(
  text: string,
  entities: ReadonlyArray<MessageEntity> | undefined | null,
): string {
  if (!entities || entities.length === 0) return escapeHtml(text);
  const ranges: Array<{
    key: string;
    start: number;
    end: number;
    tag: HtmlTagSpec;
  }> = [];
  const boundaries = new Set<number>([0, text.length]);
  for (const [index, entity] of entities.entries()) {
    const tag = entityToHtmlTag(entity, text);
    if (!tag) continue;
    // Clamp offsets to guard against malformed entity ranges.
    const start = Math.max(0, Math.min(entity.offset, text.length));
    const end = Math.max(start, Math.min(entity.offset + entity.length, text.length));
    if (start === end) continue;
    ranges.push({
      key: `${entity.type}:${start}:${end}:${index}`,
      start,
      end,
      tag,
    });
    boundaries.add(start);
    boundaries.add(end);
  }
  if (ranges.length === 0) return escapeHtml(text);
  const points = [...boundaries].sort((a, b) => a - b);
  let active: typeof ranges = [];
  let out = '';
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]!;
    const end = points[i + 1]!;
    const next = ranges
      .filter((range) => range.start <= start && range.end >= end)
      .sort(
        (a, b) =>
          a.tag.priority - b.tag.priority ||
          b.tag.length - a.tag.length ||
          a.start - b.start ||
          a.key.localeCompare(b.key),
      );
    let common = 0;
    while (
      common < active.length &&
      common < next.length &&
      active[common]!.key === next[common]!.key
    ) {
      common++;
    }
    for (let j = active.length - 1; j >= common; j--) {
      out += active[j]!.tag.close;
    }
    for (let j = common; j < next.length; j++) {
      out += next[j]!.tag.open;
    }
    out += escapeHtml(text.slice(start, end));
    active = next;
  }
  for (let i = active.length - 1; i >= 0; i--) {
    out += active[i]!.tag.close;
  }
  return out;
}

/**
 * Render a template containing `{key}` tokens to HTML, with
 * `<tg-emoji>` tags for premium-mapped emojis. Plain text only — use
 * `renderMdHtml` if your template uses Markdown.
 *
 * Pipeline:
 *   1) HTML-escape the input.
 *   2) Auto-scan and wrap unicode emojis with `<tg-emoji>` tags.
 *   3) Replace `{key}` tokens (these expand into `<tg-emoji>` tags
 *      themselves when premium-mapped, but are inserted AFTER the
 *      scan so we never double-wrap.)
 */
export function renderPremiumHtml(
  template: string,
  map: Record<string, string> = {},
): string {
  const escaped = escapeHtml(template);
  const scanned = autoScanPremiumEmojis(escaped);
  return replaceTokensHtml(scanned, map);
}

/**
 * Convert a Markdown-flavored template to HTML, auto-scan unicode
 * emojis for premium mappings, and replace `{key}` tokens with
 * `<tg-emoji>` tags. Use with `parse_mode: 'HTML'`.
 *
 * The auto-scan runs BEFORE token replacement so that the unicode
 * glyphs inserted by token replacement (already wrapped in their own
 * `<tg-emoji>` tags) aren't re-scanned and re-wrapped.
 *
 * Admin-authored bodies (announcements, product / bot / payment
 * tutorials) can also embed *arbitrary* premium custom emojis via
 * the `{{ce:<id>|<unicode>}}` marker syntax. The markers are written
 * by `injectCustomEmojiMarkers` at capture time and expanded here
 * into `<tg-emoji>` tags AFTER markdown / auto-scan / token passes,
 * so the embedded unicode can never be double-wrapped or mangled.
 */
export function renderMdHtml(template: string, map: Record<string, string> = {}): string {
  // Pull custom-emoji markers out of the template before any other
  // pass touches the body. We use private-use-area sentinels so the
  // markdown regexes / HTML escape / autoScan emoji regex / token
  // regex all leave them untouched.
  const placeholders: Array<{ id: string; glyph: string }> = [];
  const stripped = template.replace(
    CE_MARKER_RX,
    (_m: string, id: string, glyph: string) => {
      const idx = placeholders.length;
      placeholders.push({ id, glyph });
      return `\u{E000}TGCE${idx}\u{E001}`;
    },
  );
  const html = mdToHtml(stripped);
  const scanned = autoScanPremiumEmojis(html);
  let out = replaceTokensHtml(scanned, map);
  for (let i = 0; i < placeholders.length; i++) {
    const p = placeholders[i]!;
    out = out.replace(
      `\u{E000}TGCE${i}\u{E001}`,
      `<tg-emoji emoji-id="${escapeHtmlAttr(p.id)}">${escapeHtml(p.glyph)}</tg-emoji>`,
    );
  }
  return out;
}

// `{{ce:<custom_emoji_id>|<unicode glyph>}}` — embedded by
// `injectCustomEmojiMarkers` at admin capture time. The unicode glyph
// part allows ASCII brackets / colons but is bounded by `}` and `|`
// so the regex stays anchored.
const CE_MARKER_RX = /\{\{ce:([^|}\n]+)\|([^}\n]+)\}\}/g;

/**
 * Render a pre-escaped HTML template that may already contain tags
 * (from Telegram entities), while still applying `{key}` tokens,
 * premium emoji auto-scan, and custom-emoji markers.
 */
export function renderHtmlTemplate(template: string, map: Record<string, string> = {}): string {
  const placeholders: Array<{ id: string; glyph: string }> = [];
  const stripped = template.replace(
    CE_MARKER_RX,
    (_m: string, id: string, glyph: string) => {
      const idx = placeholders.length;
      placeholders.push({ id, glyph });
      return `\u{E000}TGCE${idx}\u{E001}`;
    },
  );
  const scanned = autoScanPremiumEmojis(stripped);
  let out = replaceTokensHtml(scanned, map);
  for (let i = 0; i < placeholders.length; i++) {
    const p = placeholders[i]!;
    out = out.replace(
      `\u{E000}TGCE${i}\u{E001}`,
      `<tg-emoji emoji-id="${escapeHtmlAttr(p.id)}">${escapeHtml(p.glyph)}</tg-emoji>`,
    );
  }
  return out;
}

/**
 * Convert admin-authored text + Telegram MessageEntity[] into a
 * marker-enriched body that survives DB storage and the existing
 * `renderMdHtml` pipeline. Each `custom_emoji` entity in `entities`
 * is rewritten in-place as a `{{ce:<id>|<unicode>}}` marker; the
 * surrounding text is left untouched (so admin's existing markdown
 * shortcuts — `*bold*`, `` `code` ``, etc. — still render).
 *
 * Telegram MessageEntity offsets are UTF-16 code units, which match
 * JavaScript string indexing — `text.slice(e.offset, e.offset + e.length)`
 * captures the original glyph for both single-codepoint emojis and
 * multi-codepoint sequences (regional-indicator flags, ZWJ joins).
 *
 * Non-`custom_emoji` entities (bold / italic / links / spoilers /
 * etc.) are intentionally ignored — admins are expected to use the
 * existing single-asterisk Markdown shortcuts for formatting, and
 * mixing native Telegram entities with markdown rendering would
 * produce a tangled HTML output.
 */
export function injectCustomEmojiMarkers(
  text: string,
  entities: ReadonlyArray<MessageEntity> | undefined | null,
): string {
  if (!entities || entities.length === 0) return text;
  // Filter and sort back-to-front so the index math stays valid as we
  // splice markers in.
  type CE = MessageEntity & { type: 'custom_emoji'; custom_emoji_id: string };
  const ce = entities
    .filter(
      (e): e is CE =>
        e.type === 'custom_emoji' &&
        typeof (e as { custom_emoji_id?: unknown }).custom_emoji_id === 'string',
    )
    .slice()
    .sort((a, b) => b.offset - a.offset);
  if (ce.length === 0) return text;
  let out = text;
  for (const e of ce) {
    const glyph = out.slice(e.offset, e.offset + e.length);
    // Strip any chars that would break the marker delimiters. In
    // practice unicode emojis never contain `}` or `|`, but this is
    // a cheap defence against malformed input.
    const safeGlyph = glyph.replace(/[|}\n]/g, '');
    const safeId = e.custom_emoji_id.replace(/[|}\n]/g, '');
    if (!safeGlyph || !safeId) continue;
    out =
      out.slice(0, e.offset) +
      `{{ce:${safeId}|${safeGlyph}}}` +
      out.slice(e.offset + e.length);
  }
  return out;
}

// ---------------------------------------------------------------------
// Resilience helpers — used by handlers that send admin-authored bodies
// (Using Method tutorial, Bot Tutorial, View Note, etc.) so a malformed
// markdown / over-long template never deadlocks the user with a generic
// "Failed to load" alert.
// ---------------------------------------------------------------------

/**
 * Telegram caps text messages at 4096 UTF-16 code units. We leave a
 * small headroom for the auto-appended truncation marker.
 */
const TELEGRAM_TEXT_LIMIT = 4096;
const TRUNCATION_MARKER = '\n\n…';

/**
 * Trim a rendered HTML body down to Telegram's 4096-char message
 * limit. We don't try to be smart about closing tags because the
 * caller already knows we'll fall back to plain text if the HTML send
 * fails; truncated tags will just trip the parser and trigger the
 * fallback.
 */
export function clampForTelegram(html: string): string {
  if (html.length <= TELEGRAM_TEXT_LIMIT) return html;
  return html.slice(0, TELEGRAM_TEXT_LIMIT - TRUNCATION_MARKER.length) + TRUNCATION_MARKER;
}

/**
 * Strip HTML tags and decode the handful of entities our renderer
 * emits, producing a plain-text approximation suitable for sending
 * with no `parse_mode`. Used as a last-ditch fallback so the user
 * still sees the tutorial body when Telegram rejects the HTML.
 */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<tg-emoji[^>]*>([^<]*)<\/tg-emoji>/g, '$1')
    .replace(/<\/?(?:b|strong|i|em|u|s|del|code|pre|blockquote|tg-spoiler)[^>]*>/g, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g, '$2 ($1)')
    .replace(/<br\s*\/?\s*>/g, '\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Keep Telegram formatting but degrade premium emoji tags to their
 * unicode fallback. This is useful when Telegram rejects one custom
 * emoji id: retrying with plain text would also lose bold/quote/link
 * formatting, while this preserves the rest of the admin-authored body.
 */
export function stripCustomEmojiTags(html: string): string {
  return html.replace(/<tg-emoji\b[^>]*>([\s\S]*?)<\/tg-emoji>/g, '$1');
}

/**
 * Conservative URL sanitiser for inline `url:` keyboard buttons.
 *
 * Returns the trimmed URL when it parses as a valid `http(s)://` or
 * `tg://` URL, otherwise `null` so the caller can render the body
 * without the broken button instead of crashing the whole handler.
 */
export function sanitizeButtonUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Reject anything with embedded whitespace — Telegram rejects those
  // server-side with `BUTTON_URL_INVALID`.
  if (/\s/.test(trimmed)) return null;
  if (!/^(https?:\/\/|tg:\/\/)/i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (!parsed.protocol) return null;
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * HTML-attribute-safe escaping for short admin-facing diagnostic
 * strings (stage names, error messages). Keeps the diagnostic readable
 * if injected into either text bodies or `<code>` attribute slots.
 */
export function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
