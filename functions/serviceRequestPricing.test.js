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
