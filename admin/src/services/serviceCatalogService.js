import { deleteObject, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAdminCatalogSkills } from '../constants/serviceCatalog';
import { getAdminQuestionPreset } from '../constants/serviceQuestionPresets';
import { getFirebaseClients } from '../firebase/config';

function slugify(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeImage(image) {
  if (!image) return null;
  if (typeof image === 'string') {
    const uri = String(image || '').trim();
    return uri ? { id: `img_${slugify(uri).slice(0, 24)}`, uri, objectPath: '', uploadedAt: null } : null;
  }

  const uri = String(image.uri || image.downloadUrl || '').trim();
  if (!uri) return null;

  return {
    id: String(image.id || `img_${Math.random().toString(36).slice(2, 10)}`),
    uri,
    objectPath: String(image.objectPath || '').trim(),
    uploadedAt: image.uploadedAt || null,
  };
}

export function normalizeServiceCatalogEntry(entry = {}, fallback = null) {
  const fallbackItem = fallback || null;
  const serviceId = String(entry.id || entry.serviceId || fallbackItem?.id || '').trim();
  if (!serviceId) return null;
  const presetQuestionnaire = getAdminQuestionPreset({
    serviceId,
    categoryId: String(entry.categoryId || fallbackItem?.categoryId || '').trim(),
  });

  return {
    id: serviceId,
    categoryId: String(entry.categoryId || fallbackItem?.categoryId || '').trim(),
    categoryName: String(entry.categoryName || fallbackItem?.categoryName || '').trim(),
    label: String(entry.label || entry.skillName || fallbackItem?.label || fallbackItem?.skillName || serviceId).trim(),
    promptLabel: String(entry.promptLabel || entry.label || fallbackItem?.promptLabel || fallbackItem?.label || serviceId).trim(),
    description: String(entry.description || fallbackItem?.description || '').trim(),
    kind: String(entry.kind || fallbackItem?.kind || 'service').trim().toLowerCase(),
    persisted: entry.persisted === true,
    active: entry.active !== false,
    approved: entry.approved !== false,
    pricing: entry.pricing && typeof entry.pricing === 'object' ? { ...entry.pricing } : {},
    includedServiceIds: (Array.isArray(entry.includedServiceIds) ? entry.includedServiceIds : [])
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean),
    questionnaire: entry.questionnaire && typeof entry.questionnaire === 'object'
      ? entry.questionnaire
      : {
          required: entry.requiredQuestions || presetQuestionnaire.required || [],
          optional: entry.optionalQuestions || presetQuestionnaire.optional || [],
        },
    requiresPortfolioSelection: Boolean(entry.requiresPortfolioSelection ?? fallbackItem?.requiresPortfolioSelection),
    inheritBundleImages: entry.inheritBundleImages !== false,
    createdAt: entry.createdAt || null,
    updatedAt: entry.updatedAt || null,
    createdBy: String(entry.createdBy || '').trim(),
    images: (Array.isArray(entry.images) ? entry.images : [])
      .map(normalizeImage)
      .filter(Boolean),
  };
}

export function buildServiceCatalogView(entries = []) {
  const entryMap = new Map(entries.map((entry) => [entry.id, entry]));
  const seededSkillIds = new Set(getAdminCatalogSkills().map((seedItem) => seedItem.id));
  const seededEntries = getAdminCatalogSkills().map((seedItem) => {
    const existing = entryMap.get(seedItem.id);
    return normalizeServiceCatalogEntry({
      ...seedItem,
      ...(existing || {}),
      id: seedItem.id,
      persisted: Boolean(existing),
      active: existing ? existing.active !== false : false,
      approved: existing ? existing.approved !== false : false,
    }, seedItem);
  });

  const customEntries = entries
    .filter((entry) => !seededSkillIds.has(entry.id))
    .map((entry) => normalizeServiceCatalogEntry(entry))
    .filter(Boolean);

  return [...seededEntries, ...customEntries];
}

export async function subscribeToServiceCatalog(callback, onError) {
  const clients = await getFirebaseClients();
  if (!clients) {
    callback(buildServiceCatalogView([]));
    return () => {};
  }

  const { db, firestoreModule } = clients;
  const { collection, onSnapshot, query } = firestoreModule;
  const refQuery = query(collection(db, 'serviceCatalog'));

  return onSnapshot(
    refQuery,
    (snapshot) => {
      const entries = snapshot.docs.map((docSnap) => normalizeServiceCatalogEntry({ id: docSnap.id, ...docSnap.data(), persisted: true }));
      callback(buildServiceCatalogView(entries));
    },
    onError,
  );
}

export async function getServiceCatalogEntry(serviceId) {
  const clients = await getFirebaseClients();
  if (!clients || !serviceId) return null;

  const { db, firestoreModule } = clients;
  const { doc, getDoc } = firestoreModule;
  const snapshot = await getDoc(doc(db, 'serviceCatalog', serviceId));
  return snapshot.exists() ? normalizeServiceCatalogEntry({ id: snapshot.id, ...snapshot.data(), persisted: true }) : null;
}

export async function saveServiceCatalogEntry(serviceId, updates = {}) {
  const clients = await getFirebaseClients();
  if (!clients || !serviceId) {
    throw new Error('Firebase is not configured for the admin app.');
  }

  const { db, firestoreModule } = clients;
  const { doc, getDoc, serverTimestamp, setDoc } = firestoreModule;
  const normalizedId = String(serviceId || '').trim();
  const refDoc = doc(db, 'serviceCatalog', normalizedId);
  const existing = await getDoc(refDoc);
  const current = existing.exists() ? existing.data() : {};

  await setDoc(refDoc, {
    ...current,
    ...updates,
    id: normalizedId,
    persisted: true,
    updatedAt: serverTimestamp(),
    createdAt: current.createdAt || serverTimestamp(),
  }, { merge: true });

  const saved = await getDoc(refDoc);
  return saved.exists() ? normalizeServiceCatalogEntry({ id: saved.id, ...saved.data(), persisted: true }) : null;
}

export async function uploadServiceCatalogImages({ serviceId, files = [] }) {
  const clients = await getFirebaseClients();
  if (!clients || !serviceId || !Array.isArray(files) || !files.length) {
    return [];
  }

  const { storage } = clients;
  const uploads = [];

  for (const file of files.slice(0, 10)) {
    if (!file) continue;
    const safeName = String(file.name || `service_${Date.now()}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectPath = `service-catalog/${serviceId}/${Date.now()}-${safeName}`;
    const storageRef = ref(storage, objectPath);
    await uploadBytes(storageRef, file, {
      contentType: file.type || 'image/jpeg',
      cacheControl: 'public,max-age=3600',
    });
    uploads.push({
      id: `img_${Math.random().toString(36).slice(2, 10)}`,
      uri: await getDownloadURL(storageRef),
      objectPath,
      uploadedAt: new Date().toISOString(),
    });
  }

  return uploads;
}

export async function deleteServiceCatalogImage(objectPath = '') {
  const normalizedPath = String(objectPath || '').trim();
  if (!normalizedPath) return;

  const clients = await getFirebaseClients();
  if (!clients) return;

  const { storage } = clients;
  try {
    await deleteObject(ref(storage, normalizedPath));
  } catch (error) {
    if (String(error?.code || '').toLowerCase() === 'storage/object-not-found') {
      return;
    }
    throw error;
  }
}

