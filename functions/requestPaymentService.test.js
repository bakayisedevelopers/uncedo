'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const {
  beginServicePaymentAttempt,
  cancelCashPaymentSelection,
  createPaymentToken,
  createServicePaymentSession,
  paymentStateForRequest,
  reportCashPayment,
  resolveServicePaymentSession,
  settleRequestPayment,
} = require('./requestPaymentService');
const {
  serviceFinancialOperationId,
  settleServiceFinancialOperation,
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

const admin = { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } };

const financialOperationId = `service_${createHash('sha256').update('rq_123456').digest('hex').slice(0, 40)}`;

test('payment tokens are high entropy, URL-safe and never returned as stored document IDs', () => {
  const one = createPaymentToken();
  const two = createPaymentToken();
  assert.match(one.token, /^[A-Za-z0-9_-]{40,64}$/);
  assert.notEqual(one.token, two.token);
  assert.match(one.tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(one.tokenHash, one.token);
});

test('cash attempt prevents a competing card attempt while selected or awaiting helper confirmation', async () => {
  const db = new MemoryDb({
    'serviceRequests/rq_123456': { customerId: 'customer-1', status: 'completed', totalAmount: 100 },
    'servicePaymentSessions/hash': { requestId: 'rq_123456', customerId: 'customer-1', sessionId: 'hash', status: 'active', expiresAtMs: 100_000 },
  });
  const sessionRef = db.collection('servicePaymentSessions').doc('hash');
  const session = (await sessionRef.get()).data();
  const cash = await beginServicePaymentAttempt({ db, admin, sessionRef, session, method: 'cash', idempotencyKey: 'cash-1', now: 1 });
  assert.equal(cash.action, 'created');
  const card = await beginServicePaymentAttempt({ db, admin, sessionRef, session, method: 'paystack_checkout', idempotencyKey: 'card-1', now: 2 });
  assert.equal(card.action, 'conflict');
  assert.equal(paymentStateForRequest({}, { status: 'cash_selected' }), 'cash_selected');
});

test('cash report is idempotent and a different helper cannot settle it', async () => {
  const db = new MemoryDb({
    'serviceRequests/rq_123456': { customerId: 'customer-1', status: 'completed', helperAssignment: { helperId: 'helper-1' } },
    'servicePaymentOperations/rq_123456': { status: 'cash_selected', activeAttemptId: 'attempt-1' },
    'servicePaymentOperations/rq_123456/attempts/attempt-1': { method: 'cash', status: 'cash_selected', customerId: 'customer-1', amount: 100 },
  });
  const first = await reportCashPayment({ db, admin, requestId: 'rq_123456', customerId: 'customer-1', attemptId: 'attempt-1', now: 10 });
  const replay = await reportCashPayment({ db, admin, requestId: 'rq_123456', customerId: 'customer-1', attemptId: 'attempt-1', now: 11 });
  assert.equal(first.action, 'reported');
  assert.equal(replay.action, 'already-reported');
  const wrongHelper = await settleRequestPayment({ db, admin, requestId: 'rq_123456', attemptId: 'attempt-1', outcome: 'success', helperId: 'helper-2' });
  assert.equal(wrongHelper.action, 'not-assigned-helper');
  assert.notEqual((await db.collection('serviceRequests').doc('rq_123456').get()).data().paymentStatus, 'paid');
});

test('an unreported cash choice can be cancelled before the customer reports payment', async () => {
  const db = new MemoryDb({
    'serviceRequests/rq_123456': { customerId: 'customer-1', status: 'completed', paymentStatus: 'cash_selected' },
    'servicePaymentOperations/rq_123456': { status: 'cash_selected', activeAttemptId: 'attempt-1' },
    'servicePaymentOperations/rq_123456/attempts/attempt-1': { method: 'cash', status: 'cash_selected' },
  });
  const cancelled = await cancelCashPaymentSelection({ db, admin, requestId: 'rq_123456', customerId: 'customer-1', attemptId: 'attempt-1', now: 20 });
  assert.equal(cancelled.action, 'cancelled');
  const operation = (await db.collection('servicePaymentOperations').doc('rq_123456').get()).data();
  assert.equal(operation.status, 'unpaid');
  assert.equal(operation.activeAttemptId, null);
  assert.equal((await db.collection('servicePaymentOperations').doc('rq_123456').collection('attempts').doc('attempt-1').get()).data().status, 'cancelled_by_customer');
});

test('concurrent helper confirmations settle once, reconcile legacy debt, add helper payout, and deduct platform commission atomically', async () => {
  const db = new MemoryDb({
    'serviceRequests/rq_123456': {
      customerId: 'customer-1', status: 'completed', paymentStatus: 'awaiting_cash_confirmation', totalAmount: 100,
      helperAssignment: { helperId: 'helper-1' }, helperPayoutBreakdown: { platformAmount: 15, helperAmount: 85 },
    },
    'servicePaymentOperations/rq_123456': { status: 'awaiting_cash_confirmation', activeAttemptId: 'attempt-1' },
    'servicePaymentOperations/rq_123456/attempts/attempt-1': { method: 'cash', status: 'awaiting_cash_confirmation', amount: 100, customerId: 'customer-1' },
    [`financialOperations/${financialOperationId}`]: { operationId: financialOperationId, operationType: 'completion', status: 'settled_failed', amount: 100, amountMinor: 10000, debtApplied: true, walletDebtOutstanding: true, settlementTransitionCount: 1 },
    'users/customer-1': { wallet: { balance: -100, currency: 'ZAR' } },
    'users/helper-1': { uid: 'helper-1', wallet: { balance: 0, balanceMinor: 0, currency: 'ZAR' } },
  });
  const settle = () => settleRequestPayment({ db, admin, requestId: 'rq_123456', attemptId: 'attempt-1', outcome: 'success', helperId: 'helper-1', providerStatus: 'helper_confirmed' });
  const results = await Promise.all([settle(), settle(), settle(), settle(), settle()]);
  assert.equal(results.filter((result) => result.action === 'settled').length, 1);
  assert.equal(results.filter((result) => result.action === 'already-paid').length, 4);
  const request = (await db.collection('serviceRequests').doc('rq_123456').get()).data();
  const legacy = (await db.collection('financialOperations').doc(financialOperationId).get()).data();
  const payment = (await db.collection('servicePaymentOperations').doc('rq_123456').get()).data();
  const customer = (await db.collection('users').doc('customer-1').get()).data();
  const helperWallet = (await db.collection('helperWallets').doc('helper-1').get()).data();
  const helperUser = (await db.collection('users').doc('helper-1').get()).data();
  assert.equal(request.paymentStatus, 'paid');
  assert.equal(request.cashPayment.status, 'helper_confirmed');
  assert.equal(request.cashPayment.commissionStatus, 'settled');
  assert.equal(request.cashPayment.netWalletDeltaMinor, 7000);
  assert.equal(request.cashPayment.walletBalanceAfterMinor, 7000);
  assert.equal(legacy.status, 'settled_success');
  assert.equal(legacy.finalOutcomeSource, 'request_payment');
  assert.equal(legacy.walletDebtOutstanding, false);
  assert.equal(payment.status, 'paid');
  assert.equal(customer.wallet.balance, 0);
  assert.equal(helperWallet.balanceMinor, 7000);
  assert.equal(helperWallet.balance, 70);
  assert.equal(helperUser.wallet.balanceMinor, 7000);
  assert.equal(helperUser.wallet.balance, 70);
  const reversals = [...db.records.entries()].filter(([path, value]) => path.startsWith('financialLedger/') && value.entryType === 'service_charge_debt_reversal');
  const paymentEntries = [...db.records.entries()].filter(([path, value]) => path.startsWith('financialLedger/') && value.entryType === 'direct_cash_payment');
  const policyReviews = [...db.records.entries()].filter(([path]) => path.startsWith('financialPolicyReviews/'));
  assert.equal(reversals.length, 1);
  assert.equal(paymentEntries.length, 1);
  assert.equal(policyReviews.length, 0);
});

test('cash settlement adds helper payout and deducts commission once on single wallet balance', async () => {
  const db = new MemoryDb({
    'serviceRequests/rq_123456': {
      customerId: 'customer-1', status: 'completed', paymentStatus: 'awaiting_cash_confirmation', totalAmount: 100,
      helperAssignment: { helperId: 'helper-1' }, helperPayoutBreakdown: { platformAmount: 15, helperAmount: 85 },
    },
    'servicePaymentOperations/rq_123456': { status: 'awaiting_cash_confirmation', activeAttemptId: 'attempt-1' },
    'servicePaymentOperations/rq_123456/attempts/attempt-1': { method: 'cash', status: 'awaiting_cash_confirmation', amount: 100, customerId: 'customer-1' },
    'helperWallets/helper-1': { helperId: 'helper-1', balanceMinor: 1000, balance: 10, schemaVersion: 2, currency: 'ZAR' },
    'users/helper-1': { uid: 'helper-1', wallet: { balance: 10, balanceMinor: 1000, currency: 'ZAR' } },
  });
  const settle = () => settleRequestPayment({
    db, admin, requestId: 'rq_123456', attemptId: 'attempt-1', outcome: 'success', helperId: 'helper-1',
  });
  const results = await Promise.all([settle(), settle(), settle(), settle(), settle()]);
  assert.equal(results.filter((result) => result.action === 'settled').length, 1);
  assert.equal(results.filter((result) => result.action === 'already-paid').length, 4);
  const wallet = (await db.collection('helperWallets').doc('helper-1').get()).data();
  const helperUser = (await db.collection('users').doc('helper-1').get()).data();
  assert.equal(wallet.balanceMinor, 8000);
  assert.equal(wallet.balance, 80);
  assert.equal(helperUser.wallet.balanceMinor, 8000);
  assert.equal(helperUser.wallet.balance, 80);
  const obligationPaths = [...db.records.keys()].filter((path) => path.startsWith('helperWallets/helper-1/commissionObligations/'));
  const earningEntries = [...db.records.entries()].filter(([path, entry]) => path.startsWith('helperWallets/helper-1/transactions/') && entry.entryType === 'job_earning_credit');
  const commissionEntries = [...db.records.entries()].filter(([path, entry]) => path.startsWith('helperWallets/helper-1/transactions/') && entry.entryType === 'cash_commission_assessed');
  assert.equal(obligationPaths.length, 0);
  assert.equal(earningEntries.length, 1);
  assert.equal(earningEntries[0][1].deltaMinor, 8500);
  assert.equal(commissionEntries.length, 1);
  assert.equal(commissionEntries[0][1].deltaMinor, -1500);
  const request = (await db.collection('serviceRequests').doc('rq_123456').get()).data();
  assert.equal(request.cashPayment.commissionStatus, 'settled');
  assert.equal(request.cashPayment.commissionMinor, 1500);
  assert.equal(request.cashPayment.helperAmountMinor, 8500);
  assert.equal(request.cashPayment.netWalletDeltaMinor, 7000);
  assert.equal(request.cashPayment.walletBalanceAfterMinor, 8000);
  assert.equal([...db.records.values()].filter((entry) => entry.type === 'direct_cash_platform_commission').length, 0);
});

test('cash settlement marks negative_balance if wallet balance stays below zero after payout credit and commission deduction', async () => {
  const db = new MemoryDb({
    'serviceRequests/rq_123456': {
      customerId: 'customer-1', status: 'completed', totalAmount: 100,
      helperAssignment: { helperId: 'helper-1' }, helperPayoutBreakdown: { platformAmount: 15, helperAmount: 85 },
    },
    'servicePaymentOperations/rq_123456': { status: 'awaiting_cash_confirmation', activeAttemptId: 'attempt-1' },
    'servicePaymentOperations/rq_123456/attempts/attempt-1': { method: 'cash', status: 'awaiting_cash_confirmation', amount: 100, customerId: 'customer-1' },
    'helperWallets/helper-1': { helperId: 'helper-1', balanceMinor: -8000, balance: -80, schemaVersion: 2, currency: 'ZAR' },
    'users/helper-1': { uid: 'helper-1', wallet: { balance: -80, balanceMinor: -8000, currency: 'ZAR' } },
  });
  const result = await settleRequestPayment({
    db, admin, requestId: 'rq_123456', attemptId: 'attempt-1', outcome: 'success', helperId: 'helper-1',
  });
  assert.equal(result.action, 'settled');
  const wallet = (await db.collection('helperWallets').doc('helper-1').get()).data();
  const helperUser = (await db.collection('users').doc('helper-1').get()).data();
  const request = (await db.collection('serviceRequests').doc('rq_123456').get()).data();
  assert.equal(wallet.balanceMinor, -1000);
  assert.equal(wallet.balance, -10);
  assert.equal(helperUser.wallet.balanceMinor, -1000);
  assert.equal(request.cashPayment.commissionStatus, 'negative_balance');
  assert.equal([...db.records.values()].filter((entry) => entry.entryType === 'job_earning_credit').length, 1);
  assert.equal([...db.records.values()].filter((entry) => entry.entryType === 'cash_commission_assessed').length, 1);
  assert.equal([...db.records.keys()].filter((path) => path.includes('/commissionObligations/')).length, 0);
});

test('concurrent verified Paystack callbacks create one settlement and one canonical completion outcome', async () => {
  const db = new MemoryDb({
    'serviceRequests/rq_123456': { customerId: 'customer-1', status: 'completed', paymentStatus: 'payment_processing', totalAmount: 72.5, helperAssignment: { helperId: 'helper-1' } },
    'servicePaymentOperations/rq_123456': { status: 'payment_processing', activeAttemptId: 'attempt-card' },
    'servicePaymentOperations/rq_123456/attempts/attempt-card': { method: 'paystack_checkout', status: 'processing', amount: 72.5, amountMinor: 7250, customerId: 'customer-1', gatewayReference: 'ref-1' },
  });
  const settle = () => settleRequestPayment({ db, admin, requestId: 'rq_123456', attemptId: 'attempt-card', outcome: 'success', gatewayReference: 'ref-1', gatewayTransactionId: 'tx-1', providerStatus: 'success' });
  const results = await Promise.all([settle(), settle(), settle(), settle(), settle()]);
  assert.equal(results.filter((result) => result.action === 'settled').length, 1);
  assert.equal(results.filter((result) => result.action === 'already-paid').length, 4);
  const request = (await db.collection('serviceRequests').doc('rq_123456').get()).data();
  const operation = (await db.collection('financialOperations').doc(financialOperationId).get()).data();
  const ledger = [...db.records.entries()].filter(([path]) => path.startsWith('financialLedger/'));
  assert.equal(request.paymentStatus, 'paid');
  assert.equal(request.paymentTransactionId, 'tx-1');
  assert.equal(operation.status, 'settled_success');
  assert.equal(operation.amountMinor, 7250);
  assert.equal(ledger.length, 1);
});

test('unknown Paystack outcomes stay pending and block another method', async () => {
  const db = new MemoryDb({
    'serviceRequests/rq_123456': { customerId: 'customer-1', status: 'completed', totalAmount: 30 },
    'servicePaymentOperations/rq_123456': { status: 'payment_processing', activeAttemptId: 'attempt-unknown' },
    'servicePaymentOperations/rq_123456/attempts/attempt-unknown': { method: 'paystack_checkout', status: 'processing', amount: 30, amountMinor: 3000 },
    'servicePaymentSessions/session': { requestId: 'rq_123456', customerId: 'customer-1', sessionId: 'session', status: 'active', expiresAtMs: Date.now() + 100_000 },
  });
  const held = await settleRequestPayment({ db, admin, requestId: 'rq_123456', attemptId: 'attempt-unknown', outcome: 'unknown', gatewayReference: 'uncertain-ref', providerStatus: 'unknown' });
  assert.equal(held.action, 'pending');
  const sessionRef = db.collection('servicePaymentSessions').doc('session');
  const session = (await sessionRef.get()).data();
  const conflicting = await beginServicePaymentAttempt({ db, admin, sessionRef, session, method: 'cash', idempotencyKey: 'new-cash' });
  assert.equal(conflicting.action, 'conflict');
  assert.equal((await db.collection('serviceRequests').doc('rq_123456').get()).data().paymentStatus, 'payment_reconciliation_required');
});

test('session resolves to the current server amount and cannot outlive its expiration', async () => {
  const db = new MemoryDb({
    'serviceRequests/rq_123456': { customerId: 'customer-1', status: 'completed', pricingSnapshot: { cashChargeAmount: 91.25 } },
  });
  const created = await createServicePaymentSession({ db, requestId: 'rq_123456', customerId: 'customer-1', principalId: 'customer-1', now: 1_000, expiresInMs: 60_000 });
  assert.equal(created.code, 'created');
  const resolved = await resolveServicePaymentSession({ db, token: created.token, now: 1_001 });
  assert.equal(resolved.code, 'available');
  assert.equal(resolved.amount, 91.25);
  assert.equal((await resolveServicePaymentSession({ db, token: created.token, now: created.expiresAtMs + 1 })).code, 'expired');
});

test('canceled requests with cancellation fees allow card payments only and block cash', async () => {
  const db = new MemoryDb({
    'serviceRequests/rq_cancel_fee': {
      customerId: 'guest_whatsapp_1',
      status: 'canceled',
      cancellationFeeAmount: 55,
      paymentStatus: 'wallet_debt_recorded',
    },
    'users/guest_whatsapp_1': { uid: 'guest_whatsapp_1', isGuest: true, wallet: { balance: -55, currency: 'ZAR' } },
  });
  const created = await createServicePaymentSession({
    db,
    requestId: 'rq_cancel_fee',
    customerId: 'guest_whatsapp_1',
    principalId: 'guest_whatsapp_1',
    principalType: 'whatsapp_guest',
    now: 1_000,
    expiresInMs: 12 * 60 * 60 * 1000,
  });
  assert.equal(created.code, 'created');
  assert.equal(created.amount, 55);
  assert.equal(created.expiresAtMs, 1_000 + 12 * 60 * 60 * 1000);

  const resolved = await resolveServicePaymentSession({ db, token: created.token, now: 2_000 });
  assert.equal(resolved.code, 'available');
  assert.equal(resolved.paymentStatus, 'wallet_debt_recorded');

  const cashBlocked = await beginServicePaymentAttempt({
    db,
    admin,
    sessionRef: resolved.sessionRef,
    session: resolved.session,
    method: 'cash',
    idempotencyKey: 'cash-try',
    now: 2_001,
  });
  assert.equal(cashBlocked.action, 'method-not-allowed');

  const cardBegun = await beginServicePaymentAttempt({
    db,
    admin,
    sessionRef: resolved.sessionRef,
    session: resolved.session,
    method: 'paystack_checkout',
    idempotencyKey: 'card-try',
    now: 2_002,
  });
  assert.equal(cardBegun.action, 'created');
  assert.equal(cardBegun.attempt.amount, 55);
});

test('explicit payment failure deducts guest wallet once and card retry settlement reverses the debt cleanly', async () => {
  const reqId = 'rq_guest_fail';
  const legacyOpId = `service_${createHash('sha256').update(reqId).digest('hex').slice(0, 40)}`;
  const db = new MemoryDb({
    [`serviceRequests/${reqId}`]: { customerId: 'guest_999', status: 'completed', paymentStatus: 'unpaid', totalAmount: 220 },
    [`servicePaymentOperations/${reqId}`]: { status: 'payment_processing', activeAttemptId: 'attempt-fail-1' },
    [`servicePaymentOperations/${reqId}/attempts/attempt-fail-1`]: { method: 'paystack_checkout', status: 'processing', amount: 220, amountMinor: 22000, customerId: 'guest_999' },
    [`financialOperations/${legacyOpId}`]: { operationId: legacyOpId, operationType: 'completion', status: 'settled_no_charge', finalOutcome: 'no_charge', paymentStatus: 'unpaid', amount: 220, amountMinor: 22000, debtApplied: false, walletDebtOutstanding: false },
  });

  const failedFirst = await settleRequestPayment({
    db,
    admin,
    requestId: reqId,
    attemptId: 'attempt-fail-1',
    outcome: 'failed_confirmed',
    gatewayReference: 'ref-fail-1',
    providerStatus: 'failed',
    now: 5_000,
  });
  assert.equal(failedFirst.action, 'failed');
  assert.equal(failedFirst.failureState, 'wallet_debt_recorded');
  assert.equal(failedFirst.walletDebtApplied, true);
  assert.equal(failedFirst.walletDebtOutstanding, true);

  const guestUserAfterFail = (await db.collection('users').doc('guest_999').get()).data();
  assert.equal(guestUserAfterFail.isGuest, true);
  assert.equal(guestUserAfterFail.wallet.balance, -220);

  // Second explicit attempt fails again -> must NOT double-deduct wallet
  const sessionCreated = await createServicePaymentSession({
    db,
    requestId: reqId,
    customerId: 'guest_999',
    principalId: 'guest_999',
    principalType: 'whatsapp_guest',
    now: 6_000,
  });
  assert.equal(sessionCreated.code, 'created');
  const sessionResolved = await resolveServicePaymentSession({ db, token: sessionCreated.token, now: 6_001 });
  const retryBegun = await beginServicePaymentAttempt({
    db,
    admin,
    sessionRef: sessionResolved.sessionRef,
    session: sessionResolved.session,
    method: 'paystack_checkout',
    idempotencyKey: 'retry-fail-2',
    now: 6_002,
  });
  await db.collection('servicePaymentOperations').doc(reqId).collection('attempts').doc(retryBegun.attempt.attemptId).get();
  // Move attempt to processing via MemoryDb set
  await db.runTransaction(async (tx) => {
    tx.set(db.collection('servicePaymentOperations').doc(reqId).collection('attempts').doc(retryBegun.attempt.attemptId), { status: 'processing' }, { merge: true });
  });
  const failedSecond = await settleRequestPayment({
    db,
    admin,
    requestId: reqId,
    attemptId: retryBegun.attempt.attemptId,
    outcome: 'failed_confirmed',
    gatewayReference: 'ref-fail-2',
    providerStatus: 'failed',
    now: 7_000,
  });
  assert.equal(failedSecond.walletDebtApplied, false);
  assert.equal((await db.collection('users').doc('guest_999').get()).data().wallet.balance, -220);

  // Third attempt succeeds -> wallet debt is reversed back to 0
  const successBegun = await beginServicePaymentAttempt({
    db,
    admin,
    sessionRef: sessionResolved.sessionRef,
    session: sessionResolved.session,
    method: 'paystack_checkout',
    idempotencyKey: 'retry-success-3',
    now: 8_000,
  });
  await db.runTransaction(async (tx) => {
    tx.set(db.collection('servicePaymentOperations').doc(reqId).collection('attempts').doc(successBegun.attempt.attemptId), { status: 'processing' }, { merge: true });
  });
  const succeeded = await settleRequestPayment({
    db,
    admin,
    requestId: reqId,
    attemptId: successBegun.attempt.attemptId,
    outcome: 'success',
    gatewayReference: 'ref-success-3',
    gatewayTransactionId: 'tx-3',
    providerStatus: 'success',
    now: 9_000,
  });
  assert.equal(succeeded.action, 'settled');
  assert.equal(succeeded.debtReversed, true);
  assert.equal((await db.collection('users').doc('guest_999').get()).data().wallet.balance, 0);
  const debtEntries = [...db.records.entries()].filter(([path, val]) => path.startsWith('financialLedger/') && val.entryType === 'service_charge_debt');
  const reversalEntries = [...db.records.entries()].filter(([path, val]) => path.startsWith('financialLedger/') && val.entryType === 'service_charge_debt_reversal');
  assert.equal(debtEntries.length, 1);
  assert.equal(reversalEntries.length, 1);
});

test('cancellation settlement aligns statusDetail with wallet_debt_recorded and transferred guest debt reverses on linked account', async () => {
  const reqId = 'rq_guest_cancel_linked';
  const opId = serviceFinancialOperationId(reqId);
  const db = new MemoryDb({
    [`serviceRequests/${reqId}`]: {
      customerId: 'guest_linked_1',
      status: 'canceled',
      canceledFromStatus: 'arrived',
      cancellationFeeAmount: 95,
    },
    [`financialOperations/${opId}`]: {
      operationId: opId,
      requestId: reqId,
      operationType: 'customer_cancellation',
      status: 'gateway_failed_confirmed',
      amount: 95,
      amountMinor: 9500,
      currency: 'ZAR',
      settlementTransitionCount: 0,
      settlementData: {
        customerId: 'guest_linked_1',
        requestPatch: {
          status: 'canceled',
          canceledBy: 'customer',
          cancellationFeeAmount: 95,
        },
      },
    },
  });

  const settledFail = await settleServiceFinancialOperation({
    db,
    admin,
    operationRef: db.collection('financialOperations').doc(opId),
    requestRef: db.collection('serviceRequests').doc(reqId),
    outcome: 'failed_confirmed',
    now: 10_000,
  });
  assert.equal(settledFail.applied, true);
  assert.equal(settledFail.paymentStatus, 'wallet_debt_recorded');
  const requestAfterFail = (await db.collection('serviceRequests').doc(reqId).get()).data();
  assert.match(requestAfterFail.statusDetail, /No saved card was charged/i);
  assert.doesNotMatch(requestAfterFail.statusDetail, /Cancellation fee charged/i);
  assert.equal((await db.collection('users').doc('guest_linked_1').get()).data().wallet.balance, -95);

  // Simulate commitWhatsAppIdentityLink consolidating the guest wallet debt onto the linked Firebase account
  await db.runTransaction(async (tx) => {
    tx.set(db.collection('users').doc('guest_linked_1'), { debtTransferredToUid: 'firebase_uid_1', wallet: { balance: 0, currency: 'ZAR' } }, { merge: true });
    tx.set(db.collection('users').doc('firebase_uid_1'), { uid: 'firebase_uid_1', wallet: { balance: -95, currency: 'ZAR' } }, { merge: true });
    tx.set(db.collection('servicePaymentOperations').doc(reqId), { status: 'payment_processing', activeAttemptId: 'attempt-card-1' }, { merge: true });
    tx.create(db.collection('servicePaymentOperations').doc(reqId).collection('attempts').doc('attempt-card-1'), {
      method: 'paystack_checkout',
      status: 'processing',
      amount: 95,
      amountMinor: 9500,
      customerId: 'guest_linked_1',
    });
  });

  const paid = await settleRequestPayment({
    db,
    admin,
    requestId: reqId,
    attemptId: 'attempt-card-1',
    outcome: 'success',
    gatewayReference: 'ref-cancel-paid',
    gatewayTransactionId: 'tx-cancel-paid',
    providerStatus: 'success',
    now: 20_000,
  });

  assert.equal(paid.action, 'settled');
  assert.equal(paid.debtReversed, true);
  assert.equal((await db.collection('users').doc('firebase_uid_1').get()).data().wallet.balance, 0);
  const reversal = [...db.records.values()].find((entry) => entry.entryType === 'service_charge_debt_reversal');
  assert.equal(reversal.userId, 'firebase_uid_1');
});

test('non-cash card completion credits helperAmount to the helper wallet and mirrors users/{id}.wallet', async () => {
  const reqId = 'rq_card_payout_1';
  const db = new MemoryDb({
    [`serviceRequests/${reqId}`]: {
      customerId: 'customer-1',
      status: 'completed',
      paymentStatus: 'payment_processing',
      totalAmount: 101,
      helperAssignment: { helperId: 'helper-1' },
      helperPayoutBreakdown: { customerChargeAmount: 101, helperAmount: 80, platformAmount: 21 },
    },
    [`servicePaymentOperations/${reqId}`]: { status: 'payment_processing', activeAttemptId: 'attempt-card' },
    [`servicePaymentOperations/${reqId}/attempts/attempt-card`]: { method: 'paystack_checkout', status: 'processing', amount: 101, amountMinor: 10100, customerId: 'customer-1', gatewayReference: 'ref-card-1' },
    'users/helper-1': { uid: 'helper-1', wallet: { balance: -15, balanceMinor: -1500, currency: 'ZAR' } },
    'helperWallets/helper-1': { helperId: 'helper-1', balanceMinor: -1500, balance: -15, schemaVersion: 2, currency: 'ZAR' },
  });

  const settled = await settleRequestPayment({
    db, admin, requestId: reqId, attemptId: 'attempt-card', outcome: 'success', gatewayReference: 'ref-card-1', gatewayTransactionId: 'tx-card-1', providerStatus: 'success', now: 12_000,
  });
  assert.equal(settled.action, 'settled');
  const wallet = (await db.collection('helperWallets').doc('helper-1').get()).data();
  const helperUser = (await db.collection('users').doc('helper-1').get()).data();
  assert.equal(wallet.balanceMinor, 6500);
  assert.equal(wallet.balance, 65);
  assert.equal(helperUser.wallet.balanceMinor, 6500);
  assert.equal(helperUser.wallet.balance, 65);
});

test('paid driving cancellation credits travelledKm * 4 helperAmount atomically without double-crediting', async () => {
  const reqId = 'rq_cancel_driving_1';
  const opId = serviceFinancialOperationId(reqId);
  const db = new MemoryDb({
    [`serviceRequests/${reqId}`]: {
      customerId: 'customer-2',
      status: 'driving',
      helperAssignment: { helperId: 'helper-2' },
    },
    'users/helper-2': { uid: 'helper-2', wallet: { balance: 0, balanceMinor: 0, currency: 'ZAR' } },
    [`financialOperations/${opId}`]: {
      operationId: opId,
      requestId: reqId,
      operationType: 'customer_cancellation',
      status: 'processing',
      amount: 25,
      amountMinor: 2500,
      currency: 'ZAR',
      settlementTransitionCount: 0,
      settlementData: {
        customerId: 'customer-2',
        helperId: 'helper-2',
        cancellation: {
          stage: 'driving',
          travelledDistanceKm: 6,
          travelledFee: 24,
          bookingFee: 1,
          feeAmount: 25,
          helperPayoutBreakdown: {
            customerChargeAmount: 25,
            helperAmount: 24,
            platformAmount: 1,
          },
        },
        requestPatch: {
          status: 'canceled',
          canceledBy: 'customer',
          cancellationFeeAmount: 25,
          helperPayoutBreakdown: {
            customerChargeAmount: 25,
            helperAmount: 24,
            platformAmount: 1,
          },
        },
      },
    },
  });

  const first = await settleServiceFinancialOperation({
    db, admin, operationRef: db.collection('financialOperations').doc(opId), requestRef: db.collection('serviceRequests').doc(reqId), outcome: 'success', transactionId: 'tx-cancel-driving', now: 15_000,
  });
  const replay = await settleServiceFinancialOperation({
    db, admin, operationRef: db.collection('financialOperations').doc(opId), requestRef: db.collection('serviceRequests').doc(reqId), outcome: 'success', transactionId: 'tx-cancel-driving', now: 16_000,
  });
  assert.equal(first.applied, true);
  assert.equal(replay.duplicate, true);
  const wallet = (await db.collection('helperWallets').doc('helper-2').get()).data();
  const helperUser = (await db.collection('users').doc('helper-2').get()).data();
  assert.equal(wallet.balanceMinor, 2400);
  assert.equal(wallet.balance, 24);
  assert.equal(helperUser.wallet.balanceMinor, 2400);
  assert.equal(helperUser.wallet.balance, 24);
});

test('cash settlement with reward-point discount adds helper payout and deducts platform commission', async () => {
  // Total = R200 (helper share R158.75, platform share R41.25).
  // Customer applies R20 service credit and pays R180 cash to helper.
  // Net helper delta adds +158.75 helper payout and subtracts -41.25 platform commission = +117.50 (+11750 minor).
  const db = new MemoryDb({
    'serviceRequests/rq_cash_discount': {
      customerId: 'customer-1',
      status: 'completed',
      paymentStatus: 'awaiting_cash_confirmation',
      totalAmount: 200,
      helperAssignment: { helperId: 'helper-1' },
      helperPayoutBreakdown: {
        customerChargeAmount: 200,
        helperAmount: 158.75,
        platformAmount: 41.25,
      },
    },
    'servicePaymentOperations/rq_cash_discount': { status: 'awaiting_cash_confirmation', activeAttemptId: 'attempt-cash-discount' },
    'servicePaymentOperations/rq_cash_discount/attempts/attempt-cash-discount': {
      method: 'cash',
      status: 'awaiting_cash_confirmation',
      amount: 180,
      amountMinor: 18000,
      customerId: 'customer-1',
    },
    'helperWallets/helper-1': { helperId: 'helper-1', balanceMinor: 5000, balance: 50, schemaVersion: 2, currency: 'ZAR' },
    'users/helper-1': { uid: 'helper-1', wallet: { balance: 50, balanceMinor: 5000, currency: 'ZAR' } },
  });

  const result = await settleRequestPayment({
    db, admin, requestId: 'rq_cash_discount', attemptId: 'attempt-cash-discount', outcome: 'success', helperId: 'helper-1',
  });
  assert.equal(result.action, 'settled');
  const wallet = (await db.collection('helperWallets').doc('helper-1').get()).data();
  const request = (await db.collection('serviceRequests').doc('rq_cash_discount').get()).data();
  assert.equal(wallet.balanceMinor, 16750);
  assert.equal(wallet.balance, 167.5);
  assert.equal(request.cashPayment.netWalletDeltaMinor, 11750);
});

test('wallet_debt_recorded cancellation immediately credits helper wallet and never double-credits on later card repayment', async () => {
  const reqId = 'rq_cancel_debt_later_paid';
  const opId = serviceFinancialOperationId(reqId);
  const db = new MemoryDb({
    [`serviceRequests/${reqId}`]: {
      customerId: 'customer-1',
      status: 'driving',
      helperAssignment: { helperId: 'helper-3' },
      pricingSnapshot: { travelFee: 35, bookingFee: 2 },
    },
    [`users/customer-1`]: { uid: 'customer-1', wallet: { balance: 0, currency: 'ZAR' } },
    [`users/helper-3`]: { uid: 'helper-3', wallet: { balance: 0, balanceMinor: 0, currency: 'ZAR' } },
    [`financialOperations/${opId}`]: {
      operationId: opId,
      requestId: reqId,
      operationType: 'customer_cancellation',
      status: 'gateway_failed_confirmed',
      amount: 26,
      amountMinor: 2600,
      currency: 'ZAR',
      settlementData: {
        customerId: 'customer-1',
        helperId: 'helper-3',
        cancellation: {
          cancellationBillingRule: 'travelled_distance_plus_booking_fee',
          cancellationDistanceKm: 6,
          helperPayoutBreakdown: { customerChargeAmount: 26, helperAmount: 24, platformAmount: 2 },
        },
        requestPatch: {
          status: 'canceled',
          canceledBy: 'customer',
          cancellationFeeAmount: 26,
          helperPayoutBreakdown: { customerChargeAmount: 26, helperAmount: 24, platformAmount: 2 },
        },
      },
    },
  });

  const failedCancel = await settleServiceFinancialOperation({
    db, admin, operationRef: db.collection('financialOperations').doc(opId), requestRef: db.collection('serviceRequests').doc(reqId), outcome: 'failed_confirmed', now: 10_000,
  });
  assert.equal(failedCancel.applied, true);
  assert.equal((await db.collection('serviceRequests').doc(reqId).get()).data().helperWalletAccountingVersion, 1);
  assert.equal((await db.collection('users').doc('customer-1').get()).data().wallet.balance, -26);
  const walletAfterCancel = (await db.collection('helperWallets').doc('helper-3').get()).data();
  assert.equal(walletAfterCancel.balanceMinor, 2400);
  assert.equal(walletAfterCancel.balance, 24);

  db.records.set(`servicePaymentOperations/${reqId}`, {
    status: 'payment_processing',
    activeAttemptId: 'attempt-card-1',
    walletDebtOutstanding: true,
    debtApplied: true,
    walletDebtAmount: 26,
  });
  db.records.set(`servicePaymentOperations/${reqId}/attempts/attempt-card-1`, {
    method: 'paystack_checkout',
    status: 'processing',
    amount: 26,
    amountMinor: 2600,
    customerId: 'customer-1',
    gatewayReference: 'ref-cancel-card',
  });

  const paid = await settleRequestPayment({
    db, admin, requestId: reqId, attemptId: 'attempt-card-1', outcome: 'success', gatewayReference: 'ref-cancel-card', gatewayTransactionId: 'tx-cancel-1', now: 20_000,
  });
  assert.equal(paid.action, 'settled');
  assert.equal(paid.debtReversed, true);
  assert.equal((await db.collection('users').doc('customer-1').get()).data().wallet.balance, 0);
  const helperWallet = (await db.collection('helperWallets').doc('helper-3').get()).data();
  assert.equal(helperWallet.balanceMinor, 2400);
  assert.equal(helperWallet.balance, 24);
});

test('failed explicit card completion credits helper wallet immediately and deducts only platform fee if customer switches to cash', async () => {
  const reqId = 'rq_card_fail_then_cash';
  const db = new MemoryDb({
    [`serviceRequests/${reqId}`]: {
      customerId: 'customer-9',
      status: 'completed',
      paymentFlowVersion: 'explicit_v1',
      paymentStatus: 'payment_processing',
      totalAmount: 100,
      helperAssignment: { helperId: 'helper-9' },
      helperPayoutBreakdown: {
        customerChargeAmount: 100,
        helperAmount: 75,
        platformAmount: 25,
      },
    },
    [`users/customer-9`]: { uid: 'customer-9', wallet: { balance: 0, currency: 'ZAR' } },
    [`users/helper-9`]: { uid: 'helper-9', wallet: { balance: 0, balanceMinor: 0, currency: 'ZAR' } },
    [`servicePaymentOperations/${reqId}`]: { status: 'payment_processing', activeAttemptId: 'attempt-card-fail' },
    [`servicePaymentOperations/${reqId}/attempts/attempt-card-fail`]: {
      method: 'saved_card',
      status: 'processing',
      amount: 100,
      amountMinor: 10000,
      customerId: 'customer-9',
    },
  });

  const failedCard = await settleRequestPayment({
    db, admin, requestId: reqId, attemptId: 'attempt-card-fail', outcome: 'failed_confirmed', now: 10_000,
  });
  assert.equal(failedCard.action, 'failed');
  assert.equal(failedCard.failureState, 'wallet_debt_recorded');
  assert.equal(failedCard.helperWalletCredited, true);
  assert.equal((await db.collection('helperWallets').doc('helper-9').get()).data().balanceMinor, 7500);
  assert.equal((await db.collection('users').doc('customer-9').get()).data().wallet.balance, -100);

  db.records.set(`servicePaymentOperations/${reqId}`, {
    ...(await db.collection('servicePaymentOperations').doc(reqId).get()).data(),
    status: 'awaiting_cash_confirmation',
    activeAttemptId: 'attempt-cash-switch',
  });
  db.records.set(`servicePaymentOperations/${reqId}/attempts/attempt-cash-switch`, {
    method: 'cash',
    status: 'awaiting_cash_confirmation',
    amount: 100,
    amountMinor: 10000,
    customerId: 'customer-9',
  });

  const cashSettled = await settleRequestPayment({
    db, admin, requestId: reqId, attemptId: 'attempt-cash-switch', outcome: 'success', helperId: 'helper-9', now: 20_000,
  });
  assert.equal(cashSettled.action, 'settled');
  assert.equal(cashSettled.debtReversed, true);
  assert.equal((await db.collection('users').doc('customer-9').get()).data().wallet.balance, 0);
  // Cumulative helper wallet balance = +7500 - 2500 = +5000 (R50) without double-crediting the R75 payout
  assert.equal((await db.collection('helperWallets').doc('helper-9').get()).data().balanceMinor, 5000);
  assert.equal((await db.collection('helperWallets').doc('helper-9').get()).data().balance, 50);
});


