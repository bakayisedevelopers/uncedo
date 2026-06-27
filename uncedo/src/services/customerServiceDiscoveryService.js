import {
  CUSTOMER_SERVICE_CATALOG,
  getCustomerPackagesForCategory,
  getCustomerServiceById,
  getCustomerServicesForCategory,
} from '../constants/serviceCatalog';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebaseClients } from '../firebase/config';

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
    active: skill.active !== false,
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
  if (service?.kind === 'package') {
    return `${service.label} grouped under ${categoryLabel}.`;
  }
  return `${service.label} offered by available helpers in ${categoryLabel}.`;
}

function findCategoryService(helper, categoryId) {
  return (helper.services || []).find((entry) => entry.serviceId === categoryId) || null;
}

function getMatchingSkillPictures(helper, categoryId, labels = []) {
  const categoryService = findCategoryService(helper, categoryId);
  if (!categoryService) return [];

  const normalizedLabels = labels.map(normalizeToken).filter(Boolean);
  const activeSkills = (categoryService.skills || []).filter((skill) => skill.active && skill.pictures.length);
  const fallbackSkills = (categoryService.skills || []).filter((skill) => skill.pictures.length);
  const orderedSkills = [...activeSkills, ...fallbackSkills.filter((skill) => !activeSkills.includes(skill))];

  const matchingSkill = orderedSkills.find((skill) => normalizedLabels.includes(normalizeToken(skill.name)));
  if (matchingSkill?.pictures?.length) {
    return matchingSkill.pictures;
  }

  return orderedSkills[0]?.pictures || [];
}

function resolveDiscoveryImage(helper, { categoryId, labels = [] } = {}) {
  const pictures = getMatchingSkillPictures(helper, categoryId, labels);
  if (pictures.length) {
    return pictures[0]?.uri || '';
  }
  return helper.profilePhoto || '';
}

function buildDiscoveryItems({ helpers = [], preferredCategoryIds = [] } = {}) {
  const helperItems = (Array.isArray(helpers) ? helpers : [])
    .filter((helper) => String(helper.onlineStatus || '').trim().toLowerCase() === 'online')
    .map(normalizeHelper)
    .filter((helper) => helper.id);
  const categoryOrder = preferredCategoryIds.length
    ? preferredCategoryIds
    : CUSTOMER_SERVICE_CATALOG.map((category) => category.id);

  const items = [];

  categoryOrder.forEach((categoryId) => {
    const category = CUSTOMER_SERVICE_CATALOG.find((entry) => entry.id === categoryId);
    if (!category) return;

    const categoryHelpers = helperItems.filter((helper) => findCategoryService(helper, categoryId));
    if (!categoryHelpers.length) return;

    const addItem = (service, kind) => {
      const serviceIds = kind === 'package'
        ? (Array.isArray(service.includedServiceIds) ? service.includedServiceIds : [])
        : [service.id];
      const includedLabels = serviceIds
        .map((serviceId) => getCustomerServiceById(serviceId)?.label || '')
        .filter(Boolean);
      const matchLabels = kind === 'package' ? includedLabels : [service.label];
      const bestHelper = categoryHelpers.find((helper) => resolveDiscoveryImage(helper, { categoryId, labels: matchLabels })) || categoryHelpers[0];

      items.push({
        id: `${kind}-${categoryId}-${service.id}`,
        entityId: service.id,
        kind,
        packageId: kind === 'package' ? service.id : '',
        categoryId,
        categoryLabel: category.label,
        title: service.label,
        description: buildDiscoveryDescription(service, category.label),
        priceLabel: buildCardPriceLabel(service),
        priceValue: Number(service?.pricing?.basePrice || service?.pricing?.minimumCallout || 0) || 0,
        pricing: service.pricing || {},
        serviceIds,
        includedLabels,
        helperCount: categoryHelpers.length,
        helperName: bestHelper?.fullName || 'Helper',
        imageUri: bestHelper ? resolveDiscoveryImage(bestHelper, { categoryId, labels: matchLabels }) : '',
      });
    };

    getCustomerPackagesForCategory(categoryId).forEach((service) => addItem(service, 'package'));
    getCustomerServicesForCategory(categoryId).forEach((service) => addItem(service, 'service'));
  });

  return items;
}

export function subscribeToCustomerServiceShowcase({ preferredCategoryIds = [], callback, onError } = {}) {
  const { db } = getFirebaseClients();
  const helpersQuery = query(collection(db, 'users'), where('role', '==', 'helper'));

  return onSnapshot(
    helpersQuery,
    (snapshot) => {
      const helpers = snapshot.docs.map((docSnap) => ({ uid: docSnap.id, ...docSnap.data() }));
      callback(buildDiscoveryItems({ helpers, preferredCategoryIds }));
    },
    onError,
  );
}
