import { getFirebaseClients } from '../firebase/config';
import { reconcileOpenServiceRequests } from './requestReconciliationService';

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'bakayise-uncedo';
const useFirebaseEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
const firebaseEmulatorHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || 'localhost';

const ROLE_GROUPS = {
  helper: new Set(['helper', 'tutor', 'provider']),
  customer: new Set(['customer', 'student']),
  admin: new Set(['admin']),
};

function getFunctionEndpoint(functionName) {
  if (useFirebaseEmulators) {
    return `http://${firebaseEmulatorHost}:5001/${projectId}/us-central1/${functionName}`;
  }

  return `https://us-central1-${projectId}.cloudfunctions.net/${functionName}`;
}

function normalizeRole(value) {
  return String(value || '').trim().toLowerCase();
}

function canonicalRole(value) {
  const role = normalizeRole(value);
  if (!role) return '';
  if (role === 'provider' || role === 'tutor' || role === 'helper') return 'helper';
  if (role === 'student' || role === 'customer') return 'customer';
  if (role === 'admin') return 'admin';
  return role;
}

function collectRoles(profile = {}) {
  return new Set([
    canonicalRole(profile.role),
    canonicalRole(profile.activeRole),
    ...(Array.isArray(profile.roles) ? profile.roles.map(canonicalRole) : []),
  ].filter(Boolean));
}

function inferRolesFromShape(profile = {}) {
  const roles = collectRoles(profile);
  const helperProfile = profile.helperProfile || profile.providerProfile || {};
  const customerProfile = profile.customerProfile || profile.studentProfile || {};

  const hasHelperSignals = Boolean(
    profile.agreement
    || profile.payout
    || profile.onlineStatus
    || profile.verificationStatus
    || profile.locationSharingEnabled !== undefined
    || helperProfile.providerType
    || helperProfile.businessName
  );

  const hasCustomerSignals = Boolean(
    profile.wallet
    || profile.freeMinutesRemaining !== undefined
    || profile.referralSlug
    || customerProfile.accountType
    || customerProfile.customerType
    || customerProfile.serviceAddress
    || customerProfile.discoverySource
    || customerProfile.preferredServiceCategories
  );

  if (hasHelperSignals) {
    roles.add('helper');
  }

  if (hasCustomerSignals) {
    roles.add('customer');
  }

  return roles;
}

function profileMatchesGroup(profile, groupName) {
  const roles = inferRolesFromShape(profile);
  const group = ROLE_GROUPS[groupName];
  if (!group) return false;
  return [...group].some((role) => roles.has(role));
}

function normalizePictureEntry(picture) {
  if (!picture) return null;
  if (typeof picture === 'string') {
    const uri = String(picture || '').trim();
    if (!uri) return null;
    return {
      id: `pic_${uri.slice(0, 24).replace(/[^a-z0-9]+/gi, '_')}`,
      uri,
      objectPath: '',
      uploadedAt: new Date().toISOString(),
    };
  }

  const uri = String(picture.uri || picture.downloadUrl || '').trim();
  if (!uri) return null;

  return {
    id: String(picture.id || `pic_${Math.random().toString(36).slice(2, 10)}`),
    uri,
    objectPath: String(picture.objectPath || '').trim(),
    uploadedAt: picture.uploadedAt || new Date().toISOString(),
  };
}

export function normalizeAdminProfile(profile = {}) {
  const helperProfile = profile.helperProfile || profile.providerProfile || {};
  const customerProfile = profile.customerProfile || profile.studentProfile || {};
  const inferredRoles = inferRolesFromShape(profile);
  const role = canonicalRole(profile.role) || canonicalRole(profile.activeRole) || [...inferredRoles][0] || '';
  const activeRole = canonicalRole(profile.activeRole) || role;

  return {
    ...profile,
    uid: profile.uid || profile.id || '',
    fullName: String(profile.fullName || profile.displayName || '').trim(),
    displayName: String(profile.displayName || profile.fullName || '').trim(),
    email: String(profile.email || '').trim(),
    role,
    activeRole,
    roles: Array.from(inferredRoles),
    providerType: String(profile.providerType || helperProfile.providerType || '').trim().toLowerCase(),
    businessName: String(profile.businessName || helperProfile.businessName || '').trim(),
    city: String(profile.city || helperProfile.city || '').trim(),
    homeAddress: String(profile.homeAddress || helperProfile.homeAddress || '').trim(),
    phoneNumber: String(profile.phoneNumber || helperProfile.phoneNumber || '').trim(),
    suspended: Boolean(profile.suspended ?? helperProfile.suspended ?? false),
    verificationStatus: String(profile.verificationStatus || helperProfile.verificationStatus || '').trim().toLowerCase(),
    adminStatus: String(profile.adminStatus || helperProfile.adminStatus || '').trim().toLowerCase(),
    customerProfile: {
      ...(profile.customerProfile || {}),
      serviceAddress: String(customerProfile?.serviceAddress || '').trim(),
      businessName: String(customerProfile?.businessName || '').trim(),
      businessEmail: String(customerProfile?.businessEmail || '').trim(),
      businessCategory: String(customerProfile?.businessCategory || '').trim(),
      accountType: String(customerProfile?.accountType || '').trim(),
      customerType: String(customerProfile?.customerType || '').trim(),
      discoverySource: String(customerProfile?.discoverySource || '').trim(),
      preferredServiceCategories: Array.isArray(customerProfile?.preferredServiceCategories) ? customerProfile.preferredServiceCategories : [],
    },
    studentProfile: {
      ...(profile.studentProfile || {}),
      grade: customerProfile?.grade || profile.studentProfile?.grade || null,
      curriculum: String(customerProfile?.curriculum || profile.studentProfile?.curriculum || '').trim(),
      discoverySource: String(customerProfile?.discoverySource || profile.studentProfile?.discoverySource || '').trim(),
    },
  };
}

async function saveUserProfile(uid, nextProfile, traceLabel = 'admin:saveUserProfile') {
  const clients = await getFirebaseClients();
  if (!clients) {
    throw new Error('Firebase is not configured for the admin app.');
  }

  const { db, firestoreModule } = clients;
  const { doc, getDoc, setDoc, serverTimestamp } = firestoreModule;
  const ref = doc(db, 'users', uid);
  const existing = await getDoc(ref);
  const current = existing.exists() ? existing.data() : {};

  console.info('[admin:user-write]', {
    traceLabel,
    uid,
    keys: Object.keys(nextProfile || {}),
  });

  await setDoc(
    ref,
    {
      ...current,
      ...nextProfile,
      updatedAt: serverTimestamp(),
      createdAt: current.createdAt || serverTimestamp(),
    },
    { merge: true },
  );

  const saved = await getDoc(ref);
  return saved.exists() ? normalizeAdminProfile({ uid: saved.id, ...saved.data() }) : null;
}

export async function getUserProfile(uid) {
  const clients = await getFirebaseClients();
  if (!clients || !uid) {
    return null;
  }

  const { db, firestoreModule } = clients;
  const { doc, getDoc } = firestoreModule;
  const snapshot = await getDoc(doc(db, 'users', uid));
  return snapshot.exists() ? normalizeAdminProfile({ uid: snapshot.id, ...snapshot.data() }) : null;
}

export async function listUsersByRole(activeRole) {
  const clients = await getFirebaseClients();
  if (!clients) {
    return [];
  }

  const { db, firestoreModule } = clients;
  const { collection, getDocs } = firestoreModule;
  const snapshot = await getDocs(collection(db, 'users'));
  const normalizedGroup = normalizeRole(activeRole);
  const resolvedGroup = normalizedGroup === 'provider' ? 'helper' : normalizedGroup;

  return snapshot.docs
    .map((item) => normalizeAdminProfile({ uid: item.id, ...item.data() }))
    .filter((profile) => {
      if (resolvedGroup === 'helper') return profileMatchesGroup(profile, 'helper');
      if (resolvedGroup === 'customer') return profileMatchesGroup(profile, 'customer');
      if (resolvedGroup === 'admin') return profileMatchesGroup(profile, 'admin');
      return [
        profile.role,
        profile.activeRole,
        ...(Array.isArray(profile.roles) ? profile.roles : []),
      ].map(canonicalRole).includes(canonicalRole(normalizedGroup));
    });
}

export async function listHelperProfiles() {
  const helpers = await listUsersByRole('helper');
  const serviceRows = await loadHelperServiceRows(helpers);
  return helpers.map((helper) => ({
    ...helper,
    helperServiceRows: serviceRows.filter((row) => row.helperUid === helper.uid),
  }));
}

export async function listCustomerProfiles() {
  return listUsersByRole('customer');
}

export async function updateHelperModeration(uid, updates = {}) {
  const profile = await getUserProfile(uid);
  if (!profile) {
    throw new Error('Helper profile not found.');
  }

  return saveUserProfile(uid, {
    ...profile,
    ...updates,
  }, 'admin:updateHelperModeration');
}

function normalizeHelperServiceOfferingRow(docId = '', data = {}, helperProfilesById = new Map()) {
  const helperId = String(data.helperId || '').trim();
  const helper = helperProfilesById.get(helperId) || {};
  const serviceId = String(data.serviceId || '').trim();
  return {
    providerUid: helperId,
    providerName: helper.fullName || helper.displayName || helper.email || 'Helper',
    helperUid: helperId,
    helperName: helper.fullName || helper.displayName || helper.email || 'Helper',
    providerEmail: helper.email || '',
    providerType: helper.providerType || 'individual',
    businessName: helper.businessName || '',
    city: helper.city || '',
    phoneNumber: helper.phoneNumber || '',
    suspended: Boolean(helper.suspended),
    verificationStatus: String(helper.verificationStatus || 'pending').toLowerCase(),
    serviceId,
    categoryId: String(data.categoryId || '').trim(),
    serviceName: String(data.serviceName || data.name || serviceId).trim(),
    serviceDescription: String(data.description || '').trim(),
    offeringId: String(data.offeringId || docId).trim(),
    offeringStatus: String(data.status || 'pending').toLowerCase(),
    offeringActive: data.active !== false,
    offeringVerified: data.verified === true,
    approved: data.approved === true,
    photos: Array.isArray(data.photos) ? data.photos : [],
    pictures: Array.isArray(data.photos) ? data.photos : [],
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

export async function updateHelperServiceStatus({ uid, serviceId, offeringId, updates = {} }) {
  const clients = await getFirebaseClients();
  if (!clients) throw new Error('Firebase is not configured for the admin app.');
  const { db, firestoreModule } = clients;
  const { doc, serverTimestamp, setDoc } = firestoreModule;
  const normalizedStatus = String(updates.status || '').trim().toLowerCase();
  const nextUpdates = {
    ...updates,
    ...(normalizedStatus === 'approved' ? { approved: true, verified: true, active: updates.active !== false } : {}),
    ...(normalizedStatus === 'rejected' ? { approved: false, verified: false, active: false } : {}),
    ...(normalizedStatus === 'approved' && !('approvalSource' in updates) ? { approvalSource: 'manual' } : {}),
    updatedAt: serverTimestamp(),
  };
  await setDoc(doc(db, 'helperServices', offeringId || `${uid}_${serviceId}`), nextUpdates, { merge: true });
  await reconcileOpenServiceRequests({
    reason: 'admin_helper_service_status_updated',
    touchedServiceIds: [serviceId],
  }).catch(() => null);
  return getUserProfile(uid);
}

export async function removeHelperServiceOffering({ uid, serviceId, offeringId }) {
  const clients = await getFirebaseClients();
  if (!clients) throw new Error('Firebase is not configured for the admin app.');
  const { db, firestoreModule } = clients;
  const { deleteDoc, doc } = firestoreModule;
  await deleteDoc(doc(db, 'helperServices', offeringId || `${uid}_${serviceId}`));
  await reconcileOpenServiceRequests({
    reason: 'admin_helper_service_removed',
    touchedServiceIds: [serviceId],
  }).catch(() => null);
  return getUserProfile(uid);
}

async function loadHelperServiceRows(profiles = []) {
  const clients = await getFirebaseClients();
  if (!clients) return [];
  const { db, firestoreModule } = clients;
  const { collection, getDocs } = firestoreModule;
  const helperProfilesById = new Map((Array.isArray(profiles) ? profiles : []).map((profile) => [profile.uid, profile]));
  const snapshot = await getDocs(collection(db, 'helperServices'));
  return snapshot.docs
    .map((docSnap) => normalizeHelperServiceOfferingRow(docSnap.id, docSnap.data(), helperProfilesById))
    .filter((row) => row.helperUid);
}

export function flattenProviderServices(profiles = []) {
  return (Array.isArray(profiles) ? profiles : []).flatMap((profile) => Array.isArray(profile.helperServiceRows) ? profile.helperServiceRows : []);
}
