import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getFirebaseClients } from '../firebase/config';

function normalizeId(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizePhoto(photo) {
  if (!photo) return null;
  const uri = String(photo.uri || photo.downloadUrl || '').trim();
  if (!uri) return null;
  return {
    id: String(photo.id || `photo_${normalizeId(uri).slice(0, 24)}`),
    uri,
    objectPath: String(photo.objectPath || '').trim(),
    uploadedAt: photo.uploadedAt || new Date().toISOString(),
  };
}

export function buildHelperServiceOfferingId(helperId = '', serviceId = '', optionId = '') {
  const normalizedOption = normalizeId(optionId);
  return normalizedOption
    ? `${String(helperId || '').trim()}_${normalizeId(serviceId)}__${normalizedOption}`
    : `${String(helperId || '').trim()}_${normalizeId(serviceId)}`;
}

export function normalizeHelperServiceOffering(id = '', data = {}) {
  const helperId = String(data.helperId || '').trim();
  const serviceId = normalizeId(data.serviceId || '');
  const categoryId = normalizeId(data.categoryId || '');
  if (!helperId || !serviceId || !categoryId) return null;
  const optionId = normalizeId(data.optionId || '');
  const optionTitle = String(data.optionTitle || data.optionLabel || '').trim();
  const fallbackId = buildHelperServiceOfferingId(helperId, serviceId, optionId);
  return {
    id: String(data.offeringId || id || fallbackId).trim(),
    offeringId: String(data.offeringId || id || fallbackId).trim(),
    helperId,
    serviceId,
    categoryId,
    optionId,
    optionTitle,
    applicationMode: optionId ? 'option' : String(data.applicationMode || 'service').trim().toLowerCase(),
    serviceName: String(data.serviceName || data.name || data.label || serviceId).trim(),
    status: String(data.status || 'pending').trim().toLowerCase(),
    active: data.active === true,
    approved: data.approved === true,
    verified: data.verified === true,
    photos: (Array.isArray(data.photos) ? data.photos : []).map(normalizePhoto).filter(Boolean),
    approvalSource: String(data.approvalSource || '').trim().toLowerCase(),
    derivedFromBundleIds: Array.isArray(data.derivedFromBundleIds) ? data.derivedFromBundleIds.map(normalizeId).filter(Boolean) : [],
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

export function subscribeToHelperServiceOfferings(helperId, callback, onError) {
  const { db } = getFirebaseClients();
  if (!helperId) return () => {};
  const offeringsQuery = query(collection(db, 'helperServices'), where('helperId', '==', helperId));
  return onSnapshot(
    offeringsQuery,
    (snapshot) => {
      const offerings = snapshot.docs
        .map((docSnap) => normalizeHelperServiceOffering(docSnap.id, docSnap.data()))
        .filter(Boolean);
      callback(offerings);
    },
    onError,
  );
}

export async function submitHelperServiceOffering({
  helperId,
  serviceId,
  categoryId,
  serviceName,
  optionId = '',
  optionTitle = '',
  offeringId = '',
  photos = [],
}) {
  const { db } = getFirebaseClients();
  const normalizedOptionId = normalizeId(optionId);
  const resolvedOfferingId = String(offeringId || buildHelperServiceOfferingId(helperId, serviceId, normalizedOptionId)).trim();
  const ref = doc(db, 'helperServices', resolvedOfferingId);
  const normalizedPhotos = photos.map(normalizePhoto).filter(Boolean);
  await setDoc(ref, {
    offeringId: resolvedOfferingId,
    helperId,
    serviceId: normalizeId(serviceId),
    categoryId: normalizeId(categoryId),
    optionId: normalizedOptionId,
    optionTitle: String(optionTitle || '').trim(),
    applicationMode: normalizedOptionId ? 'option' : 'service',
    serviceName: String(serviceName || serviceId).trim(),
    status: 'pending',
    active: false,
    approved: false,
    verified: false,
    photos: normalizedPhotos,
    approvalSource: '',
    derivedFromBundleIds: [],
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  }, { merge: true });
  return resolvedOfferingId;
}

export async function updateHelperServiceOfferingActive({ helperId, serviceId, optionId = '', offeringId = '', active }) {
  const { db } = getFirebaseClients();
  const resolvedOfferingId = String(offeringId || buildHelperServiceOfferingId(helperId, serviceId, optionId)).trim();
  await updateDoc(doc(db, 'helperServices', resolvedOfferingId), {
    active: Boolean(active),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteHelperServiceOffering({ helperId, serviceId, optionId = '', offeringId = '' }) {
  const { db } = getFirebaseClients();
  const resolvedOfferingId = String(offeringId || buildHelperServiceOfferingId(helperId, serviceId, optionId)).trim();
  await deleteDoc(doc(db, 'helperServices', resolvedOfferingId));
}
