'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isQuestionApplicable,
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
  const flatBaselineSignals = { now: new Date('2026-04-14T08:00:00Z') };
  const backendQuote = quoteFromCatalogEntries({
    entries: carWashCatalog(),
    categoryId: 'car_wash',
    serviceIds: ['full_body_wash'],
    structuredAnswers: answers,
    signalContext: flatBaselineSignals,
  });
  const entry = carWashCatalog()[0];
  const appEquivalentEngine = createCategoryPricingEngine('car_wash', {
    getCategoryById: () => ({ label: 'Car Wash' }),
    getServiceById: (serviceId) => serviceId === entry.id ? entry : null,
  });
  const appEquivalentQuote = appEquivalentEngine({
    serviceIds: ['full_body_wash'],
    structuredAnswers: answers,
    signalContext: flatBaselineSignals,
  });

  assert.equal(backendQuote.total, appEquivalentQuote.total);
  assert.deepEqual(backendQuote.serviceBreakdown, appEquivalentQuote.serviceBreakdown);
  assert.equal(backendQuote.travelFee, 35);
  assert.equal(backendQuote.total, 320);
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
    signalContext: { now: new Date('2026-04-14T08:00:00Z') },
  });
  assert.equal(quote.travelFee, 35);
  assert.equal(quote.total, 320);
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

  const flatSignals = { now: new Date('2026-04-14T08:00:00Z') };
  const braidQuote = quoteFromCatalogEntries({
    entries: hairstylesCatalog,
    categoryId: 'grooming',
    serviceIds: ['hairstyles'],
    selectedOptionId: 'knotless_braids',
    structuredAnswers: { service_address_target: 'saved_home_address', braid_length: 'waist' },
    signalContext: flatSignals,
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
    signalContext: flatSignals,
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

test('question dependencies support chaining, prune stale child answers, and apply multipliers > 5 without multiplying travelFee', () => {
  const beautyCatalog = [{
    id: 'makeup_service',
    categoryId: 'beauty',
    categoryName: 'Beauty',
    label: 'Event Makeup',
    active: true,
    approved: true,
    optionApplicationMode: 'per_option',
    pricing: { bookingFee: 0, travelFee: 35 },
    options: [
      {
        id: 'soft_glam',
        title: 'Soft Glam',
        price: 200,
        selectedQuestionIds: ['wants_lashes', 'lash_style', 'lash_density', 'people_count'],
        requiresNoOptionSpecificQuestions: false,
      },
    ],
    questionnaire: {
      required: [
        {
          id: 'wants_lashes',
          type: 'option-specific',
          required: true,
          prompt: 'Do you want lashes?',
          answerType: 'enum',
          options: [
            { value: 'yes', label: 'Yes', priceAdder: 50 },
            { value: 'no', label: 'No', priceAdder: 0 },
          ],
        },
        {
          id: 'lash_style',
          type: 'option-specific',
          required: true,
          prompt: 'Which lash style?',
          answerType: 'enum',
          dependencyRule: { dependsOnQuestionId: 'wants_lashes', dependsOnOptionValue: 'yes' },
          options: [
            { value: 'mink', label: 'Mink', priceAdder: 30 },
            { value: 'classic', label: 'Classic', priceAdder: 0 },
          ],
        },
        {
          id: 'lash_density',
          type: 'option-specific',
          required: true,
          prompt: 'Extra lash volume?',
          answerType: 'enum',
          dependencyRule: { dependsOnQuestionId: 'lash_style', dependsOnOptionValue: 'mink' },
          options: [
            { value: 'mega', label: 'Mega', priceAdder: 20 },
          ],
        },
        {
          id: 'people_count',
          type: 'standard',
          required: true,
          prompt: 'How many people?',
          answerType: 'enum',
          options: [
            { value: '1', label: '1 person', pricingType: 'multiplier', factor: 1 },
            { value: '14', label: '14 people', pricingType: 'multiplier', factor: 14 },
          ],
        },
      ],
      optional: [],
    },
  }];

  const questions = beautyCatalog[0].questionnaire.required;
  const noValidation = normalizeAndValidateAnswers({
    answers: {
      wants_lashes: 'no',
      lash_style: 'mink',
      lash_density: 'mega',
      people_count: '1',
      travel_distance_km: 10,
    },
    questions,
  });
  assert.deepEqual(noValidation.missingRequired, []);
  assert.equal(noValidation.answers.lash_style, undefined);
  assert.equal(noValidation.answers.lash_density, undefined);
  assert.equal(noValidation.answers.travel_distance_km, 10);

  const yesIncomplete = normalizeAndValidateAnswers({
    answers: { wants_lashes: 'yes', people_count: '1' },
    questions,
  });
  assert.deepEqual(yesIncomplete.missingRequired, ['lash_style']);

  const fullQuote = quoteFromCatalogEntries({
    entries: beautyCatalog,
    categoryId: 'beauty',
    serviceIds: ['makeup_service'],
    selectedOptionId: 'soft_glam',
    structuredAnswers: {
      wants_lashes: 'yes',
      lash_style: 'mink',
      lash_density: 'mega',
      people_count: '14',
      travel_distance_km: 10,
    },
    signalContext: { now: new Date('2026-04-14T08:00:00Z') },
  });
  // Service subtotal: (200 base + 50 + 30 + 20) * 14 = 300 * 14 = 4200 (service saved travelFee 35 is used and NOT multiplied by 14 or distance)
  assert.equal(fullQuote.serviceBreakdown[0].subtotal, 4200);
  assert.equal(fullQuote.travelFee, 35);
  assert.equal(fullQuote.bookingFee, 5);
  assert.equal(Number.isInteger(fullQuote.bookingFee), true);
  assert.equal(fullQuote.total, 4235 + fullQuote.bookingFee);
});

test('service saved pricing.travelFee is used directly (falling back to 35 only when unset) and marketplace quote aligns', () => {
  const { computeMarketplaceQuote } = require('./serviceMarketplacePricing');
  const customTravelService = {
    id: 'deep_oven_clean',
    categoryId: 'cleaning',
    categoryName: 'Cleaning',
    label: 'Oven Cleaning',
    active: true,
    approved: true,
    pricing: { basePrice: 200, travelFee: 50 },
    questionnaire: { required: [], optional: [] },
  };
  const quote = quoteFromCatalogEntries({
    entries: [customTravelService],
    categoryId: 'cleaning',
    serviceIds: ['deep_oven_clean'],
    structuredAnswers: { travel_distance_km: 25 },
    signalContext: { now: new Date('2026-04-14T08:00:00Z') },
  });
  assert.equal(quote.subtotal, 200);
  assert.equal(quote.travelFee, 50);
  assert.equal(quote.bookingFee, 3);
  assert.equal(quote.total, 253);

  const marketplaceQuote = computeMarketplaceQuote({
    categoryId: 'cleaning',
    serviceIds: ['deep_oven_clean'],
    catalogEntries: [customTravelService],
    signalContext: {
      now: new Date('2026-11-18T09:00:00'),
      onlineHelpers: 4,
      activeRequests: 2,
    },
  });
  assert.equal(marketplaceQuote.travelFee, 50);
  assert.equal(marketplaceQuote.bookingFee, 3);
  assert.equal(marketplaceQuote.total, 253);
});

test('question dependency triggers when any selected dependsOnOptionValues matches and prunes otherwise', () => {
  const nailsCatalog = [{
    id: 'manicure_service',
    categoryId: 'beauty',
    categoryName: 'Beauty',
    label: 'Manicure',
    active: true,
    approved: true,
    options: [
      { id: 'standard_manicure', title: 'Standard Manicure', price: 150, selectedQuestionIds: ['nail_type', 'nail_length'] },
    ],
    questionnaire: {
      required: [
        {
          id: 'nail_type',
          type: 'option-specific',
          required: true,
          prompt: 'Which nail type?',
          answerType: 'enum',
          options: [
            { value: 'normal_nails', label: 'Normal nails', priceAdder: 0 },
            { value: 'press_ons', label: 'Press-ons', priceAdder: 40 },
            { value: 'natural_nails', label: 'Natural nails', priceAdder: 0 },
          ],
        },
        {
          id: 'nail_length',
          type: 'option-specific',
          required: true,
          prompt: 'Which nail length?',
          answerType: 'enum',
          dependencyRule: {
            dependsOnQuestionId: 'nail_type',
            dependsOnOptionValue: 'normal_nails',
            dependsOnOptionValues: ['normal_nails', 'press_ons'],
          },
          options: [
            { value: 'short', label: 'Short', priceAdder: 0 },
            { value: 'long', label: 'Long', priceAdder: 50 },
          ],
        },
      ],
      optional: [],
    },
  }];

  const questions = nailsCatalog[0].questionnaire.required;
  assert.equal(isQuestionApplicable(questions[1], { nail_type: 'normal_nails' }, questions), true);
  assert.equal(isQuestionApplicable(questions[1], { nail_type: 'press_ons' }, questions), true);
  assert.equal(isQuestionApplicable(questions[1], { nail_type: 'natural_nails' }, questions), false);

  const pressOnMissing = normalizeAndValidateAnswers({
    answers: { nail_type: 'press_ons' },
    questions,
  });
  assert.deepEqual(pressOnMissing.missingRequired, ['nail_length']);

  const naturalCleaned = normalizeAndValidateAnswers({
    answers: { nail_type: 'natural_nails', nail_length: 'long' },
    questions,
  });
  assert.deepEqual(naturalCleaned.missingRequired, []);
  assert.equal(naturalCleaned.answers.nail_length, undefined);

  const pressOnQuote = quoteFromCatalogEntries({
    entries: nailsCatalog,
    categoryId: 'beauty',
    serviceIds: ['manicure_service'],
    selectedOptionId: 'standard_manicure',
    structuredAnswers: { nail_type: 'press_ons', nail_length: 'long', travel_distance_km: 5 },
    signalContext: { now: new Date('2026-04-14T08:00:00Z') },
  });
  // Base 150 + Press-ons 40 + Long 50 = 240
  assert.equal(pressOnQuote.serviceBreakdown[0].subtotal, 240);
});

test('dependent questions automatically follow parent question option scope even without being listed in selectedQuestionIds', () => {
  const { getQuestionnaireForSelection } = require('./serviceRequestPricing');
  const dishCatalog = [{
    id: 'dishwashing_service',
    categoryId: 'cleaning',
    categoryName: 'Cleaning',
    label: 'Dishwashing',
    active: true,
    approved: true,
    options: [
      { id: 'event_wash', title: 'Event Wash', price: 200, selectedQuestionIds: ['is_event'], requiresNoOptionSpecificQuestions: false },
      { id: 'quick_wash', title: 'Quick Rinse', price: 80, selectedQuestionIds: [], requiresNoOptionSpecificQuestions: true },
    ],
    questionnaire: {
      required: [
        {
          id: 'is_event',
          type: 'option-specific',
          required: true,
          prompt: 'Is this dishwashing for an event?',
          answerType: 'enum',
          options: [
            { value: 'yes', label: 'Yes, event', priceAdder: 0 },
            { value: 'no', label: 'No, household', priceAdder: 0 },
          ],
        },
        {
          id: 'event_people_count',
          type: 'dependent',
          required: true,
          prompt: 'How many people for the event?',
          answerType: 'enum',
          dependencyRule: {
            dependsOnQuestionId: 'is_event',
            dependsOnOptionValue: 'yes',
            dependsOnOptionValues: ['yes'],
          },
          options: [
            { value: '20', label: '20 people', priceAdder: 100 },
          ],
        },
      ],
      optional: [],
    },
  }];

  const normalized = normalizeAndCatalog(dishCatalog);
  const eventQuestions = getQuestionnaireForSelection({
    services: normalized,
    selectedOptionId: 'event_wash',
  });
  assert.deepEqual(eventQuestions.map((q) => q.id), ['is_event', 'event_people_count']);

  const quickQuestions = getQuestionnaireForSelection({
    services: normalized,
    selectedOptionId: 'quick_wash',
  });
  assert.deepEqual(quickQuestions.map((q) => q.id), []);

  const quote = quoteFromCatalogEntries({
    entries: dishCatalog,
    categoryId: 'cleaning',
    serviceIds: ['dishwashing_service'],
    selectedOptionId: 'event_wash',
    structuredAnswers: { is_event: 'yes', event_people_count: '20' },
    signalContext: { now: new Date('2026-04-14T08:00:00Z') },
  });
  assert.equal(quote.serviceBreakdown[0].subtotal, 300);
});

test('quoteFromCatalogEntries populates immutable questionAnswers snapshot with resolved option labels and pricing effects', () => {
  const catalogEntries = [{
    id: 'window_cleaning',
    categoryId: 'cleaning',
    categoryName: 'Cleaning',
    label: 'Window Cleaning',
    active: true,
    approved: true,
    pricing: { basePrice: 180, travelFee: 35, bookingFee: 0 },
    questionnaire: {
      required: [
        {
          id: 'property_type',
          prompt: 'Property type',
          answerType: 'enum',
          required: true,
          options: [
            { value: 'house', label: 'Standalone House', priceAdder: 0 },
            { value: 'apartment', label: 'Apartment', priceAdder: 0 },
          ],
        },
        {
          id: 'window_tier',
          prompt: 'How many stories?',
          answerType: 'enum',
          required: true,
          options: [
            { value: 'single', label: 'Single story', priceAdder: 0 },
            { value: 'double', label: 'Double story', priceAdder: 90 },
          ],
        },
        {
          id: 'visit_count',
          prompt: 'How many visits?',
          answerType: 'enum',
          required: true,
          options: [
            { value: '1', label: '1 visit', pricingType: 'multiplier', factor: 1 },
            { value: '2', label: '2 visits', pricingType: 'multiplier', factor: 2 },
          ],
        },
      ],
      optional: [
        { id: 'notes', prompt: 'Extra instructions', answerType: 'text', required: false },
      ],
    },
  }];

  const quote = quoteFromCatalogEntries({
    entries: catalogEntries,
    categoryId: 'cleaning',
    serviceIds: ['window_cleaning'],
    structuredAnswers: {
      property_type: 'house',
      window_tier: 'double',
      visit_count: '2',
      notes: 'Use side gate',
    },
    signalContext: { now: new Date('2026-04-14T08:00:00Z') },
  });

  assert.equal(Array.isArray(quote.questionAnswers), true);
  assert.equal(quote.questionAnswers.length, 4);
  const byId = Object.fromEntries(quote.questionAnswers.map((qa) => [qa.questionId, qa]));
  assert.equal(byId.property_type.prompt, 'Property type');
  assert.equal(byId.property_type.answerLabel, 'Standalone House');
  assert.equal(byId.property_type.pricingEffect, 'included');
  assert.equal(byId.window_tier.answerLabel, 'Double story');
  assert.equal(byId.window_tier.pricingEffect, 'adder');
  assert.equal(byId.window_tier.amount, 90);
  assert.equal(byId.visit_count.answerLabel, '2 visits');
  assert.equal(byId.visit_count.pricingEffect, 'multiplier');
  assert.equal(byId.visit_count.multiplier, 2);
  assert.equal(byId.notes.answerLabel, 'Use side gate');
});

test('applies SAST day-of-week, time-of-day, and season price multipliers to service subtotals without scaling travelFee and reconciles quote lines', () => {
  const catalog = [{
    id: 'deep_sofa_clean',
    categoryId: 'cleaning',
    categoryName: 'Cleaning',
    label: 'Sofa Clean',
    active: true,
    approved: true,
    pricing: { basePrice: 200, travelFee: 35, bookingFee: 0 },
    questionnaire: { required: [], optional: [] },
  }];

  // Baseline: Tue 2026-04-14 10:00 SAST (weekday=1, morning=1, autumn=1 => 1.0)
  const baseline = quoteFromCatalogEntries({
    entries: catalog,
    categoryId: 'cleaning',
    serviceIds: ['deep_sofa_clean'],
    structuredAnswers: {},
    signalContext: { now: new Date('2026-04-14T08:00:00Z') },
  });
  assert.equal(baseline.subtotal, 200);
  assert.equal(baseline.travelFee, 35);
  assert.equal(baseline.schedulePricing.dayBucket, 'weekday');
  assert.equal(baseline.schedulePricing.timeBucket, 'morning');
  assert.equal(baseline.schedulePricing.seasonBucket, 'autumn');
  assert.equal(baseline.schedulePricing.combinedMultiplier, 1);

  // Festive Weekend Overnight: Sat 2026-12-19 23:00 SAST (weekend=1.08 * overnight=1.12 * festive=1.10)
  const peak = quoteFromCatalogEntries({
    entries: catalog,
    categoryId: 'cleaning',
    serviceIds: ['deep_sofa_clean'],
    structuredAnswers: {},
    signalContext: { now: new Date('2026-12-19T21:00:00Z') },
  });
  assert.equal(peak.schedulePricing.dayBucket, 'weekend');
  assert.equal(peak.schedulePricing.timeBucket, 'overnight');
  assert.equal(peak.schedulePricing.seasonBucket, 'festive');
  assert.equal(peak.subtotal, Math.round(200 * (1.08 * 1.12 * 1.1)));
  assert.equal(peak.travelFee, 35);
  const peakLineSum = peak.lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  assert.equal(peakLineSum, peak.total);

  // Winter Friday Evening: Fri 2026-07-17 19:00 SAST (friday=1.04 * evening=1.08 * winter=0.96)
  const winterFriEve = quoteFromCatalogEntries({
    entries: catalog,
    categoryId: 'cleaning',
    serviceIds: ['deep_sofa_clean'],
    structuredAnswers: {},
    signalContext: { now: new Date('2026-07-17T17:00:00Z') },
  });
  assert.equal(winterFriEve.schedulePricing.dayBucket, 'friday');
  assert.equal(winterFriEve.schedulePricing.timeBucket, 'evening');
  assert.equal(winterFriEve.schedulePricing.seasonBucket, 'winter');
  assert.equal(winterFriEve.subtotal, Math.round(200 * (1.04 * 1.08 * 0.96)));
  assert.equal(winterFriEve.travelFee, 35);
  assert.equal(winterFriEve.lines.reduce((sum, line) => sum + Number(line.amount || 0), 0), winterFriEve.total);

  // Custom catalog multipliers (plus 'later' scheduled_for_text honored without explicit signalContext)
  const customCatalog = [{
    ...catalog[0],
    pricing: {
      basePrice: 200,
      travelFee: 40,
      dayMultipliers: { friday: 1.15 },
      timeMultipliers: { afternoon: 1.1 },
      seasonMultipliers: { summer: 1.05 },
    },
  }];
  const scheduledSummerFriAfternoon = quoteFromCatalogEntries({
    entries: customCatalog,
    categoryId: 'cleaning',
    serviceIds: ['deep_sofa_clean'],
    structuredAnswers: {
      timing_preference: 'later',
      scheduled_for_text: '2026-02-06T14:00:00+02:00',
    },
  });
  assert.equal(scheduledSummerFriAfternoon.schedulePricing.dayBucket, 'friday');
  assert.equal(scheduledSummerFriAfternoon.schedulePricing.timeBucket, 'afternoon');
  assert.equal(scheduledSummerFriAfternoon.schedulePricing.seasonBucket, 'summer');
  assert.equal(scheduledSummerFriAfternoon.subtotal, Math.round(200 * (1.15 * 1.1 * 1.05)));
  assert.equal(scheduledSummerFriAfternoon.travelFee, 40);
  assert.equal(
    scheduledSummerFriAfternoon.lines.reduce((sum, line) => sum + Number(line.amount || 0), 0),
    scheduledSummerFriAfternoon.total,
  );
});

test('parseScheduledSastDate parses natural-language and timezone-less SAST strings deterministically and quotes propagate questionId on lines', () => {
  const { parseScheduledSastDate } = require('./shared/categoryPricingEngineFactory.cjs');
  // Reference: Tue 2026-04-14 10:00 SAST
  const refMs = Date.parse('2026-04-14T08:00:00Z');

  assert.equal(parseScheduledSastDate('tomorrow evening', refMs).toISOString(), new Date('2026-04-15T19:00:00+02:00').toISOString());
  assert.equal(parseScheduledSastDate('Saturday 2:30 pm', refMs).toISOString(), new Date('2026-04-18T14:30:00+02:00').toISOString());
  assert.equal(parseScheduledSastDate('2026-12-25 18:00', refMs).toISOString(), new Date('2026-12-25T18:00:00+02:00').toISOString());

  const quote = quoteFromCatalogEntries({
    entries: [{
      id: 'window_cleaning',
      categoryId: 'cleaning',
      categoryName: 'Cleaning',
      label: 'Window Cleaning',
      active: true,
      approved: true,
      pricing: { basePrice: 200, travelFee: 35, bookingFee: 0 },
      questionnaire: {
        required: [{
          id: 'storey_tier',
          prompt: 'How many stories?',
          answerType: 'enum',
          required: true,
          options: [
            { value: 'single', label: 'Single story', priceAdder: 0 },
            { value: 'double', label: 'Double story', priceAdder: 90 },
          ],
        }],
        optional: [],
      },
    }],
    categoryId: 'cleaning',
    serviceIds: ['window_cleaning'],
    structuredAnswers: {
      storey_tier: 'double',
      timing_preference: 'later',
      scheduled_for_text: 'tomorrow evening',
    },
    signalContext: { now: new Date(refMs) },
  });

  const taggedLine = quote.lines.find((l) => l.amount === 90);
  assert.equal(taggedLine.questionId, 'storey_tier');
  assert.equal(quote.schedulePricing.timeBucket, 'evening');
  assert.equal(quote.schedulePricing.dayBucket, 'weekday');
});



