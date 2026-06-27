import { getFirebaseClients } from '../firebase/config';

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
    (Array.isArray(profile.services) && profile.services.length)
    || (Array.isArray(helperProfile.services) && helperProfile.services.length)
    || profile.agreement
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

function normalizeSkill(skill = {}, serviceId = '') {
  const name = String(skill.name || skill.skillName || '').trim();
  if (!name) return null;

  return {
    id: String(skill.id || `${serviceId}_${name}`.replace(/[^a-z0-9]+/gi, '_').toLowerCase()),
    catalogId: String(skill.catalogId || skill.serviceCatalogId || name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    name,
    status: String(skill.status || 'pending').trim().toLowerCase(),
    active: skill.active !== false,
    verified: skill.verified !== false,
    approvalSource: String(skill.approvalSource || '').trim().toLowerCase(),
    derivedFromBundleIds: [...new Set((Array.isArray(skill.derivedFromBundleIds) ? skill.derivedFromBundleIds : [])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean))],
    derivedFromServiceIds: [...new Set((Array.isArray(skill.derivedFromServiceIds) ? skill.derivedFromServiceIds : [])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean))],
    createdAt: skill.createdAt || null,
    updatedAt: skill.updatedAt || null,
    pictures: (Array.isArray(skill.pictures) ? skill.pictures : [])
      .map(normalizePictureEntry)
      .filter(Boolean),
  };
}

async function getAuthToken() {
  const clients = await getFirebaseClients();
  return clients?.auth?.currentUser?.getIdToken?.() || '';
}

async function authorizedFunctionFetch(functionName, options = {}) {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('You must be signed in before managing helper approvals.');
  }

  const response = await fetch(getFunctionEndpoint(functionName), {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.success) {
    throw new Error(result?.message || 'Unable to complete the helper approval request.');
  }
  return result;
}

async function syncHelperServiceApprovals(uid) {
  if (!uid) return null;

  return authorizedFunctionFetch('syncHelperServiceApprovals', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ uid }),
  });
}

function normalizeService(service = {}) {
  const serviceId = String(service.serviceId || '').trim();
  if (!serviceId) return null;

  return {
    ...service,
    serviceId,
    serviceName: String(service.serviceName || service.name || serviceId).trim(),
    description: String(service.description || '').trim(),
    skills: (Array.isArray(service.skills) ? service.skills : [])
      .map((skill) => normalizeSkill(skill, serviceId))
      .filter(Boolean),
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
    services: (Array.isArray(profile.services) ? profile.services : Array.isArray(helperProfile.services) ? helperProfile.services : [])
      .map(normalizeService)
      .filter(Boolean),
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

async function saveUserProfile(uid, nextProfile) {
  const clients = await getFirebaseClients();
  if (!clients) {
    throw new Error('Firebase is not configured for the admin app.');
  }

  const { db, firestoreModule } = clients;
  const { doc, getDoc, setDoc, serverTimestamp } = firestoreModule;
  const ref = doc(db, 'users', uid);
  const existing = await getDoc(ref);
  const current = existing.exists() ? existing.data() : {};

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
  return listUsersByRole('helper');
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
  });
}

export async function updateHelperServiceStatus({ uid, serviceId, skillId, updates = {} }) {
  const profile = await getUserProfile(uid);
  if (!profile) {
    throw new Error('Helper profile not found.');
  }

  const normalizedStatus = String(updates.status || '').trim().toLowerCase();
  const nextUpdates = {
    ...updates,
    ...(normalizedStatus === 'approved' && !('approvalSource' in updates) ? { approvalSource: 'manual' } : {}),
  };

  const nextServices = (Array.isArray(profile.services) ? profile.services : []).map((service) => {
    if (service.serviceId !== serviceId) return service;

    return {
      ...service,
      skills: (Array.isArray(service.skills) ? service.skills : []).map((skill) => {
        if (skill.id !== skillId && skill.name !== skillId) return skill;
        return {
          ...skill,
          ...nextUpdates,
          updatedAt: new Date().toISOString(),
        };
      }),
    };
  });

  await saveUserProfile(uid, {
    ...profile,
    services: nextServices,
  });
  await syncHelperServiceApprovals(uid);
  return getUserProfile(uid);
}

export async function removeHelperSkill({ uid, serviceId, skillId }) {
  const profile = await getUserProfile(uid);
  if (!profile) {
    throw new Error('Helper profile not found.');
  }

  const nextServices = (Array.isArray(profile.services) ? profile.services : [])
    .map((service) => {
      if (service.serviceId !== serviceId) return service;
      return {
        ...service,
        skills: (Array.isArray(service.skills) ? service.skills : []).filter((skill) => skill.id !== skillId && skill.name !== skillId),
      };
    })
    .filter((service) => (Array.isArray(service.skills) ? service.skills.length : 0) > 0);

  await saveUserProfile(uid, {
    ...profile,
    services: nextServices,
  });
  await syncHelperServiceApprovals(uid);
  return getUserProfile(uid);
}

export function flattenProviderServices(profiles = []) {
  return profiles.flatMap((profile) => (
    (Array.isArray(profile.services) ? profile.services : []).flatMap((service) => (
      (Array.isArray(service.skills) ? service.skills : []).map((skill) => ({
        providerUid: profile.uid,
        providerName: profile.fullName || profile.displayName || profile.email || 'Helper',
        helperUid: profile.uid,
        helperName: profile.fullName || profile.displayName || profile.email || 'Helper',
        providerEmail: profile.email || '',
        providerType: profile.providerType || 'individual',
        businessName: profile.businessName || '',
        city: profile.city || '',
        phoneNumber: profile.phoneNumber || '',
        suspended: Boolean(profile.suspended),
        verificationStatus: String(profile.verificationStatus || 'pending').toLowerCase(),
        serviceId: service.serviceId,
        serviceName: service.serviceName,
        serviceDescription: service.description,
        skillId: skill.id,
        catalogId: skill.catalogId || '',
        skillName: skill.name,
        skillStatus: String(skill.status || 'pending').toLowerCase(),
        skillActive: skill.active !== false,
        skillVerified: skill.verified !== false,
        pictures: Array.isArray(skill.pictures) ? skill.pictures : [],
        createdAt: skill.createdAt || null,
        updatedAt: skill.updatedAt || null,
      }))
    ))
  ));
}
