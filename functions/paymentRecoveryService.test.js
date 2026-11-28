'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const {
  UNPAID_RECOVERY_STAGES,
  applyUnpaidRecoveryWalletDeduction,
  buildRecoveryMessageText,
  getLatestDueUnpaidRecoveryStage,
  getNextUnpaidRecoveryStage,
  isRequestEligibleForUnpaidRecovery,
} = require('./paymentRecoveryService');
const { settleRequestPayment } = require('./requestPaymentService');
const { createMarketplaceRequestOperations } = require('./marketplaceRequestOperations');

function digest(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function createFirestoreMock(seed = {}) {
  const documents = new Map(Object.entries(seed).map(([path, value]) => [path, structuredClone(value)]));
  const makeRef = (path) => ({
    path,
    id: path.split('/').pop(),
    collection(sub) {
      return {
        doc(id) {
          return makeRef(`${path}/${sub}/${id}`);
        },
      };
    },
    async get() {
      const value = documents.get(path);
      return { id: path.split('/').pop(), exists: value !== undefined, data: () => structuredClone(value) };
    },
    async set(value, options) {
      documents.set(path, options?.merge
        ? { ...(documents.get(path) || {}), ...structuredClone(value) }
        : structuredClone(value));
    },
    async update(value) {
      if (!documents.has(path)) throw new Error(`missing: ${path}`);
      documents.set(path, { ...(documents.get(path) || {}), ...structuredClone(value) });
    },
  });
  const executeQuery = (collectionName, filters) => {
    const prefix = `${collectionName}/`;
    const docs = [...documents.entries()]
      .filter(([path, value]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/') && filters.every(([field, operator, expected]) => {
        if (operator === '==') return value[field] === expected;
        if (operator === 'in') return expected.includes(value[field]);
        return false;
      }))
      .map(([path, value]) => ({ id: path.slice(prefix.length), exists: true, ref: makeRef(path), data: () => structuredClone(value) }));
    return { docs, empty: docs.length === 0 };
  };
  const makeQuery = (collectionName, filters = []) => ({
    collectionName,
    filters,
    where(field, operator, value) { return makeQuery(collectionName, [...filters, [field, operator, value]]); },
    async get() { return executeQuery(collectionName, filters); },
  });
  const db = {
    collection(name) {
      return {
        doc(id) { return makeRef(`${name}/${id}`); },
        where(field, operator, value) { return makeQuery(name, [[field, operator, value]]); },
      };
    },
    async runTransaction(work) {
      const writes = [];
      let writeStarted = false;
      const transaction = {
        async get(target) {
          if (writeStarted) throw new Error('Firestore transactions require all reads to be executed before all writes.');
          if (target.collectionName) {
            return executeQuery(target.collectionName, target.filters);
          }
          const value = documents.get(target.path);
          return { id: target.id, exists: value !== undefined, data: () => structuredClone(value) };
        },
        create(ref, value) { writeStarted = true; writes.push(['create', ref.path, value]); },
        set(ref, value, options) { writeStarted = true; writes.push(['set', ref.path, value, options]); },
        update(ref, value) { writeStarted = true; writes.push(['update', ref.path, value]); },
      };
      const result = await work(transaction);
      for (const [operation, path, value, options] of writes) {
        if (operation === 'create' && documents.has(path)) throw new Error(`already exists: ${path}`);
        if (operation === 'update' && !documents.has(path)) throw new Error(`missing: ${path}`);
        documents.set(path, operation === 'set' && !options?.merge
          ? structuredClone(value)
          : { ...(documents.get(path) || {}), ...structuredClone(value) });
      }
      return result;
    },
    documents,
  };
  return db;
}

const adminStub = {
  firestore: {
    FieldValue: {
      serverTimestamp: () => 'server-time',
    },
  },
};

test('unpaid recovery schedule follows exact 20m, 60m, 6h, 12h, 20h, and 23h (wallet deduction) delays', () => {
  assert.deepEqual(
    UNPAID_RECOVERY_STAGES.map((stage) => ({
      index: stage.index,
      minutes: stage.delayMs / 60_000,
      deductWallet: stage.deductWallet,
    })),
    [
      { index: 0, minutes: 20, deductWallet: false },
      { index: 1, minutes: 60, deductWallet: false },
      { index: 2, minutes: 360, deductWallet: false },
      { index: 3, minutes: 720, deductWallet: false },
      { index: 4, minutes: 1200, deductWallet: false },
      { index: 5, minutes: 1380, deductWallet: true },
    ],
  );

  const endedAt = 1_700_000_000_000;
  const req = {
    status: 'completed',
    paymentStatus: 'cash_selected',
    totalAmount: 320,
    endedAt,
    unpaidRecovery: { completedStages: {} },
  };
  assert.equal(isRequestEligibleForUnpaidRecovery(req).eligible, true);
  assert.equal(getNextUnpaidRecoveryStage(req, endedAt + 5 * 60_000).label, '20m');
  assert.equal(getLatestDueUnpaidRecoveryStage(req, endedAt + 65 * 60_000).label, '60m');

  req.unpaidRecovery.completedStages = { 0: endedAt + 20 * 60_000, 1: endedAt + 60 * 60_000 };
  assert.equal(getNextUnpaidRecoveryStage(req, endedAt + 2 * 3600_000).label, '6h');

  const msg = buildRecoveryMessageText({
    request: { serviceSummary: 'Full body wash', publicRequestReference: 'UNC-77' },
    stage: UNPAID_RECOVERY_STAGES[5],
    amount: 320,
    paymentUrl: 'https://uncedo.bakayise.com/payment?token=abc',
  });
  assert.ok(msg.includes('R320'));
  assert.ok(msg.includes('wallet'));
  assert.ok(msg.includes('https://uncedo.bakayise.com/payment?token=abc'));
});

test('23h unpaid recovery deducts wallet balance idempotently, credits helper wallet, blocks new bookings, and reverses debt once paid', async () => {
  const endedAt = 1_700_000_000_000;
  const reqId = 'req_recovery_23h';
  const db = createFirestoreMock({
    'serviceRequests/req_recovery_23h': {
      customerId: 'cust-rec-1',
      status: 'completed',
      paymentStatus: 'unpaid',
      publicRequestReference: 'UNC-23H',
      totalAmount: 320,
      endedAt,
      helperAssignment: { helperId: 'helper-rec-1' },
      pricingSnapshot: { subtotal: 282, travelFee: 35, bookingFee: 3, total: 320 },
      helperPayoutBreakdown: { helperAmount: 246.5, platformAmount: 73.5, customerChargeAmount: 320 },
    },
    'users/cust-rec-1': {
      uid: 'cust-rec-1',
      role: 'customer',
      wallet: { balance: 50, currency: 'ZAR' },
      whatsappGuestPrincipalIds: [],
    },
    'users/helper-rec-1': {
      uid: 'helper-rec-1',
      role: 'helper',
    },
    'serviceCatalog/full_body_wash': {
      categoryId: 'car_wash',
      categoryName: 'Car Wash',
      label: 'Full body wash',
      active: true,
      approved: true,
      pricing: { basePrice: 190 },
      questionnaire: { required: [], optional: [] },
    },
  });

  // First 23h deduction
  const firstRun = await applyUnpaidRecoveryWalletDeduction({
    db,
    admin: adminStub,
    requestId: reqId,
    now: endedAt + 23 * 3600_000,
  });
  assert.equal(firstRun.action, 'wallet_deducted');
  assert.equal(firstRun.walletDebtAppliedNow, true);
  assert.equal(firstRun.helperWalletCredited, true);
  assert.equal(firstRun.balanceAfter, -270);
  assert.equal(db.documents.get('users/cust-rec-1').wallet.balance, -270);
  assert.equal(db.documents.get('serviceRequests/req_recovery_23h').paymentStatus, 'wallet_debt_recorded');
  assert.equal(db.documents.get('servicePaymentOperations/req_recovery_23h').walletDebtOutstanding, true);
  assert.equal(db.documents.get('helperWallets/helper-rec-1').balance, 246.5);

  // Re-running 23h deduction is completely idempotent
  const secondRun = await applyUnpaidRecoveryWalletDeduction({
    db,
    admin: adminStub,
    requestId: reqId,
    now: endedAt + 23 * 3600_000 + 5000,
  });
  assert.equal(secondRun.action, 'wallet_deducted');
  assert.equal(secondRun.walletDebtAppliedNow, false);
  assert.equal(db.documents.get('users/cust-rec-1').wallet.balance, -270);

  // Customer is blocked from creating a new booking until debt is settled
  const ops = createMarketplaceRequestOperations({ db, admin: adminStub });
  const blocked = await ops.createDraft({
    requestId: 'new_booking_while_in_debt',
    principalId: 'cust-rec-1',
    categoryId: 'car_wash',
    serviceIds: ['full_body_wash'],
    structuredAnswers: {},
    now: endedAt + 24 * 3600_000,
  });
  assert.equal(blocked.code, 'unpaid-completed-request');
  assert.equal(blocked.unpaidRequestId, reqId);
  assert.equal(blocked.paymentStatus, 'wallet_debt_recorded');

  // When customer pays the outstanding amount later, wallet debt is reversed and new booking succeeds
  await db.collection('servicePaymentOperations').doc(reqId).set({ activeAttemptId: 'att_1' }, { merge: true });
  await db.collection('servicePaymentOperations').doc(reqId).collection('attempts').doc('att_1').set({
    attemptId: 'att_1',
    requestId: reqId,
    customerId: 'cust-rec-1',
    method: 'paystack_checkout',
    status: 'processing',
    amount: 320,
    amountMinor: 32000,
  });
  const settled = await settleRequestPayment({
    db,
    admin: adminStub,
    requestId: reqId,
    attemptId: 'att_1',
    outcome: 'success',
    gatewayReference: `PAY_${digest(reqId).slice(0, 8)}`,
    now: endedAt + 25 * 3600_000,
  });
  assert.equal(settled.action, 'settled');
  assert.equal(settled.debtReversed, true);
  assert.equal(db.documents.get('users/cust-rec-1').wallet.balance, 50);

  const allowed = await ops.createDraft({
    requestId: 'new_booking_after_paying',
    principalId: 'cust-rec-1',
    categoryId: 'car_wash',
    serviceIds: ['full_body_wash'],
    structuredAnswers: {},
    now: endedAt + 25 * 3600_000 + 1000,
  });
  assert.equal(allowed.code, 'created');
});

test('23h debt deducted on linked Firebase UID from guest request reverses onto that same linked UID when settled', async () => {
  const endedAt = 1_700_000_000_000;
  const reqId = 'req_guest_linked_23h';
  const db = createFirestoreMock({
    'whatsappGuestOwnership/guest_wa_linked': { uid: 'uid-linked-1' },
    'users/uid-linked-1': {
      uid: 'uid-linked-1',
      role: 'customer',
      wallet: { balance: 40, currency: 'ZAR' },
      whatsappGuestPrincipalIds: ['guest_wa_linked'],
    },
    'users/helper-rec-2': { uid: 'helper-rec-2', role: 'helper' },
    'serviceRequests/req_guest_linked_23h': {
      customerId: 'guest_wa_linked',
      status: 'completed',
      paymentStatus: 'unpaid',
      totalAmount: 200,
      endedAt,
      helperAssignment: { helperId: 'helper-rec-2' },
      pricingSnapshot: { subtotal: 165, travelFee: 35, bookingFee: 0, total: 200 },
      helperPayoutBreakdown: { helperAmount: 158.75, platformAmount: 41.25, customerChargeAmount: 200 },
    },
  });

  const deducted = await applyUnpaidRecoveryWalletDeduction({
    db,
    admin: adminStub,
    requestId: reqId,
    now: endedAt + 23 * 3600_000,
  });
  assert.equal(deducted.action, 'wallet_deducted');
  assert.equal(deducted.ownerUid, 'uid-linked-1');
  assert.equal(db.documents.get('users/uid-linked-1').wallet.balance, -160);
  assert.equal(db.documents.get('servicePaymentOperations/req_guest_linked_23h').debtOwnerUid, 'uid-linked-1');

  await db.collection('servicePaymentOperations').doc(reqId).set({ activeAttemptId: 'att_guest_1' }, { merge: true });
  await db.collection('servicePaymentOperations').doc(reqId).collection('attempts').doc('att_guest_1').set({
    attemptId: 'att_guest_1',
    requestId: reqId,
    customerId: 'guest_wa_linked',
    method: 'paystack_checkout',
    status: 'processing',
    amount: 200,
    amountMinor: 20000,
  });

  const settled = await settleRequestPayment({
    db,
    admin: adminStub,
    requestId: reqId,
    attemptId: 'att_guest_1',
    outcome: 'success',
    gatewayReference: `PAY_${digest(reqId).slice(0, 8)}`,
    now: endedAt + 24 * 3600_000,
  });
  assert.equal(settled.action, 'settled');
  assert.equal(settled.debtReversed, true);
  assert.equal(db.documents.get('users/uid-linked-1').wallet.balance, 40);
});

