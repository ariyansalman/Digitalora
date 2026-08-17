/**
 * Functional harness for the navigation reliability layer. Executed by
 * `tests/navigation-reliability.test.mjs` through tsx, so the real
 * TypeScript modules (not copies) are exercised.
 */
import assert from 'node:assert/strict';
import {
  beginCallbackClick,
  callbackClickKey,
  resetCallbackClicks,
  safeAnswerCallback,
  clampPage,
  callbackInt,
} from '../../src/ui/callbackSafety.js';
import {
  clearFlowState,
  clearTransientFlowState,
  hasActiveFlow,
  activeFlowType,
  PROTECTED_FLOW_TYPES,
} from '../../src/ui/flowState.js';
import { safeNavigate, safeEditMessage } from '../../src/ui/navigate.js';
import { isBenignTelegramFailure } from '../../src/ui/telegramSafety.js';
import { callbackGuard } from '../../src/middleware/callbackGuard.js';

type Fake = {
  callbackQuery?: { data?: string };
  from?: { id: number };
  session: Record<string, unknown>;
  answers: unknown[];
  edits: string[];
  replies: string[];
  answerCallbackQuery: (other?: Record<string, unknown>) => Promise<unknown>;
  editMessageText: (text: string, other?: Record<string, unknown>) => Promise<unknown>;
  reply: (text: string, other?: Record<string, unknown>) => Promise<unknown>;
};

function fakeCtx(data: string | undefined, opts: { editFails?: string } = {}): Fake {
  const ctx: Fake = {
    ...(data === undefined ? {} : { callbackQuery: { data } }),
    from: { id: 42 },
    session: { qty: {}, qtyInput: { 7: '12' }, userFlow: { type: 'qty_keypad' } },
    answers: [],
    edits: [],
    replies: [],
    answerCallbackQuery: async (other) => {
      ctx.answers.push(other ?? {});
      return true;
    },
    editMessageText: async (text) => {
      if (opts.editFails) throw { description: opts.editFails };
      ctx.edits.push(text);
      return true;
    },
    reply: async (text) => {
      ctx.replies.push(text);
      return true;
    },
  };
  return ctx;
}

/* 1. Callbacks are always acknowledged, even when the query expired. */
{
  const ctx = fakeCtx('shop:home');
  assert.equal(await safeAnswerCallback(ctx), true);
  const expired = fakeCtx('shop:home');
  expired.answerCallbackQuery = async () => {
    throw { description: 'Bad Request: query is too old and response timeout expired' };
  };
  assert.equal(await safeAnswerCallback(expired), false, 'expired query must not throw');
}

/* 2. "message is not modified" is a successful no-op, not an error. */
{
  const ctx = fakeCtx('shop:home', { editFails: 'Bad Request: message is not modified' });
  assert.equal(await safeEditMessage(ctx, '<b>Store</b>'), 'unchanged');
  assert.equal(ctx.replies.length, 0, 're-tap must not spam a duplicate message');
  assert.ok(isBenignTelegramFailure('editMessageText', 'message is not modified'));
  assert.ok(isBenignTelegramFailure('answerCallbackQuery', 'query is too old'));
  assert.ok(!isBenignTelegramFailure('sendMessage', 'chat not found'));
}

/* 3. A deleted message falls back to a brand-new screen (no dead screen). */
{
  const ctx = fakeCtx('shop:home', { editFails: 'Bad Request: message to edit not found' });
  assert.equal(await safeNavigate(ctx, 'Store'), 'sent');
  assert.equal(ctx.replies.length, 1);
}

/* 4. safeNavigate acknowledges, clears stale flow, then renders. */
{
  const ctx = fakeCtx('cart:open');
  assert.equal(activeFlowType(ctx), 'qty_keypad');
  assert.equal(await safeNavigate(ctx, 'Cart'), 'edited');
  assert.equal(ctx.answers.length, 1, 'must acknowledge before rendering');
  assert.equal(hasActiveFlow(ctx), false, 'stale flow must be gone');
  assert.deepEqual(ctx.session['qtyInput'], {}, 'quantity buffer must be gone');
}

/* 5. In-flow re-render keeps the flow (quantity keypad). */
{
  const ctx = fakeCtx('qty:add:7:1');
  await safeNavigate(ctx, 'Quantity: 12', { clearFlow: false });
  assert.equal(activeFlowType(ctx), 'qty_keypad');
}

/* 6. clearFlowState is safe on an empty/absent session. */
{
  clearFlowState(undefined);
  const bare = { session: {} };
  clearFlowState(bare, { admin: true, topupOrigin: true });
  assert.equal(hasActiveFlow(bare), false);
}

/* 7. Duplicate clicks: an identical tap while the first is in flight is dropped. */
{
  resetCallbackClicks();
  const key = callbackClickKey(42, 'cart:checkout');
  const release = beginCallbackClick(key);
  assert.ok(release, 'first tap runs');
  assert.equal(beginCallbackClick(key), null, 'in-flight duplicate dropped');
  assert.ok(beginCallbackClick(callbackClickKey(42, 'cart:open')), 'other button unaffected');
  release!();
  assert.ok(beginCallbackClick(key), 'the same screen can be revisited once the handler is done');
  const stuck = callbackClickKey(42, 'cart:stuck');
  beginCallbackClick(stuck);
  assert.ok(beginCallbackClick(stuck, Date.now() + 60_000), 'a crashed handler cannot lock a button');
}

/* 8. callbackGuard: duplicate taps run the handler exactly once. */
{
  resetCallbackClicks();
  let runs = 0;
  const handler = async () => {
    runs += 1;
  };
  const a = fakeCtx('cart:checkout');
  const b = fakeCtx('cart:checkout');
  const slow = async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
    runs += 1;
  };
  void handler;
  await Promise.all([callbackGuard(a as never, slow), callbackGuard(b as never, slow)]);
  assert.equal(runs, 1, 'double-tapped checkout must fire once');
  assert.equal(b.answers.length, 1, 'dropped tap is still acknowledged (no frozen button)');
}

/* 9. callbackGuard: a throwing handler still acknowledges the tap. */
{
  resetCallbackClicks();
  const ctx = fakeCtx('shop:cat:3:0');
  await callbackGuard(ctx as never, async () => {
    throw new Error('supabase timeout');
  });
  assert.equal(ctx.answers.length, 1);
  assert.equal((ctx.answers[0] as { show_alert?: boolean }).show_alert, true);
}

/* 10. callbackGuard: decorative noop rows are acknowledged, never routed. */
{
  resetCallbackClicks();
  const ctx = fakeCtx('noop:divider');
  let ran = false;
  await callbackGuard(ctx as never, async () => {
    ran = true;
  });
  assert.equal(ran, false);
  assert.equal(ctx.answers.length, 1);
}

/* 11. callbackGuard: a handler that never answers gets a final ack. */
{
  resetCallbackClicks();
  const ctx = fakeCtx('profile:open');
  await callbackGuard(ctx as never, async () => {});
  assert.equal(ctx.answers.length, 1);
}

/* 12. Non-callback updates pass straight through. */
{
  resetCallbackClicks();
  const ctx = fakeCtx(undefined);
  let ran = false;
  await callbackGuard(ctx as never, async () => {
    ran = true;
  });
  assert.equal(ran, true);
  assert.equal(ctx.answers.length, 0);
}

/* 13. Pagination payloads never yield NaN pages. */
{
  const ctx = fakeCtx('shop:cat:3:abc');
  assert.equal(callbackInt(ctx, 3), null);
  assert.equal(clampPage(callbackInt(ctx, 3), 5), 0);
  assert.equal(clampPage(99, 5), 4);
  assert.equal(clampPage(-3, 5), 0);
}

/* 14. Full buy path + every reverse hop stays alive. */
{
  resetCallbackClicks();
  const path = [
    'main:open',
    'shop:home',
    'shop:cat:3:0',
    'prod:11',
    'qty:add:11:1',
    'buy:11',
    'pay:direct:11',
    'cart:open',
    'buy:11',
    'prod:11',
    'shop:cat:3:0',
    'shop:home',
    'main:open',
  ];
  for (const step of path) {
    const ctx = fakeCtx(step);
    let ran = false;
    await callbackGuard(ctx as never, async () => {
      ran = true;
      await safeNavigate(ctx, `screen:${step}`);
    });
    assert.equal(ran, true, `${step} must route`);
    assert.equal(ctx.answers.length, 1, `${step} must acknowledge exactly once`);
    assert.equal(ctx.edits.length + ctx.replies.length, 1, `${step} must render one screen`);
  }
}

/* 15. Live Support / delivery-form flows survive ordinary navigation. */
{
  for (const type of PROTECTED_FLOW_TYPES) {
    const ctx = fakeCtx('shop:home');
    ctx.session['userFlow'] = { type };
    clearTransientFlowState(ctx);
    assert.equal(activeFlowType(ctx), type, `${type} must not be dropped by navigation`);
    clearFlowState(ctx);
    assert.equal(hasActiveFlow(ctx), false, `${type} must end on an explicit cancel`);
  }
}

/* 16. Simulated bot restart: flow state survives a fresh process. */
{
  const { SupabaseSessionStorage } = await import('../../src/middleware/sessionStorage.js');
  const rows = new Map<string, unknown>();
  const fakeDb = {
    from: () => ({
      select: () => ({
        eq: (_c: string, key: string) => ({
          maybeSingle: async () => ({ data: rows.has(key) ? { data: rows.get(key) } : null, error: null }),
        }),
      }),
      upsert: async (row: { key: string; data: unknown }) => {
        rows.set(row.key, row.data);
        return { error: null };
      },
      delete: () => ({
        eq: async (_c: string, key: string) => {
          rows.delete(key);
          return { error: null };
        },
      }),
    }),
  };

  const before = new SupabaseSessionStorage<Record<string, unknown>>(fakeDb);
  await before.write('42', {
    qty: { 11: 3 },
    userFlow: { type: 'chain_topup', step: 'tx_id', data: { deposit_id: 900 } },
  });

  // A redeploy: brand new adapter instance, empty in-process cache.
  const after = new SupabaseSessionStorage<Record<string, unknown>>(fakeDb);
  const restored = await after.read('42');
  assert.ok(restored, 'session must survive a restart');
  assert.deepEqual(restored['qty'], { 11: 3 });
  assert.equal((restored['userFlow'] as { step: string }).step, 'tx_id');

  await after.delete('42');
  assert.equal(await new SupabaseSessionStorage<Record<string, unknown>>(fakeDb).read('42'), undefined);

  // A database outage degrades to memory, it never throws.
  const brokenDb = {
    from: () => {
      throw new Error('connection refused');
    },
  };
  const broken = new SupabaseSessionStorage<Record<string, unknown>>(brokenDb);
  await broken.write('7', { qty: {} });
  assert.deepEqual(await broken.read('7'), { qty: {} });
}

console.log('navigation reliability harness: 16/16 PASS');
