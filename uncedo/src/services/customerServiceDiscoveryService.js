import {
  getCustomerServiceById,
  getCustomerServiceCategoryById,
} from '../constants/serviceCatalog';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { getFirebaseClients } from '../firebase/config';
import { subscribeToServiceCatalog } from './serviceCatalogService';

function normalizeToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeRole(value = '') {
  return String(value || '').trim().toLowerCase();
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

function resolveStartingPrice(service) {
  const options = Array.isArray(service?.options) ? service.options : [];
  if (options.length) {
    const prices = options
      .map((option) => Number(option?.price ?? 0))
      .filter((value) => Number.isFinite(value) && value >= 0);
    if (prices.length) {
      const positive = prices.filter((value) => value > 0);
      return positive.length ? Math.min(...positive) : 0;
    }
  }
  return Number(service?.pricing?.basePrice || service?.pricing?.minimumCallout || 0) || 0;
}

function buildCardPriceLabel(service) {
  const price = resolveStartingPrice(service);
  const options = Array.isArray(service?.options) ? service.options : [];
  if (options.length > 1) {
    return `From R${price.toFixed(0)}`;
  }
  return service?.pricing?.pricingMode === 'fixed' ? `R${price.toFixed(0)}` : `From R${price.toFixed(0)}`;
}

function helperSupportsOption(helper, serviceToken, optionToken) {
  if (!helper || !serviceToken || !optionToken) return false;
  const approvedKeys = Array.isArray(helper.approvedOptionKeys) ? helper.approvedOptionKeys : [];
  return approvedKeys.includes(`${serviceToken}::${optionToken}`)
    || approvedKeys.includes(`${serviceToken}::__unified__`);
}

function helperSupportsService(helper, serviceToken, serviceOptions = []) {
  if (!helper || !serviceToken) return false;
  const approvedKeys = Array.isArray(helper.approvedOptionKeys) ? helper.approvedOptionKeys : [];
  if (Array.isArray(serviceOptions) && serviceOptions.length > 0) {
    return serviceOptions.some((option) => helperSupportsOption(helper, serviceToken, normalizeToken(option?.id || '')));
  }
  if (approvedKeys.length > 0) {
    return approvedKeys.includes(`${serviceToken}::__legacy__`)
      || approvedKeys.some((key) => key.startsWith(`${serviceToken}::`));
  }
  return helper.expandedServiceIds.includes(serviceToken);
}

function buildDiscoveryDescription(service, categoryLabel) {
  const description = String(service?.description || '').trim();
  if (description) return description;
  return `${service.label} available from approved helpers in ${categoryLabel}.`;
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
    .map((helper) => ({
      id: String(helper.helperId || helper.uid || helper.id || '').trim(),
      fullName: String(helper.fullName || helper.displayName || 'Helper').trim(),
      onlineStatus: helper.online === true ? 'online' : normalizeRole(helper.onlineStatus || 'offline'),
      categoryIds: Array.isArray(helper.categoryIds) ? helper.categoryIds.map(normalizeToken) : [],
      expandedServiceIds: Array.isArray(helper.expandedServiceIds) ? helper.expandedServiceIds.map(normalizeToken) : [],
      approvedOptionKeys: Array.isArray(helper.approvedOptionKeys)
        ? helper.approvedOptionKeys.map((key) => String(key || '').trim().toLowerCase()).filter(Boolean)
        : [],
    }))
    .filter((helper) => helper.id);

  const activeCatalog = (Array.isArray(serviceCatalog) ? serviceCatalog : [])
    .filter((entry) => entry.active !== false && entry.approved !== false)
    .filter((entry) => getCustomerServiceById(entry.id));

  const items = [];
  const seen = new Set();

  activeCatalog.forEach((entry) => {
    const customerService = getCustomerServiceById(entry.id);
    if (!customerService) return;

    const categoryId = String(customerService.categoryId || entry.categoryId || '').trim();
    const category = getCustomerServiceCategoryById(categoryId);
    const categoryLabel = category?.label || entry.categoryName || categoryId;
    const serviceToken = normalizeToken(customerService.id || entry.id);
    const categoryToken = normalizeToken(categoryId);
    const serviceOptions = Array.isArray(customerService.options) ? customerService.options : [];
    const matchingHelpers = helperItems.filter((helper) => (
      helper.onlineStatus === 'online'
      && helper.categoryIds.includes(categoryToken)
      && helperSupportsService(helper, serviceToken, serviceOptions)
    ));
    const imageUris = resolveDiscoveryImageUris(entry);
    if (!matchingHelpers.length || !imageUris.length) return;

    const enrichedOptions = serviceOptions.map((option) => {
      const optToken = normalizeToken(option?.id || '');
      const optionHelperCount = matchingHelpers.filter((helper) => (
        helperSupportsOption(helper, serviceToken, optToken)
      )).length;
      return {
        ...option,
        onlineHelperCount: optionHelperCount,
      };
    });

    const onlineHelperCount = matchingHelpers.length;
    const resolvedServiceId = customerService.id || entry.id;
    const key = `service-${categoryId}-${resolvedServiceId}`;
    if (seen.has(key)) return;
    seen.add(key);

    items.push({
      id: key,
      entityId: resolvedServiceId,
      type: customerService.type || 'service',
      packageId: customerService.type === 'bundle' ? resolvedServiceId : '',
      categoryId,
      categoryLabel,
      title: customerService.label || entry.label,
      description: buildDiscoveryDescription(customerService, categoryLabel),
      priceLabel: buildCardPriceLabel(customerService),
      priceValue: resolveStartingPrice(customerService),
      pricing: customerService.pricing || {},
      optionApplicationMode: customerService.optionApplicationMode || 'per_option',
      options: enrichedOptions,
      serviceIds: [resolvedServiceId],
      includedLabels: Array.isArray(customerService.includedServiceIds) && customerService.includedServiceIds.length
        ? customerService.includedServiceIds.map((serviceId) => getCustomerServiceById(serviceId)?.label || serviceId).filter(Boolean)
        : [customerService.label || entry.label],
      helperCount: onlineHelperCount,
      onlineHelperCount,
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
  const helpersQuery = query(collection(db, 'helperDispatchIndex'));

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
      helperItems = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
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
