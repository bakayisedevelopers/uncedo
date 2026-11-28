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

test('stale completed activeServiceRequestId does not block accepting a new offer while an ongoing job still blocks', async () => {
  const { data, operations } = setup();
  data.set('serviceRequests/request-old-done', {
    status: 'completed',
    helperAssignment: { helperId: 'helper-1' },
  });
  data.set('users/helper-1', { role: 'helper', fullName: 'Helper One', activeServiceRequestId: 'request-old-done' });

  const accepted = await operations.respond({
    requestId: 'request-0001',
    helperId: 'helper-1',
    offerToken: 'offer-token',
    offerRevision: 3,
    action: 'accept',
  });
  assert.equal(accepted.didApply, true);
  assert.equal(data.get('users/helper-1').activeServiceRequestId, 'request-0001');

  data.set('serviceRequests/request-0002', {
    status: 'helper_found',
    currentOfferHelperId: 'helper-1',
    offerToken: 'offer-token-2',
    offerRevision: 1,
    offerExpiresAt: Date.now() + 30_000,
  });
  data.set('serviceRequests/request-0001', {
    ...data.get('serviceRequests/request-0001'),
    status: 'work_started',
    helperAssignment: { helperId: 'helper-1' },
  });
  const blocked = await operations.respond({
    requestId: 'request-0002',
    helperId: 'helper-1',
    offerToken: 'offer-token-2',
    offerRevision: 1,
    action: 'accept',
  });
  assert.equal(blocked.error, 'helper-already-has-active-request');
});

test('busy_helper_fallback offer allows accepting while keeping activeServiceRequestId intact', async () => {
  const { data, operations } = setup();
  data.set('serviceRequests/request-active-1', {
    status: 'work_started',
    helperAssignment: { helperId: 'helper-1' },
  });
  data.set('users/helper-1', {
    role: 'helper',
    fullName: 'Helper One',
    activeServiceRequestId: 'request-active-1',
  });
  data.set('serviceRequests/request-busy-next', {
    status: 'helper_found',
    offerType: 'busy_helper_fallback',
    currentOfferHelperId: 'helper-1',
    offerToken: 'offer-busy-1',
    offerRevision: 2,
    offerExpiresAt: Date.now() + 30_000,
    lastOfferAt: Date.now() - 1000,
    categoryId: 'cleaning',
    serviceIds: ['house-clean'],
  });

  const accepted = await operations.respond({
    requestId: 'request-busy-next',
    helperId: 'helper-1',
    offerToken: 'offer-busy-1',
    offerRevision: 2,
    action: 'accept',
  });
  assert.equal(accepted.didApply, true);
  assert.equal(accepted.busyFallbackAccepted, true);
  assert.equal(accepted.activeRequestId, 'request-active-1');
  assert.equal(data.get('users/helper-1').activeServiceRequestId, 'request-active-1');
  assert.equal(data.get('users/helper-1').queuedServiceRequestId, 'request-busy-next');
  assert.equal(data.get('serviceRequests/request-busy-next').status, 'busy_helper_confirmation');
  assert.equal(data.get('serviceRequests/request-busy-next').pendingBusyAssignment.helperId, 'helper-1');

  data.set('serviceRequests/request-busy-third', {
    status: 'helper_found',
    offerType: 'busy_helper_fallback',
    currentOfferHelperId: 'helper-1',
    offerToken: 'offer-busy-3',
    offerRevision: 1,
    offerExpiresAt: Date.now() + 30_000,
  });
  const secondBusyBlocked = await operations.respond({
    requestId: 'request-busy-third',
    helperId: 'helper-1',
    offerToken: 'offer-busy-3',
    offerRevision: 1,
    action: 'accept',
  });
  assert.equal(secondBusyBlocked.error, 'helper-already-has-queued-request');
});

test('declining an offer moves the request back to matching and advances selection to the next helper', async () => {
  const { data, operations } = setup();
  data.set('serviceRequests/request-0001', {
    ...data.get('serviceRequests/request-0001'),
    helperQueue: ['helper-1', 'helper-2'],
    busyHelperQueue: ['helper-1', 'helper-3'],
  });
  const declined = await operations.respond({
    requestId: 'request-0001',
    helperId: 'helper-1',
    offerToken: 'offer-token',
    offerRevision: 3,
    action: 'decline',
  });
  assert.equal(declined.didApply, true);
  assert.equal(declined.action, 'decline');
  const updated = data.get('serviceRequests/request-0001');
  assert.equal(updated.status, 'matching');
  assert.equal(updated.currentOfferHelperId, null);
  assert.equal(updated.offerExpiresAt, null);
  assert.equal(updated.offerToken, null);
  assert.deepEqual(updated.helperQueue, ['helper-2']);
  assert.deepEqual(updated.busyHelperQueue, ['helper-3']);
  assert.deepEqual(updated.declinedHelperIds, ['helper-1']);
  assert.deepEqual(updated.offerCycleExcludedHelperIds, ['helper-1']);
});
