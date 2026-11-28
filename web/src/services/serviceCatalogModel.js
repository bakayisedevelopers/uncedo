export const WHATSAPP_BOOK_PHONE = '27605239926';
export const LIKED_SERVICES_STORAGE_KEY = 'uncedo_web_liked_service_options_v1';
export const SERVICE_NOTES_STORAGE_KEY = 'uncedo_web_service_notes_v1';
export const SERVICE_AI_CHATS_STORAGE_KEY = 'uncedo_web_service_ai_chats_v1';

export function buildAskAiRequestPayload({ item = null, message = '', history = [] } = {}) {
  const cleanHistory = (Array.isArray(history) ? history : [])
    .map((turn) => {
      if (!turn || typeof turn !== 'object') return null;
      const text = String(turn.text || '').trim();
      if (!text) return null;
      return {
        role: turn.role === 'assistant' ? 'assistant' : 'user',
        text: text.slice(0, 600),
      };
    })
    .filter(Boolean)
    .slice(-10);

  return {
    serviceId: String(item?.serviceId || '').trim(),
    optionId: String(item?.optionId || '').trim(),
    optionTitle: String(item?.title || '').trim(),
    categoryName: String(item?.categoryName || '').trim(),
    priceLabel: String(item?.priceLabel || '').trim(),
    message: String(message || '').trim().slice(0, 1000),
    history: cleanHistory,
  };
}

function formatCategoryLabel(raw = '') {
  const clean = String(raw || '').trim();
  if (!clean) return 'General';
  if (/[A-Z\s]/.test(clean) && !clean.includes('_')) return clean;
  return clean
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function isValidImageUrl(url = '') {
  const clean = String(url || '').trim();
  if (!clean) return false;
  return /^(https?:\/\/|\/)/i.test(clean);
}

export function buildWhatsAppOptionBookingUrl({ title = '', parentServiceLabel = '' } = {}) {
  const cleanTitle = String(title || '').trim();
  const cleanParent = String(parentServiceLabel || '').trim();
  const includeParent = cleanParent && cleanParent.toLowerCase() !== cleanTitle.toLowerCase();
  const servicePhrase = includeParent ? `${cleanTitle} (${cleanParent})` : cleanTitle;
  const message = servicePhrase
    ? `Hi Uncedo, I'd like to book ${servicePhrase}`
    : "Hi Uncedo, I'd like to book a service";
  return `https://wa.me/${WHATSAPP_BOOK_PHONE}?text=${encodeURIComponent(message)}`;
}

export function buildWhatsAppQuestionUrl({
  title = '',
  parentServiceLabel = '',
  question = '',
} = {}) {
  const cleanTitle = String(title || '').trim();
  const cleanParent = String(parentServiceLabel || '').trim();
  const cleanQuestion = String(question || '').trim();
  const includeParent = cleanParent && cleanParent.toLowerCase() !== cleanTitle.toLowerCase();
  const servicePhrase = includeParent ? `${cleanTitle} (${cleanParent})` : cleanTitle;
  const prefix = servicePhrase
    ? `Hi Uncedo, I have a question about ${servicePhrase}:`
    : 'Hi Uncedo, I have a question about a service:';
  const message = cleanQuestion ? `${prefix} ${cleanQuestion}` : prefix;
  return `https://wa.me/${WHATSAPP_BOOK_PHONE}?text=${encodeURIComponent(message)}`;
}

export function buildShareServiceUrl(origin = '', serviceOptionId = '', basePath = '/') {
  const cleanOrigin = String(origin || '').replace(/\/+$/, '');
  const cleanId = String(serviceOptionId || '').trim();
  const normalizedBase = basePath === '/' ? '' : String(basePath || '').replace(/\/+$/, '');
  const path = cleanId
    ? `${normalizedBase}/?service=${encodeURIComponent(cleanId)}`
    : normalizedBase || '/';
  return cleanOrigin ? `${cleanOrigin}${path}` : path;
}

export function shuffleServiceOptions(items = [], { priorityId = '', excludeFirstId = '' } = {}) {
  const list = Array.isArray(items) ? [...items] : [];
  for (let idx = list.length - 1; idx > 0; idx -= 1) {
    const swapIdx = Math.floor(Math.random() * (idx + 1));
    [list[idx], list[swapIdx]] = [list[swapIdx], list[idx]];
  }

  const cleanPriority = String(priorityId || '').trim();
  if (cleanPriority) {
    const targetIdx = list.findIndex((entry) => entry?.id === cleanPriority);
    if (targetIdx > 0) {
      const [match] = list.splice(targetIdx, 1);
      list.unshift(match);
      return list;
    }
  }

  const cleanExclude = String(excludeFirstId || '').trim();
  if (cleanExclude && list.length > 1 && list[0]?.id === cleanExclude) {
    const swapIdx = 1 + Math.floor(Math.random() * (list.length - 1));
    [list[0], list[swapIdx]] = [list[swapIdx], list[0]];
  }

  return list;
}

export function formatOptionPriceLabel(priceValue, pricingMode = '') {
  const numeric = Number(priceValue);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 'Quote in WhatsApp';
  }
  const rounded = Math.round(numeric);
  const mode = String(pricingMode || '').trim().toLowerCase();
  if (mode === 'fixed') {
    return `R${rounded}`;
  }
  return `From R${rounded}`;
}

export function extractPicturedServiceOptions(catalogEntries = []) {
  const items = [];
  const seenKeys = new Set();

  (Array.isArray(catalogEntries) ? catalogEntries : []).forEach((entry) => {
    if (!entry || entry.active === false || entry.approved === false) return;

    const serviceId = String(entry.id || entry.serviceId || entry.catalogId || '').trim();
    if (!serviceId) return;

    const parentServiceLabel = String(entry.label || entry.serviceName || serviceId).trim();
    const categoryId = String(entry.categoryId || '').trim().toLowerCase() || 'general';
    const categoryName = formatCategoryLabel(entry.categoryName || categoryId);
    const pricingMode = String(entry.pricing?.pricingMode || '').trim().toLowerCase();
    const options = Array.isArray(entry.options) ? entry.options : [];

    options.forEach((option, index) => {
      if (!option || typeof option !== 'object') return;
      const imageUrl = String(option.imageUrl || option.imageUri || '').trim();
      if (!isValidImageUrl(imageUrl)) return;

      const title = String(option.title || option.label || '').trim();
      if (!title) return;

      const optionId = String(option.id || `option_${index + 1}`).trim().toLowerCase();
      const uniqueKey = `${serviceId}::${optionId}::${title.toLowerCase()}`;
      if (seenKeys.has(uniqueKey)) return;
      seenKeys.add(uniqueKey);

      const rawPrice = Number(option.price ?? option.priceAdder ?? entry.pricing?.basePrice ?? 0);
      const priceValue = Number.isFinite(rawPrice) && rawPrice > 0 ? Math.round(rawPrice) : 0;
      const description =
        String(option.description || '').trim()
        || String(entry.description || '').trim()
        || `${title} service available directly on WhatsApp.`;

      items.push({
        id: `${serviceId}__${optionId}_${index}`,
        serviceId,
        optionId,
        title,
        parentServiceLabel,
        categoryId,
        categoryName,
        description,
        priceValue,
        priceLabel: formatOptionPriceLabel(priceValue, pricingMode),
        imageUrl,
        whatsappUrl: buildWhatsAppOptionBookingUrl({ title, parentServiceLabel }),
      });
    });
  });

  return items.sort((left, right) => {
    const titleCompare = left.title.localeCompare(right.title);
    if (titleCompare !== 0) return titleCompare;
    return left.categoryName.localeCompare(right.categoryName);
  });
}

export function buildCatalogCategories(items = []) {
  const counts = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item?.categoryId) return;
    const prev = counts.get(item.categoryId);
    if (prev) {
      prev.count += 1;
    } else {
      counts.set(item.categoryId, {
        id: item.categoryId,
        label: item.categoryName || formatCategoryLabel(item.categoryId),
        count: 1,
      });
    }
  });
  return Array.from(counts.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export function filterBrowseServiceOptions(
  items = [],
  { searchQuery = '', categoryId = 'all', likedIds = new Set(), onlyLiked = false } = {},
) {
  const normalizedQuery = String(searchQuery || '').trim().toLowerCase();
  const normalizedCat = String(categoryId || 'all').trim().toLowerCase();

  return (Array.isArray(items) ? items : []).filter((item) => {
    if (onlyLiked && !likedIds.has(item.id)) {
      return false;
    }
    if (normalizedCat && normalizedCat !== 'all' && normalizedCat !== 'liked') {
      if (String(item.categoryId || '').toLowerCase() !== normalizedCat) {
        return false;
      }
    }
    if (!normalizedQuery) return true;

    const haystack = [
      item.title,
      item.parentServiceLabel,
      item.categoryName,
      item.description,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}
