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

export function normalizeServiceCatalogEntry(entry = {}) {
  const id = String(entry.id || entry.serviceId || '').trim();
  if (!id) return null;

  return {
    id,
    catalogId: id,
    categoryId: String(entry.categoryId || '').trim(),
    categoryName: String(entry.categoryName || '').trim(),
    label: String(entry.label || entry.skillName || id).trim(),
    description: String(entry.description || '').trim(),
    active: entry.active !== false,
    approved: entry.approved !== false,
    createdAt: entry.createdAt || null,
    updatedAt: entry.updatedAt || null,
    images: (Array.isArray(entry.images) ? entry.images : [])
      .map(normalizeImage)
      .filter(Boolean),
  };
}

export function subscribeToServiceCatalog(callback, onError) {
  const { db, firestoreModule } = getFirebaseClients();
  const { collection, onSnapshot, query } = firestoreModule;
  const catalogQuery = query(collection(db, 'serviceCatalog'));

  return onSnapshot(
    catalogQuery,
    (snapshot) => {
      const entries = snapshot.docs.map((docSnap) => normalizeServiceCatalogEntry({ id: docSnap.id, ...docSnap.data() }));
      callback(entries.filter(Boolean));
    },
    onError,
  );
}

export function getServiceCatalogEntryById(entries = [], catalogId = '') {
  const normalizedId = String(catalogId || '').trim().toLowerCase();
  return (Array.isArray(entries) ? entries : []).find((entry) => String(entry.id || '').trim().toLowerCase() === normalizedId) || null;
}
