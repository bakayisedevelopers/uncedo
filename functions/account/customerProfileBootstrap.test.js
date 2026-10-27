'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureCustomerProfileRecord } = require('./customerProfileBootstrap');

function createFakeDb(initial = {}) {
  const records = new Map(Object.entries(initial));
  const db = {
    collection: (name) => ({
      doc: (id) => ({ path: `${name}/${id}` }),
    }),
    runTransaction: async (callback) => callback({
      get: async (ref) => ({
        exists: records.has(ref.path),
        data: () => records.get(ref.path),
      }),
      create: (ref, value) => {
        if (records.has(ref.path)) throw new Error('already exists');
        records.set(ref.path, value);
      },
      set: (ref, value, options = {}) => {
        const current = records.get(ref.path) || {};
        const next = { ...current, ...value };
        if (value.customerProfile) next.customerProfile = { ...(current.customerProfile || {}), ...value.customerProfile };
        if (options.merge || !records.has(ref.path)) records.set(ref.path, next);
        else records.set(ref.path, value);
      },
    }),
  };
  return { db, records };
}

const serverTimestamp = () => 'server-time';

test('creates a minimal customer profile using the authenticated account details', async () => {
  const { db, records } = createFakeDb();
  const result = await ensureCustomerProfileRecord({
    db, uid: 'customer-1', email: 'jabu@example.com', displayName: 'Jabu', serverTimestamp,
  });

  assert.deepEqual(result, { created: true, repaired: false });
  assert.deepEqual(records.get('users/customer-1'), {
    uid: 'customer-1', email: 'jabu@example.com', fullName: 'Jabu', displayName: 'Jabu',
    role: 'customer', activeRole: 'customer', roles: ['customer'], phoneNumber: '', paymentMethods: [],
    customerProfile: {
      accountType: '', customerType: '', serviceAddress: '', discoverySource: '',
      preferredServiceCategories: [], businessName: '', businessEmail: '', businessCategory: '',
    },
    createdAt: 'server-time', updatedAt: 'server-time',
  });
});

test('repairs only missing customer defaults and preserves existing profile information', async () => {
  const { db, records } = createFakeDb({
    'users/customer-1': {
      uid: 'customer-1', role: 'customer', activeRole: 'customer', roles: ['customer'],
      fullName: 'Existing Name', customerProfile: { serviceAddress: '1 Main Road' },
      customApplicationData: 'preserved',
    },
  });
  const result = await ensureCustomerProfileRecord({
    db, uid: 'customer-1', email: 'customer@example.com', displayName: 'Auth Name', serverTimestamp,
  });

  assert.deepEqual(result, { created: false, repaired: true });
  const saved = records.get('users/customer-1');
  assert.equal(saved.fullName, 'Existing Name');
  assert.equal(saved.customerProfile.serviceAddress, '1 Main Road');
  assert.equal(saved.customerProfile.customerType, '');
  assert.equal(saved.customApplicationData, 'preserved');
  assert.equal(saved.email, 'customer@example.com');
});

test('refuses to initialize helper or privileged profiles as customers', async () => {
  for (const [uid, profile, expectedCode] of [
    ['helper-1', { uid: 'helper-1', role: 'helper' }, 'permission-denied'],
    ['admin-1', { uid: 'admin-1', role: 'admin' }, 'permission-denied'],
    ['unknown-1', { uid: 'unknown-1', role: 'reviewer' }, 'failed-precondition'],
  ]) {
    const { db, records } = createFakeDb({ [`users/${uid}`]: profile });
    await assert.rejects(
      ensureCustomerProfileRecord({ db, uid, email: 'x@example.com', displayName: 'X', serverTimestamp }),
      { code: expectedCode },
    );
    assert.deepEqual(records.get(`users/${uid}`), profile);
  }
});

