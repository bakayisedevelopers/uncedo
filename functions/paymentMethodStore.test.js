'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getServerPaymentMethods,
  migrateLegacyPaymentMethods,
  storeReusablePaymentMethod,
  updateSavedPaymentMethod,
} = require('./paymentMethodStore');

class Snap {
  constructor(ref, data) { this.ref = ref; this.id = ref.id; this.exists = data !== undefined; this.value = data === undefined ? undefined : structuredClone(data); }
  data() { return this.value === undefined ? undefined : structuredClone(this.value); }
}
class DocRef {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split('/').at(-1); }
  collection(name) { return new Collection(this.db, `${this.path}/${name}`); }
  async get() { return new Snap(this, this.db.data.get(this.path)); }
}
class Query {
  constructor(collection, filters = [], max = 100) { this.collection = collection; this.filters = filters; this.max = max; }
  where(field, operator, value) { return new Query(this.collection, [...this.filters, [field, operator, value]], this.max); }
  limit(count) { return new Query(this.collection, this.filters, count); }
  async get() { return this.snapshot(); }
  snapshot() {
    const prefix = `${this.collection.path}/`;
    const docs = [...this.collection.db.data.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map(([path, value]) => new Snap(new DocRef(this.collection.db, path), value))
      .filter((snap) => this.filters.every(([field, operator, wanted]) => operator === '==' && snap.data()?.[field] === wanted))
      .slice(0, this.max);
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}
class Collection extends Query {
  constructor(db, path) { super(null); this.db = db; this.path = path; this.collection = this; }
  doc(id) { return new DocRef(this.db, `${this.path}/${String(id)}`); }
  where(field, operator, value) { return new Query(this, [[field, operator, value]]); }
  limit(count) { return new Query(this, [], count); }
}
class Db {
  constructor(seed = {}) { this.data = new Map(Object.entries(seed).map(([key, value]) => [key, structuredClone(value)])); this.mutex = Promise.resolve(); }
  collection(name) { return new Collection(this, name); }
  async runTransaction(callback) {
    const previous = this.mutex;
    let release;
    this.mutex = new Promise((resolve) => { release = resolve; });
    await previous;
    const writes = [];
    const tx = {
      get: async (ref) => ref instanceof Query ? ref.snapshot() : new Snap(ref, this.data.get(ref.path)),
      create: (ref, value) => writes.push({ kind: 'create', ref, value: structuredClone(value) }),
      set: (ref, value, options = {}) => writes.push({ kind: 'set', ref, value: structuredClone(value), merge: options.merge === true }),
      delete: (ref) => writes.push({ kind: 'delete', ref }),
    };
    try {
      const result = await callback(tx);
      for (const write of writes) {
        const old = this.data.get(write.ref.path);
        if (write.kind === 'create' && old !== undefined) throw new Error(`already-exists:${write.ref.path}`);
        if (write.kind === 'delete') this.data.delete(write.ref.path);
        else this.data.set(write.ref.path, write.merge && old ? { ...old, ...write.value } : write.value);
      }
      return result;
    } finally { release(); }
  }
}
const admin = { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } };

test('new reusable authorizations are stored server-side while profiles receive only masked card descriptors', async () => {
  const db = new Db({ 'users/customer-1': { uid: 'customer-1', paymentMethods: [] } });
  const saved = await storeReusablePaymentMethod({
    db, admin, uid: 'customer-1',
    authorization: { authorization_code: 'AUTH_SECRET_123', reusable: true, brand: 'visa', last4: '4242', signature: 'SIG_PRIVATE' },
    consentAtMs: 100, consentPurpose: 'explicit_future_card_consent',
  });
  const profile = (await db.collection('users').doc('customer-1').get()).data();
  const privateCard = (await db.collection('paymentAuthorizations').doc('customer-1').collection('methods').doc(saved.card.id).get()).data();
  assert.equal(saved.saved, true);
  assert.equal(profile.paymentMethods[0].last4, '4242');
  assert.equal(Object.hasOwn(profile.paymentMethods[0], 'paystackAuthorizationCode'), false);
  assert.equal(Object.hasOwn(profile.paymentMethods[0], 'signature'), false);
  assert.equal(privateCard.authorizationCode, 'AUTH_SECRET_123');
  assert.equal(privateCard.authorizationSignature, 'SIG_PRIVATE');
  assert.equal(privateCard.consentPurpose, 'explicit_future_card_consent');
  const serverMethods = await getServerPaymentMethods({ db, admin, uid: 'customer-1' });
  assert.equal(serverMethods[0].paystackAuthorizationCode, 'AUTH_SECRET_123');
});

test('legacy embedded authorization codes migrate to private documents and are removed from the user profile', async () => {
  const db = new Db({
    'users/customer-2': { uid: 'customer-2', paymentMethods: [{ id: 'legacy-card', brand: 'visa', last4: '9876', reusable: true, paystackAuthorizationCode: 'OLD_AUTH', signature: 'OLD_SIG' }] },
  });
  await migrateLegacyPaymentMethods({ db, admin, uid: 'customer-2' });
  const profile = (await db.collection('users').doc('customer-2').get()).data();
  const authorization = (await db.collection('paymentAuthorizations').doc('customer-2').collection('methods').doc('legacy-card').get()).data();
  assert.equal(profile.paymentMethods[0].id, 'legacy-card');
  assert.equal(Object.hasOwn(profile.paymentMethods[0], 'paystackAuthorizationCode'), false);
  assert.equal(authorization.authorizationCode, 'OLD_AUTH');
  assert.equal(authorization.consentSource, 'legacy_card_on_file');
});

test('payment method removal deletes server authorization and default selection updates only safe metadata', async () => {
  const db = new Db({
    'users/customer-3': { uid: 'customer-3', paymentMethods: [
      { id: 'card-a', brand: 'visa', last4: '1111', reusable: true, isDefault: true },
      { id: 'card-b', brand: 'mc', last4: '2222', reusable: true, isDefault: false },
    ] },
    'paymentAuthorizations/customer-3/methods/card-a': { uid: 'customer-3', authorizationCode: 'AUTH_A' },
    'paymentAuthorizations/customer-3/methods/card-b': { uid: 'customer-3', authorizationCode: 'AUTH_B' },
  });
  const selected = await updateSavedPaymentMethod({ db, admin, uid: 'customer-3', methodId: 'card-b', action: 'set_default' });
  assert.equal(selected.action, 'updated');
  assert.equal(selected.paymentMethods.find((card) => card.id === 'card-b').isDefault, true);
  const removed = await updateSavedPaymentMethod({ db, admin, uid: 'customer-3', methodId: 'card-a', action: 'remove' });
  assert.equal(removed.paymentMethods.length, 1);
  assert.equal(removed.paymentMethods[0].isDefault, true);
  assert.equal((await db.collection('paymentAuthorizations').doc('customer-3').collection('methods').doc('card-a').get()).exists, false);
  assert.equal((await db.collection('paymentAuthorizations').doc('customer-3').collection('methods').doc('card-b').get()).exists, true);
});
