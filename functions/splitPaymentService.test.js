'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SPLIT_MODES,
  buildPaystackSplitParams,
  createPaystackSubaccount,
  ensureHelperPaystackSubaccount,
  resolveAttemptSplitAllocation,
  resolvePaystackSplitAllocation,
} = require('./splitPaymentService');
const {
  applyHelperPayoutInTransaction,
  applySplitSettlementInTransaction,
  isWalletEarningEligible,
  reverseSplitSettlementInTransaction,
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
  async set(data, options = {}) {
    const previousValue = this.db.records.get(this.path);
    const next = options.merge && previousValue
      ? {
          ...previousValue,
          ...data,
          ...(previousValue.payout && data.payout ? { payout: { ...previousValue.payout, ...data.payout } } : {}),
        }
      : structuredClone(data);
    this.db.records.set(this.path, next);
  }
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

test('Scenario A: non-negative helper wallet with verified subaccount splits directly and writes 0 wallet delta', async () => {
  const allocation = resolvePaystackSplitAllocation({
    helperId: 'helper-1',
    payoutProfile: { verificationStatus: 'verified', subaccountCode: 'ACCT_helper1' },
    helperWalletBalanceMinor: 5000, // +R50.00 already sitting in wallet
    helperAmountMinor: 11000, // R110.00
    platformAmountMinor: 2600, // R26.00
    customerChargeAmountMinor: 13600, // R136.00
  });

  assert.equal(allocation.mode, SPLIT_MODES.PAYSTACK_SPLIT);
  assert.equal(allocation.useSubaccount, true);
  assert.equal(allocation.helperSplitMinor, 11000);
  assert.equal(allocation.transactionChargeMinor, 2600);
  assert.equal(allocation.debtRecoveredMinor, 0);
  assert.equal(allocation.walletDeltaOnSuccessMinor, 0);
  assert.deepEqual(buildPaystackSplitParams(allocation), {
    subaccount: 'ACCT_helper1',
    transaction_charge: 2600,
    bearer: 'account',
  });

  const db = new MemoryDb({
    'users/helper-1': { uid: 'helper-1', wallet: { balance: 50, balanceMinor: 5000, currency: 'ZAR' } },
    'helperWallets/helper-1': { helperId: 'helper-1', balance: 50, balanceMinor: 5000, schemaVersion: 2, currency: 'ZAR' },
  });

  const settled = await db.runTransaction((transaction) => applySplitSettlementInTransaction({
    transaction,
    db,
    helperId: 'helper-1',
    requestId: 'req-split-a',
    splitAllocation: allocation,
    helperAmountMinor: 11000,
    platformAmountMinor: 2600,
    customerChargeAmountMinor: 13600,
    gatewayReference: 'ref-split-a',
    now: 1000,
  }));

  assert.equal(settled.applied, true);
  assert.equal(settled.deltaMinor, 0);
  assert.equal(settled.balanceAfterMinor, 5000);
  assert.equal((await db.collection('helperWallets').doc('helper-1').get()).data().balanceMinor, 5000);

  const ledger = (await db.collection('helperWallets').doc('helper-1').collection('transactions').doc(walletEarningLedgerId('req-split-a')).get()).data();
  assert.equal(ledger.entryType, 'split_direct_settlement');
  assert.equal(ledger.splitHelperAmountMinor, 11000);
  assert.equal(ledger.deltaMinor, 0);

  // Sync guard prevents re-crediting into wallet
  assert.equal(isWalletEarningEligible({
    helperWalletAccountingVersion: 1,
    paymentStatus: 'paid',
    paymentSettlementMode: allocation.mode,
  }), false);
});

test('Scenario B1: negative wallet smaller than helper share splits net remainder to bank and offsets debt', async () => {
  const allocation = resolvePaystackSplitAllocation({
    helperId: 'helper-neg-part',
    payoutProfile: { verificationStatus: 'verified', subaccountCode: 'ACCT_neg1' },
    helperWalletBalanceMinor: -3000, // -R30.00 owed from cash job
    helperAmountMinor: 11000, // R110.00 helper share
    platformAmountMinor: 2600,
    customerChargeAmountMinor: 13600,
  });

  assert.equal(allocation.mode, SPLIT_MODES.PAYSTACK_SPLIT_WITH_DEBT_RECOVERY);
  assert.equal(allocation.useSubaccount, true);
  assert.equal(allocation.debtRecoveredMinor, 3000);
  assert.equal(allocation.helperSplitMinor, 8000);
  assert.equal(allocation.transactionChargeMinor, 5600); // R26 platform + R30 debt recovery = R56
  assert.deepEqual(buildPaystackSplitParams(allocation), {
    subaccount: 'ACCT_neg1',
    transaction_charge: 5600,
    bearer: 'account',
  });

  const db = new MemoryDb({
    'users/helper-neg-part': { uid: 'helper-neg-part', wallet: { balance: -30, balanceMinor: -3000, currency: 'ZAR' } },
    'helperWallets/helper-neg-part': { helperId: 'helper-neg-part', balance: -30, balanceMinor: -3000, schemaVersion: 2, currency: 'ZAR' },
  });

  const settled = await db.runTransaction((transaction) => applySplitSettlementInTransaction({
    transaction,
    db,
    helperId: 'helper-neg-part',
    requestId: 'req-split-b1',
    splitAllocation: allocation,
    helperAmountMinor: 11000,
    platformAmountMinor: 2600,
    customerChargeAmountMinor: 13600,
    now: 2000,
  }));

  assert.equal(settled.applied, true);
  assert.equal(settled.deltaMinor, 3000);
  assert.equal(settled.balanceAfterMinor, 0);
  assert.equal((await db.collection('helperWallets').doc('helper-neg-part').get()).data().balanceMinor, 0);
  assert.equal((await db.collection('users').doc('helper-neg-part').get()).data().wallet.balance, 0);
});

test('Scenario B2: negative wallet >= helper share routes 100% to platform without subaccount and offsets wallet balance', async () => {
  const allocation = resolvePaystackSplitAllocation({
    helperId: 'helper-neg-full',
    payoutProfile: { verificationStatus: 'verified', subaccountCode: 'ACCT_neg2' },
    helperWalletBalanceMinor: -12000, // -R120.00 owed
    helperAmountMinor: 7500, // R75.00 helper share
    platformAmountMinor: 2500,
    customerChargeAmountMinor: 10000,
  });

  assert.equal(allocation.mode, SPLIT_MODES.DEBT_RECOVERY_PLATFORM_ONLY);
  assert.equal(allocation.useSubaccount, false);
  assert.equal(allocation.debtRecoveredMinor, 7500);
  assert.equal(allocation.helperSplitMinor, 0);
  assert.deepEqual(buildPaystackSplitParams(allocation), {});

  const db = new MemoryDb({
    'users/helper-neg-full': { uid: 'helper-neg-full', wallet: { balance: -120, balanceMinor: -12000, currency: 'ZAR' } },
    'helperWallets/helper-neg-full': { helperId: 'helper-neg-full', balance: -120, balanceMinor: -12000, schemaVersion: 2, currency: 'ZAR' },
  });

  const settled = await db.runTransaction((transaction) => applySplitSettlementInTransaction({
    transaction,
    db,
    helperId: 'helper-neg-full',
    requestId: 'req-split-b2',
    splitAllocation: allocation,
    helperAmountMinor: 7500,
    platformAmountMinor: 2500,
    customerChargeAmountMinor: 10000,
    now: 3000,
  }));

  assert.equal(settled.applied, true);
  assert.equal(settled.deltaMinor, 7500);
  assert.equal(settled.balanceAfterMinor, -4500); // -R120 + R75 = -R45 remaining owed
  assert.equal((await db.collection('helperWallets').doc('helper-neg-full').get()).data().balance, -45);
});

test('Scenario C: unpaid/failed job already credited to helper wallet routes late card recovery 100% to platform with 0 helper wallet delta', async () => {
  const db = new MemoryDb({
    'users/helper-rec': {
      uid: 'helper-rec',
      email: 'helper@uncedo.test',
      payout: { verificationStatus: 'verified', subaccountCode: 'ACCT_rec', bankCode: '632005', accountNumber: '1234567890' },
      wallet: { balance: 0, balanceMinor: 0, currency: 'ZAR' },
    },
  });

  // Initial unpaid/failed completion credits helper wallet +R75.00
  await db.runTransaction((transaction) => applyHelperPayoutInTransaction({
    transaction,
    db,
    helperId: 'helper-rec',
    requestId: 'req-late-recovery',
    helperAmountMinor: 7500,
    platformAmountMinor: 2500,
    customerChargeAmountMinor: 10000,
    isCash: false,
    closureType: 'completed',
    now: 1000,
  }));
  assert.equal((await db.collection('helperWallets').doc('helper-rec').get()).data().balanceMinor, 7500);

  // Customer later pays via Paystack link or saved card
  const allocation = await resolveAttemptSplitAllocation({
    db,
    requestId: 'req-late-recovery',
    helperId: 'helper-rec',
    helperAmountMinor: 7500,
    platformAmountMinor: 2500,
    customerChargeAmountMinor: 10000,
  });

  assert.equal(allocation.mode, SPLIT_MODES.RECOVERY_PLATFORM_ONLY);
  assert.equal(allocation.useSubaccount, false);
  assert.equal(allocation.earningAlreadyApplied, true);
  assert.deepEqual(buildPaystackSplitParams(allocation), {});

  const settled = await db.runTransaction((transaction) => applySplitSettlementInTransaction({
    transaction,
    db,
    helperId: 'helper-rec',
    requestId: 'req-late-recovery',
    splitAllocation: allocation,
    helperAmountMinor: 7500,
    platformAmountMinor: 2500,
    customerChargeAmountMinor: 10000,
    now: 2000,
  }));
  assert.equal(settled.deltaMinor, 0);
  assert.equal((await db.collection('helperWallets').doc('helper-rec').get()).data().balanceMinor, 7500);
});

test('Scenario E: reward discount exceeding platform margin or missing subaccount falls back to wallet credit', async () => {
  const heavyDiscount = resolvePaystackSplitAllocation({
    helperId: 'helper-disc',
    payoutProfile: { verificationStatus: 'verified', subaccountCode: 'ACCT_disc' },
    helperWalletBalanceMinor: 0,
    helperAmountMinor: 7500,
    platformAmountMinor: 2500,
    customerChargeAmountMinor: 6000, // customer paid R60 due to promo points, helper still owed R75
  });
  assert.equal(heavyDiscount.mode, SPLIT_MODES.PLATFORM_HOLD_FALLBACK);
  assert.equal(heavyDiscount.useSubaccount, false);
  assert.equal(heavyDiscount.fallbackReason, 'charge_does_not_exceed_helper_share');

  const partialDiscount = resolvePaystackSplitAllocation({
    helperId: 'helper-disc',
    payoutProfile: { verificationStatus: 'verified', subaccountCode: 'ACCT_disc' },
    helperWalletBalanceMinor: 0,
    helperAmountMinor: 7500,
    platformAmountMinor: 2500,
    customerChargeAmountMinor: 9000, // customer paid R90 (R10 points off), helper still gets R75, platform gets R15
  });
  assert.equal(partialDiscount.mode, SPLIT_MODES.PAYSTACK_SPLIT);
  assert.equal(partialDiscount.useSubaccount, true);
  assert.equal(partialDiscount.helperSplitMinor, 7500);
  assert.equal(partialDiscount.transactionChargeMinor, 1500);

  const missingSubaccount = resolvePaystackSplitAllocation({
    helperId: 'helper-nosub',
    payoutProfile: { verificationStatus: 'verified' },
    helperWalletBalanceMinor: 0,
    helperAmountMinor: 7500,
    platformAmountMinor: 2500,
    customerChargeAmountMinor: 10000,
  });
  assert.equal(missingSubaccount.mode, SPLIT_MODES.PLATFORM_HOLD_FALLBACK);
  assert.equal(missingSubaccount.useSubaccount, false);

  const zeroShare = resolvePaystackSplitAllocation({
    helperId: 'helper-zero',
    payoutProfile: { verificationStatus: 'verified', subaccountCode: 'ACCT_zero' },
    helperAmountMinor: 0,
    platformAmountMinor: 500,
    customerChargeAmountMinor: 500,
  });
  assert.equal(zeroShare.mode, SPLIT_MODES.PLATFORM_ONLY);
  assert.equal(zeroShare.useSubaccount, false);
});

test('Scenario F & Lazy Backfill: reverses split debt recovery idempotently and lazily provisions subaccount for already-verified helper', async () => {
  let subaccountCreateCalls = 0;
  const db = new MemoryDb({
    'users/helper-legacy-verified': {
      uid: 'helper-legacy-verified',
      email: 'verified@uncedo.test',
      businessName: 'Mpho Electrical',
      payout: {
        verificationStatus: 'verified',
        verified: true,
        bankCode: '632005',
        bankName: 'First National Bank',
        accountNumber: '62000112233',
        accountHolder: 'Mpho Ndlovu',
        recipientCode: 'RCP_legacy_1',
      },
    },
    'helperWallets/helper-legacy-verified': {
      helperId: 'helper-legacy-verified',
      balance: -20,
      balanceMinor: -2000,
      schemaVersion: 2,
      currency: 'ZAR',
    },
  });

  const callPaystackApi = async ({ path, body }) => {
    assert.equal(path, '/subaccount');
    subaccountCreateCalls += 1;
    assert.equal(body.business_name, 'Mpho Electrical');
    assert.equal(body.settlement_bank, '632005');
    assert.equal(body.account_number, '62000112233');
    return { status: true, data: { subaccount_code: 'ACCT_backfilled_1', id: 998877 } };
  };

  const allocation = await resolveAttemptSplitAllocation({
    db,
    callPaystackApi,
    paystackSecretKey: 'sk_test_fake',
    requestId: 'req-backfill-rev',
    helperId: 'helper-legacy-verified',
    helperAmountMinor: 8000,
    platformAmountMinor: 2000,
    customerChargeAmountMinor: 10000,
  });

  assert.equal(subaccountCreateCalls, 1);
  assert.equal(allocation.mode, SPLIT_MODES.PAYSTACK_SPLIT_WITH_DEBT_RECOVERY);
  assert.equal(allocation.subaccountCode, 'ACCT_backfilled_1');
  assert.equal(allocation.debtRecoveredMinor, 2000);
  assert.equal(allocation.helperSplitMinor, 6000);
  assert.equal(allocation.transactionChargeMinor, 4000);
  assert.equal((await db.collection('users').doc('helper-legacy-verified').get()).data().payout.subaccountCode, 'ACCT_backfilled_1');

  // Settle split with debt recovery -> wallet rises from -2000 to 0
  await db.runTransaction((transaction) => applySplitSettlementInTransaction({
    transaction,
    db,
    helperId: 'helper-legacy-verified',
    requestId: 'req-backfill-rev',
    splitAllocation: allocation,
    helperAmountMinor: 8000,
    platformAmountMinor: 2000,
    customerChargeAmountMinor: 10000,
    now: 5000,
  }));
  assert.equal((await db.collection('helperWallets').doc('helper-legacy-verified').get()).data().balanceMinor, 0);

  // Reverse Paystack split charge -> claws back the 2000 recovered debt once
  const reverse = () => db.runTransaction((transaction) => reverseSplitSettlementInTransaction({
    transaction,
    db,
    helperId: 'helper-legacy-verified',
    requestId: 'req-backfill-rev',
    splitAllocation: allocation,
    now: 6000,
  }));
  const firstRev = await reverse();
  const secondRev = await reverse();
  assert.equal(firstRev.applied, true);
  assert.equal(secondRev.duplicate, true);
  assert.equal((await db.collection('helperWallets').doc('helper-legacy-verified').get()).data().balanceMinor, -2000);

  const reversalDoc = (await db.collection('helperWallets').doc('helper-legacy-verified').collection('transactions').doc(walletLedgerId('split_rev:req-backfill-rev', 'split_reversal')).get()).data();
  assert.equal(reversalDoc.entryType, 'split_settlement_reversal');
  assert.equal(reversalDoc.deltaMinor, -2000);
});

test('createPaystackSubaccount and ensureHelperPaystackSubaccount are no-ops once provisioned', async () => {
  let calls = 0;
  const created = await createPaystackSubaccount({
    callPaystackApi: async () => {
      calls += 1;
      return { status: true, data: { subaccount_code: 'ACCT_new_1', id: 123 } };
    },
    paystackSecretKey: 'sk_test_fake',
    payout: { bankCode: '632005', accountNumber: '123456', bankName: 'FNB', accountHolder: 'Sipho', recipientCode: 'RCP_1' },
    email: 'sipho@uncedo.test',
    uid: 'helper-sipho',
  });
  assert.equal(created.subaccountCode, 'ACCT_new_1');
  assert.equal(calls, 1);

  const db = new MemoryDb({
    'users/helper-sipho': {
      uid: 'helper-sipho',
      payout: { verificationStatus: 'verified', bankCode: '632005', accountNumber: '123456', subaccountCode: 'ACCT_new_1' },
    },
  });
  const profile = await ensureHelperPaystackSubaccount({
    db,
    callPaystackApi: async () => { throw new Error('should not call Paystack when subaccount exists'); },
    paystackSecretKey: 'sk_test_fake',
    helperId: 'helper-sipho',
  });
  assert.equal(profile.subaccountCode, 'ACCT_new_1');
});
