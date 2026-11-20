'use strict';

const { formatWhatsAppText } = require('./messageFormatting');

const MAX_SERVICE_LIST_ITEMS = 50;
const MAX_SERVICE_LIST_CHARS = 3800;

function isPriceQuestion(text = '') {
  return /\b(?:price|pricing|cost|costs|charge|charges|rate|rates|estimate|estimates|how much|what would .* cost|what .* cost|what (?:will|would) i pay|how expensive|expensive|cheap|price range|afford(?:able|ability))\b/i
    .test(String(text || '').slice(0, 1200));
}

function getConfiguredServicePriceRange(service = {}) {
  const pricing = service.priceRange && typeof service.priceRange === 'object'
    ? service.priceRange
    : service.pricing && typeof service.pricing === 'object' ? service.pricing : {};
  const currency = String(pricing.currency || 'ZAR').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  const minimum = Number(pricing.minimumTotal);
  const maximum = Number(pricing.maximumTotal);
  if (Number.isFinite(minimum) && Number.isFinite(maximum)
    && minimum > 0 && maximum > 0 && maximum >= minimum) {
    return { currency, minimum, maximum };
  }
  const optionPrices = (Array.isArray(service.options) ? service.options : [])
    .map((opt) => Number(opt?.price))
    .filter((price) => Number.isFinite(price) && price > 0);
  if (!optionPrices.length) return null;
  return {
    currency,
    minimum: Math.min(...optionPrices),
    maximum: Math.max(...optionPrices),
  };
}

const DEFAULT_SERVICE_PLACEHOLDER_IMAGE = 'https://uncedo.bakayise.com/logo.png';
const MAX_INTERACTIVE_BODY_CHARS = 1024;
const UNSUPPORTED_WHATSAPP_IMAGE_EXT_RE = /\.(?:webp|svg|gif|avif)(?:$|[?#])/i;
const VALID_WHATSAPP_IMAGE_MIME_RE = /^image\/(?:jpeg|jpg|png)$/i;
const MAX_WHATSAPP_CAROUSEL_IMAGE_BYTES = 5 * 1024 * 1024;
const DEFAULT_IMAGE_VERIFY_TIMEOUT_MS = 2500;
const POSITIVE_IMAGE_CACHE_TTL_MS = 5 * 60 * 1000;
const NEGATIVE_IMAGE_CACHE_TTL_MS = 60 * 1000;
const verifiedImageUrlCache = new Map();

function isSupportedWhatsAppImageUrl(value) {
  const url = String(value || '').trim();
  if (!url.startsWith('https://')) return false;
  if (UNSUPPORTED_WHATSAPP_IMAGE_EXT_RE.test(url)) return false;
  return true;
}

function isValidWhatsAppImageContentType(contentType = '') {
  const normalized = String(contentType || '').split(';')[0].trim().toLowerCase();
  return VALID_WHATSAPP_IMAGE_MIME_RE.test(normalized);
}

function collectServiceCarouselImageCandidates(service = {}) {
  const raw = [
    ...(Array.isArray(service.images) ? service.images.map((item) => item?.uri || item?.url || item) : []),
    service.imageUri,
    service.imageUrl,
    ...(Array.isArray(service.options) ? service.options.map((opt) => opt?.imageUrl || opt?.imageUri) : []),
  ];
  const seen = new Set();
  const candidates = [];
  for (const item of raw) {
    const trimmed = String(item || '').trim();
    if (!trimmed || seen.has(trimmed) || !isSupportedWhatsAppImageUrl(trimmed)) continue;
    seen.add(trimmed);
    candidates.push(trimmed);
  }
  return candidates;
}

function selectWhatsAppCarouselImageUrl(service = {}, placeholderImage = DEFAULT_SERVICE_PLACEHOLDER_IMAGE) {
  const candidates = collectServiceCarouselImageCandidates(service);
  return candidates[0] || placeholderImage;
}

function evaluateImageResponse(response, maxBytes = MAX_WHATSAPP_CAROUSEL_IMAGE_BYTES) {
  if (!response || !response.ok) {
    return {
      ok: false,
      status: Number(response?.status || 0),
      reason: `http_${Number(response?.status || 0)}`,
    };
  }
  const contentType = String(response.headers?.get?.('content-type') || '').trim();
  if (!isValidWhatsAppImageContentType(contentType)) {
    return {
      ok: false,
      status: Number(response.status || 200),
      contentType,
      reason: 'unsupported_content_type',
    };
  }
  const rawLength = response.headers?.get?.('content-length');
  const contentLength = rawLength !== null && rawLength !== undefined && rawLength !== '' ? Number(rawLength) : NaN;
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return {
      ok: false,
      status: Number(response.status || 200),
      contentType,
      contentLength,
      reason: 'exceeds_max_bytes',
    };
  }
  return {
    ok: true,
    status: Number(response.status || 200),
    contentType: contentType.split(';')[0].trim().toLowerCase(),
    contentLength: Number.isFinite(contentLength) ? contentLength : null,
  };
}

async function verifyWhatsAppImageUrl(
  url,
  {
    fetchImpl = fetch,
    timeoutMs = DEFAULT_IMAGE_VERIFY_TIMEOUT_MS,
    maxBytes = MAX_WHATSAPP_CAROUSEL_IMAGE_BYTES,
    useCache = fetchImpl === fetch,
    now = Date.now(),
  } = {},
) {
  const normalizedUrl = String(url || '').trim();
  if (!isSupportedWhatsAppImageUrl(normalizedUrl)) {
    return { ok: false, status: 0, reason: 'invalid_url' };
  }
  if (useCache) {
    const cached = verifiedImageUrlCache.get(normalizedUrl);
    if (cached && cached.expiresAtMs > now) {
      return cached.result;
    }
  }
  let result;
  try {
    let response = await fetchImpl(normalizedUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response && (response.status === 405 || response.status === 501)) {
      response.body?.cancel?.().catch?.(() => {});
      response = await fetchImpl(normalizedUrl, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
    }
    response?.body?.cancel?.().catch?.(() => {});
    result = evaluateImageResponse(response, maxBytes);
  } catch (error) {
    result = {
      ok: false,
      status: 0,
      reason: error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'fetch_error',
    };
  }
  if (useCache) {
    const ttlMs = result.ok ? POSITIVE_IMAGE_CACHE_TTL_MS : NEGATIVE_IMAGE_CACHE_TTL_MS;
    verifiedImageUrlCache.set(normalizedUrl, {
      result,
      expiresAtMs: now + ttlMs,
    });
  }
  return result;
}

async function resolveVerifiedWhatsAppImageMap(
  urls = [],
  {
    fetchImpl = fetch,
    timeoutMs = DEFAULT_IMAGE_VERIFY_TIMEOUT_MS,
    maxBytes = MAX_WHATSAPP_CAROUSEL_IMAGE_BYTES,
    useCache = fetchImpl === fetch,
  } = {},
) {
  const uniqueUrls = [...new Set(
    (Array.isArray(urls) ? urls : [])
      .map((u) => String(u || '').trim())
      .filter((u) => isSupportedWhatsAppImageUrl(u)),
  )];
  const results = await Promise.all(
    uniqueUrls.map(async (url) => [
      url,
      await verifyWhatsAppImageUrl(url, { fetchImpl, timeoutMs, maxBytes, useCache }),
    ]),
  );
  return new Map(results);
}

function selectVerifiedWhatsAppCarouselImageUrl(
  service = {},
  verifiedMap = new Map(),
  placeholderImage = DEFAULT_SERVICE_PLACEHOLDER_IMAGE,
) {
  const candidates = collectServiceCarouselImageCandidates(service);
  for (const candidate of candidates) {
    if (verifiedMap.get(candidate)?.ok === true) return candidate;
  }
  const safePlaceholder = String(placeholderImage || '').trim();
  if (isSupportedWhatsAppImageUrl(safePlaceholder)) {
    const placeholderCheck = verifiedMap.get(safePlaceholder);
    if (!placeholderCheck || placeholderCheck.ok === true) return safePlaceholder;
  }
  return '';
}

function truncateCleanly(value, maxLength) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  if (maxLength <= 1) return clean.slice(0, maxLength);
  const sliced = clean.slice(0, maxLength - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  const boundary = lastSpace >= Math.floor(maxLength * 0.5) ? sliced.slice(0, lastSpace) : sliced;
  return `${boundary.trimEnd()}…`;
}

function buildWhatsAppServiceCarousel(services = [], { placeholderImage = DEFAULT_SERVICE_PLACEHOLDER_IMAGE } = {}) {
  const available = (Array.isArray(services) ? services : [])
    .filter((service) => String(service?.label || '').trim());
  if (available.length < 2) return null;

  const cards = available.slice(0, 10).map((service, index) => {
    const imageUrl = selectWhatsAppCarouselImageUrl(service, placeholderImage);
    const labelText = formatWhatsAppText(service.label).replace(/\n/g, ' ').replace(/\*/g, '').slice(0, 60).trim();
    const rawCategory = formatWhatsAppText(service.categoryName || service.categoryId || '').replace(/\n/g, ' ').replace(/\*/g, '').slice(0, 32).trim();
    const categoryText = rawCategory ? ` · ${rawCategory}` : '';
    const headerLine = `*${labelText}*${categoryText}`;
    const remainingForDesc = 160 - headerLine.length - 1;
    const rawDesc = formatWhatsAppText(service.description || '').replace(/\n+/g, ' ').replace(/\*/g, '').trim();
    const descLine = rawDesc && remainingForDesc >= 12 ? `\n${truncateCleanly(rawDesc, remainingForDesc)}` : '';
    const bodyText = `${headerLine}${descLine}`.slice(0, 160);

    return {
      card_index: index,
      type: 'button',
      header: {
        type: 'image',
        image: {
          link: imageUrl,
        },
      },
      body: {
        text: bodyText,
      },
      action: {
        buttons: [
          {
            type: 'quick_reply',
            quick_reply: {
              id: `wa_book_svc_${service.id}`.slice(0, 250),
              title: 'Book',
            },
          },
          {
            type: 'quick_reply',
            quick_reply: {
              id: `wa_learn_svc_${service.id}`.slice(0, 250),
              title: 'Learn more',
            },
          },
        ],
      },
    };
  });

  return {
    type: 'carousel',
    body: {
      text: formatWhatsAppText('✨ *Services available on Uncedo* 🛠️\n\nSwipe through our services below and tap *Book* or *Learn more* on any service:'),
    },
    action: {
      cards,
    },
  };
}

async function buildVerifiedWhatsAppServiceCarousel(
  services = [],
  {
    placeholderImage = DEFAULT_SERVICE_PLACEHOLDER_IMAGE,
    fetchImpl = fetch,
    timeoutMs = DEFAULT_IMAGE_VERIFY_TIMEOUT_MS,
    logger = null,
    useCache = fetchImpl === fetch,
  } = {},
) {
  const available = (Array.isArray(services) ? services : [])
    .filter((service) => String(service?.label || '').trim());
  if (available.length < 2) return null;

  const topServices = available.slice(0, 10);
  const allCandidates = topServices.flatMap((service) => collectServiceCarouselImageCandidates(service));
  if (isSupportedWhatsAppImageUrl(placeholderImage)) {
    allCandidates.push(String(placeholderImage).trim());
  }
  const verifiedMap = await resolveVerifiedWhatsAppImageMap(allCandidates, {
    fetchImpl,
    timeoutMs,
    useCache,
  });

  const brokenUrls = [];
  const sanitizedServices = [];
  for (const service of topServices) {
    const candidates = collectServiceCarouselImageCandidates(service);
    for (const candidate of candidates) {
      const check = verifiedMap.get(candidate);
      if (check && !check.ok) {
        brokenUrls.push({
          serviceId: String(service.id || ''),
          reason: check.reason,
          status: check.status || 0,
        });
      }
    }
    const chosenImageUrl = selectVerifiedWhatsAppCarouselImageUrl(service, verifiedMap, placeholderImage);
    if (!chosenImageUrl) {
      logger?.warn?.('whatsapp_carousel_no_reachable_image_fallback_text', {
        serviceId: String(service.id || ''),
      });
      return null;
    }
    sanitizedServices.push({
      ...service,
      images: [{ uri: chosenImageUrl }],
      imageUri: chosenImageUrl,
      imageUrl: chosenImageUrl,
    });
  }

  if (brokenUrls.length > 0) {
    logger?.warn?.('whatsapp_carousel_broken_image_skipped', {
      brokenCount: brokenUrls.length,
      brokenUrls: brokenUrls.slice(0, 10),
    });
  }

  return buildWhatsAppServiceCarousel(sanitizedServices, { placeholderImage });
}

function formatWhatsAppServiceList(services = [], { includePricing = false } = {}) {
  const available = (Array.isArray(services) ? services : [])
    .filter((service) => String(service?.label || '').trim());
  const items = available.slice(0, MAX_SERVICE_LIST_ITEMS);
  if (!items.length) return 'I could not find any currently published Uncedo services.';

  const lines = ['✨ *Services available on Uncedo* 🛠️', ''];
  let listed = 0;
  for (const service of items) {
    const label = formatWhatsAppText(service.label).replace(/\n/g, ' ').slice(0, 140);
    const category = formatWhatsAppText(service.categoryName || service.categoryId || '').replace(/\n/g, ' ').slice(0, 80);
    const range = includePricing ? getConfiguredServicePriceRange(service) : null;
    const rangeText = range
      ? (range.minimum === range.maximum
        ? ` · 💰 ${range.currency} ${range.minimum.toFixed(2)}`
        : ` · 💰 ${range.currency} ${range.minimum.toFixed(2)}–${range.currency} ${range.maximum.toFixed(2)}`)
      : '';
    const line = `${listed + 1}. *${label}*${category ? ` — ${category}` : ''}${rangeText}`;
    if (lines.join('\n').length + line.length + 2 > MAX_SERVICE_LIST_CHARS) break;
    lines.push(line);
    listed += 1;
  }

  const remaining = Math.max(0, available.length - listed);
  lines.push('', remaining
    ? `📌 I can show the remaining ${remaining} services by category. Which type of service are you looking for?`
    : '💬 Tell me which service you are interested in, and I’ll help you with the next step.');
  return lines.join('\n');
}

function formatWhatsAppPriceGuidance(serviceName, priceRange) {
  const name = formatWhatsAppText(serviceName || 'This service').replace(/\n/g, ' ').slice(0, 140);
  if (priceRange && Number.isFinite(Number(priceRange.minimum)) && Number.isFinite(Number(priceRange.maximum))) {
    const currency = String(priceRange.currency || 'ZAR').trim().toUpperCase();
    const minimum = Number(priceRange.minimum).toFixed(2);
    const maximum = Number(priceRange.maximum).toFixed(2);
    if (minimum === maximum) {
      return `💰 *${name}* is currently listed at *${currency} ${minimum}*. This is an indication; your final quote depends on the service details.`;
    }
    return `💰 *${name}* is currently listed in the range of *${currency} ${minimum}–${currency} ${maximum}*. This is an indication; your final quote depends on the service details.`;
  }
  return `ℹ️ I don’t have a reliable price range for *${name}* in the current catalogue. The final amount depends on the service details, and I’d be happy to help collect them so Uncedo can prepare an accurate quote.`;
}

function boundInteractiveBodyText(text, maxLength = MAX_INTERACTIVE_BODY_CHARS) {
  const formatted = formatWhatsAppText(text);
  if (formatted.length <= maxLength) return formatted;
  return truncateCleanly(formatted, maxLength);
}

function formatWhatsAppPriceDetailsMessage({ service = {}, matchedOption = null } = {}) {
  const label = formatWhatsAppText(service.label || service.id || 'This service').replace(/\n/g, ' ').slice(0, 120);
  const serviceOptions = Array.isArray(service.options) ? service.options : [];
  if (matchedOption) {
    const optPrice = Number(matchedOption.price || 0);
    const optTitle = formatWhatsAppText(matchedOption.title || matchedOption.id || 'Selected option').replace(/\n/g, ' ').slice(0, 100);
    const optDesc = matchedOption.description ? `\n📝 ${truncateCleanly(formatWhatsAppText(matchedOption.description), 220)}` : '';
    return boundInteractiveBodyText(
      `💰 *${label} — ${optTitle}* starts at *R${optPrice.toFixed(2)} ZAR*.${optDesc}\n\nYour final quote depends on the service details. Reply with a question or tap below to book.`,
    );
  }
  const guidance = formatWhatsAppPriceGuidance(label, getConfiguredServicePriceRange(service));
  const optionsText = serviceOptions.length
    ? `\n\n🛠️ *Available options:*\n${serviceOptions.slice(0, 8).map((opt) => `• *${formatWhatsAppText(opt.title || opt.id).slice(0, 80)}:* R${Number(opt.price || 0).toFixed(2)}`).join('\n')}`
    : '';
  return boundInteractiveBodyText(
    `${guidance}${optionsText}\n\nReply with a question or tap *Book now* when you’re ready.`,
  );
}

function formatWhatsAppServiceDetailsMessage({ service = {}, selectedOption = null, questions = [] } = {}) {
  const label = formatWhatsAppText(service.label || service.id || 'Service').replace(/\n/g, ' ').slice(0, 120);
  const category = formatWhatsAppText(service.categoryName || service.categoryId || '').replace(/\n/g, ' ').slice(0, 60);
  const header = category ? `✨ *${label}* · ${category}` : `✨ *${label}*`;
  const rawDesc = formatWhatsAppText(service.description || '').replace(/\n+/g, ' ').trim();
  const descText = rawDesc ? `\n📝 ${truncateCleanly(rawDesc, 260)}` : '';

  const priceRange = getConfiguredServicePriceRange(service);
  const priceText = selectedOption && Number.isFinite(Number(selectedOption.price))
    ? `\n💰 *${formatWhatsAppText(selectedOption.title || selectedOption.id).slice(0, 60)} price:* R${Number(selectedOption.price).toFixed(2)} ZAR`
    : priceRange
      ? (priceRange.minimum === priceRange.maximum
        ? `\n💰 *Price estimate:* R${Number(priceRange.minimum).toFixed(2)} ZAR`
        : `\n💰 *Price estimate:* R${Number(priceRange.minimum).toFixed(2)} – R${Number(priceRange.maximum).toFixed(2)} ZAR`)
      : '\n💰 *Pricing:* Custom quote based on your service details';

  const serviceOptions = Array.isArray(service.options) ? service.options : [];
  const serviceOptionsText = serviceOptions.length
    ? `\n\n🛠️ *Available options:*\n${serviceOptions.slice(0, 8).map((opt) => {
      const title = formatWhatsAppText(opt.title || opt.id).slice(0, 60);
      const priceStr = Number.isFinite(Number(opt.price)) ? ` — R${Number(opt.price).toFixed(2)}` : '';
      return `• *${title}*${priceStr}`;
    }).join('\n')}`
    : '';

  const questionPrompts = (Array.isArray(questions) ? questions : [])
    .map((q) => formatWhatsAppText(q.prompt || q.label || q.id || '').replace(/\n/g, ' ').slice(0, 70))
    .filter(Boolean)
    .slice(0, 3);
  const questionsText = questionPrompts.length
    ? `\n\n📋 *Details we’ll ask when booking:*\n${questionPrompts.map((p) => `• ${p}`).join('\n')}`
    : '';

  const footer = '\n\n💬 Ask me any question about this service, or tap *Book now* when you’re ready.';
  const withQuestions = `${header}${descText}${priceText}${serviceOptionsText}${questionsText}${footer}`;
  if (withQuestions.length <= MAX_INTERACTIVE_BODY_CHARS) return formatWhatsAppText(withQuestions);
  const withoutQuestions = `${header}${descText}${priceText}${serviceOptionsText}${footer}`;
  if (withoutQuestions.length <= MAX_INTERACTIVE_BODY_CHARS) return formatWhatsAppText(withoutQuestions);
  return boundInteractiveBodyText(withoutQuestions);
}

module.exports = {
  DEFAULT_SERVICE_PLACEHOLDER_IMAGE,
  MAX_INTERACTIVE_BODY_CHARS,
  MAX_SERVICE_LIST_CHARS,
  MAX_SERVICE_LIST_ITEMS,
  MAX_WHATSAPP_CAROUSEL_IMAGE_BYTES,
  buildVerifiedWhatsAppServiceCarousel,
  buildWhatsAppServiceCarousel,
  collectServiceCarouselImageCandidates,
  formatWhatsAppPriceDetailsMessage,
  formatWhatsAppPriceGuidance,
  formatWhatsAppServiceDetailsMessage,
  formatWhatsAppServiceList,
  getConfiguredServicePriceRange,
  isPriceQuestion,
  isSupportedWhatsAppImageUrl,
  isValidWhatsAppImageContentType,
  resolveVerifiedWhatsAppImageMap,
  selectVerifiedWhatsAppCarouselImageUrl,
  selectWhatsAppCarouselImageUrl,
  verifyWhatsAppImageUrl,
};
