'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatWhatsAppPriceGuidance,
  formatWhatsAppServiceList,
  getConfiguredServicePriceRange,
  isPriceQuestion,
} = require('./servicePresentation');

test('service discovery lists readable service names and categories without prices', () => {
  const message = formatWhatsAppServiceList([
    { label: 'Home Cleaning', categoryName: 'Home care', pricing: { basePrice: 850 } },
    { label: 'Garden Care', categoryName: 'Outdoor', pricing: { basePrice: 1200 } },
  ]);
  assert.match(message, /\*Services available on Uncedo\*/);
  assert.match(message, /1\. \*Home Cleaning\* — Home care/);
  assert.doesNotMatch(message, /850|1200|basePrice|price/i);
});

test('only explicit configured catalogue minimum and maximum values produce a price range', () => {
  assert.deepEqual(getConfiguredServicePriceRange({ pricing: {
    currency: 'ZAR', basePrice: 250, minimumTotal: 300, maximumTotal: 900,
  } }), { currency: 'ZAR', minimum: 300, maximum: 900 });
  assert.equal(getConfiguredServicePriceRange({ pricing: { currency: 'ZAR', basePrice: 250 } }), null);
  assert.equal(getConfiguredServicePriceRange({ pricing: { currency: 'ZAR', minimumTotal: 900, maximumTotal: 300 } }), null);
});

test('price guidance uses the verified range or states that a reliable range is unavailable', () => {
  const ranged = formatWhatsAppPriceGuidance('Home Cleaning', { currency: 'ZAR', minimum: 300, maximum: 900 });
  assert.match(ranged, /ZAR 300\.00–ZAR 900\.00/);
  assert.match(ranged, /final quote depends on the service details/);
  const unknown = formatWhatsAppPriceGuidance('Home Cleaning', null);
  assert.match(unknown, /don’t have a reliable price range/);
  assert.doesNotMatch(unknown, /R\d|ZAR \d/);
});

test('pricing is included only when the wording asks or implies a price question', () => {
  assert.equal(isPriceQuestion('What services do you offer?'), false);
  assert.equal(isPriceQuestion('Do you offer home cleaning?'), false);
  assert.equal(isPriceQuestion('How much does home cleaning cost?'), true);
  assert.equal(isPriceQuestion('What would I pay for a cleaning?'), true);
  assert.equal(isPriceQuestion('What are your rates?'), true);

  const services = [{
    label: 'Home Cleaning',
    pricing: { currency: 'ZAR', basePrice: 250, minimumTotal: 300, maximumTotal: 900 },
  }];
  const discovery = formatWhatsAppServiceList(services);
  const pricing = formatWhatsAppServiceList(services, { includePricing: isPriceQuestion('How much is home cleaning?') });
  assert.doesNotMatch(discovery, /300|900|250/);
  assert.match(pricing, /ZAR 300\.00–ZAR 900\.00/);
  assert.doesNotMatch(pricing, /250/);
});

test('buildWhatsAppServiceCarousel generates valid interactive carousel cards with type=button, Book/Learn more buttons, and safe HTTPS images', () => {
  const { buildWhatsAppServiceCarousel } = require('./servicePresentation');
  const services = [
    { id: 'svc_barber', label: 'Barber Grooming', categoryName: 'Personal Care', description: 'Fresh haircut with a very long description that exceeds the card character limit smoothly without breaking bold markers.', images: [{ uri: 'https://example.com/barber.jpg' }] },
    { id: 'svc_clean', label: 'House Cleaning', categoryName: 'Home Care', description: 'Deep home cleaning', images: [{ uri: 'https://example.com/photo.webp' }] },
  ];
  const carousel = buildWhatsAppServiceCarousel(services);
  assert.equal(carousel.type, 'carousel');
  assert.equal(carousel.action.cards.length, 2);
  assert.equal(carousel.action.cards[0].type, 'button');
  assert.equal(carousel.action.cards[1].type, 'button');
  assert.equal(carousel.action.cards[0].header.image.link, 'https://example.com/barber.jpg');
  assert.ok(carousel.action.cards[0].body.text.length <= 160);
  assert.equal(carousel.action.cards[0].action.buttons[0].quick_reply.title, 'Book');
  assert.equal(carousel.action.cards[0].action.buttons[0].quick_reply.id, 'wa_book_svc_svc_barber');
  assert.equal(carousel.action.cards[0].action.buttons[1].quick_reply.title, 'Learn more');
  assert.equal(carousel.action.cards[0].action.buttons[1].quick_reply.id, 'wa_learn_svc_svc_barber');

  // Unsupported .webp or missing image falls back to HTTPS PNG placeholder image
  assert.equal(carousel.action.cards[1].header.image.link, 'https://uncedo.bakayise.com/logo.png');
});

test('formatWhatsAppServiceDetailsMessage and formatWhatsAppPriceDetailsMessage stay within 1024-char button body limit with complete info', () => {
  const {
    MAX_INTERACTIVE_BODY_CHARS,
    formatWhatsAppPriceDetailsMessage,
    formatWhatsAppServiceDetailsMessage,
  } = require('./servicePresentation');
  const service = {
    id: 'hairstyle',
    label: 'Hairstyle',
    categoryName: 'Beauty',
    description: 'Professional home-visit hair styling for every occasion.',
    options: [
      { id: 'opt_1', title: 'Braids/Twist', price: 250 },
      { id: 'opt_2', title: 'Straight back', price: 150 },
    ],
  };
  const info = formatWhatsAppServiceDetailsMessage({
    service,
    questions: [{ id: 'length', prompt: 'What hair length do you prefer?' }],
  });
  assert.ok(info.length <= MAX_INTERACTIVE_BODY_CHARS);
  assert.match(info, /\*Hairstyle\*/);
  assert.match(info, /Professional home-visit hair styling/);
  assert.match(info, /R150\.00 – R250\.00/);
  assert.match(info, /\*Braids\/Twist\* — R250\.00/);
  assert.match(info, /What hair length do you prefer\?/);

  const priceDetails = formatWhatsAppPriceDetailsMessage({ service });
  assert.ok(priceDetails.length <= MAX_INTERACTIVE_BODY_CHARS);
  assert.match(priceDetails, /ZAR 150\.00–ZAR 250\.00/);
  assert.match(priceDetails, /\*Braids\/Twist:\* R250\.00/);
});

test('services with configured options derive price range from option prices when no explicit range exists', () => {
  const hairstyles = {
    label: 'Hairstyles',
    options: [
      { id: 'buzz_cut', title: 'Buzz Cut', price: 100 },
      { id: 'knotless_braids', title: 'Knotless Braids', price: 350 },
    ],
  };
  assert.deepEqual(getConfiguredServicePriceRange(hairstyles), {
    currency: 'ZAR',
    minimum: 100,
    maximum: 350,
  });
  const singleOption = {
    label: 'Basic Trim',
    options: [{ id: 'trim', title: 'Trim', price: 120 }],
  };
  const guidance = formatWhatsAppPriceGuidance('Basic Trim', getConfiguredServicePriceRange(singleOption));
  assert.match(guidance, /ZAR 120\.00/);
  assert.doesNotMatch(guidance, /ZAR 120\.00–ZAR 120\.00/);
});

test('buildVerifiedWhatsAppServiceCarousel skips 404/non-image/oversized URLs and falls back to working images or placeholder', async () => {
  const {
    DEFAULT_SERVICE_PLACEHOLDER_IMAGE,
    buildVerifiedWhatsAppServiceCarousel,
    verifyWhatsAppImageUrl,
  } = require('./servicePresentation');

  const fetchImpl = async (url, init = {}) => {
    if (url === 'https://example.com/404.jpg') {
      return { ok: false, status: 404, headers: new Headers({ 'content-type': 'application/json' }) };
    }
    if (url === 'https://example.com/json-masquerade.jpg') {
      return { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }) };
    }
    if (url === 'https://example.com/oversized.png') {
      return { ok: true, status: 200, headers: new Headers({ 'content-type': 'image/png', 'content-length': String(6 * 1024 * 1024) }) };
    }
    if (url === 'https://example.com/head-405.jpg') {
      if (init.method === 'HEAD') {
        return { ok: false, status: 405, headers: new Headers() };
      }
      return { ok: true, status: 200, headers: new Headers({ 'content-type': 'image/jpeg', 'content-length': '12000' }) };
    }
    if (url === 'https://example.com/valid-barber.jpg' || url === DEFAULT_SERVICE_PLACEHOLDER_IMAGE) {
      return { ok: true, status: 200, headers: new Headers({ 'content-type': 'image/png', 'content-length': '45000' }) };
    }
    return { ok: false, status: 404, headers: new Headers() };
  };

  const headFallback = await verifyWhatsAppImageUrl('https://example.com/head-405.jpg', { fetchImpl });
  assert.equal(headFallback.ok, true);
  assert.equal(headFallback.contentType, 'image/jpeg');

  const warnings = [];
  const carousel = await buildVerifiedWhatsAppServiceCarousel([
    {
      id: 'barber',
      label: 'Barber',
      categoryName: 'Barber',
      description: 'Haircuts',
      images: [
        { uri: 'https://example.com/404.jpg' },
        { uri: 'https://example.com/json-masquerade.jpg' },
        { uri: 'https://example.com/valid-barber.jpg' },
      ],
    },
    {
      id: 'cleaning',
      label: 'Cleaning',
      categoryName: 'Home',
      description: 'Home cleaning',
      images: [{ uri: 'https://example.com/oversized.png' }],
    },
    {
      id: 'beauty',
      label: 'Beauty',
      categoryName: 'Beauty',
      description: 'Beauty treatment',
      images: [{ uri: 'https://example.com/head-405.jpg' }],
    },
  ], {
    fetchImpl,
    logger: { warn: (msg, meta) => warnings.push({ msg, meta }) },
  });

  assert.equal(carousel.type, 'carousel');
  assert.equal(carousel.action.cards.length, 3);
  assert.equal(carousel.action.cards[0].header.image.link, 'https://example.com/valid-barber.jpg');
  assert.equal(carousel.action.cards[1].header.image.link, DEFAULT_SERVICE_PLACEHOLDER_IMAGE);
  assert.equal(carousel.action.cards[2].header.image.link, 'https://example.com/head-405.jpg');
  assert.ok(warnings.some((w) => w.msg === 'whatsapp_carousel_broken_image_skipped'));

  const nullWhenPlaceholderBroken = await buildVerifiedWhatsAppServiceCarousel([
    { id: 'barber', label: 'Barber', images: [{ uri: 'https://example.com/404.jpg' }] },
    { id: 'cleaning', label: 'Cleaning', images: [{ uri: 'https://example.com/404.jpg' }] },
  ], {
    fetchImpl: async () => ({ ok: false, status: 404, headers: new Headers() }),
  });
  assert.equal(nullWhenPlaceholderBroken, null);
});

