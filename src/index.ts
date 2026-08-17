import http from 'node:http';
import { buildBot } from './bot.js';
import { env } from './env.js';
import { logger } from './logger.js';
import { logMailerStatus } from './services/mailer.js';
import {
  handleHealthRequest,
  handleResellerApiRequest,
  setRuntimeReady,
} from './services/resellerApiHttp.js';
import { handleCryptoPayWebhook } from './services/cryptoPayWebhookHttp.js';
import {
  startSupplierStockSyncLoop,
  stopSupplierStockSyncLoop,
} from './services/supplierAutoSync.js';
import {
  startCryptoPayReconciliationLoop,
  stopCryptoPayReconciliationLoop,
} from './services/cryptoPayReconcile.js';

let activeServer: http.Server | null = null;
let activeBot: Awaited<ReturnType<typeof buildBot>> | null = null;
let shuttingDown = false;

async function main() {
  const bot = await buildBot();
  activeBot = bot;
  logMailerStatus();
  startSupplierStockSyncLoop(bot.api);
  startCryptoPayReconciliationLoop(bot.api);

  const startHttpServer = (telegramHandler?: http.RequestListener) => {
    const server = http.createServer((req, res) => {
      void (async () => {
        if (handleHealthRequest(req, res)) return;
        if (await handleResellerApiRequest(req, res, bot.api)) return;
        if (await handleCryptoPayWebhook(req, res, bot.api)) return;
        if (telegramHandler) {
          telegramHandler(req, res);
          return;
        }
        res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'not_found' }));
      })().catch((err) => {
        logger.error({ err }, 'HTTP request handler failed');
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        }
        res.end(JSON.stringify({ ok: false, error: 'internal_error' }));
      });
    });
    activeServer = server;
    server.requestTimeout = 30_000;
    server.headersTimeout = 10_000;
    server.keepAliveTimeout = 5_000;
    server.listen(env.PORT, '0.0.0.0', () => {
      setRuntimeReady(true);
      logger.info({ port: env.PORT, mode: env.BOT_MODE }, 'HTTP server started');
    });
  };

  if (env.BOT_MODE === 'webhook') {
    if (!env.WEBHOOK_URL) {
      logger.fatal('BOT_MODE=webhook but WEBHOOK_URL is empty');
      process.exit(1);
    }
    const { webhookCallback } = await import('grammy');

    await bot.api.setWebhook(env.WEBHOOK_URL, {
      secret_token: env.WEBHOOK_SECRET || undefined,
    });

    const handler = webhookCallback(bot, 'http', {
      secretToken: env.WEBHOOK_SECRET || undefined,
    });
    startHttpServer(handler);
  } else {
    startHttpServer();
    await bot.api.deleteWebhook({ drop_pending_updates: true });

    logger.info('Starting bot with long-polling…');
    await bot.start({
      onStart: (info) => logger.info({ username: info.username }, 'Bot is online'),
    });
  }
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown started');

  stopSupplierStockSyncLoop();
  stopCryptoPayReconciliationLoop();

  try {
    activeBot?.stop();
  } catch (err) {
    logger.warn({ err }, 'Bot stop failed during shutdown');
  }

  if (activeServer) {
    setRuntimeReady(false);
    await new Promise<void>((resolve) => {
      const server = activeServer;
      activeServer = null;
      if (!server) {
        resolve();
        return;
      }
      server.close(() => resolve());
      setTimeout(() => resolve(), 5_000).unref();
    });
  }

  logger.info('Graceful shutdown complete');
}

process.once('SIGINT', () => {
  void shutdown('SIGINT').finally(() => process.exit(0));
});
process.once('SIGTERM', () => {
  void shutdown('SIGTERM').finally(() => process.exit(0));
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  void shutdown('unhandledRejection').finally(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  void shutdown('uncaughtException').finally(() => process.exit(1));
});

main().catch((err) => {
  logger.fatal({ err }, 'Fatal error during startup');
  void shutdown('startup_failure').finally(() => process.exit(1));
});
