function toTitleCase(value = '') {
  return String(value || '')
    .trim()
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export const SERVICE_CATALOG = [];

const liveCategoryMap = new Map();

function rebuildServiceCatalog() {
  const next = [...liveCategoryMap.values()]
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')))
    .map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      skills: [],
    }));

  SERVICE_CATALOG.splice(0, SERVICE_CATALOG.length, ...next);
}

export function hydrateHelperServiceCategories(entries = []) {
  liveCategoryMap.clear();

  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const categoryId = String(entry.categoryId || '').trim().toLowerCase();
    if (!categoryId) return;

    liveCategoryMap.set(categoryId, {
      id: categoryId,
      name: String(entry.categoryName || toTitleCase(categoryId)).trim(),
      description: String(entry.description || '').trim(),
    });
  });

  rebuildServiceCatalog();
}

export function getServiceById(serviceId) {
  const normalizedServiceId = String(serviceId || '').trim().toLowerCase();
  return SERVICE_CATALOG.find((service) => service.id === normalizedServiceId) || null;
}
