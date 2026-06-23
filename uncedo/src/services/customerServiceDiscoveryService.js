import {
  getCustomerServiceById,
  getCustomerServiceCategoryById,
} from '../constants/serviceCatalog';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebaseClients } from '../firebase/config';
import { subscribeToServiceCatalog } from './serviceCatalogService';

function normalizeToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizePicture(picture) {
  if (!picture) return null;
  if (typeof picture === 'string') {
    const uri = String(picture || '').trim();
    return uri ? { uri, objectPath: '', uploadedAt: null } : null;
  }

  const uri = String(picture.uri || picture.downloadUrl || '').trim();
  if (!uri) return null;

  return {
    uri,
    objectPath: String(picture.objectPath || '').trim(),
    uploadedAt: picture.uploadedAt || null,
  };
}

function normalizeSkill(skill = {}) {
  const name = String(skill.name || '').trim();
  if (!name) return null;

  const pictures = (Array.isArray(skill.pictures) ? skill.pictures : [])
    .map(normalizePicture)
    .filter(Boolean);

  return {
    name,
    catalogId: String(skill.catalogId || skill.serviceCatalogId || normalizeToken(name)).trim().toLowerCase(),
    active: skill.active !== false,
    status: String(skill.status || 'approved').trim().toLowerCase(),
    pictures,
  };
}

function normalizeHelper(helper = {}) {
  const serviceEntries = Array.isArray(helper.services) ? helper.services : [];
  const services = serviceEntries
    .map((service) => {
      const serviceId = String(service.serviceId || '').trim();
      if (!serviceId) return null;

      return {
        serviceId,
        skills: (Array.isArray(service.skills) ? service.skills : [])
          .map(normalizeSkill)
          .filter(Boolean),
      };
    })
    .filter(Boolean);

  return {
    id: String(helper.uid || helper.id || '').trim(),
    fullName: String(helper.fullName || helper.displayName || 'Helper').trim(),
    profilePhoto: String(helper.profilePhoto || helper.selfieUrl || '').trim(),
    services,
  };
}

function buildCardPriceLabel(service) {
  const price = Number(service?.pricing?.basePrice || service?.pricing?.minimumCallout || 0) || 0;
  return service?.pricing?.pricingMode === 'fixed' ? `R${price.toFixed(0)}` : `From R${price.toFixed(0)}`;
}

function buildDiscoveryDescription(service, categoryLabel) {
  const description = String(service?.description || '').trim();
  if (description) return description;
  return `${service.label} available from approved helpers in ${categoryLabel}.`;
}

function findMatchingSkills(helper, categoryId, labels = []) {
  const categoryService = (helper.services || []).find((entry) => entry.serviceId === categoryId) || null;
  if (!categoryService) return [];

  const normalizedLabels = labels.map(normalizeToken).filter(Boolean);
  return (categoryService.skills || []).filter((skill) => (
    skill.status === 'approved'
    && skill.active !== false
    && Array.isArray(skill.pictures)
    && skill.pictures.length > 0
    && (
      !normalizedLabels.length
      || normalizedLabels.includes(normalizeToken(skill.name))
      || normalizedLabels.includes(normalizeToken(skill.catalogId))
    )
  ));
}

function resolveDiscoveryImageUris(serviceEntry) {
  return (Array.isArray(serviceEntry?.images) ? serviceEntry.images : [])
    .map((picture) => normalizePicture(picture))
    .filter(Boolean)
    .map((picture) => picture.uri)
    .filter(Boolean);
}

function buildDiscoveryItems({ helpers = [], serviceCatalog = [], preferredCategoryIds = [] } = {}) {
  const helperItems = (Array.isArray(helpers) ? helpers : [])
    .filter((helper) => String(helper.onlineStatus || '').trim().toLowerCase() === 'online')
    .map(normalizeHelper)
    .filter((helper) => helper.id);

  const activeCatalog = (Array.isArray(serviceCatalog) ? serviceCatalog : [])
    .filter((entry) => entry.active !== false && entry.approved !== false)
    .filter((entry) => getCustomerServiceById(entry.id));

  const items = [];
  const seen = new Set();

  activeCatalog.forEach((entry) => {
    const customerService = getCustomerServiceById(entry.id);
    if (!customerService) return;

    const categoryId = String(entry.categoryId || customerService.categoryId || '').trim();
    const category = getCustomerServiceCategoryById(categoryId);
    const categoryLabel = category?.label || entry.categoryName || categoryId;
    const matchingHelpers = helperItems.filter((helper) => findMatchingSkills(helper, categoryId, [entry.label, customerService.label]));
    const imageUris = resolveDiscoveryImageUris(entry);
    if (!matchingHelpers.length || !imageUris.length) return;

    const resolvedServiceId = customerService.id || entry.id;
    const key = `service-${categoryId}-${resolvedServiceId}`;
    if (seen.has(key)) return;
    seen.add(key);

    items.push({
      id: key,
      entityId: resolvedServiceId,
      kind: 'service',
      packageId: '',
      categoryId,
      categoryLabel,
      title: customerService.label || entry.label,
      description: buildDiscoveryDescription(customerService, categoryLabel),
      priceLabel: buildCardPriceLabel(customerService),
      priceValue: Number(customerService?.pricing?.basePrice || customerService?.pricing?.minimumCallout || 0) || 0,
      pricing: customerService.pricing || {},
      serviceIds: [resolvedServiceId],
      includedLabels: [customerService.label || entry.label],
      helperCount: matchingHelpers.length,
      helperName: matchingHelpers[0]?.fullName || 'Helper',
      imageUris,
      imageUri: imageUris[0] || '',
    });
  });

  return items.sort((left, right) => {
    const categoryCompare = String(left.categoryLabel || '').localeCompare(String(right.categoryLabel || ''));
    if (categoryCompare !== 0) return categoryCompare;
    return String(left.title || '').localeCompare(String(right.title || ''));
  });
}

export function subscribeToCustomerServiceShowcase({ preferredCategoryIds = [], callback, onError } = {}) {
  const { db } = getFirebaseClients();
  const helpersQuery = query(collection(db, 'users'), where('role', '==', 'helper'));

  let helperItems = [];
  let serviceCatalogItems = [];
  let helpersReady = false;
  let catalogReady = false;

  const emit = () => {
    if (!helpersReady || !catalogReady) return;
    callback(buildDiscoveryItems({ helpers: helperItems, serviceCatalog: serviceCatalogItems, preferredCategoryIds }));
  };

  const unsubscribeHelpers = onSnapshot(
    helpersQuery,
    (snapshot) => {
      helperItems = snapshot.docs.map((docSnap) => ({ uid: docSnap.id, ...docSnap.data() }));
      helpersReady = true;
      emit();
    },
    onError,
  );

  const unsubscribeCatalog = subscribeToServiceCatalog(
    (entries) => {
      serviceCatalogItems = entries;
      catalogReady = true;
      emit();
    },
    onError,
  );

  return () => {
    unsubscribeHelpers?.();
    unsubscribeCatalog?.();
  };
}
