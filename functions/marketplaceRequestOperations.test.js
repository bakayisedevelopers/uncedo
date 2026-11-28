'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createMarketplaceRequestOperations,
  findUnpaidCompletedRequest,
} = require('./marketplaceRequestOperations');

function createFirestoreMock(seed = {}) {
  const documents = new Map(Object.entries(seed).map(([path, value]) => [path, structuredClone(value)]));
  const makeRef = (path) => ({
    path,
    id: path.split('/').pop(),
    async get() {
      const value = documents.get(path);
      return { id: path.split('/').pop(), exists: value !== undefined, data: () => structuredClone(value) };
    },
  });
  const executeQuery = (collectionName, filters) => {
    const prefix = `${collectionName}/`;
    const docs = [...documents.entries()]
      .filter(([path, value]) => path.startsWith(prefix) && filters.every(([field, operator, expected]) => {
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
      const transaction = {
        async get(target) {
          if (target.collectionName) {
            return executeQuery(target.collectionName, target.filters);
          }
          const value = documents.get(target.path);
          return { id: target.id, exists: value !== undefined, data: () => structuredClone(value) };
        },
        create(ref, value) { writes.push(['create', ref.path, value]); },
        set(ref, value, options) { writes.push(['set', ref.path, value, options]); },
        update(ref, value) { writes.push(['update', ref.path, value]); },
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

const catalog = {
  'serviceCatalog/full_body_wash': {
    categoryId: 'car_wash', categoryName: 'Car Wash', label: 'Full body wash', active: true, approved: true,
    pricing: { basePrice: 190 },
    questionnaire: { required: [
      { id: 'vehicle_type', prompt: 'Vehicle type', answerType: 'enum', options: ['suv', 'sedan'].map((value) => ({ value, label: value })) },
      { id: 'service_address_target', prompt: 'Service address', answerType: 'enum', options: [{ value: 'saved_home_address', label: 'Home' }] },
      { id: 'full_body_wash_detailing_addons', prompt: 'Tyre detailing', answerType: 'enum', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
    ], optional: [] },
  },
};
const answers = {
  vehicle_type: 'suv',
  service_address_target: 'saved_home_address',
  full_body_wash_detailing_addons: 'yes',
};

async function createAndConfirm(operationsDb, operations, {
  requestId,
  principalId,
  channel,
  versioned = false,
  signalContext = { now: new Date('2026-04-14T08:00:00Z') },
}) {
  const selection = { categoryId: 'car_wash', serviceIds: ['full_body_wash'], selectedPackageId: '', structuredAnswers: answers };
  const created = await operations.createDraft({
    requestId, principalId, ...selection, channel, identityId: channel === 'whatsapp' ? 'identity-1' : '', now: 1000,
  });
  assert.equal(created.code, 'created');
  const updated = await operations.updateDraft({ requestId, principalId, ...selection, now: 2000 });
  assert.equal(updated.code, 'updated');
  const quoted = await operations.quoteDraft({ requestId, principalId, signalContext, now: 3000 });
  assert.equal(quoted.code, 'quoted');
  const confirmed = await operations.confirmDraft({
    requestId, principalId, approvedQuote: quoted.quote, quoteExpiresAtMs: quoted.quoteExpiresAtMs, source: channel,
    signalContext,
    ...(versioned ? { paymentFlowVersion: 'explicit_v1', walletAccountingVersion: 1 } : {}),
    now: 4000,
  });
  assert.equal(confirmed.code, 'submitted');
  return { quote: quoted.quote, confirmed, request: operationsDb.documents.get(`serviceRequests/${requestId}`) };
}

test('customer and WhatsApp requests share quote calculation and submitted request semantics', async () => {
  const operationsDb = createFirestoreMock({
    ...catalog,
    'users/customer-1': { uid: 'customer-1', role: 'customer', whatsappGuestPrincipalIds: [] },
  });
  const operations = createMarketplaceRequestOperations({
    db: operationsDb,
    admin: { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } },
  });
  const customer = await createAndConfirm(operationsDb, operations, { requestId: 'customer-request-1', principalId: 'customer-1', channel: 'app' });
  const guest = await createAndConfirm(operationsDb, operations, { requestId: 'wa-request-0001', principalId: 'guest_identity-1', channel: 'whatsapp' });
  assert.equal(customer.quote.total, guest.quote.total);
  assert.deepEqual(customer.quote.serviceBreakdown, guest.quote.serviceBreakdown);
  assert.equal(customer.request.status, guest.request.status);
  assert.equal(customer.request.status, 'matching');
  assert.equal(guest.request.originChannel, 'whatsapp');
  assert.equal(guest.request.originIdentityId, 'identity-1');
  assert.equal(customer.request.pricingSnapshot.total, guest.request.pricingSnapshot.total);
  assert.equal(customer.request.pricingSnapshot.travelFee, 35);
  assert.equal(customer.request.totalAmount, customer.request.pricingSnapshot.total);
  assert.equal(guest.request.totalAmount, guest.request.pricingSnapshot.total);
  // Subtotal 282 -> 75% labor (211.50) + travelFee (35) = 246.50 <= customerChargeAmount (320)
  assert.equal(customer.request.helperPayoutBreakdown.helperAmount, 246.5);
  assert.equal(customer.request.helperPayoutBreakdown.customerChargeAmount, customer.request.totalAmount);
  assert.equal(
    customer.request.helperPayoutBreakdown.helperAmount <= customer.request.helperPayoutBreakdown.customerChargeAmount,
    true,
  );
  assert.equal(
    guest.request.helperPayoutBreakdown.helperAmount,
    customer.request.helperPayoutBreakdown.helperAmount,
  );
});

test('newly confirmed requests can be explicitly versioned for future payment and wallet accounting', async () => {
  const operationsDb = createFirestoreMock({
    ...catalog,
    'users/customer-1': { uid: 'customer-1', role: 'customer', whatsappGuestPrincipalIds: [] },
  });
  const operations = createMarketplaceRequestOperations({
    db: operationsDb,
    admin: { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } },
  });
  const result = await createAndConfirm(operationsDb, operations, {
    requestId: 'future-versioned-request', principalId: 'customer-1', channel: 'app', versioned: true,
  });
  assert.equal(result.request.paymentFlowVersion, 'explicit_v1');
  assert.equal(result.request.helperWalletAccountingVersion, 1);
});

test('canonical request creation is idempotent and active-request policy includes linked guest history', async () => {
  const operationsDb = createFirestoreMock({
    ...catalog,
    'users/customer-1': { uid: 'customer-1', role: 'customer', whatsappGuestPrincipalIds: ['guest_identity-1'] },
    'serviceRequests/wa-request-0001': { customerId: 'guest_identity-1', status: 'matching' },
  });
  const operations = createMarketplaceRequestOperations({
    db: operationsDb,
    admin: { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } },
  });
  const existing = await operations.createDraft({
    requestId: 'wa-request-0001', principalId: 'guest_identity-1', categoryId: 'car_wash', serviceIds: ['full_body_wash'], structuredAnswers: answers,
  });
  assert.equal(existing.code, 'request-id-conflict');
  const newRequest = await operations.createDraft({
    requestId: 'customer-request-2', principalId: 'customer-1', categoryId: 'car_wash', serviceIds: ['full_body_wash'], structuredAnswers: answers,
  });
  assert.equal(newRequest.code, 'active-request');
  assert.equal(newRequest.activeRequestId, 'wa-request-0001');
});

test('single-active policy also blocks a second booking while a prior request is accepted or in progress', async () => {
  for (const status of ['accepted', 'work_started']) {
    const operationsDb = createFirestoreMock({
      ...catalog,
      'users/customer-1': { uid: 'customer-1', role: 'customer', whatsappGuestPrincipalIds: [] },
      [`serviceRequests/active-${status}`]: { customerId: 'customer-1', status },
    });
    const operations = createMarketplaceRequestOperations({
      db: operationsDb,
      admin: { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } },
    });
    const result = await operations.createDraft({
      requestId: `new-request-${status}`, principalId: 'customer-1', categoryId: 'car_wash',
      serviceIds: ['full_body_wash'], structuredAnswers: answers,
    });
    assert.equal(result.code, 'active-request');
    assert.equal(result.activeRequestId, `active-${status}`);
  }
});

test('optioned service draft persists selectedOptionId and enforces valid option before quoting', async () => {
  const optionedCatalog = {
    'serviceCatalog/hairstyles': {
      categoryId: 'grooming',
      categoryName: 'Grooming',
      label: 'Hairstyles',
      active: true,
      approved: true,
      options: [
        { id: 'knotless_braids', title: 'Knotless Braids', price: 320, selectedQuestionIds: [] },
        { id: 'buzz_cut', title: 'Buzz Cut', price: 95, selectedQuestionIds: [] },
      ],
      questionnaire: {
        required: [
          {
            id: 'service_address_target',
            type: 'standard',
            prompt: 'Service address',
            answerType: 'enum',
            options: [{ value: 'saved_home_address', label: 'Home' }],
          },
        ],
        optional: [],
      },
    },
  };
  const operationsDb = createFirestoreMock({
    ...optionedCatalog,
    'users/customer-opt-1': { uid: 'customer-opt-1', role: 'customer', whatsappGuestPrincipalIds: [] },
  });
  const operations = createMarketplaceRequestOperations({
    db: operationsDb,
    admin: { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } },
  });

  const missingOptCreated = await operations.createDraft({
    requestId: 'opt-req-missing',
    principalId: 'customer-opt-1',
    categoryId: 'grooming',
    serviceIds: ['hairstyles'],
    structuredAnswers: { service_address_target: 'saved_home_address' },
    now: 1000,
  });
  assert.equal(missingOptCreated.code, 'missing-service-option');

  const invalidOptCreated = await operations.createDraft({
    requestId: 'opt-req-invalid',
    principalId: 'customer-opt-1',
    categoryId: 'grooming',
    serviceIds: ['hairstyles'],
    selectedOptionId: 'unknown_style',
    structuredAnswers: { service_address_target: 'saved_home_address' },
    now: 1500,
  });
  assert.equal(invalidOptCreated.code, 'invalid-service-option');

  const validCreated = await operations.createDraft({
    requestId: 'opt-req-valid',
    principalId: 'customer-opt-1',
    categoryId: 'grooming',
    serviceIds: ['hairstyles'],
    selectedOptionId: 'knotless_braids',
    selectedOptionTitle: 'Knotless Braids',
    structuredAnswers: { service_address_target: 'saved_home_address' },
    now: 3000,
  });
  assert.equal(validCreated.code, 'created');
  const quoted = await operations.quoteDraft({
    requestId: 'opt-req-valid',
    principalId: 'customer-opt-1',
    now: 4000,
  });
  assert.equal(quoted.code, 'quoted');
  assert.equal(quoted.quote.selectedOptionId, 'knotless_braids');
  assert.equal(quoted.quote.selectedOptionTitle, 'Knotless Braids');

  const confirmed = await operations.confirmDraft({
    requestId: 'opt-req-valid',
    principalId: 'customer-opt-1',
    approvedQuote: quoted.quote,
    quoteExpiresAtMs: quoted.quoteExpiresAtMs,
    source: 'app',
    now: 5000,
  });
  assert.equal(confirmed.code, 'submitted');
  const submittedDoc = operationsDb.documents.get('serviceRequests/opt-req-valid');
  assert.equal(submittedDoc.selectedOptionId, 'knotless_braids');
  assert.equal(submittedDoc.selectedOptionTitle, 'Knotless Braids');
});

test('confirmDraft preserves pre-selected payment fields onto confirmed request without promoting temporary card ID to selectedCardId', async () => {
  const operationsDb = createFirestoreMock({
    ...catalog,
    'users/customer-pay-1': { uid: 'customer-pay-1', role: 'customer', whatsappGuestPrincipalIds: [] },
  });
  const operations = createMarketplaceRequestOperations({
    db: operationsDb,
    admin: { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } },
  });

  const selection = { categoryId: 'car_wash', serviceIds: ['full_body_wash'], selectedPackageId: '', structuredAnswers: answers };
  await operations.createDraft({
    requestId: 'req-preselect-saved', principalId: 'customer-pay-1', ...selection, channel: 'whatsapp', identityId: 'id-pay-1', now: 1000,
  });
  const quotedSaved = await operations.quoteDraft({ requestId: 'req-preselect-saved', principalId: 'customer-pay-1', now: 2000 });
  // Simulate pre-booking saved card selection persisted onto the draft
  const draftSaved = operationsDb.documents.get('serviceRequests/req-preselect-saved');
  operationsDb.documents.set('serviceRequests/req-preselect-saved', {
    ...draftSaved,
    preSelectedPaymentType: 'card',
    preSelectedCardMode: 'saved',
    preSelectedCardId: 'card_saved_1',
    preSelectedCardSummary: { brand: 'visa', last4: '4242', temporary: false },
  });
  await operations.confirmDraft({
    requestId: 'req-preselect-saved',
    principalId: 'customer-pay-1',
    approvedQuote: quotedSaved.quote,
    quoteExpiresAtMs: quotedSaved.quoteExpiresAtMs,
    source: 'whatsapp',
    paymentFlowVersion: 'explicit_v1',
    walletAccountingVersion: 1,
    now: 3000,
  });
  const submittedSaved = operationsDb.documents.get('serviceRequests/req-preselect-saved');
  assert.equal(submittedSaved.preSelectedPaymentType, 'card');
  assert.equal(submittedSaved.preSelectedCardMode, 'saved');
  assert.equal(submittedSaved.preSelectedCardId, 'card_saved_1');
  assert.equal(submittedSaved.selectedCardId, 'card_saved_1');
  assert.deepEqual(submittedSaved.preSelectedCardSummary, { brand: 'visa', last4: '4242', temporary: false });
  assert.equal(submittedSaved.requestPayload.selectedCardId, 'card_saved_1');

  // Temporary card authorization should keep preSelectedCardId='request_temp' and leave selectedCardId null/omitted
  await operations.createDraft({
    requestId: 'req-preselect-temp', principalId: 'customer-pay-1', ...selection, channel: 'whatsapp', identityId: 'id-pay-1', now: 4000,
  });
  const quotedTemp = await operations.quoteDraft({ requestId: 'req-preselect-temp', principalId: 'customer-pay-1', now: 5000 });
  const draftTemp = operationsDb.documents.get('serviceRequests/req-preselect-temp');
  operationsDb.documents.set('serviceRequests/req-preselect-temp', {
    ...draftTemp,
    preSelectedPaymentType: 'card',
    preSelectedCardMode: 'new_temp',
    preSelectedCardId: 'request_temp',
    preSelectedCardSummary: { brand: 'mastercard', last4: '5555', temporary: true },
  });
  await operations.confirmDraft({
    requestId: 'req-preselect-temp',
    principalId: 'customer-pay-1',
    approvedQuote: quotedTemp.quote,
    quoteExpiresAtMs: quotedTemp.quoteExpiresAtMs,
    source: 'whatsapp',
    paymentFlowVersion: 'explicit_v1',
    walletAccountingVersion: 1,
    now: 6000,
  });
  const submittedTemp = operationsDb.documents.get('serviceRequests/req-preselect-temp');
  assert.equal(submittedTemp.preSelectedPaymentType, 'card');
  assert.equal(submittedTemp.preSelectedCardMode, 'new_temp');
  assert.equal(submittedTemp.preSelectedCardId, 'request_temp');
  assert.equal(submittedTemp.selectedCardId, undefined);
  assert.deepEqual(submittedTemp.preSelectedCardSummary, { brand: 'mastercard', last4: '5555', temporary: true });
});

test('blocks booking when customer has at least one unpaid completed request and allows once paid', async () => {
  const { createHash } = require('node:crypto');
  const legacyOpId = (id) => `service_${createHash('sha256').update(id).digest('hex').slice(0, 40)}`;
  const admin = { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } };

  for (const paymentStatus of ['unpaid', 'wallet_debt_recorded', 'payment_failed', 'awaiting_cash_confirmation', 'cash_selected']) {
    const operationsDb = createFirestoreMock({
      ...catalog,
      'users/customer-unpaid': { uid: 'customer-unpaid', role: 'customer', whatsappGuestPrincipalIds: ['guest_identity-unpaid'] },
      'serviceRequests/completed-unpaid-1': {
        customerId: 'guest_identity-unpaid',
        status: 'completed',
        paymentStatus,
        publicRequestReference: 'UNC-1001',
        totalAmount: 320,
        endedAt: 5000,
      },
    });
    const operations = createMarketplaceRequestOperations({ db: operationsDb, admin });
    const blockedCreate = await operations.createDraft({
      requestId: 'new-req-after-unpaid',
      principalId: 'customer-unpaid',
      categoryId: 'car_wash',
      serviceIds: ['full_body_wash'],
      structuredAnswers: answers,
      now: 10_000,
    });
    assert.equal(blockedCreate.code, 'unpaid-completed-request');
    assert.equal(blockedCreate.unpaidRequestId, 'completed-unpaid-1');
    assert.equal(blockedCreate.requestReference, 'UNC-1001');
    assert.equal(blockedCreate.unpaidAmount, 320);

    const earlyLookup = await findUnpaidCompletedRequest({
      db: operationsDb,
      principalId: 'guest_identity-unpaid',
    });
    operationsDb.documents.set('whatsappGuestOwnership/guest_identity-unpaid', { uid: 'customer-unpaid' });
    assert.equal(earlyLookup?.unpaidRequestId, 'completed-unpaid-1');

    const linkedGuestLookup = await findUnpaidCompletedRequest({
      db: operationsDb,
      principalId: 'customer-unpaid',
    });
    assert.equal(linkedGuestLookup?.unpaidRequestId, 'completed-unpaid-1');
  }

  // Also block confirmDraft if a draft existed prior to an unpaid completed request
  const confirmDb = createFirestoreMock({
    ...catalog,
    'users/customer-confirm-block': { uid: 'customer-confirm-block', role: 'customer', whatsappGuestPrincipalIds: [] },
  });
  const confirmOps = createMarketplaceRequestOperations({ db: confirmDb, admin });
  await confirmOps.createDraft({
    requestId: 'draft-before-unpaid',
    principalId: 'customer-confirm-block',
    categoryId: 'car_wash',
    serviceIds: ['full_body_wash'],
    structuredAnswers: answers,
    now: 1000,
  });
  const quoted = await confirmOps.quoteDraft({
    requestId: 'draft-before-unpaid',
    principalId: 'customer-confirm-block',
    now: 2000,
  });
  confirmDb.documents.set('serviceRequests/completed-debt-2', {
    customerId: 'customer-confirm-block',
    status: 'completed',
    paymentStatus: 'unpaid',
    totalAmount: 190,
    endedAt: 2500,
  });
  const blockedConfirm = await confirmOps.confirmDraft({
    requestId: 'draft-before-unpaid',
    principalId: 'customer-confirm-block',
    approvedQuote: quoted.quote,
    quoteExpiresAtMs: quoted.quoteExpiresAtMs,
    now: 3000,
  });
  assert.equal(blockedConfirm.code, 'unpaid-completed-request');
  assert.equal(blockedConfirm.unpaidRequestId, 'completed-debt-2');

  // Marking completed requests paid (directly or via payment/financial operations) or R0 allows booking
  const paidDb = createFirestoreMock({
    ...catalog,
    'users/customer-paid': { uid: 'customer-paid', role: 'customer', whatsappGuestPrincipalIds: [] },
    'serviceRequests/completed-paid-direct': { customerId: 'customer-paid', status: 'completed', paymentStatus: 'paid', totalAmount: 320 },
    'serviceRequests/completed-paid-op': { customerId: 'customer-paid', status: 'completed', paymentStatus: 'unpaid', totalAmount: 250 },
    'servicePaymentOperations/completed-paid-op': { status: 'paid' },
    'serviceRequests/completed-paid-legacy': { customerId: 'customer-paid', status: 'completed', paymentStatus: 'unpaid', totalAmount: 190 },
    [`financialOperations/${legacyOpId('completed-paid-legacy')}`]: { status: 'settled_success', operationType: 'completion', amountMinor: 19000 },
    'serviceRequests/completed-zero-charge': { customerId: 'customer-paid', status: 'completed', paymentStatus: 'unpaid', pricingSnapshot: { cashChargeAmount: 0 }, totalAmount: 190 },
  });
  const paidOps = createMarketplaceRequestOperations({ db: paidDb, admin });
  const allowed = await paidOps.createDraft({
    requestId: 'allowed-new-req',
    principalId: 'customer-paid',
    categoryId: 'car_wash',
    serviceIds: ['full_body_wash'],
    structuredAnswers: answers,
    now: 4000,
  });
  assert.equal(allowed.code, 'created');
});

test('persists resolved questionAnswers snapshot onto request, requestPayload, and pricingSnapshot on create, update, quote, and confirm', async () => {
  const operationsDb = createFirestoreMock({
    ...catalog,
    'users/customer-qa-1': { uid: 'customer-qa-1', role: 'customer', whatsappGuestPrincipalIds: [] },
  });
  const operations = createMarketplaceRequestOperations({
    db: operationsDb,
    admin: { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } },
  });

  const { request } = await createAndConfirm(operationsDb, operations, {
    requestId: 'qa-snapshot-request',
    principalId: 'customer-qa-1',
    channel: 'app',
  });

  for (const list of [
    request.questionAnswers,
    request.requestPayload?.questionAnswers,
    request.pricingSnapshot?.questionAnswers,
  ]) {
    assert.equal(Array.isArray(list), true);
    assert.equal(list.length, 3);
    const byId = Object.fromEntries(list.map((qa) => [qa.questionId, qa]));
    assert.equal(byId.vehicle_type.prompt, 'Vehicle type');
    assert.equal(byId.service_address_target.answerLabel, 'Home');
    assert.equal(byId.full_body_wash_detailing_addons.answerLabel, 'Yes');
  }
});

test('locks SAST day, time, and season multipliers from quoteDraft through confirmDraft even across boundary hours', async () => {
  const operationsDb = createFirestoreMock({
    ...catalog,
    'users/customer-sched-1': { uid: 'customer-sched-1', role: 'customer', whatsappGuestPrincipalIds: [] },
  });
  const operations = createMarketplaceRequestOperations({
    db: operationsDb,
    admin: { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } },
  });

  const selection = { categoryId: 'car_wash', serviceIds: ['full_body_wash'], selectedPackageId: '', structuredAnswers: answers };
  // Saturday 2026-12-19 21:59 SAST (weekend * evening * festive => 1.08 * 1.08 * 1.1 = 1.28304)
  const quoteTimeMs = Date.parse('2026-12-19T19:59:00Z');
  // Confirm occurs 2 minutes later across the 22:00 overnight boundary (no signalContext passed explicitly)
  const confirmTimeMs = Date.parse('2026-12-19T20:01:00Z');

  await operations.createDraft({
    requestId: 'sched-lock-req',
    principalId: 'customer-sched-1',
    ...selection,
    channel: 'app',
    now: quoteTimeMs - 1000,
  });
  const quoted = await operations.quoteDraft({
    requestId: 'sched-lock-req',
    principalId: 'customer-sched-1',
    now: quoteTimeMs,
  });
  assert.equal(quoted.code, 'quoted');
  assert.equal(quoted.quote.schedulePricing.dayBucket, 'weekend');
  assert.equal(quoted.quote.schedulePricing.timeBucket, 'evening');
  assert.equal(quoted.quote.schedulePricing.seasonBucket, 'festive');
  assert.equal(quoted.quote.subtotal > 282, true);

  const confirmed = await operations.confirmDraft({
    requestId: 'sched-lock-req',
    principalId: 'customer-sched-1',
    approvedQuote: quoted.quote,
    quoteExpiresAtMs: quoted.quoteExpiresAtMs,
    source: 'app',
    now: confirmTimeMs,
  });
  assert.equal(confirmed.code, 'submitted');
  const submitted = operationsDb.documents.get('serviceRequests/sched-lock-req');
  assert.equal(submitted.totalAmount, quoted.quote.total);
  assert.equal(submitted.pricingSnapshot.schedulePricing.timeBucket, 'evening');
});

test('blocks new bookings on unpaid canceled fee or negative customer wallet debt, while allowing free cancellations', async () => {
  const canceledFeeDb = createFirestoreMock({
    ...catalog,
    'users/cust-cancel-fee': { uid: 'cust-cancel-fee', role: 'customer', whatsappGuestPrincipalIds: [] },
    'serviceRequests/canceled-unpaid-1': {
      customerId: 'cust-cancel-fee',
      status: 'canceled',
      paymentStatus: 'payment_failed',
      publicRequestReference: 'UNC-CAN-1',
      cancellationFeeAmount: 45,
      canceledAtMs: 5000,
    },
    'users/cust-free-cancel': { uid: 'cust-free-cancel', role: 'customer', whatsappGuestPrincipalIds: [] },
    'serviceRequests/canceled-free-1': {
      customerId: 'cust-free-cancel',
      status: 'canceled',
      paymentStatus: 'not_applicable',
      cancellationFeeAmount: 0,
      canceledAtMs: 5000,
    },
    'users/cust-wallet-debt': {
      uid: 'cust-wallet-debt',
      role: 'customer',
      whatsappGuestPrincipalIds: [],
      wallet: { balance: -80, currency: 'ZAR' },
    },
  });
  const ops = createMarketplaceRequestOperations({
    db: canceledFeeDb,
    admin: { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } },
  });

  const blockedCancel = await ops.createDraft({
    requestId: 'new-req-after-unpaid-cancel',
    principalId: 'cust-cancel-fee',
    categoryId: 'car_wash',
    serviceIds: ['full_body_wash'],
    structuredAnswers: answers,
    now: 10_000,
  });
  assert.equal(blockedCancel.code, 'unpaid-completed-request');
  assert.equal(blockedCancel.unpaidRequestId, 'canceled-unpaid-1');
  assert.equal(blockedCancel.unpaidAmount, 45);

  const allowedAfterFreeCancel = await ops.createDraft({
    requestId: 'new-req-after-free-cancel',
    principalId: 'cust-free-cancel',
    categoryId: 'car_wash',
    serviceIds: ['full_body_wash'],
    structuredAnswers: answers,
    now: 10_000,
  });
  assert.equal(allowedAfterFreeCancel.code, 'created');

  const blockedWallet = await ops.createDraft({
    requestId: 'new-req-with-wallet-debt',
    principalId: 'cust-wallet-debt',
    categoryId: 'car_wash',
    serviceIds: ['full_body_wash'],
    structuredAnswers: answers,
    now: 10_000,
  });
  assert.equal(blockedWallet.code, 'unpaid-completed-request');
  assert.equal(blockedWallet.unpaidRequestId, 'wallet_debt');
  assert.equal(blockedWallet.unpaidAmount, 80);
});

test('natural-language SAST scheduled_for_text persists scheduledForAtMs and drives weekend evening pricing', async () => {
  const operationsDb = createFirestoreMock({
    ...catalog,
    'users/cust-nat-sched': { uid: 'cust-nat-sched', role: 'customer', whatsappGuestPrincipalIds: [] },
  });
  const ops = createMarketplaceRequestOperations({
    db: operationsDb,
    admin: { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } },
  });
  // Tuesday 2026-04-14 10:00 SAST (weekday morning)
  const tuesdayNow = Date.parse('2026-04-14T08:00:00Z');
  const created = await ops.createDraft({
    requestId: 'nat-sched-req-1',
    principalId: 'cust-nat-sched',
    categoryId: 'car_wash',
    serviceIds: ['full_body_wash'],
    structuredAnswers: answers,
    timingPreference: 'later',
    scheduledForText: 'Saturday evening',
    now: tuesdayNow,
  });
  assert.equal(created.code, 'created');
  const draftDoc = operationsDb.documents.get('serviceRequests/nat-sched-req-1');
  assert.equal(draftDoc.requestPayload.scheduledForAtMs, Date.parse('2026-04-18T19:00:00+02:00'));

  const quoted = await ops.quoteDraft({
    requestId: 'nat-sched-req-1',
    principalId: 'cust-nat-sched',
    now: tuesdayNow + 1000,
  });
  assert.equal(quoted.code, 'quoted');
  assert.equal(quoted.quote.schedulePricing.dayBucket, 'weekend');
  assert.equal(quoted.quote.schedulePricing.timeBucket, 'evening');
});

test('address-only and null coordinates never coerce to Null Island (0, 0) across create, update, and confirm', async () => {
  const operationsDb = createFirestoreMock({
    ...catalog,
    'users/cust-addr-only': { uid: 'cust-addr-only', role: 'customer', whatsappGuestPrincipalIds: [] },
  });
  const ops = createMarketplaceRequestOperations({
    db: operationsDb,
    admin: { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } },
  });
  const now = Date.parse('2026-04-14T08:00:00Z');
  const created = await ops.createDraft({
    requestId: 'addr-only-req-1',
    principalId: 'cust-addr-only',
    categoryId: 'car_wash',
    serviceIds: ['full_body_wash'],
    structuredAnswers: answers,
    location: { address: '17 Iris Street Witbank Mpumalanga 1035', latitude: null, longitude: null },
    now,
  });
  assert.equal(created.code, 'created');
  const afterCreate = operationsDb.documents.get('serviceRequests/addr-only-req-1');
  assert.equal(afterCreate.location.latitude, null);
  assert.equal(afterCreate.location.longitude, null);

  const updated = await ops.updateDraft({
    requestId: 'addr-only-req-1',
    principalId: 'cust-addr-only',
    structuredAnswers: answers,
    location: { address: '17 Iris Street Witbank Mpumalanga 1035', latitude: 0, longitude: 0 },
    now: now + 1000,
  });
  assert.equal(updated.code, 'updated');
  const afterUpdate = operationsDb.documents.get('serviceRequests/addr-only-req-1');
  assert.equal(afterUpdate.location.latitude, null);
  assert.equal(afterUpdate.location.longitude, null);

  const quoted = await ops.quoteDraft({
    requestId: 'addr-only-req-1',
    principalId: 'cust-addr-only',
    now: now + 2000,
  });
  assert.equal(quoted.code, 'quoted');
  const confirmed = await ops.confirmDraft({
    requestId: 'addr-only-req-1',
    principalId: 'cust-addr-only',
    approvedQuote: quoted.quote,
    quoteExpiresAtMs: quoted.quoteExpiresAtMs,
    now: now + 3000,
  });
  assert.equal(confirmed.code, 'submitted');
  const afterConfirm = operationsDb.documents.get('serviceRequests/addr-only-req-1');
  assert.equal(afterConfirm.location.latitude, null);
  assert.equal(afterConfirm.location.longitude, null);
  assert.equal(afterConfirm.serviceAddress, '17 Iris Street Witbank Mpumalanga 1035');
});



