'use strict';

function normalizeDispatchToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeCatalogIdList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeDispatchToken(value))
      .filter(Boolean),
  )];
}

function getHelperPayoutVerificationStatus(helper = {}) {
  return String(helper?.payout?.verificationStatus || helper?.payoutVerificationStatus || '').trim().toLowerCase();
}

function hasVerifiedHelperPayout(helper = {}) {
  return getHelperPayoutVerificationStatus(helper) === 'verified';
}

function normalizeHelperServiceOfferingDocument(offeringId = '', offering = {}) {
  const helperId = String(offering.helperId || '').trim();
  const serviceId = normalizeDispatchToken(offering.serviceId || '');
  const categoryId = normalizeDispatchToken(offering.categoryId || '');
  if (!helperId || !serviceId || !categoryId) return null;

  const optionId = normalizeDispatchToken(offering.optionId || '');
  const optionTitle = String(offering.optionTitle || offering.optionLabel || '').trim();
  const applicationMode = optionId
    ? 'option'
    : (String(offering.applicationMode || 'service').trim().toLowerCase() || 'service');

  return {
    offeringId: String(offering.offeringId || offeringId || (optionId ? `${helperId}_${serviceId}__${optionId}` : `${helperId}_${serviceId}`)).trim(),
    helperId,
    serviceId,
    categoryId,
    optionId,
    optionTitle,
    applicationMode,
    serviceName: String(offering.serviceName || offering.name || offering.label || serviceId).trim(),
    status: String(offering.status || 'pending').trim().toLowerCase(),
    active: offering.active !== false,
    approved: offering.approved === true || String(offering.status || '').toLowerCase() === 'approved',
    verified: offering.verified === true,
    photos: (Array.isArray(offering.photos) ? offering.photos : []).filter(Boolean),
    approvalSource: String(offering.approvalSource || '').trim().toLowerCase(),
    derivedFromBundleIds: normalizeCatalogIdList(offering.derivedFromBundleIds),
    createdAt: offering.createdAt || null,
    updatedAt: offering.updatedAt || null,
  };
}

function getApprovedActiveHelperServiceOfferings(offerings = []) {
  return (Array.isArray(offerings) ? offerings : []).filter((offering) => (
    offering.active !== false
    && offering.approved === true
    && offering.verified === true
    && String(offering.status || '').toLowerCase() === 'approved'
  ));
}

function resolveRequestedServiceEntries(requestServiceIds = [], catalogIndex = null) {
  const entries = [];
  (Array.isArray(requestServiceIds) ? requestServiceIds : []).forEach((serviceId) => {
    const token = normalizeDispatchToken(serviceId);
    if (!token) return;
    const entry = catalogIndex?.byId?.get(token) || null;
    if (entry && !entries.some((item) => normalizeDispatchToken(item.id) === normalizeDispatchToken(entry.id))) {
      entries.push(entry);
    }
  });
  return entries;
}

function buildHelperDispatchServiceIds(helperOfferings = [], catalogIndex = null) {
  const categoryIds = new Set();
  const serviceIds = new Set();
  const expandedServiceIds = new Set();
  const approvedOptionKeys = new Set();

  getApprovedActiveHelperServiceOfferings(helperOfferings).forEach((offering) => {
    const serviceToken = normalizeDispatchToken(offering.serviceId);
    const categoryToken = normalizeDispatchToken(offering.categoryId);
    const nameToken = normalizeDispatchToken(offering.serviceName || offering.name || '');
    const optionToken = normalizeDispatchToken(offering.optionId || '');
    const catalogEntry = catalogIndex?.byId?.get(serviceToken) || null;
    const catalogCategoryToken = normalizeDispatchToken(catalogEntry?.categoryId || categoryToken);
    const catalogOptions = Array.isArray(catalogEntry?.options) ? catalogEntry.options : [];
    const hasConfiguredOptions = catalogOptions.length > 0;
    const isUnifiedService = catalogEntry?.optionApplicationMode === 'unified';

    if (catalogCategoryToken) categoryIds.add(catalogCategoryToken);
    if (serviceToken) serviceIds.add(serviceToken);
    if (nameToken) serviceIds.add(nameToken);
    [serviceToken, nameToken].filter(Boolean).forEach((token) => expandedServiceIds.add(token));
    if (catalogEntry?.label) {
      const labelToken = normalizeDispatchToken(catalogEntry.label);
      if (labelToken) expandedServiceIds.add(labelToken);
    }
    (Array.isArray(catalogEntry?.includedServiceIds) ? catalogEntry.includedServiceIds : []).forEach((includedId) => {
      const includedToken = normalizeDispatchToken(includedId);
      if (includedToken) expandedServiceIds.add(includedToken);
    });

    if (serviceToken) {
      if (optionToken) {
        approvedOptionKeys.add(`${serviceToken}::${optionToken}`);
      } else if (hasConfiguredOptions && isUnifiedService) {
        approvedOptionKeys.add(`${serviceToken}::__unified__`);
        catalogOptions.forEach((opt) => {
          const optToken = normalizeDispatchToken(opt?.id || opt?.title || '');
          if (optToken) approvedOptionKeys.add(`${serviceToken}::${optToken}`);
        });
      } else if (!hasConfiguredOptions) {
        approvedOptionKeys.add(`${serviceToken}::__legacy__`);
      }
      // Note: When hasConfiguredOptions && !isUnifiedService && !optionToken,
      // legacy service-wide approval does not grant option keys by default.
    }
  });

  return {
    categoryIds: [...categoryIds],
    serviceIds: [...serviceIds],
    expandedServiceIds: [...expandedServiceIds],
    approvedOptionKeys: [...approvedOptionKeys],
  };
}

function buildRequestedOptionQueryKeys(requestServiceIds = [], catalogIndex = null, requestOptionId = '') {
  const optionToken = normalizeDispatchToken(requestOptionId);
  const serviceTokens = [...new Set(
    (Array.isArray(requestServiceIds) ? requestServiceIds : [])
      .map((id) => normalizeDispatchToken(id))
      .filter(Boolean),
  )];
  const requestedEntries = resolveRequestedServiceEntries(serviceTokens, catalogIndex);
  const requiresOptionMatch = Boolean(optionToken)
    || requestedEntries.some((entry) => Array.isArray(entry?.options) && entry.options.length > 0);

  if (!requiresOptionMatch) {
    return { requiresOptionMatch: false, optionQueryKeys: [] };
  }
  if (!optionToken) {
    return { requiresOptionMatch: true, optionQueryKeys: [] };
  }

  const keys = new Set();
  serviceTokens.forEach((serviceToken) => {
    keys.add(`${serviceToken}::${optionToken}`);
    const entry = catalogIndex?.byId?.get(serviceToken) || null;
    if (entry?.optionApplicationMode === 'unified') {
      keys.add(`${serviceToken}::__unified__`);
    }
  });

  return {
    requiresOptionMatch: true,
    optionQueryKeys: [...keys],
  };
}

function helperServiceOfferingMatchesRequest(
  offering = {},
  categoryId = '',
  requestServiceIds = [],
  catalogIndex = null,
  requestOptionId = '',
  expandRequestedServiceTokensFn = null,
) {
  const categoryToken = normalizeDispatchToken(categoryId);
  if (!categoryToken || normalizeDispatchToken(offering.categoryId) !== categoryToken) return false;

  const serviceToken = normalizeDispatchToken(offering.serviceId);
  const offeringOptionToken = normalizeDispatchToken(offering.optionId || '');
  const requestOptionToken = normalizeDispatchToken(requestOptionId);

  const requestedTokens = typeof expandRequestedServiceTokensFn === 'function'
    ? expandRequestedServiceTokensFn(requestServiceIds, catalogIndex)
    : [...new Set((Array.isArray(requestServiceIds) ? requestServiceIds : []).map(normalizeDispatchToken).filter(Boolean))];

  const requestedEntries = resolveRequestedServiceEntries(requestServiceIds, catalogIndex);
  const requiresOptionMatch = Boolean(requestOptionToken)
    || requestedEntries.some((entry) => Array.isArray(entry?.options) && entry.options.length > 0);

  if (!requestedTokens.length && !requiresOptionMatch) return true;

  const offeringTokens = new Set([serviceToken, normalizeDispatchToken(offering.serviceName)]);
  const catalogEntry = catalogIndex?.byId?.get(serviceToken) || null;
  if (catalogEntry?.label) offeringTokens.add(normalizeDispatchToken(catalogEntry.label));
  (Array.isArray(catalogEntry?.includedServiceIds) ? catalogEntry.includedServiceIds : []).forEach((includedId) => {
    const token = normalizeDispatchToken(includedId);
    if (token) offeringTokens.add(token);
  });

  const serviceMatches = !requestedTokens.length || requestedTokens.some((token) => offeringTokens.has(token));
  if (!serviceMatches) return false;

  if (!requiresOptionMatch) {
    return !offeringOptionToken;
  }

  if (!requestOptionToken) {
    return false;
  }

  if (offeringOptionToken) {
    return offeringOptionToken === requestOptionToken;
  }

  // No offering.optionId (service-level approval): only matches when the catalog service uses unified application mode
  return catalogEntry?.optionApplicationMode === 'unified';
}

module.exports = {
  normalizeDispatchToken,
  getHelperPayoutVerificationStatus,
  hasVerifiedHelperPayout,
  normalizeHelperServiceOfferingDocument,
  getApprovedActiveHelperServiceOfferings,
  buildHelperDispatchServiceIds,
  buildRequestedOptionQueryKeys,
  helperServiceOfferingMatchesRequest,
};
