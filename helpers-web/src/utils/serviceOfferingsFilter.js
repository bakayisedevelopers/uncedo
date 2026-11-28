export function normalizeServiceToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function isOfferingApproved(offering = {}) {
  return offering?.status === 'approved' && offering?.approved === true;
}

export function getOfferingStatusMeta(offering = {}) {
  if (isOfferingApproved(offering) || offering?.status === 'approved') {
    return {
      key: 'approved',
      label: 'Approved',
      className: 'text-tealbrand-700 font-semibold',
    };
  }
  if (offering?.status === 'declined') {
    return {
      key: 'declined',
      label: 'Declined',
      className: 'text-red-700 font-semibold',
    };
  }
  return {
    key: 'pending',
    label: 'Pending review',
    className: 'text-amber-800 font-semibold',
  };
}

export function groupSubmittedOfferings(offerings = [], catalogById = new Map()) {
  const groups = new Map();

  for (const offering of Array.isArray(offerings) ? offerings : []) {
    if (!offering || offering.status === 'removed') continue;
    const serviceId = normalizeServiceToken(offering.serviceId || offering.serviceName || offering.id);
    if (!serviceId) continue;

    const catalogEntry = catalogById.get(serviceId)
      || catalogById.get(String(offering.serviceId || '').toLowerCase());
    const serviceName = String(catalogEntry?.label || offering.serviceName || serviceId).trim();
    const optionToken = normalizeServiceToken(offering.optionId || '');
    const catalogOption = optionToken && Array.isArray(catalogEntry?.options)
      ? catalogEntry.options.find((opt) => normalizeServiceToken(opt?.id || '') === optionToken)
      : null;
    const liveOptionTitle = String(catalogOption?.title || catalogOption?.label || offering.optionTitle || '').trim();

    if (!groups.has(serviceId)) {
      groups.set(serviceId, {
        serviceId,
        serviceName,
        items: [],
        approvedCount: 0,
        pendingCount: 0,
        declinedCount: 0,
      });
    }

    const group = groups.get(serviceId);
    group.items.push({
      ...offering,
      serviceName,
      optionTitle: liveOptionTitle,
    });
    const meta = getOfferingStatusMeta(offering);
    if (meta.key === 'approved') group.approvedCount += 1;
    else if (meta.key === 'declined') group.declinedCount += 1;
    else group.pendingCount += 1;
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => {
        const aLabel = String(a.optionTitle || a.serviceName || '').toLowerCase();
        const bLabel = String(b.optionTitle || b.serviceName || '').toLowerCase();
        return aLabel.localeCompare(bLabel);
      }),
    }))
    .sort((a, b) => a.serviceName.localeCompare(b.serviceName));
}

export function getAvailableCatalogEntries(catalog = [], offerings = []) {
  const appliedServiceLevel = new Set();
  const appliedOptionsByService = new Map();

  for (const offering of Array.isArray(offerings) ? offerings : []) {
    if (!offering || String(offering.status || '').toLowerCase() === 'removed') continue;
    const serviceKey = normalizeServiceToken(offering.serviceId || offering.serviceName);
    if (!serviceKey) continue;

    const optionIdKey = normalizeServiceToken(offering.optionId || '');
    const optionTitleKey = normalizeServiceToken(offering.optionTitle || '');

    if (!optionIdKey && !optionTitleKey) {
      appliedServiceLevel.add(serviceKey);
      continue;
    }

    if (!appliedOptionsByService.has(serviceKey)) {
      appliedOptionsByService.set(serviceKey, new Set());
    }
    const set = appliedOptionsByService.get(serviceKey);
    if (optionIdKey) {
      set.add(optionIdKey);
    } else if (optionTitleKey) {
      set.add(optionTitleKey);
    }
  }

  const available = [];

  for (const entry of Array.isArray(catalog) ? catalog : []) {
    if (!entry) continue;
    const serviceKey = normalizeServiceToken(entry.id || entry.label);
    if (!serviceKey) continue;

    const hasPerOptionMode = Array.isArray(entry.options)
      && entry.options.length > 0
      && entry.optionApplicationMode !== 'unified';

    if (hasPerOptionMode) {
      const appliedSet = appliedOptionsByService.get(serviceKey) || new Set();
      const availableOptions = entry.options.filter((opt) => {
        const optIdKey = normalizeServiceToken(opt?.id || '');
        const optTitleKey = normalizeServiceToken(opt?.title || opt?.label || '');
        const matchedById = optIdKey && appliedSet.has(optIdKey);
        const matchedByTitle = !optIdKey && optTitleKey && appliedSet.has(optTitleKey);
        return !matchedById && !matchedByTitle;
      });

      if (availableOptions.length === 0) {
        continue;
      }

      available.push({
        ...entry,
        options: availableOptions,
        totalOptionsCount: entry.options.length,
        availableOptionsCount: availableOptions.length,
      });
      continue;
    }

    const alreadyApplied = appliedServiceLevel.has(serviceKey)
      || (appliedOptionsByService.get(serviceKey)?.size || 0) > 0;
    if (alreadyApplied) {
      continue;
    }

    available.push({
      ...entry,
      totalOptionsCount: Array.isArray(entry.options) ? entry.options.length : 0,
      availableOptionsCount: Array.isArray(entry.options) ? entry.options.length : 0,
    });
  }

  return available;
}
