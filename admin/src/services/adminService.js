import { getFirebaseClients } from '../firebase/config';

const ROLE_GROUPS = {
  provider: new Set(['helper', 'tutor']),
  customer: new Set(['student', 'customer']),
  admin: new Set(['admin']),
};

function normalizeRole(value) {
  return String(value || '').trim().toLowerCase();
}

function collectRoles(profile = {}) {
  return new Set([
    normalizeRole(profile.role),
    normalizeRole(profile.activeRole),
    ...(Array.isArray(profile.roles) ? profile.roles.map(normalizeRole) : []),
  ].filter(Boolean));
}

function profileMatchesGroup(profile, groupName) {
  const roles = collectRoles(profile);
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
    createdAt: skill.createdAt || null,
    updatedAt: skill.updatedAt || null,
    pictures: (Array.isArray(skill.pictures) ? skill.pictures : [])
      .map(normalizePictureEntry)
      .filter(Boolean),
  };
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
  return {
    ...profile,
    uid: profile.uid || profile.id || '',
    fullName: String(profile.fullName || profile.displayName || '').trim(),
    displayName: String(profile.displayName || profile.fullName || '').trim(),
    email: String(profile.email || '').trim(),
    role: String(profile.role || '').trim().toLowerCase(),
    activeRole: String(profile.activeRole || profile.role || '').trim().toLowerCase(),
    providerType: String(profile.providerType || '').trim().toLowerCase(),
    businessName: String(profile.businessName || '').trim(),
    city: String(profile.city || '').trim(),
    homeAddress: String(profile.homeAddress || '').trim(),
    phoneNumber: String(profile.phoneNumber || '').trim(),
    services: (Array.isArray(profile.services) ? profile.services : [])
      .map(normalizeService)
      .filter(Boolean),
    customerProfile: {
      ...(profile.customerProfile || {}),
      serviceAddress: String(profile.customerProfile?.serviceAddress || '').trim(),
      businessName: String(profile.customerProfile?.businessName || '').trim(),
      businessEmail: String(profile.customerProfile?.businessEmail || '').trim(),
      businessCategory: String(profile.customerProfile?.businessCategory || '').trim(),
    },
    studentProfile: {
      ...(profile.studentProfile || {}),
      grade: profile.studentProfile?.grade || null,
      curriculum: String(profile.studentProfile?.curriculum || '').trim(),
      discoverySource: String(profile.studentProfile?.discoverySource || '').trim(),
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

  return snapshot.docs
    .map((item) => normalizeAdminProfile({ uid: item.id, ...item.data() }))
    .filter((profile) => {
      if (normalizedGroup === 'provider') return profileMatchesGroup(profile, 'provider');
      if (normalizedGroup === 'customer') return profileMatchesGroup(profile, 'customer');
      if (normalizedGroup === 'admin') return profileMatchesGroup(profile, 'admin');
      return [
        profile.role,
        profile.activeRole,
        ...(Array.isArray(profile.roles) ? profile.roles : []),
      ].map(normalizeRole).includes(normalizedGroup);
    });
}

export async function listHelperProfiles() {
  return listUsersByRole('provider');
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

  const nextServices = (Array.isArray(profile.services) ? profile.services : []).map((service) => {
    if (service.serviceId !== serviceId) return service;

    return {
      ...service,
      skills: (Array.isArray(service.skills) ? service.skills : []).map((skill) => {
        if (skill.id !== skillId && skill.name !== skillId) return skill;
        return {
          ...skill,
          ...updates,
          updatedAt: new Date().toISOString(),
        };
      }),
    };
  });

  return saveUserProfile(uid, {
    ...profile,
    services: nextServices,
  });
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

  return saveUserProfile(uid, {
    ...profile,
    services: nextServices,
  });
}

export function flattenProviderServices(profiles = []) {
  return profiles.flatMap((profile) => (
    (Array.isArray(profile.services) ? profile.services : []).flatMap((service) => (
      (Array.isArray(service.skills) ? service.skills : []).map((skill) => ({
        providerUid: profile.uid,
        providerName: profile.fullName || profile.displayName || profile.email || 'Provider',
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
