function normalize(value = '') {
  return String(value || '').trim().toLowerCase();
}

export function slugify(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function isPendingSkillStatus(status = '') {
  const normalized = normalize(status);
  return normalized === 'pending' || normalized === 'review';
}

export function isApprovedSkillStatus(status = '') {
  return normalize(status) === 'approved';
}

export function isRejectedSkillStatus(status = '') {
  return normalize(status) === 'rejected';
}

export function matchesCatalogItem(row = {}, item = {}) {
  const rowKeys = [
    row.catalogId,
    row.skillId,
    row.skillName,
    row.serviceId,
    row.serviceName,
  ]
    .map(slugify)
    .filter(Boolean);

  const itemKeys = [
    item.id,
    item.label,
    item.categoryId,
    item.categoryName,
  ]
    .map(slugify)
    .filter(Boolean);

  return itemKeys.some((itemKey) => rowKeys.includes(itemKey));
}

function groupRows(rows = [], getKey, buildMeta) {
  const groups = new Map();

  rows.forEach((row) => {
    const key = String(getKey(row) || '').trim();
    if (!key) return;

    if (!groups.has(key)) {
      groups.set(key, {
        meta: buildMeta(row),
        rows: [],
      });
    }

    groups.get(key).rows.push(row);
  });

  return [...groups.values()].map(({ meta, rows: groupedRows }) => ({
    ...meta,
    rows: groupedRows,
    totalCount: groupedRows.length,
    pendingCount: groupedRows.filter((row) => isPendingSkillStatus(row.skillStatus)).length,
    approvedCount: groupedRows.filter((row) => isApprovedSkillStatus(row.skillStatus)).length,
    rejectedCount: groupedRows.filter((row) => isRejectedSkillStatus(row.skillStatus)).length,
    pausedCount: groupedRows.filter((row) => row.skillActive === false).length,
    serviceCount: new Set(groupedRows.map((row) => row.serviceId).filter(Boolean)).size,
  }));
}

export function groupRowsByHelper(rows = []) {
  return groupRows(
    rows,
    (row) => row.providerUid || row.helperUid || row.providerEmail || row.providerName,
    (row) => ({
      providerUid: row.providerUid || row.helperUid || '',
      helperName: row.helperName || row.providerName || 'Helper',
      providerName: row.providerName || row.helperName || 'Helper',
      providerEmail: row.providerEmail || '',
      providerType: row.providerType || 'individual',
      businessName: row.businessName || '',
      city: row.city || '',
      phoneNumber: row.phoneNumber || '',
      suspended: Boolean(row.suspended),
      verificationStatus: String(row.verificationStatus || 'pending').toLowerCase(),
      skillRows: [],
    }),
  ).sort((left, right) => {
    if (right.pendingCount !== left.pendingCount) {
      return right.pendingCount - left.pendingCount;
    }
    return `${left.providerName}`.localeCompare(`${right.providerName}`);
  });
}

export function groupRowsByService(rows = []) {
  return groupRows(
    rows,
    (row) => row.serviceId || row.catalogId || row.serviceName,
    (row) => ({
      serviceId: row.serviceId || row.catalogId || '',
      serviceName: row.serviceName || row.skillName || 'Service',
      serviceDescription: row.serviceDescription || '',
    }),
  ).sort((left, right) => {
    if (right.pendingCount !== left.pendingCount) {
      return right.pendingCount - left.pendingCount;
    }
    return `${left.serviceName}`.localeCompare(`${right.serviceName}`);
  });
}

