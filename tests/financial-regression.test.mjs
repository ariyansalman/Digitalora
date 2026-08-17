import test from 'node:test';
import assert from 'node:assert/strict';

class Wallet {
  constructor(balance = 0) {
    this.balance = balance;
    this.ledger = new Map();
    this.lock = Promise.resolve();
  }

  async apply(delta, type, reference, user = 'u1') {
    const previous = this.lock;
    let release;
    this.lock = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      if (!Number.isFinite(delta) || delta === 0) throw new Error('INVALID_WALLET_DELTA');
      if (reference && this.ledger.has(reference)) {
        const prior = this.ledger.get(reference);
        if (prior.user !== user || prior.type !== type || prior.amount !== delta) {
          throw new Error('WALLET_REFERENCE_CONFLICT');
        }
        return this.balance;
      }
      if (delta < 0 && this.balance + delta < 0) throw new Error('INSUFFICIENT_FUNDS');
      this.balance += delta;
      if (reference) this.ledger.set(reference, { user, type, amount: delta });
      return this.balance;
    } finally {
      release();
    }
  }
}

test('duplicate wallet credits are idempotent and conflicting replays fail', async () => {
  const wallet = new Wallet(10);
  const results = await Promise.all(
    Array.from({ length: 40 }, () => wallet.apply(5, 'deposit_credit', 'tx:one')),
  );
  assert.equal(wallet.balance, 15);
  assert.equal(wallet.ledger.size, 1);
  assert.ok(results.every((value) => value === 15));
  await assert.rejects(wallet.apply(6, 'deposit_credit', 'tx:one'), /WALLET_REFERENCE_CONFLICT/);
});

test('concurrent payments cannot double-spend a wallet', async () => {
  const wallet = new Wallet(10);
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, (_, i) => wallet.apply(-6, 'wallet_purchase', `order:${i}`)),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(wallet.balance, 4);
  assert.equal(wallet.ledger.size, 1);
});

test('replayed webhook resumes fulfilment without creating a second order', () => {
  const state = { deposit: 'approved', fulfilment: 'failed', orders: 0 };
  const process = () => {
    if (state.deposit !== 'approved') return false;
    if (state.fulfilment === 'completed') return true;
    state.orders += 1;
    state.fulfilment = 'completed';
    return true;
  };
  assert.equal(process(), true);
  assert.equal(process(), true);
  assert.equal(state.orders, 1);
});

test('payment verification rejects wrong amount, network, asset, and expiry', () => {
  const verify = ({ expectedAmount, amount, expectedNetwork, network, asset, expiresAt, now }) =>
    asset === 'USDT' &&
    network === expectedNetwork &&
    Math.abs(amount - expectedAmount) <= 0.000001 &&
    (expiresAt == null || now <= expiresAt);
  const base = {
    expectedAmount: 12.5, amount: 12.5, expectedNetwork: 'TRC20',
    network: 'TRC20', asset: 'USDT', expiresAt: 100, now: 50,
  };
  assert.equal(verify(base), true);
  assert.equal(verify({ ...base, amount: 12.49 }), false);
  assert.equal(verify({ ...base, network: 'BEP20' }), false);
  assert.equal(verify({ ...base, asset: 'TON' }), false);
  assert.equal(verify({ ...base, now: 101 }), false);
});

test('same request id creates one order when callers race', async () => {
  const state = { request: null, orders: 0, balance: 100 };
  let lock = Promise.resolve();
  const place = async (requestId) => {
    const previous = lock;
    let release;
    lock = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      if (state.request === requestId) return 'duplicate';
      state.request = requestId;
      state.orders += 1;
      state.balance -= 10;
      return 'created';
    } finally {
      release();
    }
  };
  const results = await Promise.all(Array.from({ length: 50 }, () => place('same')));
  assert.equal(results.filter((r) => r === 'created').length, 1);
  assert.equal(results.filter((r) => r === 'duplicate').length, 49);
  assert.equal(state.orders, 1);
  assert.equal(state.balance, 90);
});