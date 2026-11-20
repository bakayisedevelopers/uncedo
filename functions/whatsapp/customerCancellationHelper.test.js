'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { findCustomerCancellationTarget, isRequestAuthorizedForCaller } = require('./customerCancellationHelper');

function createFakeDb({ users = {}, requests = {}, guestOwnership = {}, drafts = {} } = {}) {
  return {
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              if (name === 'users') {
                return { id, exists: Boolean(users[id]), data: () => users[id] || {} };
              }
              if (name === 'serviceRequests') {
                return { id, exists: Boolean(requests[id]), data: () => requests[id] || {} };
              }
              if (name === 'whatsappGuestOwnership') {
                return { id, exists: Boolean(guestOwnership[id]), data: () => guestOwnership[id] || {} };
              }
              if (name === 'whatsappServiceDrafts') {
                return { id, exists: Boolean(drafts[id]), data: () => drafts[id] || {} };
              }
              return { id, exists: false, data: () => ({}) };
            },
          };
        },
        where(field, operator, value) {
          assert.equal(operator, '==');
          return {
            orderBy() {
              return this;
            },
            limit(max) {
              return {
                async get() {
                  const docs = Object.entries(requests)
                    .filter(([, rec]) => (
                      (field === 'customerId' && rec.customerId === value)
                      || (field === 'helperAssignment.helperId' && rec.helperAssignment?.helperId === value)
                    ))
                    .slice(0, max)
                    .map(([id, data]) => ({ id, data: () => data }));
                  return { docs };
                },
              };
            },
          };
        },
      };
    },
  };
}

test('findCustomerCancellationTarget resolves active non-canceled request automatically from history including helper_found and collecting_details', async () => {
  const db = createFakeDb({
    users: {
      'user-1': { whatsappGuestPrincipalIds: ['guest_old'] },
    },
    requests: {
      req_canceled: { customerId: 'user-1', status: 'canceled', createdAtMs: 500 },
      req_active_guest: { customerId: 'guest_old', status: 'helper_found', createdAtMs: 300, publicRequestReference: 'UNC-1001' },
      req_completed: { customerId: 'user-1', status: 'completed', createdAtMs: 200 },
    },
  });

  const target = await findCustomerCancellationTarget({
    db,
    callerIdentity: { linkedFirebaseUid: 'user-1', role: 'customer', guestPrincipalId: 'guest_new' },
    conversation: {},
  });

  assert.equal(target.kind, 'eligible');
  assert.equal(target.request.id, 'req_active_guest');
});

test('findCustomerCancellationTarget works for guest customer identities with role="guest"', async () => {
  const db = createFakeDb({
    requests: {
      wa_req_collecting: { customerId: 'guest_99', status: 'collecting_details', createdAtMs: 100 },
    },
  });

  const target = await findCustomerCancellationTarget({
    db,
    callerIdentity: { role: 'guest', guestPrincipalId: 'guest_99' },
    conversation: {},
  });

  assert.equal(target.kind, 'eligible');
  assert.equal(target.request.id, 'wa_req_collecting');
});

test('findCustomerCancellationTarget matches explicit publicRequestReference or doc ID', async () => {
  const db = createFakeDb({
    requests: {
      wa_req_first: { customerId: 'user-1', status: 'matching', publicRequestReference: 'UNC-777', createdAtMs: 200 },
      wa_req_second: { customerId: 'user-1', status: 'scheduled_pending', publicRequestReference: 'UNC-888', createdAtMs: 400 },
    },
  });

  const target = await findCustomerCancellationTarget({
    db,
    callerIdentity: { linkedFirebaseUid: 'user-1', role: 'customer' },
    conversation: { activeServiceRequestId: 'wa_req_second' },
    requestedId: 'unc-777',
  });

  assert.equal(target.kind, 'eligible');
  assert.equal(target.request.id, 'wa_req_first');
});

test('findCustomerCancellationTarget falls back to active draft when no canonical request doc exists yet', async () => {
  const db = createFakeDb({
    drafts: {
      draft_1: { serviceId: 'car_wash', status: 'collecting' },
    },
  });

  const target = await findCustomerCancellationTarget({
    db,
    callerIdentity: { guestPrincipalId: 'guest_only' },
    conversation: { activeDraftId: 'draft_1' },
  });

  assert.equal(target.kind, 'draft-only');
  assert.equal(target.activeDraft.id, 'draft_1');
});

test('findCustomerCancellationTarget blocks cross-customer cancellation and denies helper callers', async () => {
  const db = createFakeDb({
    requests: {
      other_req: { customerId: 'other-user', status: 'matching', createdAtMs: 400 },
    },
  });

  const forbidden = await findCustomerCancellationTarget({
    db,
    callerIdentity: { linkedFirebaseUid: 'user-1', role: 'customer' },
    requestedId: 'other_req',
  });
  assert.equal(forbidden.kind, 'forbidden');

  const helperDenied = await findCustomerCancellationTarget({
    db,
    callerIdentity: { linkedFirebaseUid: 'helper-1', role: 'helper' },
  });
  assert.equal(helperDenied.kind, 'customer-role-required');

  assert.equal(
    isRequestAuthorizedForCaller({
      request: { customerId: 'guest_old' },
      callerIdentity: { linkedFirebaseUid: 'user-1', role: 'customer' },
      extraCustomerIds: ['guest_old'],
    }),
    true,
  );
});
