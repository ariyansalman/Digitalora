/**
 * Shared helpers for rendering the delivered-items block on the My
 * Orders detail screen, the post-purchase Order Delivered card, and
 * the post-/start invoice deep-link.
 *
 * The delivered items are stored on `orders.delivered_items` as one
 * payload per line (URL, code, account creds, etc.) once the buyer
 * goes through Wallet Pay or direct-pay. We render them as Telegram
 * blockquote pills:
 *
 *   *Received:*
 *
 *   > #1
 *   > [Open Link #1](https://…)
 *
 *   > #2
 *   > [Open Link #2](https://…)
 *
 * For bulk orders (e.g. 37+ links) the full block can blow past
 * Telegram's 4096-char message limit, which used to cause the
 * delivery `reply` / order-detail `editMessageText` to throw — the
 * user paid, stock decremented, items were claimed, but no message
 * landed. The new helpers cap the inline preview at a safe budget
 * and surface an `attach` payload the caller is expected to send
 * as a Telegram document so the buyer always gets the full list.
 */

const URL_RE = /^https?:\/\/\S+$/i;

/**
 * Telegram caps text bodies at 4096 UTF-16 code units. The order
 * templates wrap the items block with a fixed header/footer that
 * inflates after premium-emoji expansion + HTML escaping. We leave
 * a generous chunk of headroom so the resulting `reply` /
 * `editMessageText` never overflows even for orders with many long
 * URLs.
 */
const ITEMS_INLINE_BUDGET = 2800;

/**
 * Above this many items we always send a `.txt` attachment in
 * addition to whatever preview fits inline. Keeps the chat readable
 * for truly bulk orders (100+ links) without making the buyer scroll
 * a wall of blockquote pills.
 */
const ITEMS_BULK_THRESHOLD = 12;

/**
 * How many items we try to keep in the inline preview before
 * deferring everything to the attachment. Picked so the card stays
 * scannable on a phone — anything more starts to look like a wall.
 */
const ITEMS_PREVIEW_TARGET = 10;

export type DeliveredItemsAttach = {
  filename: string;
  contents: string;
};

export type DeliveredItemsBlock = {
  /** Markdown blockquote ready to splice into a card template. */
  inlineBlock: string;
  /**
   * When non-null, the caller MUST also send a Telegram document
   * with these contents — the inline block has been truncated and
   * points at the file for the rest.
   */
  attach: DeliveredItemsAttach | null;
};

function splitDeliveredItems(deliveredItems: string): string[] {
  return deliveredItems
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function moreItemsPill(remaining: number): string {
  return `> 📎 +${remaining} more items — see attached file`;
}

function bulkOnlyPill(total: number): string {
  return `> 📎 ${total} items — see attached file`;
}

function quotePayload(payload: string): string {
  return payload
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');
}

/**
 * Try to render `items` inline using `renderBlock`. When the full
 * render exceeds the inline budget OR the item count crosses the
 * bulk threshold, return a truncated preview that ends with a "see
 * attached file" pill plus the full payload as an attachment.
 */
function pickPreview(
  items: string[],
  renderBlock: (xs: string[]) => string,
  /** separator inserted between the preview and the trailing "more" pill. */
  trailingSeparator: string,
  attachText: string,
  filename: string,
): DeliveredItemsBlock {
  const fullBlock = renderBlock(items);
  if (
    items.length <= ITEMS_BULK_THRESHOLD &&
    fullBlock.length <= ITEMS_INLINE_BUDGET
  ) {
    return { inlineBlock: fullBlock, attach: null };
  }
  for (let n = Math.min(ITEMS_PREVIEW_TARGET, items.length); n >= 1; n--) {
    const preview = renderBlock(items.slice(0, n));
    const remaining = items.length - n;
    const candidate =
      remaining > 0 ? `${preview}${trailingSeparator}${moreItemsPill(remaining)}` : preview;
    if (candidate.length <= ITEMS_INLINE_BUDGET) {
      return {
        inlineBlock: candidate,
        attach: { filename, contents: attachText },
      };
    }
  }
  // Pathological: even a single item won't fit inline. Drop the
  // preview entirely and let the attachment carry the payload.
  return {
    inlineBlock: bulkOnlyPill(items.length),
    attach: { filename, contents: attachText },
  };
}

/**
 * Build the items block for the post-purchase Order Delivered card
 * (`shop.buy.order_delivered` template, `{items}` slot).
 *
 * Each item renders as `> {payload}` and entries are separated by
 * `\n>\n` so `renderMdHtml` collapses them into one Telegram
 * blockquote with internal blank rows between entries — matching
 * the View Note "luli" / "Hey" pill style the bot owner pinned.
 */
export function buildOrderDeliveredItemsBlock(
  items: string[],
  opts: { filename?: string } = {},
): DeliveredItemsBlock {
  if (items.length === 0) return { inlineBlock: '', attach: null };
  const filename = opts.filename ?? 'delivered-items.txt';
  const attachText = items.join('\n') + '\n';
  const renderBlock = (xs: string[]) =>
    xs.map((it) => quotePayload(it)).join('\n>\n');
  return pickPreview(items, renderBlock, '\n>\n', attachText, filename);
}

/**
 * The bot owner's preferred bulk-delivery layout: instead of one
 * giant card with a `.txt` attachment, split the claimed items into
 * messages of `chunkSize` each. The first chunk goes inside the
 * Order Delivered header card; subsequent chunks are sent as plain
 * blockquote messages right below it. Only the last chunk's message
 * gets the inline keyboard, so the buyer scrolls down to the bottom
 * and finds Using Method there.
 */
export const ORDER_DELIVERED_CHUNK_SIZE = 10;

export type DeliveredChunk = {
  /** Markdown blockquote ready for `renderMdHtml`. */
  inlineBlock: string;
  /** True for chunk index 0 — caller wraps this in the header card. */
  isFirst: boolean;
  /**
   * True for the last chunk — caller attaches the inline keyboard
   * (Using Method, etc.) to this message only.
   */
  isLast: boolean;
};

/**
 * Split `items` into successive chunks of `chunkSize` and pre-render
 * each chunk's blockquote pill. Order Delivered cards splice
 * `chunks[0].inlineBlock` into the `{items}` slot, then send the
 * remaining chunks as plain follow-up messages.
 */
export function buildOrderDeliveredChunks(
  items: string[],
  chunkSize: number = ORDER_DELIVERED_CHUNK_SIZE,
): DeliveredChunk[] {
  if (items.length === 0) return [];
  const size = Math.max(1, Math.floor(chunkSize));
  const chunks: DeliveredChunk[] = [];
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size);
    chunks.push({
      inlineBlock: slice.map((it) => quotePayload(it)).join('\n>\n'),
      isFirst: i === 0,
      isLast: i + size >= items.length,
    });
  }
  return chunks;
}

/**
 * Build the items block for the My Orders detail screen
 * (`orders.detail.received` template, `{received}` slot).
 *
 * Each item is rendered as a numbered blockquote pill — URLs become
 * `[Open Link #N](url)` so they're tappable. Pills are separated
 * with a blank line so each one renders as its own `<blockquote>`
 * (matching the existing `formatReceivedItemsBlock` look).
 */
export function buildOrderDetailReceivedBlock(
  deliveredItems: string | null | undefined,
  opts: { filename?: string } = {},
): DeliveredItemsBlock {
  if (!deliveredItems) return { inlineBlock: '', attach: null };
  const items = splitDeliveredItems(deliveredItems);
  if (items.length === 0) return { inlineBlock: '', attach: null };
  const filename = opts.filename ?? 'delivered-items.txt';
  const attachText = items.join('\n') + '\n';
  const renderBlock = (xs: string[]) =>
    xs
      .map((item, i) => {
        const n = i + 1;
        const inner = URL_RE.test(item) ? `[Open Link #${n}](${item})` : item;
        return `> #${n}\n${quotePayload(inner)}`;
      })
      .join('\n\n');
  return pickPreview(items, renderBlock, '\n\n', attachText, filename);
}

/**
 * Backwards-compat wrapper for callers that just need the inline
 * Markdown block (no attachment handling). Returns an empty string
 * when there are no delivered items so the caller can skip the
 * section entirely.
 *
 * New call sites should prefer `buildOrderDetailReceivedBlock` so
 * they can also forward the optional `.txt` attachment.
 */
export function formatReceivedItemsBlock(
  deliveredItems: string | null | undefined,
): string {
  return buildOrderDetailReceivedBlock(deliveredItems).inlineBlock;
}
