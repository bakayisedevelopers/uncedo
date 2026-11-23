'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applyHelperPayoutInTransaction,
  computeLegacyCompletedJobResolution,
  creditHelperWalletEarning,
  emptyHelperWallet,
  isWalletEarningEligible,
  normalizeWalletForClient,
  resolveSignedBalanceMinor,
  walletEarningLedgerId,
  walletLedgerId,
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

test('wallet earnings require a versioned non-cash request in paid or wallet_debt_recorded status', () => {
  assert.equal(isWalletEarningEligible({ helperWalletAccountingVersion: 1, paymentStatus: 'unpaid' }), false);
  assert.equal(isWalletEarningEligible({ helperWalletAccountingVersion: 1, paymentStatus: 'payment_processing' }), false);
  assert.equal(isWalletEarningEligible({ helperWalletAccountingVersion: 1, paymentStatus: 'paid' }), true);
  assert.equal(isWalletEarningEligible({ helperWalletAccountingVersion: 1, paymentStatus: 'wallet_debt_recorded' }), true);
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

test('single wallet balance adds helper payout and deducts platform commission on cash jobs and stacks with non-cash earnings', async () => {
  const db = new MemoryDb({
    'users/helper-1': { uid: 'helper-1', role: 'helper' },
  });

  // 1. Helper confirms R100 cash (R85 helper share, R15 platform commission) -> +8500 - 1500 = +7000 minor (R70)
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
  assert.equal(cashResult.payoutCreditDeltaMinor, 8500);
  assert.equal(cashResult.commissionMinor, 1500);
  assert.equal(cashResult.deltaMinor, 7000);
  assert.equal(cashResult.balanceAfterMinor, 7000);

  let walletDoc = (await db.collection('helperWallets').doc('helper-1').get()).data();
  let userDoc = (await db.collection('users').doc('helper-1').get()).data();
  assert.equal(walletDoc.balanceMinor, 7000);
  assert.equal(walletDoc.balance, 70);
  assert.equal(userDoc.wallet.balanceMinor, 7000);
  assert.equal(userDoc.wallet.balance, 70);

  const earningEntry = (await db.collection('helperWallets').doc('helper-1').collection('transactions').doc(walletEarningLedgerId('req-cash-1')).get()).data();
  const commissionEntry = (await db.collection('helperWallets').doc('helper-1').collection('transactions').doc(walletLedgerId('cash:req-cash-1', 'cash_commission')).get()).data();
  assert.equal(earningEntry.entryType, 'job_earning_credit');
  assert.equal(earningEntry.deltaMinor, 8500);
  assert.equal(commissionEntry.entryType, 'cash_commission_assessed');
  assert.equal(commissionEntry.deltaMinor, -1500);

  // 2. Helper completes an R100 card job (R85 helper payout) -> 7000 + 8500 = 15500 (R155)
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
  assert.equal(walletDoc.balanceMinor, 15500);
  assert.equal(walletDoc.balance, 155);
  assert.equal(userDoc.wallet.balanceMinor, 15500);
  assert.equal(userDoc.wallet.balance, 155);
});

test('cash settlement after prior wallet_debt_recorded earning credit does not double-credit payout and deducts only platform commission', async () => {
  const db = new MemoryDb({
    'users/helper-1': { uid: 'helper-1', role: 'helper' },
  });

  // Customer card declines on completion -> helper gets +R85 wallet credit
  const credit = await db.runTransaction((transaction) => applyHelperPayoutInTransaction({
    transaction,
    db,
    helperId: 'helper-1',
    requestId: 'req-debt-then-cash',
    helperAmountMinor: 8500,
    platformAmountMinor: 1500,
    customerChargeAmountMinor: 10000,
    isCash: false,
    closureType: 'completed',
    now: 1_000,
  }));
  assert.equal(credit.balanceAfterMinor, 8500);

  // Customer switches to cash and hands helper R100 -> payout already credited, so only deducts -R15 commission -> net +R70 (7000)
  const cash = await db.runTransaction((transaction) => applyHelperPayoutInTransaction({
    transaction,
    db,
    helperId: 'helper-1',
    requestId: 'req-debt-then-cash',
    helperAmountMinor: 8500,
    platformAmountMinor: 1500,
    customerChargeAmountMinor: 10000,
    cashCollectedMinor: 10000,
    isCash: true,
    closureType: 'completed',
    now: 2_000,
  }));
  assert.equal(cash.applied, true);
  assert.equal(cash.payoutCreditDeltaMinor, 0);
  assert.equal(cash.commissionMinor, 1500);
  assert.equal(cash.deltaMinor, -1500);
  assert.equal(cash.balanceAfterMinor, 7000);
});

test('computeLegacyCompletedJobResolution resolves eligible legacy jobs once and excludes paid, cash, pending explicit, and wallet-credited requests', () => {
  const result = computeLegacyCompletedJobResolution({
    requests: [
      {
        id: 'legacy-completed-1',
        status: 'completed',
        totalAmount: 136,
        pricingSnapshot: { subtotal: 100, travelFee: 35, bookingFee: 1 },
        helperPayoutBreakdown: { helperAmount: 110, platformAmount: 26, customerChargeAmount: 136 },
      },
      {
        id: 'legacy-cancel-missed',
        status: 'canceled',
        paymentStatus: 'wallet_debt_recorded',
        helperPayoutBreakdown: { helperAmount: 24, platformAmount: 1, customerChargeAmount: 25 },
      },
      {
        id: 'already-resolved',
        status: 'completed',
        legacyWalletResolvedAtMs: 5_000,
        helperPayoutBreakdown: { helperAmount: 95, platformAmount: 15, customerChargeAmount: 110 },
      },
      {
        id: 'already-paid-weekly',
        status: 'completed',
        helperPayoutBreakdown: { helperAmount: 80, platformAmount: 20, customerChargeAmount: 100 },
      },
      {
        id: 'already-in-wallet',
        status: 'completed',
        helperPayoutBreakdown: { helperAmount: 70, platformAmount: 15, customerChargeAmount: 85 },
      },
      {
        id: 'cash-confirmed',
        status: 'completed',
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashPayment: { status: 'helper_confirmed' },
        helperPayoutBreakdown: { helperAmount: 75, platformAmount: 25, customerChargeAmount: 100 },
      },
      {
        id: 'explicit-pending',
        status: 'completed',
        paymentFlowVersion: 'explicit_v1',
        paymentStatus: 'awaiting_cash_confirmation',
        helperPayoutBreakdown: { helperAmount: 75, platformAmount: 25, customerChargeAmount: 100 },
      },
    ],
    walletTransactions: [
      { id: walletEarningLedgerId('already-in-wallet'), entryType: 'job_earning_credit', requestId: 'already-in-wallet' },
      { id: walletLedgerId('cash:other-cash', 'cash_commission'), entryType: 'cash_commission_assessed', requestId: 'other-cash' },
    ],
    paidWeeklyPayoutRequestIds: new Set(['already-paid-weekly']),
  });

  assert.equal(result.unresolvedJobsCount, 2);
  assert.equal(result.unresolvedAmountMinor, 13400);
  assert.equal(result.unresolvedAmount, 134);
  assert.deepEqual(
    result.resolvableJobs.map((item) => item.requestId),
    ['legacy-completed-1', 'legacy-cancel-missed'],
  );
});


