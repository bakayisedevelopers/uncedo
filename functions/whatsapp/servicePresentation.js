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
  const minimum = Number(pricing.minimumTotal);
  const maximum = Number(pricing.maximumTotal);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)
    || minimum <= 0 || maximum <= 0 || maximum < minimum) return null;
  const currency = String(pricing.currency || 'ZAR').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  return { currency, minimum, maximum };
}

function formatWhatsAppServiceList(services = [], { includePricing = false } = {}) {
  const available = (Array.isArray(services) ? services : [])
    .filter((service) => String(service?.label || '').trim());
  const items = available.slice(0, MAX_SERVICE_LIST_ITEMS);
  if (!items.length) return 'I could not find any currently published Uncedo services.';

  const lines = ['*Services available on Uncedo*', ''];
  let listed = 0;
  for (const service of items) {
    const label = formatWhatsAppText(service.label).replace(/\n/g, ' ').slice(0, 140);
    const category = formatWhatsAppText(service.categoryName || service.categoryId || '').replace(/\n/g, ' ').slice(0, 80);
    const range = includePricing ? getConfiguredServicePriceRange(service) : null;
    const rangeText = range ? ` · ${range.currency} ${range.minimum.toFixed(2)}–${range.currency} ${range.maximum.toFixed(2)}` : '';
    const line = `${listed + 1}. *${label}*${category ? ` — ${category}` : ''}${rangeText}`;
    if (lines.join('\n').length + line.length + 2 > MAX_SERVICE_LIST_CHARS) break;
    lines.push(line);
    listed += 1;
  }

  const remaining = Math.max(0, available.length - listed);
  lines.push('', remaining
    ? `I can show the remaining ${remaining} services by category. Which type of service are you looking for?`
    : 'Tell me which service you are interested in, and I’ll help you with the next step.');
  return lines.join('\n');
}

function formatWhatsAppPriceGuidance(serviceName, priceRange) {
  const name = formatWhatsAppText(serviceName || 'This service').replace(/\n/g, ' ').slice(0, 140);
  if (priceRange && Number.isFinite(Number(priceRange.minimum)) && Number.isFinite(Number(priceRange.maximum))) {
    const currency = String(priceRange.currency || 'ZAR').trim().toUpperCase();
    const minimum = Number(priceRange.minimum).toFixed(2);
    const maximum = Number(priceRange.maximum).toFixed(2);
    return `*${name}* is currently listed in the range of *${currency} ${minimum}–${currency} ${maximum}*. This is an indication; your final quote depends on the service details.`;
  }
  return `I don’t have a reliable price range for *${name}* in the current catalogue. The final amount depends on the service details, and I’d be happy to help collect them so Uncedo can prepare an accurate quote.`;
}

module.exports = {
  MAX_SERVICE_LIST_CHARS,
  MAX_SERVICE_LIST_ITEMS,
  isPriceQuestion,
  formatWhatsAppPriceGuidance,
  formatWhatsAppServiceList,
  getConfiguredServicePriceRange,
};
