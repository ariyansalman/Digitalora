import { Bot } from 'grammy';
import { env } from './env.js';
import { logger } from './logger.js';
import { sessionMiddleware, type SessionCtx } from './middleware/session.js';
import { userMiddleware, type AppCtx } from './middleware/user.js';
import { banMiddleware } from './middleware/ban.js';
import { callbackGuard } from './middleware/callbackGuard.js';
import { installTelegramSafety } from './ui/telegramSafety.js';
import { forceJoinMiddleware } from './middleware/forceJoin.js';
import { registerStart } from './handlers/start.js';
import { registerShop } from './handlers/shop.js';
import { registerCart } from './handlers/cart.js';
import { registerCheckout } from './handlers/checkout.js';
import { registerProfile } from './handlers/profile.js';
import { registerSupport, restoreLiveSupportSession } from './handlers/support.js';
import { registerTopup } from './handlers/topup.js';
import { registerDirectPay } from './handlers/directPay.js';
import { registerResellerApi } from './handlers/resellerApi.js';
import { registerPublicGroup } from './handlers/publicGroup.js';
import { adminBot } from './handlers/admin/index.js';
import { refreshSettings } from './services/settings.js';
import { listAdminTelegramIds } from './db/queries.js';

export async function buildBot(): Promise<Bot<AppCtx>> {
  const bot = new Bot<AppCtx>(env.BOT_TOKEN);

  // Global Telegram-call safety net: the benign edit/answer failures
  // ("message is not modified", "query is too old") can no longer escape
  // into handlers from *any* call site, old or new.
  installTelegramSafety(bot.api);

  // Order matters: session → user (which depends on session) → ban
  // (which depends on the loaded user row) → handlers.
  // Runs before everything: acknowledges every tap promptly, drops
  // duplicate taps and decorative `noop:` payloads, and guarantees a
  // frozen button can never survive a handler error.
  bot.use(callbackGuard);
  bot.use(sessionMiddleware as unknown as (ctx: SessionCtx, next: () => Promise<void>) => Promise<void>);
  bot.use(userMiddleware);
  bot.use(banMiddleware);
  bot.use(forceJoinMiddleware);

  registerStart(bot);
  registerShop(bot);
  registerCart(bot);
  registerCheckout(bot);
  registerProfile(bot);
  registerSupport(bot);
  registerTopup(bot);
  registerDirectPay(bot);
  registerResellerApi(bot);
  registerPublicGroup(bot);
  bot.use(adminBot);

  bot.catch(async (err) => {
    // "message is not modified" fires whenever the user taps a button
    // that re-renders the exact same screen — purely cosmetic and harmless.
    const msg = (err.error as { description?: string } | undefined)?.description ?? '';
    if (msg.includes('message is not modified')) return;
    logger.error(
      {
        err: err.error,
        updateId: err.ctx.update.update_id,
        userId: err.ctx.from?.id,
      },
      'Unhandled bot error',
    );

    // Middleware failures (most commonly a transient database error) used
    // to make commands look completely ignored. Always acknowledge private
    // chats with a plain, dependency-free response so /start and /admin can
    // never fail silently again.
    try {
      if (err.ctx.callbackQuery) {
        await err.ctx.answerCallbackQuery({
          text: 'Temporary error. Please try again in a few seconds.',
          show_alert: true,
        });
      } else if (err.ctx.chat?.type === 'private') {
        await err.ctx.reply(
          '⚠️ The bot hit a temporary error. Please try /start again in a few seconds.',
        );
      }
    } catch (replyErr) {
      logger.error({ err: replyErr }, 'Failed to send bot error fallback');
    }
  });

  // Pre-load admin-editable settings into memory.
  await refreshSettings();

  // Rehydrate any in-flight Live Support session from the DB so a
  // Render redeploy mid-session doesn't break the user→admin relay.
  await restoreLiveSupportSession();

  // The slash menu exposes the six buyer shortcuts below. /admin and
  // /menu still work as typed commands but remain intentionally hidden.
  await bot.api.setMyCommands([
    { command: 'start', description: 'Open the main menu' },
    { command: 'products', description: 'Browse products' },
    { command: 'deposit', description: 'Add funds to your wallet' },
    { command: 'settings', description: 'Your profile & settings' },
    { command: 'support', description: 'Get help' },
    { command: 'api', description: 'Reseller API access' },
  ]);

  // Give every configured admin a chat-scoped list with /admin in slot 2.
  // The chat scope overrides the global buyer list for those chats.
  if (env.ADMIN_USER_ID) {
    const adminCommands = [
      { command: 'start', description: 'Open the main menu' },
      { command: 'admin', description: 'Admin panel' },
      { command: 'products', description: 'Browse products' },
      { command: 'deposit', description: 'Add funds to your wallet' },
      { command: 'settings', description: 'Your profile & settings' },
      { command: 'support', description: 'Get help' },
      { command: 'api', description: 'Reseller API access' },
    ];
    const adminIds = new Set<number>([
      env.ADMIN_USER_ID,
      ...(await listAdminTelegramIds()),
    ]);
    for (const adminId of adminIds) {
      try {
        await bot.api.setMyCommands(adminCommands, {
          scope: { type: 'chat', chat_id: adminId },
        });
      } catch (err) {
        logger.debug({ err, adminId }, 'Failed to set admin-scoped commands');
      }
    }

    // Live Support reachability probe: Telegram won't let the bot
    // initiate a DM to an account that has never tapped Start on it.
    // We test this with a `sendChatAction(typing)` — lightweight, no
    // visible artifact when it succeeds — so the operator can spot
    // the misconfiguration in Railway logs (`live-support: ADMIN
    // CHAT NOT REACHABLE …`) the moment the bot boots, instead of
    // waiting for a user to open Live Support and get a silent fail.
    try {
      await bot.api.sendChatAction(env.ADMIN_USER_ID, 'typing');
      logger.info(
        { adminUserId: env.ADMIN_USER_ID },
        'live-support: admin chat reachable',
      );
    } catch (err) {
      logger.error(
        { err, adminUserId: env.ADMIN_USER_ID },
        'live-support: ADMIN CHAT NOT REACHABLE — Live Support relay will fail until the admin account opens this bot and taps Start. Check that ADMIN_USER_ID is set correctly and that the admin has started the bot at least once.',
      );
    }
  }

  return bot;
}
