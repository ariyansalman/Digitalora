/**
 * Loads the user from Supabase (creating them on first contact) and
 * attaches `ctx.user` + `ctx.lang` + `ctx.t()` for handlers.
 */
import type { MiddlewareFn } from 'grammy';
import { normalizeCurrency } from '../../config/currencies.js';
import type { Lang } from '../../config/index.js';
import { getOrCreateUser } from '../db/queries.js';
import { env } from '../env.js';
import { t as translate } from '../i18n/index.js';
import { renderMdHtml } from '../services/premium.js';
import type { DBUser } from '../types.js';
import type { SessionCtx } from './session.js';
import { maybeSendEmailNag } from '../services/emailNag.js';
import * as publicFeed from '../services/publicFeed.js';
import { getForceJoinEnabled } from '../services/settings.js';

export type AppCtx = SessionCtx & {
  user: DBUser;
  lang: Lang;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

/**
 * Look at the most recent /start payload (if any) for a referral code
 * like `?start=R12AB`. Stored on the user via getOrCreateUser.
 */
function extractReferral(text: string | undefined): number | null {
  if (!text) return null;
  const m = text.match(/^\/start(?:@\S+)?\s+R([A-Z0-9]+)/i);
  if (!m) return null;
  const id = parseInt(m[1]!, 36);
  return Number.isFinite(id) ? id : null;
}

export const userMiddleware: MiddlewareFn<AppCtx> = async (ctx, next) => {
  if (!ctx.from) return next();
  const referred_by = extractReferral(ctx.message?.text ?? undefined);

  const user = await getOrCreateUser({
    telegram_id: ctx.from.id,
    username: ctx.from.username ?? null,
    first_name: ctx.from.first_name ?? null,
    last_name: ctx.from.last_name ?? null,
    language: env.DEFAULT_LANG,
    referred_by,
  });

  ctx.user = user;
  ctx.user.currency = normalizeCurrency((user as DBUser & { currency?: string | null }).currency);
  ctx.lang = user.language;
  ctx.t = (key, vars) => translate(ctx.lang, key, vars);

  // Fire-and-forget the 12h email nag.
  void maybeSendEmailNag(ctx);

  // If this is a newly created user with a referrer, notify the referrer
  // directly and mirror it to the admin channel when configured.
  if (
    (user as DBUser & { __just_created?: boolean }).__just_created &&
    user.referred_by &&
    !getForceJoinEnabled()
  ) {
    void activateReferralForUser(ctx);
  }

  return next();
};

function cleanDisplayName(value: string): string {
  return value.replace(/[*_`~]/g, '').trim() || 'New user';
}

/**
 * Send referral notifications. The user DM must not depend on optional
 * admin-channel settings or newer referral-balance tables.
 */
export async function activateReferralForUser(ctx: AppCtx): Promise<void> {
  if (!ctx.user?.referred_by || !ctx.from) return;
  const { activateReferralRecord } = await import('../db/queries.js');
  const activated = await activateReferralRecord(ctx.user.referred_by, ctx.user.telegram_id);
  if (!activated) return;
  await sendReferralNotification(
    ctx,
    ctx.user.referred_by,
    ctx.user.telegram_id,
    ctx.from.username ?? null,
    ctx.from.first_name ?? null,
  );
}

async function sendReferralNotification(
  ctx: AppCtx,
  referrerId: number,
  refereeId: number,
  refereeUsername: string | null,
  refereeFirstName: string | null,
) {
  const { getUserByTelegramId, getReferralBalance } = await import('../db/queries.js');

  const referrer = await getUserByTelegramId(referrerId);
  if (!referrer) return;

  const referrerUsername = cleanDisplayName(
    referrer.username ? `@${referrer.username}` : referrer.first_name ?? `User ${referrer.telegram_id}`,
  );
  const refereeDisplay = cleanDisplayName(
    refereeUsername ? `@${refereeUsername}` : refereeFirstName ?? `User ${refereeId}`,
  );

  let refBalance = { total: 0, spent: 0, available: 0 };
  try {
    refBalance = await getReferralBalance(referrerId);
  } catch {
    refBalance = { total: 0, spent: 0, available: 0 };
  }
  // Existing notification templates call this "totalRefs", but the
  // number shown to users must be the spendable Referral Pay balance:
  // lifetime referrals minus purchase/conversion spends.
  const totalRefs = refBalance.total;
  const cleanUserMsg = [
    '*You Got a Refer +1!*',
    '',
    `*New Active Refer:* ${refereeDisplay}`,
    `*Active Refers:* ${totalRefs} refs`,
    '',
    'Keep sharing your link.',
  ].join('\n');

  await ctx.api
    .sendMessage(referrerId, renderMdHtml(cleanUserMsg), { parse_mode: 'HTML' })
    .catch(() => {});

  void publicFeed.notifyActiveReferral(ctx.api, {
    referrerName: referrerUsername,
    totalReferrals: refBalance.total,
    activeReferrals: totalRefs,
    totalEarned: 0,
  });
  if (false && totalRefs > 0 && totalRefs % 10 === 0) {
    void publicFeed.notifyReferralAchievement(ctx.api, {
      userId: referrerId,
      amount: 0.5,
    });
  }
}
