'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeAndValidateAnswers,
  quoteFromCatalogEntries,
  quoteFromFirestore,
} = require('./serviceRequestPricing');
const { createCategoryPricingEngine } = require('./shared/categoryPricingEngineFactory.cjs');

const vehicleOptions = ['sedan', 'hatchback', 'suv', 'bakkie', 'van', 'minibus', 'other']
  .map((value) => ({ value, label: value }));

function carWashCatalog() {
  return [{
    id: 'full_body_wash',
    categoryId: 'car_wash',
    categoryName: 'Car Wash',
    label: 'Full body wash',
    active: true,
    approved: true,
    pricing: { basePrice: 190 },
    questionnaire: {
      required: [
        { id: 'vehicle_type', prompt: 'Vehicle type', answerType: 'enum', required: true, options: vehicleOptions },
        { id: 'service_address_target', prompt: 'Service address', answerType: 'enum', required: true, options: [{ value: 'saved_home_address', label: 'Home' }] },
        { id: 'full_body_wash_detailing_addons', prompt: 'Tyre detailing', answerType: 'enum', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
      ],
      optional: [],
    },
  }];
}

test('backend quote uses the same shared category pricing source and Firestore questionnaire ids', () => {
  const answers = {
    vehicle_type: 'suv',
    service_address_target: 'saved_home_address',
    full_body_wash_detailing_addons: 'yes',
  };
  const backendQuote = quoteFromCatalogEntries({
    entries: carWashCatalog(),
    categoryId: 'car_wash',
    serviceIds: ['full_body_wash'],
    structuredAnswers: answers,
  });
  const entry = carWashCatalog()[0];
  const appEquivalentEngine = createCategoryPricingEngine('car_wash', {
    getCategoryById: () => ({ label: 'Car Wash' }),
    getServiceById: (serviceId) => serviceId === entry.id ? entry : null,
  });
  const appEquivalentQuote = appEquivalentEngine({ serviceIds: ['full_body_wash'], structuredAnswers: answers });

  assert.equal(backendQuote.total, appEquivalentQuote.total);
  assert.deepEqual(backendQuote.serviceBreakdown, appEquivalentQuote.serviceBreakdown);
  assert.equal(backendQuote.total, 317.14);
  assert.match(backendQuote.questionnaireVersion, /^[a-f0-9]{64}$/);
});

test('Firestore questionnaire answer validation rejects missing and unsupported values', () => {
  const questions = [{
    id: 'vehicle_type',
    answerType: 'enum',
    required: true,
    options: vehicleOptions,
  }];
  assert.deepEqual(normalizeAndValidateAnswers({ answers: {}, questions }).missingRequired, ['vehicle_type']);
  assert.throws(() => normalizeAndValidateAnswers({
    answers: { vehicle_type: 'spaceship' }, questions,
  }), /Invalid option/);
  assert.throws(() => normalizeAndValidateAnswers({
    answers: { made_up_field: 'yes' }, questions,
  }), /Unknown service answer field/);
});

test('quote rejects inactive services and unsupported selections', () => {
  const entries = carWashCatalog().map((entry) => ({ ...entry, active: false }));
  assert.throws(() => quoteFromCatalogEntries({
    entries,
    categoryId: 'car_wash',
    serviceIds: ['full_body_wash'],
    structuredAnswers: { vehicle_type: 'suv' },
  }), /no longer available/);
});

test('Firestore package lookup keeps selected package metadata out of the priced child service list', async () => {
  const catalog = [
    ...carWashCatalog(),
    {
      id: 'wash_bundle',
      categoryId: 'car_wash',
      categoryName: 'Car Wash',
      label: 'Wash bundle',
      type: 'bundle',
      active: true,
      approved: true,
      includedServiceIds: ['full_body_wash'],
      pricing: { basePrice: 999 },
      questionnaire: { required: [], optional: [] },
    },
  ];
  const getEntry = (id) => catalog.find((entry) => entry.id === id);
  const db = {
    collection: () => ({ doc: (id) => ({
      id,
      get: async () => ({ exists: Boolean(getEntry(id)), data: () => getEntry(id) }),
    }) }),
    getAll: async (...refs) => refs.map((ref) => ({
      id: ref.id,
      exists: Boolean(getEntry(ref.id)),
      data: () => getEntry(ref.id),
    })),
  };
  const answers = {
    vehicle_type: 'suv',
    service_address_target: 'saved_home_address',
    full_body_wash_detailing_addons: 'yes',
  };
  const quote = await quoteFromFirestore({
    db,
    categoryId: 'car_wash',
    serviceIds: ['full_body_wash'],
    selectedPackageId: 'wash_bundle',
    structuredAnswers: answers,
  });
  assert.equal(quote.total, 317.14);
  assert.deepEqual(quote.serviceBreakdown.map((line) => line.serviceId), ['full_body_wash']);
});

test('optioned service derives base price from selected option and scopes standard vs option-specific questions', () => {
  const hairstylesCatalog = [{
    id: 'hairstyles',
    categoryId: 'grooming',
    categoryName: 'Grooming',
    label: 'Hairstyles',
    active: true,
    approved: true,
    optionApplicationMode: 'per_option',
    pricing: { bookingFee: 0, travelFee: 0 },
    options: [
      {
        id: 'knotless_braids',
        title: 'Knotless Braids',
        price: 350,
        selectedQuestionIds: ['braid_length'],
        requiresNoOptionSpecificQuestions: false,
      },
      {
        id: 'buzz_cut',
        title: 'Buzz Cut',
        price: 100,
        selectedQuestionIds: ['braid_length'],
        requiresNoOptionSpecificQuestions: true,
      },
    ],
    questionnaire: {
      required: [
        {
          id: 'service_address_target',
          type: 'standard',
          prompt: 'Where should the helper come?',
          answerType: 'enum',
          options: [{ value: 'saved_home_address', label: 'Saved home' }],
        },
        {
          id: 'braid_length',
          type: 'option-specific',
          prompt: 'Preferred braid length?',
          answerType: 'enum',
          options: [
            { value: 'shoulder', label: 'Shoulder', priceAdder: 0 },
            { value: 'waist', label: 'Waist', priceAdder: 120 },
          ],
        },
      ],
      optional: [],
    },
  }];

  const { getQuestionnaireForSelection } = require('./serviceRequestPricing');
  const braidQuestions = getQuestionnaireForSelection({
    services: normalizeAndCatalog(hairstylesCatalog),
    selectedPackageId: 'hairstyles',
    selectedOptionId: 'knotless_braids',
  });
  assert.deepEqual(braidQuestions.map((q) => q.id), ['service_address_target', 'braid_length']);

  const buzzQuestions = getQuestionnaireForSelection({
    services: normalizeAndCatalog(hairstylesCatalog),
    selectedPackageId: 'hairstyles',
    selectedOptionId: 'buzz_cut',
  });
  assert.deepEqual(buzzQuestions.map((q) => q.id), ['service_address_target']);

  const braidQuote = quoteFromCatalogEntries({
    entries: hairstylesCatalog,
    categoryId: 'grooming',
    serviceIds: ['hairstyles'],
    selectedOptionId: 'knotless_braids',
    structuredAnswers: { service_address_target: 'saved_home_address', braid_length: 'waist' },
  });
  assert.equal(braidQuote.selectedOptionId, 'knotless_braids');
  assert.equal(braidQuote.selectedOptionTitle, 'Knotless Braids');
  assert.equal(braidQuote.serviceBreakdown[0].subtotal, 470);
  assert.equal(braidQuote.total >= 470, true);

  const buzzQuote = quoteFromCatalogEntries({
    entries: hairstylesCatalog,
    categoryId: 'grooming',
    serviceIds: ['hairstyles'],
    selectedOptionId: 'buzz_cut',
    structuredAnswers: { service_address_target: 'saved_home_address' },
  });
  assert.equal(buzzQuote.selectedOptionId, 'buzz_cut');
  assert.equal(buzzQuote.serviceBreakdown[0].subtotal, 100);
  assert.equal(buzzQuote.total >= 100, true);

  assert.throws(() => quoteFromCatalogEntries({
    entries: hairstylesCatalog,
    categoryId: 'grooming',
    serviceIds: ['hairstyles'],
    structuredAnswers: { service_address_target: 'saved_home_address' },
  }), (err) => err?.code === 'missing-service-option');

  assert.throws(() => quoteFromCatalogEntries({
    entries: hairstylesCatalog,
    categoryId: 'grooming',
    serviceIds: ['hairstyles'],
    selectedOptionId: 'unknown_style',
    structuredAnswers: { service_address_target: 'saved_home_address' },
  }), (err) => err?.code === 'invalid-service-option');
});

function normalizeAndCatalog(entries) {
  const { normalizeServiceCatalogEntry } = require('./serviceMarketplacePricing');
  return entries.map((e) => normalizeServiceCatalogEntry(e));
}

