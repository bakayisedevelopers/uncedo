'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServiceRequestOfferOperations } = require('./serviceRequestOfferOperations');

function createFakeStore(seed = {}) {
  const data = new Map(Object.entries(seed).map(([path, value]) => [path, structuredClone(value)]));
  let lock = Promise.resolve();
  const ref = (path) => ({ path, id: path.split('/').pop() });
  const db = {
    collection(name) {
      return { doc(id) { return ref(`${name}/${id}`); } };
    },
    async runTransaction(work) {
      let unlock;
      const previous = lock;
      lock = new Promise((resolve) => { unlock = resolve; });
      await previous;
      const writes = [];
      const transaction = {
        async get(documentRef) {
          const value = data.get(documentRef.path);
          return { exists: value !== undefined, id: documentRef.id, data: () => structuredClone(value) };
        },
        update(documentRef, value) { writes.push(['update', documentRef.path, value]); },
        set(documentRef, value, options) { writes.push(['set', documentRef.path, value, options]); },
      };
      try {
        const result = await work(transaction);
        for (const [operation, path, value, options] of writes) {
          if (operation === 'update' || options?.merge) data.set(path, { ...(data.get(path) || {}), ...value });
          else data.set(path, structuredClone(value));
        }
        return result;
      } finally { unlock(); }
    },
  };
  const admin = { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } };
  return { db, data, admin };
}

function setup() {
  const store = createFakeStore({
    'serviceRequests/request-0001': {
      status: 'helper_found', currentOfferHelperId: 'helper-1', offerToken: 'offer-token', offerRevision: 3,
      offerExpiresAt: Date.now() + 30_000, lastOfferAt: Date.now() - 1000,
      helperQueue: ['helper-1', 'helper-2'], categoryId: 'cleaning', serviceIds: ['house-clean'],
    },
    'users/helper-1': { role: 'helper', fullName: 'Helper One', activeServiceRequestId: '' },
  });
  const operations = createServiceRequestOfferOperations({
    ...store,
    isHelperUserRecord: (user) => user.role === 'helper',
  });
  return { ...store, operations };
}

test('helper acceptance is idempotent and assigns the canonical request once', async () => {
  const { data, operations } = setup();
  const input = { requestId: 'request-0001', helperId: 'helper-1', offerToken: 'offer-token', offerRevision: 3, action: 'accept' };
  const [first, second] = await Promise.all([operations.respond(input), operations.respond(input)]);
  assert.equal([first, second].filter((result) => result.didApply).length, 1);
  assert.equal([first, second].filter((result) => result.idempotent).length, 1);
  assert.equal(data.get('serviceRequests/request-0001').helperAssignment.helperId, 'helper-1');
  assert.equal(data.get('users/helper-1').activeServiceRequestId, 'request-0001');
});

test('app and WhatsApp accept/decline races allow only one current-offer response', async () => {
  const { data, operations } = setup();
  const common = { requestId: 'request-0001', helperId: 'helper-1', offerToken: 'offer-token', offerRevision: 3 };
  const results = await Promise.all([
    operations.respond({ ...common, action: 'accept' }),
    operations.respond({ ...common, action: 'decline' }),
  ]);
  assert.equal(results.filter((result) => result.didApply).length, 1);
  assert.ok(results.some((result) => result.error === 'offer-no-longer-current'));
  const request = data.get('serviceRequests/request-0001');
  assert.ok(request.helperAssignment?.helperId === 'helper-1' || request.lastOfferResponse?.action === 'decline');
});

test('expired and stale WhatsApp offer references are rejected', async () => {
  const { data, operations } = setup();
  data.set('serviceRequests/request-0001', { ...data.get('serviceRequests/request-0001'), offerExpiresAt: Date.now() - 1 });
  const expired = await operations.respond({ requestId: 'request-0001', helperId: 'helper-1', offerToken: 'offer-token', offerRevision: 3, action: 'accept' });
  assert.equal(expired.error, 'offer-expired');
  const stale = await operations.respond({ requestId: 'request-0001', helperId: 'helper-1', offerToken: 'wrong', offerRevision: 3, action: 'decline' });
  assert.equal(stale.error, 'offer-no-longer-current');
});
