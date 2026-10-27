'use strict';

const CUSTOMER_PROFILE_DEFAULTS = Object.freeze({
  accountType: '',
  customerType: '',
  serviceAddress: '',
  discoverySource: '',
  preferredServiceCategories: [],
  businessName: '',
  businessEmail: '',
  businessCategory: '',
});

const CUSTOMER_ROLE_VALUES = new Set(['customer', 'student', 'client']);
const HELPER_ROLE_VALUES = new Set(['helper', 'provider', 'tutor']);
const PRIVILEGED_ROLE_VALUES = new Set(['admin', 'staff', 'support', 'moderator']);

function normalizedRoles(profile = {}) {
  return [profile.role, profile.activeRole, ...(Array.isArray(profile.roles) ? profile.roles : [])]
    .map((role) => String(role || '').trim().toLowerCase())
    .filter(Boolean);
}

function profileDefaults({ uid, email, displayName, serverTimestamp }) {
  const name = String(displayName || '').trim().slice(0, 120);
  const now = serverTimestamp();
  return {
    uid,
    email: String(email || '').trim(),
    fullName: name,
    displayName: name,
    role: 'customer',
    activeRole: 'customer',
    roles: ['customer'],
    phoneNumber: '',
    paymentMethods: [],
    customerProfile: { ...CUSTOMER_PROFILE_DEFAULTS },
    createdAt: now,
    updatedAt: now,
  };
}

function customerProfilePatch(existing, { uid, email, displayName, serverTimestamp }) {
  const roles = normalizedRoles(existing);
  if (roles.some((role) => HELPER_ROLE_VALUES.has(role) || PRIVILEGED_ROLE_VALUES.has(role))) {
    const error = new Error('This account is not a customer account.');
    error.code = 'permission-denied';
    throw error;
  }
  if (roles.some((role) => !CUSTOMER_ROLE_VALUES.has(role))) {
    const error = new Error('This account has a role that cannot be initialized as a customer.');
    error.code = 'failed-precondition';
    throw error;
  }

  const patch = {};
  const name = String(displayName || '').trim().slice(0, 120);
  if (!existing.uid) patch.uid = uid;
  if (!String(existing.email || '').trim() && email) patch.email = String(email).trim();
  if (!String(existing.fullName || '').trim() && name) patch.fullName = name;
  if (!String(existing.displayName || '').trim() && name) patch.displayName = name;
  if (!roles.length) {
    patch.role = 'customer';
    patch.activeRole = 'customer';
    patch.roles = ['customer'];
  }
  if (!Object.hasOwn(existing, 'phoneNumber')) patch.phoneNumber = '';
  if (!Object.hasOwn(existing, 'paymentMethods')) patch.paymentMethods = [];

  const currentCustomerProfile = existing.customerProfile && typeof existing.customerProfile === 'object'
    && !Array.isArray(existing.customerProfile) ? existing.customerProfile : {};
  const missingCustomerFields = Object.fromEntries(
    Object.entries(CUSTOMER_PROFILE_DEFAULTS)
      .filter(([key]) => !Object.hasOwn(currentCustomerProfile, key))
      .map(([key, value]) => [key, value]),
  );
  if (!existing.customerProfile || Object.keys(missingCustomerFields).length) {
    patch.customerProfile = { ...missingCustomerFields };
  }
  if (!existing.createdAt) patch.createdAt = serverTimestamp();
  patch.updatedAt = serverTimestamp();
  return patch;
}

async function ensureCustomerProfileRecord({ db, uid, email = '', displayName = '', serverTimestamp }) {
  if (!db || typeof db.runTransaction !== 'function') throw new TypeError('A Firestore Admin database is required.');
  if (!uid || typeof uid !== 'string') throw new TypeError('An authenticated user ID is required.');
  if (typeof serverTimestamp !== 'function') throw new TypeError('A server timestamp factory is required.');

  const userRef = db.collection('users').doc(uid);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    if (!snapshot.exists) {
      transaction.create(userRef, profileDefaults({ uid, email, displayName, serverTimestamp }));
      return { created: true, repaired: false };
    }

    const patch = customerProfilePatch(snapshot.data() || {}, { uid, email, displayName, serverTimestamp });
    if (Object.keys(patch).length) transaction.set(userRef, patch, { merge: true });
    return { created: false, repaired: Object.keys(patch).length > 0 };
  });
}

module.exports = {
  CUSTOMER_PROFILE_DEFAULTS,
  ensureCustomerProfileRecord,
  profileDefaults,
};
