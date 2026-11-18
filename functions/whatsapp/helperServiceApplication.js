'use strict';

const { resolveSelectedServiceOption } = require('../serviceMarketplacePricing');
const { formatWhatsAppText } = require('./messageFormatting');

const HELPER_SERVICE_APP_TTL_MS = 30 * 60 * 1000;

const HELPER_ADD_BUTTONS = Object.freeze({
  PICK_SERVICE_PREFIX: 'wa_hsvc_pick_',
  NEXT_SERVICES: 'wa_hsvc_svc_next',
  PICK_OPTION_PREFIX: 'wa_hsvc_opt_',
  NEXT_OPTIONS: 'wa_hsvc_opt_next',
  SUBMIT_OPTIONS: 'wa_hsvc_opt_submit',
  BACK_TO_SERVICES: 'wa_hsvc_svc_back',
  PHOTOS_DONE: 'wa_hsvc_photos_done',
  CANCEL: 'wa_hsvc_cancel',
});

function normalizeToken(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isHelperServiceApplicationActive(appState = null, nowMs = Date.now()) {
  if (!appState || typeof appState !== 'object') return false;
  const stage = String(appState.stage || '').trim();
  if (!stage || stage === 'completed') return false;
  return Number(appState.expiresAtMs || 0) > nowMs;
}

function matchCatalogService(catalog = [], { serviceId = '', query = '' } = {}) {
  const entries = (Array.isArray(catalog) ? catalog : [])
    .filter((service) => service && service.active !== false && service.approved !== false);
  const idInput = String(serviceId || '').trim().toLowerCase();
  const idToken = normalizeToken(serviceId);
  const queryInput = String(query || '').trim().toLowerCase();
  const queryToken = normalizeToken(query);

  if (idInput || idToken) {
    const exactId = entries.find((entry) => (
      String(entry.id || '').trim().toLowerCase() === idInput
      || (idToken && normalizeToken(entry.id) === idToken)
    ));
    if (exactId) return exactId;
  }

  if (queryInput || queryToken) {
    const exactQuery = entries.find((entry) => (
      String(entry.id || '').trim().toLowerCase() === queryInput
      || String(entry.label || '').trim().toLowerCase() === queryInput
      || (queryToken && (normalizeToken(entry.id) === queryToken || normalizeToken(entry.label) === queryToken))
    ));
    if (exactQuery) return exactQuery;

    const partialQuery = entries.find((entry) => (
      String(entry.label || '').toLowerCase().includes(queryInput)
      || String(entry.id || '').toLowerCase().includes(queryInput)
      || String(entry.description || '').toLowerCase().includes(queryInput)
    ));
    if (partialQuery) return partialQuery;
  }

  return null;
}

function matchSingleServiceOption(service, rawText = '') {
  const text = String(rawText || '').trim();
  if (!text || !Array.isArray(service?.options) || !service.options.length) return null;

  const direct = resolveSelectedServiceOption(service, text);
  if (direct) return direct;

  const normalizedInput = text.toLowerCase();
  const inputToken = normalizeToken(text);
  const sorted = service.options
    .slice()
    .sort((left, right) => String(right?.title || '').length - String(left?.title || '').length);

  return sorted.find((opt) => {
    const title = String(opt?.title || '').trim().toLowerCase();
    const optId = String(opt?.id || '').trim().toLowerCase();
    return (title && title === normalizedInput)
      || (optId && optId === normalizedInput)
      || (inputToken && (normalizeToken(opt?.id) === inputToken || normalizeToken(opt?.title) === inputToken));
  }) || sorted.find((opt) => {
    const title = String(opt?.title || '').trim().toLowerCase();
    return title.length >= 3 && (normalizedInput.includes(title) || title.includes(normalizedInput));
  }) || null;
}

function parseRequestedServiceOptions(service, rawOptionInput = '') {
  const options = Array.isArray(service?.options) ? service.options : [];
  if (!options.length) return { matchedOptions: [], unmatchedTokens: [] };

  const rawList = Array.isArray(rawOptionInput)
    ? rawOptionInput.map((item) => String(item || '').trim()).filter(Boolean)
    : [String(rawOptionInput || '').trim()].filter(Boolean);

  if (!rawList.length) return { matchedOptions: [], unmatchedTokens: [] };

  const matchesExactOption = (segment) => {
    const segToken = normalizeToken(segment);
    if (!segToken) return null;
    return options.find((opt) => normalizeToken(opt?.id) === segToken || normalizeToken(opt?.title) === segToken) || null;
  };

  const tokens = rawList
    .flatMap((entry) => entry.split(/\s*(?:,|;|\n)\s*/))
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap((segment) => {
      if (matchesExactOption(segment)) return [segment];
      return segment.split(/\s*(?:\band\b|&)\s*/i).map((item) => item.trim()).filter(Boolean);
    });

  const matchedOptions = [];
  const unmatchedTokens = [];
  const seenIds = new Set();

  for (const token of tokens) {
    const match = matchesExactOption(token) || matchSingleServiceOption(service, token);
    if (!match) {
      unmatchedTokens.push(token);
      continue;
    }
    const key = normalizeToken(match.id);
    if (!seenIds.has(key)) {
      seenIds.add(key);
      matchedOptions.push(match);
    }
  }

  return { matchedOptions, unmatchedTokens };
}

function isBlockingOfferingStatus(status = '') {
  const normalized = String(status || '').trim().toLowerCase();
  return Boolean(normalized && !['declined', 'removed', 'rejected'].includes(normalized));
}

function analyzeHelperServiceCatalog(catalog = [], offerings = []) {
  const activeCatalog = (Array.isArray(catalog) ? catalog : [])
    .filter((entry) => entry && entry.active !== false && entry.approved !== false);

  const offeringMap = new Map();
  for (const offering of Array.isArray(offerings) ? offerings : []) {
    const svcToken = normalizeToken(offering?.serviceId);
    const optToken = normalizeToken(offering?.optionId || '');
    if (!svcToken) continue;
    const key = `${svcToken}::${optToken}`;
    const existing = offeringMap.get(key);
    if (!existing || isBlockingOfferingStatus(offering?.status)) {
      offeringMap.set(key, offering);
    }
  }

  return activeCatalog.map((service) => {
    const svcToken = normalizeToken(service.id);
    const options = Array.isArray(service.options) ? service.options : [];
    const isPerOption = options.length > 0 && service.optionApplicationMode !== 'unified';
    const inheritsBundleImages = service.type === 'bundle' && service.inheritBundleImages !== false;

    if (isPerOption) {
      const optionStates = options.map((opt) => {
        const resolvedId = String(opt.id || opt.title || '').trim();
        const optToken = normalizeToken(resolvedId);
        const existing = offeringMap.get(`${svcToken}::${optToken}`) || null;
        const existingStatus = String(existing?.status || '').trim().toLowerCase();
        const hasPhotos = Array.isArray(existing?.photos) && existing.photos.length > 0;
        const canApply = !isBlockingOfferingStatus(existingStatus);
        return {
          id: resolvedId,
          title: String(opt.title || resolvedId || ''),
          description: String(opt.description || ''),
          price: Number(opt.price || 0),
          existingStatus,
          hasPhotos,
          canApply,
        };
      });
      const availableOptions = optionStates.filter((opt) => opt.canApply);
      return {
        service,
        id: String(service.id || ''),
        label: String(service.label || service.id || ''),
        categoryId: String(service.categoryId || ''),
        categoryName: String(service.categoryName || service.categoryId || ''),
        optionApplicationMode: 'per_option',
        inheritsBundleImages,
        isPerOption: true,
        optionStates,
        availableOptions,
        canApplyMore: availableOptions.length > 0,
      };
    }

    const existing = offeringMap.get(`${svcToken}::`) || null;
    const existingStatus = String(existing?.status || '').trim().toLowerCase();
    const hasPhotos = Array.isArray(existing?.photos) && existing.photos.length > 0;
    const canApplyMore = !isBlockingOfferingStatus(existingStatus);
    return {
      service,
      id: String(service.id || ''),
      label: String(service.label || service.id || ''),
      categoryId: String(service.categoryId || ''),
      categoryName: String(service.categoryName || service.categoryId || ''),
      optionApplicationMode: service.optionApplicationMode === 'unified' ? 'unified' : 'service',
      inheritsBundleImages,
      isPerOption: false,
      optionStates: [],
      availableOptions: [],
      existingStatus,
      hasPhotos,
      canApplyMore,
    };
  });
}

function buildHelperAddServiceMenu(analyses = [], { page = 0, leadIn = '' } = {}) {
  const eligible = (Array.isArray(analyses) ? analyses : []).filter((entry) => entry.canApplyMore);
  const pageSize = 9;
  const safePage = Math.max(0, Number(page || 0));
  const slice = eligible.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const rows = slice.map((entry) => {
    const desc = entry.isPerOption
      ? `${entry.availableOptions.length} option${entry.availableOptions.length === 1 ? '' : 's'} available`
      : (entry.categoryName || 'Apply for this service');
    return {
      id: `${HELPER_ADD_BUTTONS.PICK_SERVICE_PREFIX}${normalizeToken(entry.id)}`.slice(0, 200),
      title: String(entry.label || entry.id).slice(0, 24),
      description: String(desc).slice(0, 72),
    };
  });

  if (eligible.length > (safePage + 1) * pageSize) {
    rows.push({
      id: HELPER_ADD_BUTTONS.NEXT_SERVICES,
      title: 'More services',
      description: 'Show the next available services',
    });
  }

  const baseText = eligible.length
    ? `${leadIn ? `${leadIn}\n\n` : ''}Choose a service below to apply for it or select specific options:`
    : 'You have already applied for all currently published Uncedo services and options.';
  const text = formatWhatsAppText(`${baseText}${safePage > 0 && eligible.length ? ` (page ${safePage + 1})` : ''}`);

  return {
    eligibleCount: eligible.length,
    text,
    interactive: rows.length
      ? {
          type: 'list',
          body: { text: text.slice(0, 1024) },
          action: {
            button: 'Choose service',
            sections: [{ title: 'Available services', rows: rows.slice(0, 10) }],
          },
        }
      : null,
  };
}

function buildHelperAddOptionMenu(serviceAnalysis, { selectedOptionIds = [], page = 0, leadIn = '' } = {}) {
  const selectedTokens = new Set(
    (Array.isArray(selectedOptionIds) ? selectedOptionIds : [])
      .map((id) => normalizeToken(id))
      .filter(Boolean),
  );
  const availableOptions = Array.isArray(serviceAnalysis?.availableOptions) ? serviceAnalysis.availableOptions : [];
  const selectedOptions = availableOptions.filter((opt) => selectedTokens.has(normalizeToken(opt.id)));
  const remaining = availableOptions.filter((opt) => !selectedTokens.has(normalizeToken(opt.id)));

  const safePage = Math.max(0, Number(page || 0));
  const hasSelected = selectedOptions.length > 0;
  const pageSize = hasSelected ? 8 : 9;
  const slice = remaining.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const rows = [];
  const seenRowIds = new Set();
  if (hasSelected) {
    rows.push({
      id: HELPER_ADD_BUTTONS.SUBMIT_OPTIONS,
      title: 'Submit selected',
      description: `Apply for ${selectedOptions.length} option${selectedOptions.length === 1 ? '' : 's'}`,
    });
    seenRowIds.add(HELPER_ADD_BUTTONS.SUBMIT_OPTIONS);
  }

  slice.forEach((opt) => {
    const priceLabel = Number.isFinite(Number(opt.price)) && Number(opt.price) >= 0
      ? `R${Number(opt.price).toFixed(0)}`
      : '';
    const desc = [priceLabel, String(opt.description || '').trim()].filter(Boolean).join(' · ') || 'Tap to select option';
    const optToken = normalizeToken(opt.id || opt.title);
    if (!optToken) return;
    const rowId = `${HELPER_ADD_BUTTONS.PICK_OPTION_PREFIX}${optToken}`.slice(0, 200);
    if (seenRowIds.has(rowId)) return;
    seenRowIds.add(rowId);
    rows.push({
      id: rowId,
      title: String(opt.title || opt.id).slice(0, 24),
      description: desc.slice(0, 72),
    });
  });

  if (remaining.length > (safePage + 1) * pageSize && !seenRowIds.has(HELPER_ADD_BUTTONS.NEXT_OPTIONS)) {
    rows.push({
      id: HELPER_ADD_BUTTONS.NEXT_OPTIONS,
      title: 'More options',
      description: 'Show more options for this service',
    });
  }

  const serviceTitle = String(serviceAnalysis?.label || serviceAnalysis?.id || 'this service');
  const selectedTitles = selectedOptions.map((opt) => opt.title);
  const promptText = hasSelected
    ? `${leadIn ? `${leadIn}\n\n` : ''}Selected under *${serviceTitle}*: ${selectedTitles.join(', ')}.\n\nTap another option to add it, or tap *Submit selected* to apply.`
    : `${leadIn ? `${leadIn}\n\n` : ''}Which option(s) under *${serviceTitle}* would you like to apply for? Tap an option below or reply with the option name(s).`;

  const text = formatWhatsAppText(`${promptText}${safePage > 0 ? ` (page ${safePage + 1})` : ''}`);

  return {
    availableCount: availableOptions.length,
    remainingCount: remaining.length,
    selectedCount: selectedOptions.length,
    text,
    interactive: rows.length
      ? {
          type: 'list',
          body: { text: text.slice(0, 1024) },
          action: {
            button: 'Choose option',
            sections: [{ title: serviceTitle.slice(0, 24), rows: rows.slice(0, 10) }],
          },
        }
      : null,
  };
}

function buildHelperPhotoUploadPrompt({ serviceName = '', submittedLabels = [], photoUploadUrl = '', needsPhotos = true } = {}) {
  const summary = submittedLabels.length
    ? submittedLabels.join(', ')
    : (serviceName || 'your selected service');

  const bodyText = needsPhotos
    ? `✅ Submitted application for *${summary}* (pending review).\n\n📸 Please send at least one work photo right here in this WhatsApp chat so Uncedo can review your application${photoUploadUrl ? `, or upload on the web app: ${photoUploadUrl}` : ''}.`
    : `✅ Submitted application for *${summary}* (pending Uncedo admin review).`;

  const text = formatWhatsAppText(bodyText);
  return {
    text,
    interactive: {
      type: 'button',
      body: { text: text.slice(0, 1024) },
      action: {
        buttons: [
          { type: 'reply', reply: { id: HELPER_ADD_BUTTONS.BACK_TO_SERVICES, title: 'Add more services' } },
          { type: 'reply', reply: { id: HELPER_ADD_BUTTONS.PHOTOS_DONE, title: 'Done' } },
        ],
      },
    },
  };
}

module.exports = {
  HELPER_ADD_BUTTONS,
  HELPER_SERVICE_APP_TTL_MS,
  analyzeHelperServiceCatalog,
  buildHelperAddOptionMenu,
  buildHelperAddServiceMenu,
  buildHelperPhotoUploadPrompt,
  isBlockingOfferingStatus,
  isHelperServiceApplicationActive,
  matchCatalogService,
  matchSingleServiceOption,
  normalizeToken,
  parseRequestedServiceOptions,
};
