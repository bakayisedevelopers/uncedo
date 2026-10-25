'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getWhatsAppRequestForIdentity, listWhatsAppRequests, validRequestId } = require('./requestAccessService');

function fakeDb(records, guestOwners = {}) {
  const collection = (name) => ({
    doc(id) {
      const record = name === 'serviceRequests' ? records[id] : guestOwners[id];
      return { get: async () => ({ id, exists: Boolean(record), data: () => record || {} }) };
    },
    where(field, operator, value) {
      assert.equal(operator, '==');
      return {
        orderBy(orderField, direction) {
          assert.equal(orderField, 'createdAt');
          assert.equal(direction, 'desc');
          return this;
        },
        limit(max) {
          return { get: async () => ({ docs: Object.entries(records)
            .filter(([, record]) => record[field] === value
              || (field === 'helperAssignment.helperId' && record.helperAssignment?.helperId === value))
            .slice(0, max)
            .map(([id, data]) => ({ id, data: () => data })) }) };
        },
      };
    },
  });
  return { collection };
}

test('request IDs reject malformed references before any lookup', () => {
  assert.equal(validRequestId('request_123'), 'request_123');
  assert.equal(validRequestId('../../users'), '');
  assert.equal(validRequestId('short'), '');
});

test('request lookup enforces customer, linked guest owner, and assigned helper access', async () => {
  const db = fakeDb({
    request_own: { customerId: 'customer-1' },
    request_guest: { customerId: 'guest_1' },
    request_assigned: { helperAssignment: { helperId: 'helper-1' } },
  }, { guest_1: { uid: 'customer-1' } });

  assert.equal((await getWhatsAppRequestForIdentity({ db, identity: { role: 'customer', linkedFirebaseUid: 'customer-1' }, requestId: 'request_own' })).code, 'found');
  assert.equal((await getWhatsAppRequestForIdentity({ db, identity: { role: 'customer', linkedFirebaseUid: 'customer-1' }, requestId: 'request_guest' })).code, 'found');
  assert.equal((await getWhatsAppRequestForIdentity({ db, identity: { role: 'customer', guestPrincipalId: 'guest-other' }, requestId: 'request_guest' })).code, 'forbidden');
  assert.equal((await getWhatsAppRequestForIdentity({ db, identity: { role: 'helper', linkedFirebaseUid: 'helper-1' }, requestId: 'request_assigned' })).code, 'found');
});

test('request history reads only bounded owned records and returns the newest first', async () => {
  const db = fakeDb({
    old: { customerId: 'customer-1', createdAt: { toMillis: () => 1 } },
    newer: { customerId: 'customer-1', createdAt: { toMillis: () => 3 } },
    guest: { customerId: 'guest-1', createdAt: { toMillis: () => 2 } },
    other: { customerId: 'customer-2', createdAt: { toMillis: () => 4 } },
  });
  const requests = await listWhatsAppRequests({
    db,
    identity: { role: 'customer', linkedFirebaseUid: 'customer-1', guestPrincipalId: 'guest-1' },
    resultLimit: 2,
  });
  assert.deepEqual(requests.map((request) => request.id), ['newer', 'guest']);
});
