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

test('concurrent helper confirmations settle once and reconcile the legacy wallet debt atomically', async () => {
  const db = new MemoryDb({
    'serviceRequests/rq_123456': {
      customerId: 'customer-1', status: 'completed', paymentStatus: 'awaiting_cash_confirmation', totalAmount: 100,
      helperAssignment: { helperId: 'helper-1' }, helperPayoutBreakdown: { platformAmount: 15, helperAmount: 85 },
    },
    'servicePaymentOperations/rq_123456': { status: 'awaiting_cash_confirmation', activeAttemptId: 'attempt-1' },
    'servicePaymentOperations/rq_123456/attempts/attempt-1': { method: 'cash', status: 'awaiting_cash_confirmation', amount: 100, customerId: 'customer-1' },
    [`financialOperations/${financialOperationId}`]: { operationId: financialOperationId, operationType: 'completion', status: 'settled_failed', amount: 100, amountMinor: 10000, debtApplied: true, walletDebtOutstanding: true, settlementTransitionCount: 1 },
    'users/customer-1': { wallet: { balance: -100, currency: 'ZAR' } },
  });
  const settle = () => settleRequestPayment({ db, admin, requestId: 'rq_123456', attemptId: 'attempt-1', outcome: 'success', helperId: 'helper-1', providerStatus: 'helper_confirmed' });
  const results = await Promise.all([settle(), settle(), settle(), settle(), settle()]);
  assert.equal(results.filter((result) => result.action === 'settled').length, 1);
  assert.equal(results.filter((result) => result.action === 'already-paid').length, 4);
  const request = (await db.collection('serviceRequests').doc('rq_123456').get()).data();
  const legacy = (await db.collection('financialOperations').doc(financialOperationId).get()).data();
  const payment = (await db.collection('servicePaymentOperations').doc('rq_123456').get()).data();
  const customer = (await db.collection('users').doc('customer-1').get()).data();
  assert.equal(request.paymentStatus, 'paid');
  assert.equal(request.cashPayment.status, 'helper_confirmed');
  assert.equal(legacy.status, 'settled_success');
  assert.equal(legacy.finalOutcomeSource, 'request_payment');
  assert.equal(legacy.walletDebtOutstanding, false);
  assert.equal(payment.status, 'paid');
  assert.equal(customer.wallet.balance, 0);
  const reversals = [...db.records.entries()].filter(([path, value]) => path.startsWith('financialLedger/') && value.entryType === 'service_charge_debt_reversal');
  const paymentEntries = [...db.records.entries()].filter(([path, value]) => path.startsWith('financialLedger/') && value.entryType === 'direct_cash_payment');
  const policyReviews = [...db.records.entries()].filter(([path, value]) => path.startsWith('financialPolicyReviews/') && value.type === 'direct_cash_platform_commission');
  assert.equal(reversals.length, 1);
  assert.equal(paymentEntries.length, 1);
  assert.equal(policyReviews.length, 1);
  assert.equal(policyReviews[0][1].automatedCommissionRecovery, false);
});

test('wallet-enabled cash settlement deducts commission once and carries any shortfall as an obligation', async () => {
  const db = new MemoryDb({
    'serviceRequests/rq_123456': {
      customerId: 'customer-1', status: 'completed', paymentStatus: 'awaiting_cash_confirmation', totalAmount: 100,
      helperAssignment: { helperId: 'helper-1' }, helperPayoutBreakdown: { platformAmount: 15, helperAmount: 85 },
    },
    'servicePaymentOperations/rq_123456': { status: 'awaiting_cash_confirmation', activeAttemptId: 'attempt-1' },
    'servicePaymentOperations/rq_123456/attempts/attempt-1': { method: 'cash', status: 'awaiting_cash_confirmation', amount: 100, customerId: 'customer-1' },
    'helperWallets/helper-1': { helperId: 'helper-1', availableMinor: 1000, reservedMinor: 500, outstandingCommissionMinor: 0, currency: 'ZAR' },
  });
  const settle = () => settleRequestPayment({
    db, admin, requestId: 'rq_123456', attemptId: 'attempt-1', outcome: 'success', helperId: 'helper-1', walletEnabled: true,
  });
  const results = await Promise.all([settle(), settle(), settle(), settle(), settle()]);
  assert.equal(results.filter((result) => result.action === 'settled').length, 1);
  assert.equal(results.filter((result) => result.action === 'already-paid').length, 4);
  const wallet = (await db.collection('helperWallets').doc('helper-1').get()).data();
  assert.equal(wallet.availableMinor, 0);
  assert.equal(wallet.reservedMinor, 500);
  assert.equal(wallet.outstandingCommissionMinor, 500);
  const obligationPaths = [...db.records.keys()].filter((path) => path.startsWith('helperWallets/helper-1/commissionObligations/'));
  const commissionEntries = [...db.records.entries()].filter(([path, entry]) => path.startsWith('helperWallets/helper-1/transactions/') && entry.entryType === 'cash_commission_assessed');
  assert.equal(obligationPaths.length, 1);
  assert.equal(commissionEntries.length, 1);
  const obligation = db.records.get(obligationPaths[0]);
  assert.equal(obligation.originalMinor, 1500);
  assert.equal(obligation.recoveredMinor, 1000);
  assert.equal(obligation.outstandingMinor, 500);
  const request = (await db.collection('serviceRequests').doc('rq_123456').get()).data();
  assert.equal(request.cashPayment.commissionStatus, 'partially_outstanding');
  assert.equal(request.cashPayment.commissionRecoveredMinor, 1000);
  assert.equal(request.cashPayment.commissionOutstandingMinor, 500);
  assert.equal([...db.records.values()].filter((entry) => entry.type === 'direct_cash_platform_commission').length, 0);
});

test('wallet-enabled cash settlement deducts the full commission when available balance covers it', async () => {
  const db = new MemoryDb({
    'serviceRequests/rq_123456': {
      customerId: 'customer-1', status: 'completed', totalAmount: 100,
      helperAssignment: { helperId: 'helper-1' }, helperPayoutBreakdown: { platformAmount: 15, helperAmount: 85 },
    },
    'servicePaymentOperations/rq_123456': { status: 'awaiting_cash_confirmation', activeAttemptId: 'attempt-1' },
    'servicePaymentOperations/rq_123456/attempts/attempt-1': { method: 'cash', status: 'awaiting_cash_confirmation', amount: 100, customerId: 'customer-1' },
    'helperWallets/helper-1': { helperId: 'helper-1', availableMinor: 3000, reservedMinor: 700, outstandingCommissionMinor: 0, currency: 'ZAR' },
  });
  const result = await settleRequestPayment({
    db, admin, requestId: 'rq_123456', attemptId: 'attempt-1', outcome: 'success', helperId: 'helper-1', walletEnabled: true,
  });
  assert.equal(result.action, 'settled');
  const wallet = (await db.collection('helperWallets').doc('helper-1').get()).data();
  assert.equal(wallet.availableMinor, 1500);
  assert.equal(wallet.reservedMinor, 700);
  assert.equal(wallet.outstandingCommissionMinor, 0);
  assert.equal([...db.records.values()].filter((entry) => entry.entryType === 'cash_commission_assessed').length, 1);
  const obligations = [...db.records.values()].filter((entry) => entry.requestId === 'rq_123456' && entry.originalMinor === 1500);
  assert.equal(obligations.length, 1);
  assert.equal(obligations[0].status, 'recovered');
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
