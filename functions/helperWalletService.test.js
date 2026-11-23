'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applyHelperPayoutInTransaction,
  creditHelperWalletEarning,
  emptyHelperWallet,
  isWalletEarningEligible,
  normalizeWalletForClient,
  resolveSignedBalanceMinor,
} = require('./helperWalletService');

class Snapshot {
  constructor(ref, data) {
    this.ref = ref;
    this.id = ref.id;
    this.exists = data !== undefined;
    this.value = data === undefined ? undefined : structuredClone(data);
  }
  data() { return this.value === undefined ? undefined : structuredClone(this.value); }
}

class DocumentRef {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split('/').at(-1); }
  collection(name) { return new CollectionRef(this.db, `${this.path}/${name}`); }
  async get() { return new Snapshot(this, this.db.records.get(this.path)); }
}

class CollectionRef {
  constructor(db, path) { this.db = db; this.path = path; }
  doc(id) { return new DocumentRef(this.db, `${this.path}/${String(id)}`); }
}

class MemoryDb {
  constructor(seed = {}) {
    this.records = new Map(Object.entries(seed).map(([path, value]) => [path, structuredClone(value)]));
    this.lock = Promise.resolve();
  }
  collection(name) { return new CollectionRef(this, name); }
  async runTransaction(callback) {
    const previous = this.lock;
    let release;
    this.lock = new Promise((resolve) => { release = resolve; });
    await previous;
    const writes = [];
    const transaction = {
      get: async (ref) => new Snapshot(ref, this.records.get(ref.path)),
      create: (ref, data) => writes.push({ kind: 'create', ref, data: structuredClone(data) }),
      set: (ref, data, options = {}) => writes.push({ kind: 'set', ref, data: structuredClone(data), merge: options.merge === true }),
      update: (ref, data) => writes.push({ kind: 'update', ref, data: structuredClone(data) }),
    };
    try {
      const result = await callback(transaction);
      for (const write of writes) {
        const previousValue = this.records.get(write.ref.path);
        if (write.kind === 'create' && previousValue !== undefined) throw new Error(`already-exists:${write.ref.path}`);
        if (write.kind === 'update' && previousValue === undefined) throw new Error(`not-found:${write.ref.path}`);
        const shouldMerge = write.kind === 'update' || write.merge;
        const next = shouldMerge && previousValue ? { ...previousValue, ...write.data } : write.data;
        this.records.set(write.ref.path, next);
      }
      return result;
    } finally {
      release();
    }
  }
}

test('wallet earnings require a versioned request with verified payment settlement', () => {
  assert.equal(isWalletEarningEligible({ helperWalletAccountingVersion: 1, paymentStatus: 'unpaid' }), false);
  assert.equal(isWalletEarningEligible({ helperWalletAccountingVersion: 1, paymentStatus: 'payment_processing' }), false);
  assert.equal(isWalletEarningEligible({ helperWalletAccountingVersion: 1, paymentStatus: 'paid' }), true);
  assert.equal(isWalletEarningEligible({ paymentStatus: 'paid' }), false);
  assert.equal(isWalletEarningEligible({ helperWalletAccountingVersion: 1, paymentStatus: 'paid', cashPayment: { status: 'helper_confirmed' } }), false);
});

test('emptyHelperWallet and resolveSignedBalanceMinor model a single signed balance with v1 compatibility', () => {
  const fresh = emptyHelperWallet('helper-1', 1_000);
  assert.equal(fresh.schemaVersion, 2);
  assert.equal(fresh.balanceMinor, 0);
  assert.equal(fresh.balance, 0);

  assert.equal(resolveSignedBalanceMinor({ balanceMinor: -1500 }), -1500);
  assert.equal(resolveSignedBalanceMinor({ availableMinor: 1000, outstandingCommissionMinor: 1500 }), -500);

  const negativeClient = normalizeWalletForClient({ balanceMinor: -1500, updatedAtMs: 5_000 });
  assert.equal(negativeClient.balanceMinor, -1500);
  assert.equal(negativeClient.balance, -15);
  assert.equal(negativeClient.availableMinor, 0);
  assert.equal(negativeClient.reservedMinor, 0);
  assert.equal(negativeClient.outstandingCommissionMinor, 1500);
});

test('single wallet balance handles cash shortfall into negative and automatically balances on next non-cash earning', async () => {
  const db = new MemoryDb({
    'users/helper-1': { uid: 'helper-1', role: 'helper' },
  });

  // 1. Helper collects R100 cash (R85 helper share, R15 platform commission) -> net -R15 (-1500 minor)
  const cashResult = await db.runTransaction((transaction) => applyHelperPayoutInTransaction({
    transaction,
    db,
    helperId: 'helper-1',
    requestId: 'req-cash-1',
    helperAmountMinor: 8500,
    platformAmountMinor: 1500,
    customerChargeAmountMinor: 10000,
    isCash: true,
    now: 2_000,
  }));
  assert.equal(cashResult.applied, true);
  assert.equal(cashResult.deltaMinor, -1500);
  assert.equal(cashResult.balanceAfterMinor, -1500);

  let walletDoc = (await db.collection('helperWallets').doc('helper-1').get()).data();
  let userDoc = (await db.collection('users').doc('helper-1').get()).data();
  assert.equal(walletDoc.balanceMinor, -1500);
  assert.equal(walletDoc.balance, -15);
  assert.equal(userDoc.wallet.balanceMinor, -1500);
  assert.equal(userDoc.wallet.balance, -15);

  // 2. Helper completes an R100 card job (R85 helper payout) -> -1500 + 8500 = +7000 (R70)
  const creditResult = await creditHelperWalletEarning({
    db,
    helperId: 'helper-1',
    requestId: 'req-card-2',
    amountMinor: 8500,
    platformAmountMinor: 1500,
    customerChargeAmountMinor: 10000,
    closureType: 'completed',
    now: 3_000,
  });
  assert.equal(creditResult.action, 'credited');

  // 3. Idempotent replay does not double-credit
  const replay = await creditHelperWalletEarning({
    db,
    helperId: 'helper-1',
    requestId: 'req-card-2',
    amountMinor: 8500,
    platformAmountMinor: 1500,
    customerChargeAmountMinor: 10000,
    closureType: 'completed',
    now: 4_000,
  });
  assert.equal(replay.action, 'duplicate');

  walletDoc = (await db.collection('helperWallets').doc('helper-1').get()).data();
  userDoc = (await db.collection('users').doc('helper-1').get()).data();
  assert.equal(walletDoc.balanceMinor, 7000);
  assert.equal(walletDoc.balance, 70);
  assert.equal(userDoc.wallet.balanceMinor, 7000);
  assert.equal(userDoc.wallet.balance, 70);
});

