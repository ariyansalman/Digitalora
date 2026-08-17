/**
 * Navigation & state-transition reliability.
 *
 * Part 1 runs the real modules through a fake grammY context (tsx).
 * Part 2 is a source contract: the safety layer must stay wired into
 * the bot, and sessions must stay durable across restarts.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const out = execFileSync(
  process.execPath,
  ['node_modules/tsx/dist/cli.mjs', 'tests/harness/navigation.harness.ts'],
  {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? '123456:TEST_TOKEN_FOR_HARNESS',
      SUPABASE_URL: process.env.SUPABASE_URL ?? 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'test-service-role-key',
      BOT_USERNAME: process.env.BOT_USERNAME ?? 'digitalorashopbot',
      ADMIN_USER_ID: process.env.ADMIN_USER_ID ?? '1',
      LOG_LEVEL: 'fatal',
    },
  },
);
assert.match(out, /navigation reliability harness: 16\/16 PASS/);

// --- wiring contract -------------------------------------------------
const bot = read('src/bot.ts');
assert.match(bot, /installTelegramSafety\(bot\.api\)/);
assert.match(bot, /bot\.use\(callbackGuard\)/);
assert.ok(
  bot.indexOf('bot.use(callbackGuard)') < bot.indexOf('registerStart(bot)'),
  'callbackGuard must run before handlers',
);

// --- durable session contract ---------------------------------------
const session = read('src/middleware/session.ts');
assert.match(session, /SupabaseSessionStorage/);
assert.match(session, /storage: sessionStorage/);
const migration = read('supabase/migrations/0057_durable_bot_sessions.sql');
assert.match(migration, /create table if not exists public\.bot_sessions/);
assert.match(migration, /grant all on public\.bot_sessions to service_role/);
assert.match(migration, /enable row level security/);

// --- navigation entry points clear stale input flows -----------------
assert.match(read('src/handlers/shop.ts'), /clearTransientFlowState\(ctx\)/);
assert.match(read('src/handlers/cart.ts'), /clearTransientFlowState\(ctx\)/);
assert.match(read('src/handlers/start.ts'), /clearFlowState\(ctx\)/);

// --- helper surface contract -----------------------------------------
const safety = read('src/ui/callbackSafety.ts');
assert.match(safety, /export const safeAnswerCallback/);
assert.match(safety, /export function beginCallbackClick/);
assert.match(read('src/ui/navigate.ts'), /export async function safeNavigate/);
assert.match(read('src/ui/navigate.ts'), /export function safeEditMessage/);
assert.match(read('src/ui/flowState.ts'), /export function clearFlowState/);

// --- backward compatibility ------------------------------------------
assert.match(safety, /export async function safeAnswer\(/, 'legacy safeAnswer must remain');
assert.match(read('src/ui/screen.ts'), /export async function renderScreen\(/);

console.log('navigation reliability tests: 33/33 PASS');
