'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMarketplaceRequestOperations } = require('./marketplaceRequestOperations');

function createFirestoreMock(seed = {}) {
  const documents = new Map(Object.entries(seed).map(([path, value]) => [path, structuredClone(value)]));
  const makeRef = (path) => ({ path, id: path.split('/').pop() });
  const makeQuery = (collectionName, filters = []) => ({
    collectionName,
    filters,
    where(field, operator, value) { return makeQuery(collectionName, [...filters, [field, operator, value]]); },
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
            const prefix = `${target.collectionName}/`;
            const docs = [...documents.entries()]
              .filter(([path, value]) => path.startsWith(prefix) && target.filters.every(([field, operator, expected]) => {
                if (operator === '==') return value[field] === expected;
                if (operator === 'in') return expected.includes(value[field]);
                return false;
              }))
              .map(([path, value]) => ({ id: path.slice(prefix.length), exists: true, ref: makeRef(path), data: () => structuredClone(value) }));
            return { docs, empty: docs.length === 0 };
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

async function createAndConfirm(operationsDb, operations, { requestId, principalId, channel, versioned = false }) {
  const selection = { categoryId: 'car_wash', serviceIds: ['full_body_wash'], selectedPackageId: '', structuredAnswers: answers };
  const created = await operations.createDraft({
    requestId, principalId, ...selection, channel, identityId: channel === 'whatsapp' ? 'identity-1' : '', now: 1000,
  });
  assert.equal(created.code, 'created');
  const updated = await operations.updateDraft({ requestId, principalId, ...selection, now: 2000 });
  assert.equal(updated.code, 'updated');
  const quoted = await operations.quoteDraft({ requestId, principalId, now: 3000 });
  assert.equal(quoted.code, 'quoted');
  const confirmed = await operations.confirmDraft({
    requestId, principalId, approvedQuote: quoted.quote, quoteExpiresAtMs: quoted.quoteExpiresAtMs, source: channel,
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
