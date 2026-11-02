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

test('buildWhatsAppServiceCarousel generates valid interactive carousel cards with Book and Learn More buttons', () => {
  const { buildWhatsAppServiceCarousel } = require('./servicePresentation');
  const services = [
    { id: 'svc_barber', label: 'Barber Grooming', categoryName: 'Personal Care', description: 'Fresh haircut', images: [{ uri: 'https://example.com/barber.jpg' }] },
    { id: 'svc_clean', label: 'House Cleaning', categoryName: 'Home Care', description: 'Deep home cleaning' },
  ];
  const carousel = buildWhatsAppServiceCarousel(services);
  assert.equal(carousel.type, 'carousel');
  assert.equal(carousel.action.cards.length, 2);
  assert.equal(carousel.action.cards[0].header.image.link, 'https://example.com/barber.jpg');
  assert.equal(carousel.action.cards[0].action.buttons[0].quick_reply.title, 'Book');
  assert.equal(carousel.action.cards[0].action.buttons[0].quick_reply.id, 'wa_book_svc_svc_barber');
  assert.equal(carousel.action.cards[0].action.buttons[1].quick_reply.title, 'Learn more');
  assert.equal(carousel.action.cards[0].action.buttons[1].quick_reply.id, 'wa_learn_svc_svc_barber');

  // Service without image falls back to placeholder image
  assert.match(carousel.action.cards[1].header.image.link, /^https:\/\//);
});
