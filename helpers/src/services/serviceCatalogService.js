import { SERVICE_CATALOG, hydrateHelperServiceCategories } from '../constants/serviceCatalog';
import { getFirebaseClients } from '../firebase/config';

function slugify(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const SERVICE_CATALOG_COLLECTIONS = ['serviceCatalog', 'services'];

function normalizeCatalogCollectionEntries(entries = []) {
  const byId = new Map();

  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const normalized = normalizeServiceCatalogEntry(entry);
    if (!normalized) return;

    const key = String(normalized.id || '').trim().toLowerCase();
    if (!key) return;

    const existing = byId.get(key);
    byId.set(key, existing ? { ...normalized, ...existing } : normalized);
  });

  return [...byId.values()];
}

function normalizeCategoryId(entry = {}) {
  const directCategoryId = String(entry.categoryId || '').trim().toLowerCase();
  if (directCategoryId) return directCategoryId;

  const categoryName = String(entry.categoryName || '').trim();
  if (categoryName) return slugify(categoryName);

  return 'uncategorized';
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

export function normalizeServiceCatalogEntry(entry = {}) {
  const id = String(entry.id || entry.serviceId || '').trim();
  if (!id) return null;

  return {
    id,
    catalogId: id,
    categoryId: normalizeCategoryId(entry),
    categoryName: String(entry.categoryName || (normalizeCategoryId(entry) === 'uncategorized' ? 'Uncategorized' : '')).trim(),
    label: String(entry.label || entry.serviceName || id).trim(),
    description: String(entry.description || '').trim(),
    type: String(entry.type || 'service').trim().toLowerCase(),
    active: entry.active !== false,
    approved: entry.approved !== false,
    includedServiceIds: (Array.isArray(entry.includedServiceIds) ? entry.includedServiceIds : [])
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean),
    pricing: entry.pricing && typeof entry.pricing === 'object' ? { ...entry.pricing } : {},
    questionnaire: entry.questionnaire && typeof entry.questionnaire === 'object'
      ? entry.questionnaire
      : { required: entry.requiredQuestions || [], optional: entry.optionalQuestions || [] },
    inheritBundleImages: entry.inheritBundleImages !== false,
    requiresPortfolioSelection: Boolean(entry.requiresPortfolioSelection),
    createdAt: entry.createdAt || null,
    updatedAt: entry.updatedAt || null,
    images: (Array.isArray(entry.images) ? entry.images : [])
      .map(normalizeImage)
      .filter(Boolean),
  };
}

export function buildHelperServiceCatalog(entries = []) {
  const activeEntries = (Array.isArray(entries) ? entries : [])
    .map(normalizeServiceCatalogEntry)
    .filter(Boolean)
    .filter((entry) => entry.active !== false && entry.approved !== false);

  hydrateHelperServiceCategories(activeEntries);
  return SERVICE_CATALOG.map((category) => ({
    ...category,
    services: activeEntries.filter((entry) => entry.categoryId === category.id),
  }));
}

export function subscribeToServiceCatalog(callback) {
  const { db, firestoreModule } = getFirebaseClients();
  const { collection, onSnapshot, query } = firestoreModule;
  const collectionEntries = new Map();
  const unsubscribers = [];
  const emitCatalog = () => {
    const normalizedEntries = normalizeCatalogCollectionEntries(
      SERVICE_CATALOG_COLLECTIONS.flatMap((collectionName) => collectionEntries.get(collectionName) || []),
    );
    hydrateHelperServiceCategories(normalizedEntries);
    callback(normalizedEntries);
  };

  SERVICE_CATALOG_COLLECTIONS.forEach((collectionName) => {
    const catalogQuery = query(collection(db, collectionName));
    const unsubscribe = onSnapshot(
      catalogQuery,
      (snapshot) => {
        collectionEntries.set(collectionName, snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })));
        emitCatalog();
      },
      () => {
        collectionEntries.set(collectionName, []);
        emitCatalog();
      },
    );
    unsubscribers.push(unsubscribe);
  });

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe?.());
  };
}

export function getCatalogEntryById(entries = [], catalogId = '') {
  const normalizedId = String(catalogId || '').trim().toLowerCase();
  return (Array.isArray(entries) ? entries : []).find((entry) => String(entry.id || '').trim().toLowerCase() === normalizedId) || null;
}

export function getCatalogEntriesForCategory(entries = [], categoryId = '') {
  const normalizedCategoryId = String(categoryId || '').trim().toLowerCase();
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => String(entry.categoryId || '').trim().toLowerCase() === normalizedCategoryId && entry.active !== false && entry.approved !== false);
}
