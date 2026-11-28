'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ACCOUNT_DELETION_GRACE_MS,
  buildDeletedUserRecordSnapshot,
  buildWhatsAppAccountDeletionUrl,
  createWhatsAppAccountDeletionChallenge,
  executePermanentAccountDeletion,
  isAccountPendingDeletion,
  isWhatsAppAccountDeletionChallengeLive,
  reactivateAccount,
  scheduleAccountDeletion,
} = require('./accountDeletionService');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createFakeFieldValue() {
  return {
    serverTimestamp: () => ({ __op: 'serverTimestamp' }),
    delete: () => ({ __op: 'delete' }),
  };
}

function applyPatch(target = {}, data = {}) {
  const next = { ...clone(target) };
  for (const [key, val] of Object.entries(data)) {
    if (val && typeof val === 'object' && val.__op === 'delete') {
      delete next[key];
    } else if (val && typeof val === 'object' && val.__op === 'serverTimestamp') {
      next[key] = 'SERVER_TIMESTAMP';
    } else if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
      next[key] = applyPatch(next[key] && typeof next[key] === 'object' ? next[key] : {}, val);
    } else {
      next[key] = clone(val);
    }
  }
  return next;
}

function getByPath(obj, path) {
  return String(path || '').split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), obj);
}

function createFakeDb(seed = {}) {
  const store = new Map();
  let autoSeq = 1;
  for (const [col, docs] of Object.entries(seed)) {
    const colMap = new Map();
    for (const [id, data] of Object.entries(docs || {})) {
      colMap.set(id, clone(data));
    }
    store.set(col, colMap);
  }
  function getColMap(col) {
    if (!store.has(col)) store.set(col, new Map());
    return store.get(col);
  }
  function makeDocRef(col, id) {
    const docId = id || `auto_${autoSeq++}`;
    return {
      id: docId,
      path: `${col}/${docId}`,
      _col: col,
      async get() {
        const val = getColMap(col).get(docId);
        return {
          id: docId,
          ref: this,
          exists: val !== undefined,
          data: () => clone(val),
        };
      },
      async set(data, options = {}) {
        const colMap = getColMap(col);
        const current = options.merge ? (colMap.get(docId) || {}) : {};
        colMap.set(docId, applyPatch(current, data));
      },
      async delete() {
        getColMap(col).delete(docId);
      },
    };
  }
  function makeQuery(col, filters = [], limitVal = null) {
    return {
      where(field, op, value) {
        return makeQuery(col, [...filters, { field, op, value }], limitVal);
      },
      limit(count) {
        return makeQuery(col, filters, count);
      },
      async get() {
        const colMap = getColMap(col);
        let docs = [];
        for (const [id, data] of colMap.entries()) {
          const matches = filters.every(({ field, op, value }) => {
            const actual = getByPath(data, field);
            if (op === '==') return actual === value;
            if (op === 'in') return Array.isArray(value) && value.includes(actual);
            return false;
          });
          if (matches) {
            const ref = makeDocRef(col, id);
            docs.push({
              id,
              ref,
              exists: true,
              data: () => clone(data),
            });
          }
        }
        if (Number.isInteger(limitVal)) docs = docs.slice(0, limitVal);
        return { empty: docs.length === 0, docs };
      },
    };
  }

  return {
    _store: store,
    collection(col) {
      return {
        doc(id) {
          return makeDocRef(col, id);
        },
        where(field, op, value) {
          return makeQuery(col, [{ field, op, value }]);
        },
        async get() {
          return makeQuery(col).get();
        },
      };
    },
    async runTransaction(fn) {
      const tx = {
        get: (target) => target.get(),
        set: (ref, data, options) => {
          const colMap = getColMap(ref._col);
          const current = options?.merge ? (colMap.get(ref.id) || {}) : {};
          colMap.set(ref.id, applyPatch(current, data));
        },
        create: (ref, data) => {
          getColMap(ref._col).set(ref.id, applyPatch({}, data));
        },
        delete: (ref) => {
          getColMap(ref._col).delete(ref.id);
        },
      };
      return fn(tx);
    },
    batch() {
      const ops = [];
      return {
        set(ref, data, options) {
          ops.push({ type: 'set', ref, data, options });
        },
        delete(ref) {
          ops.push({ type: 'delete', ref });
        },
        async commit() {
          for (const op of ops) {
            if (op.type === 'set') await op.ref.set(op.data, op.options);
            if (op.type === 'delete') await op.ref.delete();
          }
        },
      };
    },
    async recursiveDelete(ref) {
      await ref.delete();
    },
  };
}

function createFakeAdmin(authUsers = {}) {
  const FieldValue = createFakeFieldValue();
  const deletedAuthUids = [];
  const rtdbRemovedPaths = [];
  return {
    deletedAuthUids,
    rtdbRemovedPaths,
    firestore: {
      FieldValue,
      Timestamp: {
        fromMillis: (ms) => ({ __ts: ms }),
      },
    },
    auth() {
      return {
        async getUser(uid) {
          if (!authUsers[uid]) {
            const err = new Error('User not found');
            err.code = 'auth/user-not-found';
            throw err;
          }
          return authUsers[uid];
        },
        async deleteUser(uid) {
          if (!authUsers[uid]) {
            const err = new Error('User not found');
            err.code = 'auth/user-not-found';
            throw err;
          }
          delete authUsers[uid];
          deletedAuthUids.push(uid);
        },
      };
    },
    database() {
      return {
        ref(path) {
          return {
            async remove() {
              rtdbRemovedPaths.push(path);
            },
          };
        },
      };
    },
  };
}

test('scheduleAccountDeletion sets 30-day window, takes helper offline, and reactivateAccount restores within window', async () => {
  const nowMs = 1_760_000_000_000;
  const db = createFakeDb({
    users: {
      'helper-1': {
        uid: 'helper-1',
        role: 'helper',
        activeRole: 'helper',
        fullName: 'Sipho Dlamini',
        email: 'sipho@example.com',
        onlineStatus: 'online',
        locationSharingEnabled: true,
      },
    },
    helperDispatchIndex: {
      'helper-1': { online: true, available: true, activeRole: 'helper' },
    },
  });
  const admin = createFakeAdmin({ 'helper-1': { uid: 'helper-1', email: 'sipho@example.com' } });

  const scheduled = await scheduleAccountDeletion({
    db,
    admin,
    uid: 'helper-1',
    role: 'helper',
    channel: 'web',
    nowMs,
  });
  assert.equal(scheduled.code, 'scheduled');
  assert.equal(scheduled.deletionScheduledAtMs, nowMs + ACCOUNT_DELETION_GRACE_MS);

  const userAfterSchedule = db._store.get('users').get('helper-1');
  assert.equal(isAccountPendingDeletion(userAfterSchedule), true);
  assert.equal(userAfterSchedule.onlineStatus, 'offline');
  assert.equal(userAfterSchedule.dispatchPaused, true);
  assert.equal(db._store.get('helperDispatchIndex').get('helper-1').available, false);

  const reactivated = await reactivateAccount({
    db,
    admin,
    uid: 'helper-1',
    channel: 'web',
    nowMs: nowMs + 5 * 24 * 60 * 60 * 1000,
  });
  assert.equal(reactivated.code, 'reactivated');
  const userAfterReactivate = db._store.get('users').get('helper-1');
  assert.equal(isAccountPendingDeletion(userAfterReactivate), false);
  assert.equal(userAfterReactivate.accountStatus, 'active');
  assert.equal(userAfterReactivate.dispatchPaused, false);
});

test('scheduleAccountDeletion blocks customer with unpaid completed request or active request', async () => {
  const nowMs = 1_760_000_000_000;
  const db = createFakeDb({
    users: {
      'cust-1': { uid: 'cust-1', role: 'customer', fullName: 'Nomsa Mokoena', email: 'nomsa@example.com' },
    },
    serviceRequests: {
      'req-unpaid': {
        customerId: 'cust-1',
        status: 'completed',
        paymentStatus: 'unpaid',
        totalAmount: 250,
        publicRequestReference: 'UNC-1001',
      },
    },
  });
  const admin = createFakeAdmin();

  const blocked = await scheduleAccountDeletion({ db, admin, uid: 'cust-1', role: 'customer', nowMs });
  assert.equal(blocked.code, 'unpaid-completed-request');
  assert.equal(isAccountPendingDeletion(db._store.get('users').get('cust-1')), false);
});

test('reactivateAccount rejects after 30-day window expires', async () => {
  const nowMs = 1_760_000_000_000;
  const db = createFakeDb({
    users: {
      'cust-2': {
        uid: 'cust-2',
        role: 'customer',
        accountStatus: 'pending_deletion',
        deletionScheduledAtMs: nowMs + 1000,
      },
    },
  });
  const admin = createFakeAdmin();

  const expired = await reactivateAccount({ db, admin, uid: 'cust-2', nowMs: nowMs + 2000 });
  assert.equal(expired.code, 'grace-period-expired');
});

test('WhatsApp account deletion challenge & URL use fragment token and HTTPS origin', () => {
  const nowMs = 1_760_000_000_000;
  const challenge = createWhatsAppAccountDeletionChallenge({
    uid: 'cust-1',
    role: 'customer',
    identityId: 'wa-1',
    phoneNumber: '+27601112222',
    nowMs,
  });
  assert.equal(isWhatsAppAccountDeletionChallengeLive(challenge.challenge, nowMs), true);
  assert.equal(isWhatsAppAccountDeletionChallengeLive(challenge.challenge, challenge.challenge.expiresAtMs), false);
  const url = buildWhatsAppAccountDeletionUrl('https://uncedo.bakayise.com/delete-account', challenge.token);
  assert.match(url, /^https:\/\/uncedo\.bakayise\.com\/delete-account#wa_delete_token=/);
  assert.throws(() => buildWhatsAppAccountDeletionUrl('http://uncedo.bakayise.com/delete-account', challenge.token), /HTTPS/);
});

test('executePermanentAccountDeletion imprints real user details onto existing serviceRequests & payouts before deleting user profile', async () => {
  const nowMs = 1_765_000_000_000;
  const db = createFakeDb({
    users: {
      'cust-del': {
        uid: 'cust-del',
        role: 'customer',
        fullName: 'Lerato Khumalo',
        email: 'lerato@example.com',
        phoneNumber: '+27821234567',
        accountStatus: 'pending_deletion',
        customerProfile: { accountType: 'individual', serviceAddress: '12 Oak Street, Cape Town' },
      },
      'helper-del': {
        uid: 'helper-del',
        role: 'helper',
        activeRole: 'helper',
        fullName: 'Thabo Ndlovu',
        email: 'thabo@example.com',
        whatsappPhoneNumber: '+27839998888',
        accountStatus: 'pending_deletion',
        city: 'Johannesburg',
      },
    },
    serviceRequests: {
      'req-1': {
        customerId: 'cust-del',
        customerName: 'Customer', // generic placeholder should be overwritten with real name
        status: 'completed',
        helperAssignment: {
          helperId: 'helper-del',
          helperName: 'Helper',
        },
      },
      'req-unrelated': {
        customerId: 'other-cust',
        customerName: 'Someone Else',
        status: 'completed',
      },
    },
    helperWeeklyPayouts: {
      '2026-W47_helper-del': {
        helperId: 'helper-del',
        helperName: 'Helper',
        amountMinor: 15000,
      },
    },
    helperServices: {
      'helper-del_plumbing': { helperId: 'helper-del', serviceId: 'plumbing' },
    },
    helperDispatchIndex: {
      'helper-del': { online: false, available: false },
    },
    whatsappUserLinks: {
      'cust-del': { identityId: 'wa-cust' },
      'helper-del': { identityId: 'wa-helper' },
    },
    whatsappIdentities: {
      'wa-cust': { linkedFirebaseUid: 'cust-del', waId: '27821234567' },
      'wa-helper': { linkedFirebaseUid: 'helper-del', waId: '27839998888' },
    },
    whatsappConversations: {
      'wa-cust': { linkedFirebaseUid: 'cust-del' },
      'wa-helper': { linkedFirebaseUid: 'helper-del' },
    },
  });
  const admin = createFakeAdmin({
    'cust-del': { uid: 'cust-del', email: 'lerato@example.com' },
    'helper-del': { uid: 'helper-del', email: 'thabo@example.com' },
  });

  const custOutcome = await executePermanentAccountDeletion({ db, admin, uid: 'cust-del', nowMs });
  assert.equal(custOutcome.code, 'permanently-deleted');
  assert.equal(custOutcome.imprintedCounts.customerServiceRequests, 1);

  const helperOutcome = await executePermanentAccountDeletion({ db, admin, uid: 'helper-del', nowMs });
  assert.equal(helperOutcome.code, 'permanently-deleted');
  assert.equal(helperOutcome.imprintedCounts.helperServiceRequests, 1);
  assert.equal(helperOutcome.imprintedCounts.helperWeeklyPayouts, 1);

  const req1 = db._store.get('serviceRequests').get('req-1');
  assert.equal(req1.customerName, 'Lerato Khumalo');
  assert.equal(req1.customerEmail, 'lerato@example.com');
  assert.equal(req1.customerPhone, '+27821234567');
  assert.equal(req1.customerDeleted, true);
  assert.equal(req1.customerSnapshot.fullName, 'Lerato Khumalo');
  assert.equal(req1.helperAssignment.helperName, 'Thabo Ndlovu');
  assert.equal(req1.helperAssignment.helperEmail, 'thabo@example.com');
  assert.equal(req1.helperAssignment.helperPhone, '+27839998888');
  assert.equal(req1.helperAssignment.helperDeleted, true);
  assert.equal(req1.helperSnapshot.fullName, 'Thabo Ndlovu');

  // Unrelated request untouched; no phantom records created
  const unrelated = db._store.get('serviceRequests').get('req-unrelated');
  assert.equal(unrelated.customerDeleted, undefined);
  assert.equal(db._store.get('serviceRequests').size, 2);

  // Payout imprinted
  const payout = db._store.get('helperWeeklyPayouts').get('2026-W47_helper-del');
  assert.equal(payout.helperName, 'Thabo Ndlovu');
  assert.equal(payout.helperEmail, 'thabo@example.com');
  assert.equal(payout.helperDeleted, true);

  // Profiles, dispatch, helperServices, WhatsApp links, and Auth users are deleted
  assert.equal(db._store.get('users').has('cust-del'), false);
  assert.equal(db._store.get('users').has('helper-del'), false);
  assert.equal(db._store.get('helperDispatchIndex').has('helper-del'), false);
  assert.equal(db._store.get('helperServices').has('helper-del_plumbing'), false);
  assert.equal(db._store.get('whatsappUserLinks').has('cust-del'), false);
  assert.equal(db._store.get('whatsappIdentities').get('wa-cust').linkedFirebaseUid, undefined);
  assert.equal(db._store.get('whatsappConversations').get('wa-helper').linkedFirebaseUid, undefined);
  assert.deepEqual(admin.deletedAuthUids, ['cust-del', 'helper-del']);
});

test('buildDeletedUserRecordSnapshot falls back gracefully across displayName and email', () => {
  const snapshot = buildDeletedUserRecordSnapshot('u1', { email: 'user@example.com' }, { displayName: 'Zanele' }, 100);
  assert.equal(snapshot.fullName, 'Zanele');
  assert.equal(snapshot.email, 'user@example.com');
  assert.equal(snapshot.accountDeleted, true);
});

test('executePermanentAccountDeletion preserves sanitized payoutSnapshot when helper has positive wallet balance', async () => {
  const nowMs = 1_760_000_000_000;
  const db = createFakeDb({
    users: {
      'helper-pos': {
        uid: 'helper-pos',
        role: 'helper',
        activeRole: 'helper',
        fullName: 'Buhle Mkhize',
        email: 'buhle@example.com',
        payout: {
          verificationStatus: 'verified',
          recipientCode: 'RCP_buhle_1',
          subaccountCode: 'ACCT_buhle_1',
          bankCode: '632005',
          bankName: 'ABSA',
          accountType: 'personal',
          documentNumber: '9001015009087',
        },
      },
    },
    helperWallets: {
      'helper-pos': {
        helperId: 'helper-pos',
        balanceMinor: 15000,
        balance: 150,
        currency: 'ZAR',
      },
    },
  });
  const admin = createFakeAdmin({ 'helper-pos': { uid: 'helper-pos', email: 'buhle@example.com' } });

  const outcome = await executePermanentAccountDeletion({ db, admin, uid: 'helper-pos', nowMs });
  assert.equal(outcome.code, 'permanently-deleted');
  assert.equal(db._store.get('users').has('helper-pos'), false);

  const preservedWallet = db._store.get('helperWallets').get('helper-pos');
  assert.equal(preservedWallet.helperDeleted, true);
  assert.equal(preservedWallet.helperName, 'Buhle Mkhize');
  assert.equal(preservedWallet.payoutSnapshot.recipientCode, 'RCP_buhle_1');
  assert.equal(preservedWallet.payoutSnapshot.subaccountCode, 'ACCT_buhle_1');
  assert.equal(preservedWallet.payoutSnapshot.verificationStatus, 'verified');
  assert.equal(preservedWallet.payoutSnapshot.documentNumber, undefined);
});

