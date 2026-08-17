/**
 * User-facing renderer for the per-payment-method tutorial card.
 *
 * Bot-owner spec (2026-05-08): the tutorial replaces the existing
 * instructions message *in-place* via `editMessageText` — no new
 * message bubble below the address / Pay ID screen. The admin-
 * uploaded photo / video / document (if any) is still sent as a
 * follow-up message because Telegram doesn't allow turning a text
 * bubble into a media bubble. If the in-place edit fails (rare —
 * usually the message is too old to edit), we fall back to
 * `ctx.reply` so the buyer always gets something.
 *
 * Mirrors the bot-tutorial render in `profile.ts` and the product
 * "Using Method" render in `shop.ts`. Errors never throw — every
 * failure falls back to a polite "couldn't load this tutorial" stub
 * so the buyer isn't left staring at a perpetual spinner.
 *
 * The card is admin-editable from /admin → Payment Methods → "📘 #N
 * Tutorial" and stored in the `settings` table under
 * `pay_tutorial.<methodId>.{text,file_id,file_type,url}` (see
 * `services/settings.ts`).
 */
import { InlineKeyboard } from 'grammy';
import type { AppCtx } from '../middleware/user.js';
import { inlineBtn, inlineUrl } from '../keyboards/helpers.js';
import {
  clampForTelegram,
  escapeAttr,
  htmlToPlain,
  renderMdHtml,
  sanitizeButtonUrl,
} from './premium.js';
import { getPaymentMethodTutorial } from './settings.js';
import { logger } from '../logger.js';

/**
 * Send the per-method tutorial card as a NEW message (not an edit) so
 * the buyer's instruction screen — which still has the address /
 * Pay ID / locked LTC quote — stays visible above the tutorial. The
 * `backCallback` is wired into the tutorial card's "⬅️ Back" row so
 * tapping it re-opens whichever screen the user came from (top-up
 * picker, direct-pay picker, etc.) without mutating the underlying
 * deposit row.
 */
export async function renderPaymentMethodTutorial(
  ctx: AppCtx,
  methodId: number,
  methodName: string,
  backCallback: string,
): Promise<void> {
  // Always ack first so Telegram never shows a perpetual spinner
  // even if the body below throws.
  await ctx.answerCallbackQuery();
  let stage = 'load_settings';
  try {
    const tut = getPaymentMethodTutorial(methodId);
    stage = 'compose_body';
    const text = (tut.text ?? '').trim();
    const titleLine = ctx.t('pay.tutorial.title', { method: methodName });
    const body =
      text.length > 0
        ? `${titleLine}\n\n${ctx.t('pay.tutorial.body', { body: text })}`
        : `${titleLine}\n\n${ctx.t('pay.tutorial.empty')}`;
    stage = 'build_keyboard';
    const safeUrl = sanitizeButtonUrl(tut.url);
    const kb = new InlineKeyboard();
    if (safeUrl) {
      inlineUrl(kb, ctx.lang, 'tutorial_open_link', safeUrl);
      kb.row();
    }
    inlineBtn(kb, ctx.lang, 'back', backCallback);
    stage = 'render_html';
    const html = renderMdHtml(body);
    const safeHtml = clampForTelegram(html);
    logger.info(
      {
        methodId,
        hasText: text.length > 0,
        hasFile: Boolean(tut.file_id && tut.file_type),
        fileType: tut.file_type ?? null,
        hasUrl: Boolean(safeUrl),
        rejectedUrl: tut.url && !safeUrl ? tut.url : null,
        htmlLen: safeHtml.length,
      },
      'paytut: — rendering payment method tutorial',
    );
    // Bot-owner spec: convert the existing instructions card into the
    // tutorial card on the SAME message bubble — no new message below
    // the address / Pay ID screen. Cascading fallbacks:
    //   1) HTML edit-in-place
    //   2) plain-text edit-in-place (in case admin-authored body
    //      contains HTML that grammy rejects after our clamp)
    //   3) HTML reply (last-ditch — message too old to edit, etc.)
    stage = 'edit_html';
    let edited = false;
    try {
      await ctx.editMessageText(safeHtml, {
        parse_mode: 'HTML',
        reply_markup: kb,
        link_preview_options: { is_disabled: true },
      });
      edited = true;
    } catch (htmlErr) {
      logger.warn(
        { err: htmlErr, methodId },
        'paytut: HTML edit failed, retrying as plain-text edit',
      );
      try {
        stage = 'edit_plain';
        await ctx.editMessageText(htmlToPlain(safeHtml), {
          reply_markup: kb,
          link_preview_options: { is_disabled: true },
        });
        edited = true;
      } catch (plainErr) {
        logger.warn(
          { err: plainErr, methodId },
          'paytut: plain-text edit failed, falling back to fresh reply',
        );
      }
    }
    if (!edited) {
      stage = 'reply_html';
      try {
        await ctx.reply(safeHtml, {
          parse_mode: 'HTML',
          reply_markup: kb,
          link_preview_options: { is_disabled: true },
        });
      } catch (replyErr) {
        logger.warn(
          { err: replyErr, methodId },
          'paytut: HTML reply failed, retrying as plain-text reply',
        );
        stage = 'reply_plain';
        await ctx.reply(htmlToPlain(safeHtml), {
          reply_markup: kb,
          link_preview_options: { is_disabled: true },
        });
      }
    }
    if (tut.file_id && tut.file_type) {
      try {
        stage = 'send_file';
        if (tut.file_type === 'photo') {
          await ctx.replyWithPhoto(tut.file_id);
        } else if (tut.file_type === 'video') {
          await ctx.replyWithVideo(tut.file_id);
        } else {
          await ctx.replyWithDocument(tut.file_id);
        }
      } catch (err) {
        logger.warn({ err, methodId }, 'paytut: file send failed');
      }
    }
  } catch (err) {
    logger.error({ err, methodId, stage }, 'paytut: failed to render');
    const reason = (err as Error)?.message ?? String(err);
    try {
      await ctx.reply(
        `⚠️ <b>Couldn't load this tutorial.</b>\n\n` +
          `Stage: <code>${escapeAttr(stage)}</code>\n` +
          `Reason: <code>${escapeAttr(reason).slice(0, 200)}</code>\n\n` +
          `Admin: open <code>/admin</code> → <i>Payment Methods → 📘 #${methodId} Tutorial → Set Text / Set File / Set URL</i> and double-check the URL (must start with <code>https://</code> and contain no spaces or newlines).`,
        { parse_mode: 'HTML' },
      );
    } catch {
      // Last-ditch: nothing else to do.
    }
  }
}
