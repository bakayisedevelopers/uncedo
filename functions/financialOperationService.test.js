'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  claimPayoutTransfer,
  classifyPaystackTransaction,
  classifyPaystackTransfer,
  executePayoutTransferAttempt,
  executeServiceChargeAttempt,
  paystackChargeReference,
  paystackTransferReference,
  recordPayoutObservation,
  serviceFinancialOperationId,
  settleCustomerWalletBalancePayment,
  settleServiceFinancialOperation,
  shouldDeferCompletionPayment,
} = require('./financialOperationService');

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

const admin = { firestore: { FieldValue: { serverTimestamp: () => 'server-time', delete: () => null } } };

test('service charge uses one stable reference and verifies after a timed out request', async () => {
  const operationId = serviceFinancialOperationId('request-123');
  const reference = paystackChargeReference(operationId, 1);
  const operation = { operationId, requestId: 'request-123', amount: 42.5, amountMinor: 4250, currency: 'ZAR', gatewayReference: reference };
  let chargeCalls = 0;
  let verificationCalls = 0;
  const paystack = {
    async chargeAuthorization(input) {
      chargeCalls += 1;
      assert.equal(input.reference, reference);
      throw Object.assign(new Error('timed out after acceptance'), { code: 'ETIMEDOUT' });
    },
    async verifyTransaction(input) {
      verificationCalls += 1;
      assert.equal(input.reference, reference);
      return verificationCalls === 1
        ? { outcome: 'success', transaction: { id: 'tx-1', reference, amount: 4250, currency: 'ZAR', status: 'success' } }
        : { outcome: 'success', transaction: { id: 'tx-1', reference, amount: 4250, currency: 'ZAR', status: 'success' } };
    },
  };

  const first = await executeServiceChargeAttempt({ operation, action: 'charge', email: 'buyer@example.test', authorizationCode: 'mock-auth', paystack });
  const replay = await executeServiceChargeAttempt({ operation, action: 'reconcile', email: 'buyer@example.test', authorizationCode: 'mock-auth', paystack });
  assert.equal(first.outcome, 'success');
  assert.equal(first.requestErrorCode, 'ETIMEDOUT');
  assert.equal(replay.outcome, 'success');
  assert.equal(chargeCalls, 1);
  assert.equal(verificationCalls, 2);
});

test('missing card authorization is a confirmed non-charge and does not contact Paystack', async () => {
  let calls = 0;
  const result = await executeServiceChargeAttempt({
    operation: { operationId: 'op', requestId: 'request', amount: 1, amountMinor: 100, gatewayReference: 'ref' },
    action: 'charge',
    authorizationCode: '',
    paystack: {
      async chargeAuthorization() { calls += 1; },
      async verifyTransaction() { calls += 1; },
    },
  });
  assert.equal(result.outcome, 'failed_confirmed');
  assert.equal(result.reason, 'missing_authorization');
  assert.equal(calls, 0);
});

test('a claimed charge in reconciliation mode only verifies and never charges again', async () => {
  let chargeCalls = 0;
  let verifyCalls = 0;
  const result = await executeServiceChargeAttempt({
    operation: { operationId: 'op', requestId: 'request', amount: 9, amountMinor: 900, currency: 'ZAR', gatewayReference: 'stable-ref' },
    action: 'reconcile',
    authorizationCode: 'mock-auth',
    paystack: {
      async chargeAuthorization() { chargeCalls += 1; },
      async verifyTransaction({ reference, amountMinor, currency }) {
        verifyCalls += 1;
        assert.deepEqual({ reference, amountMinor, currency }, { reference: 'stable-ref', amountMinor: 900, currency: 'ZAR' });
        return { outcome: 'unknown', reason: 'provider_unavailable' };
      },
    },
  });
  assert.equal(result.outcome, 'unknown');
  assert.equal(chargeCalls, 0);
  assert.equal(verifyCalls, 1);
});

test('payout transfer is submitted once and verified using its stable reference', async () => {
  const operationId = 'payout-test-operation';
  const reference = paystackTransferReference(operationId, 1);
  const claim = { action: 'transfer', operationId, attempt: { reference, currency: 'ZAR' } };
  let transferCalls = 0;
  let verifyCalls = 0;
  const paystack = {
    async initiateTransfer(input) {
      transferCalls += 1;
      assert.equal(input.reference, reference);
      return { status: 'pending', reference, amount: 2500, currency: 'ZAR' };
    },
    async verifyTransfer(input) {
      verifyCalls += 1;
      assert.equal(input.reference, reference);
      return { outcome: 'pending', transfer: { status: 'pending', reference, amount: 2500, currency: 'ZAR' } };
    },
  };
  const first = await executePayoutTransferAttempt({ claim, amount: 25, recipientCode: 'RCP_mock', reason: 'weekly payout', paystack });
  const replay = await executePayoutTransferAttempt({
    claim: { action: 'reconcile', reference, payout: { transferCurrency: 'ZAR' } },
    amount: 25,
    recipientCode: 'RCP_mock',
    reason: 'weekly payout',
    paystack,
  });
  assert.equal(first.verification.outcome, 'pending');
  assert.equal(replay.verification.outcome, 'pending');
  assert.equal(transferCalls, 1);
  assert.equal(verifyCalls, 2);
});

test('Paystack classifiers require matching reference, exact amount and currency', () => {
  const transaction = { reference: 'charge-ref', amount: 1234, currency: 'ZAR', status: 'success' };
  assert.equal(classifyPaystackTransaction({ status: true, data: transaction }, { reference: 'charge-ref', amountMinor: 1234, currency: 'ZAR' }).outcome, 'success');
  assert.equal(classifyPaystackTransaction({ status: true, data: transaction }, { reference: 'other-ref', amountMinor: 1234, currency: 'ZAR' }).outcome, 'unknown');
  assert.equal(classifyPaystackTransaction({ status: true, data: transaction }, { reference: 'charge-ref', amountMinor: 1235, currency: 'ZAR' }).outcome, 'unknown');
  assert.equal(classifyPaystackTransfer({ status: true, data: { ...transaction, status: 'received' } }, { reference: 'charge-ref', amountMinor: 1234, currency: 'ZAR' }).outcome, 'pending');
  assert.equal(classifyPaystackTransfer({ status: true, data: { ...transaction, status: 'rejected' } }, { reference: 'charge-ref', amountMinor: 1234, currency: 'ZAR' }).outcome, 'failed_confirmed');
  assert.equal(classifyPaystackTransfer({ status: true, data: { ...transaction, status: 'blocked' } }, { reference: 'charge-ref', amountMinor: 1234, currency: 'ZAR' }).outcome, 'failed_confirmed');
  assert.equal(classifyPaystackTransfer({ status: true, data: { ...transaction, status: 'reversed' } }, { reference: 'charge-ref', amountMinor: 1234, currency: 'ZAR' }).outcome, 'reversed');
});

test('only newly versioned requests defer completion-time card charging; pre-selected card executes automatically while cash defers', () => {
  assert.equal(shouldDeferCompletionPayment({ paymentFlowVersion: 'explicit_v1' }), true);
  assert.equal(shouldDeferCompletionPayment({ paymentFlowVersion: 'explicit_v1', preSelectedPaymentType: 'cash' }), true);
  assert.equal(shouldDeferCompletionPayment({ paymentFlowVersion: 'explicit_v1', preSelectedPaymentType: 'card' }), false);
  assert.equal(shouldDeferCompletionPayment({ paymentFlowVersion: 'explicit_v1', requestPayload: { preSelectedPaymentType: 'card' } }), false);
  assert.equal(shouldDeferCompletionPayment({}), false);
  assert.equal(shouldDeferCompletionPayment({ paymentFlowVersion: 'explicit_v1', preSelectedPaymentType: 'card' }, { status: 'processing', deferredPaymentSelection: false }), false);
  assert.equal(shouldDeferCompletionPayment({ paymentFlowVersion: 'explicit_v1', preSelectedPaymentType: 'card' }, { deferredPaymentSelection: true }), true);
  assert.equal(shouldDeferCompletionPayment({ paymentFlowVersion: 'explicit_v1' }, { settlementData: { deferredPaymentSelection: true } }), true);
});

test('arrived cancellation travel fee credits helper wallet immediately even when no saved card is charged', async () => {
  const reqId = 'rq-arrived-cancel-1';
  const opId = serviceFinancialOperationId(reqId);
  const db = new MemoryDb({
    [`serviceRequests/${reqId}`]: {
      customerId: 'customer-arrived',
      status: 'arrived',
      helperAssignment: { helperId: 'helper-arrived' },
    },
    'users/customer-arrived': { uid: 'customer-arrived', wallet: { balance: 0, currency: 'ZAR' } },
    'users/helper-arrived': { uid: 'helper-arrived', wallet: { balance: 10, balanceMinor: 1000, currency: 'ZAR' } },
    'helperWallets/helper-arrived': { helperId: 'helper-arrived', balance: 10, balanceMinor: 1000, schemaVersion: 2, currency: 'ZAR' },
    [`financialOperations/${opId}`]: {
      operationId: opId,
      requestId: reqId,
      operationType: 'customer_cancellation',
      status: 'gateway_failed_confirmed',
      amount: 37,
      amountMinor: 3700,
      currency: 'ZAR',
      settlementData: {
        customerId: 'customer-arrived',
        helperId: 'helper-arrived',
        cancellation: {
          cancellationBillingRule: 'travel_fee_plus_booking_fee',
          helperPayoutBreakdown: { customerChargeAmount: 37, helperAmount: 35, platformAmount: 2 },
        },
        requestPatch: {
          status: 'canceled',
          canceledBy: 'customer',
          cancellationFeeAmount: 37,
          helperPayoutBreakdown: { customerChargeAmount: 37, helperAmount: 35, platformAmount: 2 },
        },
      },
    },
  });

  const settled = await settleServiceFinancialOperation({
    db, admin, operationRef: db.collection('financialOperations').doc(opId), requestRef: db.collection('serviceRequests').doc(reqId), outcome: 'failed_confirmed', now: 12_000,
  });
  assert.equal(settled.applied, true);
  assert.equal((await db.collection('users').doc('customer-arrived').get()).data().wallet.balance, -37);
  assert.equal((await db.collection('helperWallets').doc('helper-arrived').get()).data().balanceMinor, 4500);
  assert.equal((await db.collection('users').doc('helper-arrived').get()).data().wallet.balanceMinor, 4500);
});

test('Monday wallet payout skips zero and negative balances and keeps balance untouched if transfer is rejected or fails', async () => {
  const db = new MemoryDb({
    'helperWallets/helper-zero': { helperId: 'helper-zero', balanceMinor: 0, balance: 0, schemaVersion: 2, currency: 'ZAR' },
    'helperWeeklyPayouts/wallet_2026-W47_helper-zero': { id: 'wallet_2026-W47_helper-zero', helperId: 'helper-zero', weekKey: '2026-W47', walletAccountingVersion: 1, helperAmount: 0, status: 'unpaid', transferAttempts: 0 },
    'helperWallets/helper-neg': { helperId: 'helper-neg', balanceMinor: -1500, balance: -15, schemaVersion: 2, currency: 'ZAR' },
    'helperWeeklyPayouts/wallet_2026-W47_helper-neg': { id: 'wallet_2026-W47_helper-neg', helperId: 'helper-neg', weekKey: '2026-W47', walletAccountingVersion: 1, helperAmount: 0, status: 'unpaid', transferAttempts: 0 },
    'users/helper-neg': { uid: 'helper-neg', wallet: { balance: -15, balanceMinor: -1500, currency: 'ZAR' } },
    'helperWallets/helper-pos': { helperId: 'helper-pos', balanceMinor: 12345, balance: 123.45, schemaVersion: 2, currency: 'ZAR' },
    'users/helper-pos': { uid: 'helper-pos', wallet: { balance: 123.45, balanceMinor: 12345, currency: 'ZAR' } },
    'helperWeeklyPayouts/wallet_2026-W47_helper-pos': { id: 'wallet_2026-W47_helper-pos', helperId: 'helper-pos', weekKey: '2026-W47', walletAccountingVersion: 1, helperAmount: 123.45, status: 'unpaid', transferAttempts: 0 },
  });

  const zeroClaim = await claimPayoutTransfer({
    db, admin, payoutRef: db.collection('helperWeeklyPayouts').doc('wallet_2026-W47_helper-zero'),
    payoutId: 'wallet_2026-W47_helper-zero', helperId: 'helper-zero', weekKey: '2026-W47', runKey: 'run-1', amount: 0, recipientCode: '',
  });
  assert.equal(zeroClaim.action, 'no_wallet_balance');

  const negClaim = await claimPayoutTransfer({
    db, admin, payoutRef: db.collection('helperWeeklyPayouts').doc('wallet_2026-W47_helper-neg'),
    payoutId: 'wallet_2026-W47_helper-neg', helperId: 'helper-neg', weekKey: '2026-W47', runKey: 'run-1', amount: 0, recipientCode: '',
  });
  assert.equal(negClaim.action, 'no_wallet_balance');
  assert.equal((await db.collection('helperWallets').doc('helper-neg').get()).data().balanceMinor, -1500);

  // Positive balance claim does NOT reserve/deduct wallet upfront
  const posPayoutRef = db.collection('helperWeeklyPayouts').doc('wallet_2026-W47_helper-pos');
  const firstClaim = await claimPayoutTransfer({
    db, admin, payoutRef: posPayoutRef,
    payoutId: 'wallet_2026-W47_helper-pos', helperId: 'helper-pos', weekKey: '2026-W47', runKey: 'run-1', amount: 123.45, recipientCode: 'RCP_pos',
  });
  assert.equal(firstClaim.action, 'transfer');
  assert.equal(firstClaim.attempt.walletFundsReserved, false);
  assert.equal((await db.collection('helperWallets').doc('helper-pos').get()).data().balanceMinor, 12345);

  // If Paystack rejects or fails the transfer, balance stays untouched in wallet and status becomes 'unsuccessful'
  const failObs = await recordPayoutObservation({
    db, admin, payoutRef: posPayoutRef, transferAttemptRef: firstClaim.transferAttemptRef, referenceRef: firstClaim.referenceRef,
    reference: firstClaim.attempt.reference, outcome: 'failed_confirmed', transfer: { status: 'rejected', reference: firstClaim.attempt.reference, amount: 12345, currency: 'ZAR' },
  });
  assert.equal(failObs.updated, true);
  assert.equal((await posPayoutRef.get()).data().status, 'unsuccessful');
  assert.equal((await db.collection('helperWallets').doc('helper-pos').get()).data().balanceMinor, 12345);
  assert.equal((await db.collection('users').doc('helper-pos').get()).data().wallet.balanceMinor, 12345);

  // Next Monday run pays out the retained balance and confirmed success resets balance to 0
  const retryClaim = await claimPayoutTransfer({
    db, admin, payoutRef: posPayoutRef,
    payoutId: 'wallet_2026-W47_helper-pos', helperId: 'helper-pos', weekKey: '2026-W47', runKey: 'run-2', amount: 123.45, recipientCode: 'RCP_pos',
  });
  assert.equal(retryClaim.action, 'transfer');
  const successObs = await recordPayoutObservation({
    db, admin, payoutRef: posPayoutRef, transferAttemptRef: retryClaim.transferAttemptRef, referenceRef: retryClaim.referenceRef,
    reference: retryClaim.attempt.reference, outcome: 'success', transfer: { id: 'tr-1', status: 'success', reference: retryClaim.attempt.reference, amount: 12345, currency: 'ZAR' },
  });
  assert.equal(successObs.updated, true);
  assert.equal((await posPayoutRef.get()).data().status, 'paid');
  assert.equal((await db.collection('helperWallets').doc('helper-pos').get()).data().balanceMinor, 0);
  assert.equal((await db.collection('users').doc('helper-pos').get()).data().wallet.balanceMinor, 0);

  // If Paystack subsequently reverses a debited transfer, balance is restored to the wallet
  const reversedObs = await recordPayoutObservation({
    db, admin, payoutRef: posPayoutRef, transferAttemptRef: retryClaim.transferAttemptRef, referenceRef: retryClaim.referenceRef,
    reference: retryClaim.attempt.reference, outcome: 'reversed', transfer: { id: 'tr-1', status: 'reversed', reference: retryClaim.attempt.reference, amount: 12345, currency: 'ZAR' },
  });
  assert.equal(reversedObs.updated, true);
  assert.equal((await posPayoutRef.get()).data().status, 'unsuccessful');
  assert.equal((await db.collection('helperWallets').doc('helper-pos').get()).data().balanceMinor, 12345);
  assert.equal((await db.collection('users').doc('helper-pos').get()).data().wallet.balanceMinor, 12345);
});

test('settleCustomerWalletBalancePayment gates on Paystack verification outcome and credits customer wallet idempotently', async () => {
  const db = new MemoryDb({
    'users/cust-debt': { uid: 'cust-debt', wallet: { balance: -75, currency: 'ZAR' } },
    'paystackRequestPaymentReferences/wa_wallet_ref_1': {
      type: 'customer_wallet_settlement',
      customerId: 'cust-debt',
      amount: 75,
      amountMinor: 7500,
      status: 'processing',
    },
  });

  const pending = await settleCustomerWalletBalancePayment({
    db, admin, reference: 'wa_wallet_ref_1', customerId: 'cust-debt', amountMinor: 7500, verificationOutcome: 'pending',
  });
  const unknown = await settleCustomerWalletBalancePayment({
    db, admin, reference: 'wa_wallet_ref_1', customerId: 'cust-debt', amountMinor: 7500, verificationOutcome: 'unknown',
  });
  const failed = await settleCustomerWalletBalancePayment({
    db, admin, reference: 'wa_wallet_ref_1', customerId: 'cust-debt', amountMinor: 7500, verificationOutcome: 'failed_confirmed',
  });
  assert.equal(pending.action, 'pending');
  assert.equal(unknown.action, 'pending');
  assert.equal(failed.action, 'failed');
  assert.equal((await db.collection('users').doc('cust-debt').get()).data().wallet.balance, -75);

  const settled = await settleCustomerWalletBalancePayment({
    db, admin, reference: 'wa_wallet_ref_1', customerId: 'cust-debt', amountMinor: 7500, verificationOutcome: 'success', now: 5_000,
  });
  const replay = await settleCustomerWalletBalancePayment({
    db, admin, reference: 'wa_wallet_ref_1', customerId: 'cust-debt', amountMinor: 7500, verificationOutcome: 'success', now: 6_000,
  });
  assert.equal(settled.action, 'settled');
  assert.equal(settled.balanceAfter, 0);
  assert.equal(replay.action, 'already-settled');
  assert.equal((await db.collection('users').doc('cust-debt').get()).data().wallet.balance, 0);
  assert.equal((await db.collection('paystackRequestPaymentReferences').doc('wa_wallet_ref_1').get()).data().status, 'settled');
});

test('completion card failure records attemptedCardId into failedCardIds without duplicates', async () => {
  const reqId = 'rq-failed-card-1';
  const opId = serviceFinancialOperationId(reqId);
  const db = new MemoryDb({
    [`serviceRequests/${reqId}`]: {
      customerId: 'customer-card-fail',
      status: 'work_completed',
      preSelectedPaymentType: 'card',
      preSelectedCardId: 'card_1',
      failedCardIds: ['card_0'],
      helperAssignment: { helperId: 'helper-card-fail' },
    },
    'users/customer-card-fail': { uid: 'customer-card-fail', wallet: { balance: 0, currency: 'ZAR' } },
    'users/helper-card-fail': { uid: 'helper-card-fail', wallet: { balance: 0, balanceMinor: 0, currency: 'ZAR' } },
    'helperWallets/helper-card-fail': { helperId: 'helper-card-fail', balance: 0, balanceMinor: 0, schemaVersion: 2, currency: 'ZAR' },
    [`financialOperations/${opId}`]: {
      operationId: opId,
      requestId: reqId,
      operationType: 'completion',
      status: 'processing',
      amount: 150,
      amountMinor: 15000,
      currency: 'ZAR',
      settlementData: {
        customerId: 'customer-card-fail',
        helperId: 'helper-card-fail',
        attemptedCardId: 'card_1',
        helperPayoutBreakdown: { customerChargeAmount: 150, helperAmount: 112.5, platformAmount: 37.5 },
        requestPatch: { status: 'completed' },
      },
    },
  });

  const settled = await settleServiceFinancialOperation({
    db,
    admin,
    operationRef: db.collection('financialOperations').doc(opId),
    requestRef: db.collection('serviceRequests').doc(reqId),
    outcome: 'failed_confirmed',
    now: 25_000,
  });

  assert.equal(settled.applied, true);
  assert.equal(settled.paymentStatus, 'wallet_debt_recorded');
  const updatedReq = (await db.collection('serviceRequests').doc(reqId).get()).data();
  assert.deepEqual(updatedReq.failedCardIds, ['card_0', 'card_1']);
});

test('completion card charge forwards splitAllocation to Paystack and reverses recovered debt if transaction is reversed', async () => {
  const { resolvePaystackSplitAllocation } = require('./splitPaymentService');
  const { claimServiceFinancialOperation } = require('./financialOperationService');
  const reqId = 'rq-split-op-1';
  const opId = serviceFinancialOperationId(reqId);
  const splitAllocation = resolvePaystackSplitAllocation({
    helperId: 'helper-op-1',
    payoutProfile: { verificationStatus: 'verified', subaccountCode: 'ACCT_op1' },
    helperWalletBalanceMinor: -2500,
    helperAmountMinor: 7500,
    platformAmountMinor: 2500,
    customerChargeAmountMinor: 10000,
  });

  const db = new MemoryDb({
    [`serviceRequests/${reqId}`]: {
      customerId: 'customer-op-1',
      status: 'work_completed',
      helperAssignment: { helperId: 'helper-op-1' },
    },
    'users/customer-op-1': { uid: 'customer-op-1', wallet: { balance: 0, currency: 'ZAR' } },
    'users/helper-op-1': { uid: 'helper-op-1', wallet: { balance: -25, balanceMinor: -2500, currency: 'ZAR' } },
    'helperWallets/helper-op-1': { helperId: 'helper-op-1', balance: -25, balanceMinor: -2500, schemaVersion: 2, currency: 'ZAR' },
  });

  const claim = await claimServiceFinancialOperation({
    db,
    requestRef: db.collection('serviceRequests').doc(reqId),
    requestId: reqId,
    operationType: 'completion',
    amount: 100,
    splitAllocation,
    settlementData: {
      customerId: 'customer-op-1',
      helperId: 'helper-op-1',
      helperPayoutBreakdown: { customerChargeAmount: 100, helperAmount: 75, platformAmount: 25 },
      requestPatch: { status: 'completed' },
    },
    now: 5_000,
  });

  assert.equal(claim.action, 'charge');
  assert.equal(claim.operation.splitAllocation.mode, 'paystack_split_with_debt_recovery');

  let receivedSplitAllocation = null;
  const chargeOutcome = await executeServiceChargeAttempt({
    operation: claim.operation,
    action: 'charge',
    email: 'customer@uncedo.test',
    authorizationCode: 'AUTH_test',
    paystack: {
      async chargeAuthorization(input) {
        receivedSplitAllocation = input.splitAllocation;
        return { attempted: true, ok: true, transactionId: 'tx-split-op', reference: input.reference, gatewayStatus: 'success' };
      },
      async verifyTransaction() {
        return { outcome: 'success', transaction: { id: 'tx-split-op', status: 'success' } };
      },
    },
  });
  assert.equal(chargeOutcome.outcome, 'success');
  assert.equal(receivedSplitAllocation.subaccountCode, 'ACCT_op1');
  assert.equal(receivedSplitAllocation.transactionChargeMinor, 5000); // R25 platform + R25 debt

  const settled = await settleServiceFinancialOperation({
    db,
    admin,
    operationRef: claim.operationRef,
    requestRef: db.collection('serviceRequests').doc(reqId),
    outcome: 'success',
    transactionId: 'tx-split-op',
    now: 6_000,
  });
  assert.equal(settled.applied, true);
  assert.equal((await db.collection('helperWallets').doc('helper-op-1').get()).data().balanceMinor, 0);
  assert.equal((await db.collection('serviceRequests').doc(reqId).get()).data().paymentSettlementMode, 'paystack_split_with_debt_recovery');

  // Reversal restores the -R25 debt on helper wallet and moves customer to wallet_debt_recorded
  const reversed = await settleServiceFinancialOperation({
    db,
    admin,
    operationRef: claim.operationRef,
    requestRef: db.collection('serviceRequests').doc(reqId),
    outcome: 'reversed',
    transactionId: 'tx-split-op',
    now: 7_000,
  });
  assert.equal(reversed.applied, true);
  assert.equal((await db.collection('helperWallets').doc('helper-op-1').get()).data().balanceMinor, -2500);
  assert.equal((await db.collection('users').doc('customer-op-1').get()).data().wallet.balance, -100);
});




