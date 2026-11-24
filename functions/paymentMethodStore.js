'use strict';

const { randomUUID } = require('node:crypto');

const PRIVATE_COLLECTION = 'paymentAuthorizations';

function publicPaymentMethod(method = {}) {
  return {
    id: String(method.id || ''),
    nickname: String(method.nickname || `${method.brand || 'Card'} ending ${method.last4 || '----'}`).slice(0, 80),
    brand: String(method.brand || 'Card').slice(0, 40),
    last4: String(method.last4 || '').slice(-4),
    isDefault: method.isDefault === true,
    reusable: method.reusable === true,
    createdAt: String(method.createdAt || ''),
  };
}

function privateMethodsRef(db, uid) {
  return db.collection(PRIVATE_COLLECTION).doc(String(uid)).collection('methods');
}

async function migrateLegacyPaymentMethods({ db, admin, uid }) {
  const userId = String(uid || '').trim();
  if (!userId) return [];
  const userRef = db.collection('users').doc(userId);
  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) return [];
    const user = userSnap.data() || {};
    const existing = Array.isArray(user.paymentMethods) ? user.paymentMethods : [];
    const withAuthorization = existing.filter((method) => String(method?.paystackAuthorizationCode || '').trim());
    const privateRefs = withAuthorization.map((method, index) => {
      const methodId = String(method.id || `legacy_${index}`);
      return { method, ref: privateMethodsRef(db, userId).doc(methodId) };
    });
    const privateSnaps = await Promise.all(privateRefs.map(({ ref }) => transaction.get(ref)));
    const safeMethods = existing.map(publicPaymentMethod).filter((method) => method.id);
    const needsSanitize = existing.some((method) => (
      Object.prototype.hasOwnProperty.call(method || {}, 'paystackAuthorizationCode')
      || Object.prototype.hasOwnProperty.call(method || {}, 'signature')
      || Object.keys(method || {}).some((key) => !['id', 'nickname', 'brand', 'last4', 'isDefault', 'reusable', 'createdAt'].includes(key))
    ));
    if (!needsSanitize) return safeMethods;
    privateRefs.forEach(({ method, ref }, index) => {
      if (privateSnaps[index].exists) return;
      transaction.create(ref, {
        methodId: ref.id,
        uid: userId,
        authorizationCode: String(method.paystackAuthorizationCode || '').trim(),
        authorizationSignature: String(method.signature || '').slice(0, 120) || null,
        brand: String(method.brand || 'Card').slice(0, 40),
        last4: String(method.last4 || '').slice(-4),
        reusable: method.reusable === true,
        consentedAtMs: Number(method.consentedAtMs || 0),
        consentSource: 'legacy_card_on_file',
        createdAt: String(method.createdAt || ''),
        migratedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    transaction.set(userRef, { paymentMethods: safeMethods, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return safeMethods;
  });
}

async function getServerPaymentMethods({ db, admin, uid }) {
  const userId = String(uid || '').trim();
  const safeMethods = await migrateLegacyPaymentMethods({ db, admin, uid: userId });
  if (!userId || !safeMethods.length) return [];
  const privateSnap = await privateMethodsRef(db, userId).limit(50).get();
  const privateById = new Map(privateSnap.docs.map((doc) => [doc.id, doc.data() || {}]));
  return safeMethods.map((method) => {
    const authorization = privateById.get(method.id) || {};
    return {
      ...method,
      paystackAuthorizationCode: String(authorization.authorizationCode || ''),
      signature: String(authorization.authorizationSignature || '') || null,
      payerEmail: String(authorization.payerEmail || '').trim().toLowerCase() || null,
    };
  });
}

async function getServerPaymentMethod({ db, admin, uid, methodId }) {
  const methods = await getServerPaymentMethods({ db, admin, uid });
  return methods.find((method) => method.id === String(methodId || '')) || null;
}

async function storeReusablePaymentMethod({
  db,
  admin,
  uid,
  authorization = {},
  nickname = '',
  consentAtMs = Date.now(),
  consentPurpose = 'customer_payment_method_added',
  payerEmail = '',
  allowCreateGuestProfile = false,
}) {
  const userId = String(uid || '').trim();
  const authorizationCode = String(authorization.authorization_code || '').trim();
  const normalizedPayerEmail = String(payerEmail || '').trim().toLowerCase();
  if (!userId || !authorizationCode || authorization.reusable !== true) return { saved: false, reason: 'not-reusable' };
  await migrateLegacyPaymentMethods({ db, admin, uid: userId });
  const userRef = db.collection('users').doc(userId);
  const methodsRef = privateMethodsRef(db, userId);
  const duplicateQuery = methodsRef.where('authorizationCode', '==', authorizationCode).limit(1);
  return db.runTransaction(async (transaction) => {
    const [userSnap, duplicateSnap] = await Promise.all([transaction.get(userRef), transaction.get(duplicateQuery)]);
    const isGuestUid = userId.startsWith('guest_');
    if (!userSnap.exists && !allowCreateGuestProfile && !isGuestUid) return { saved: false, reason: 'profile-not-found' };
    const user = userSnap.exists ? (userSnap.data() || {}) : {};
    const methods = Array.isArray(user.paymentMethods) ? user.paymentMethods.map(publicPaymentMethod) : [];
    if (!duplicateSnap.empty) {
      const duplicateDoc = duplicateSnap.docs[0];
      const duplicateId = duplicateDoc.id;
      if (normalizedPayerEmail && !String(duplicateDoc.data()?.payerEmail || '').trim()) {
        transaction.set(duplicateDoc.ref, { payerEmail: normalizedPayerEmail }, { merge: true });
      }
      let duplicate = methods.find((method) => method.id === duplicateId);
      if (!duplicate) {
        duplicate = publicPaymentMethod({
          id: duplicateId, nickname: nickname || `${authorization.brand || 'Card'} •••• ${authorization.last4 || '----'}`,
          brand: authorization.brand || 'Card', last4: authorization.last4 || '', reusable: true,
          isDefault: methods.length === 0, createdAt: new Date(consentAtMs).toISOString(),
        });
        methods.push(duplicate);
        transaction.set(userRef, {
          ...(!userSnap.exists ? {
            uid: userId,
            ...(isGuestUid ? { isGuest: true } : {}),
            wallet: { balance: 0, currency: 'ZAR' },
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          } : {}),
          paymentMethods: methods,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      return { saved: true, duplicate: true, card: duplicate };
    }
    const methodId = randomUUID();
    const card = publicPaymentMethod({
      id: methodId,
      nickname: nickname || `${String(authorization.brand || 'Card').slice(0, 24)} •••• ${String(authorization.last4 || '----').slice(-4)}`,
      brand: authorization.brand || 'Card',
      last4: authorization.last4 || '',
      reusable: true,
      isDefault: methods.length === 0,
      createdAt: new Date(consentAtMs).toISOString(),
    });
    transaction.create(methodsRef.doc(methodId), {
      methodId,
      uid: userId,
      authorizationCode,
      authorizationSignature: String(authorization.signature || '').slice(0, 120) || null,
      brand: card.brand,
      last4: card.last4,
      reusable: true,
      ...(normalizedPayerEmail ? { payerEmail: normalizedPayerEmail } : {}),
      consentedAtMs: Number(consentAtMs || 0),
      consentPurpose: String(consentPurpose || 'customer_payment_method_added'),
      createdAt: card.createdAt,
    });
    transaction.set(userRef, {
      ...(!userSnap.exists ? {
        uid: userId,
        ...(isGuestUid ? { isGuest: true } : {}),
        wallet: { balance: 0, currency: 'ZAR' },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      } : {}),
      paymentMethods: [...methods, card],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { saved: true, duplicate: false, card };
  });
}

async function updateSavedPaymentMethod({ db, admin, uid, methodId, action }) {
  const userId = String(uid || '').trim();
  const normalizedMethodId = String(methodId || '').trim();
  const normalizedAction = String(action || '').trim().toLowerCase();
  if (!userId || !normalizedMethodId || !['set_default', 'remove'].includes(normalizedAction)) return { action: 'invalid-input' };
  await migrateLegacyPaymentMethods({ db, admin, uid: userId });
  const userRef = db.collection('users').doc(userId);
  const privateRef = privateMethodsRef(db, userId).doc(normalizedMethodId);
  return db.runTransaction(async (transaction) => {
    const [userSnap, privateSnap] = await Promise.all([transaction.get(userRef), transaction.get(privateRef)]);
    if (!userSnap.exists) return { action: 'profile-not-found' };
    const user = userSnap.data() || {};
    const methods = Array.isArray(user.paymentMethods) ? user.paymentMethods.map(publicPaymentMethod) : [];
    if (!methods.some((method) => method.id === normalizedMethodId)) return { action: 'method-not-found' };
    let nextMethods;
    if (normalizedAction === 'set_default') {
      nextMethods = methods.map((method) => ({ ...method, isDefault: method.id === normalizedMethodId }));
    } else {
      nextMethods = methods.filter((method) => method.id !== normalizedMethodId);
      if (nextMethods.length && !nextMethods.some((method) => method.isDefault)) nextMethods[0] = { ...nextMethods[0], isDefault: true };
    }
    transaction.set(userRef, { paymentMethods: nextMethods, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    if (normalizedAction === 'remove' && privateSnap.exists) transaction.delete(privateRef);
    return { action: 'updated', paymentMethods: nextMethods };
  });
}

const REQUEST_TEMP_AUTH_COLLECTION = 'requestPaymentAuthorizations';

async function storeTemporaryRequestPaymentAuthorization({
  db,
  admin,
  requestId,
  customerId = '',
  authorization = {},
  payerEmail = '',
  consentAtMs = Date.now(),
  now = Date.now(),
} = {}) {
  const safeRequestId = String(requestId || '').trim();
  const safeCustomerId = String(customerId || '').trim();
  const authorizationCode = String(authorization.authorization_code || authorization.authorizationCode || '').trim();
  const normalizedEmail = String(payerEmail || '').trim().toLowerCase();
  if (!safeRequestId || !authorizationCode || authorization.reusable !== true) {
    return { saved: false, reason: 'not-reusable' };
  }
  const brand = String(authorization.brand || 'Card').slice(0, 40);
  const last4 = String(authorization.last4 || '').slice(-4);
  const ref = db.collection(REQUEST_TEMP_AUTH_COLLECTION).doc(safeRequestId);
  await ref.set({
    requestId: safeRequestId,
    customerId: safeCustomerId,
    authorizationCode,
    authorizationSignature: String(authorization.signature || '').slice(0, 120) || null,
    brand,
    last4,
    reusable: true,
    temporary: true,
    ...(normalizedEmail ? { payerEmail: normalizedEmail } : {}),
    consentedAtMs: Number(consentAtMs || now),
    createdAtMs: now,
    updatedAtMs: now,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return {
    saved: true,
    card: {
      id: 'request_temp',
      brand,
      last4,
      reusable: true,
      temporary: true,
      payerEmail: normalizedEmail || null,
    },
  };
}

async function getTemporaryRequestPaymentAuthorization({ db, requestId } = {}) {
  const safeRequestId = String(requestId || '').trim();
  if (!safeRequestId) return null;
  const snap = await db.collection(REQUEST_TEMP_AUTH_COLLECTION).doc(safeRequestId).get().catch(() => null);
  if (!snap?.exists) return null;
  const data = snap.data() || {};
  const authorizationCode = String(data.authorizationCode || '').trim();
  if (!authorizationCode || data.reusable !== true) return null;
  return {
    id: 'request_temp',
    temporary: true,
    brand: String(data.brand || 'Card').slice(0, 40),
    last4: String(data.last4 || '').slice(-4),
    reusable: true,
    customerId: String(data.customerId || '').trim(),
    paystackAuthorizationCode: authorizationCode,
    signature: String(data.authorizationSignature || '') || null,
    payerEmail: String(data.payerEmail || '').trim().toLowerCase() || null,
  };
}

async function deleteTemporaryRequestPaymentAuthorization({ db, requestId } = {}) {
  const safeRequestId = String(requestId || '').trim();
  if (!safeRequestId) return false;
  try {
    await db.collection(REQUEST_TEMP_AUTH_COLLECTION).doc(safeRequestId).delete();
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  PRIVATE_COLLECTION,
  REQUEST_TEMP_AUTH_COLLECTION,
  deleteTemporaryRequestPaymentAuthorization,
  getServerPaymentMethod,
  getServerPaymentMethods,
  getTemporaryRequestPaymentAuthorization,
  migrateLegacyPaymentMethods,
  publicPaymentMethod,
  storeReusablePaymentMethod,
  storeTemporaryRequestPaymentAuthorization,
  updateSavedPaymentMethod,
};

