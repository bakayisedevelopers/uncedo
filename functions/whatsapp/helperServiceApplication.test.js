'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  HELPER_ADD_BUTTONS,
  analyzeHelperServiceCatalog,
  buildHelperAddOptionMenu,
  buildHelperAddServiceMenu,
  buildHelperPhotoUploadPrompt,
  isHelperServiceApplicationActive,
  matchCatalogService,
  parseRequestedServiceOptions,
} = require('./helperServiceApplication');

const sampleCatalog = [
  {
    id: 'barber_grooming',
    label: 'Barber Grooming',
    categoryId: 'personal_care',
    categoryName: 'Personal Care',
    active: true,
    approved: true,
    optionApplicationMode: 'per_option',
    options: [
      { id: 'fade_cut', title: 'Fade Cut', price: 120, description: 'Clean skin fade' },
      { id: 'beard_trim', title: 'Beard Trim', price: 80, description: 'Lineup and trim' },
      { id: 'kids_cut', title: 'Kids Cut', price: 90, description: 'Cut for kids' },
    ],
  },
  {
    id: 'home_cleaning',
    label: 'Home Cleaning',
    categoryId: 'cleaning',
    categoryName: 'Cleaning',
    active: true,
    approved: true,
    optionApplicationMode: 'unified',
    options: [
      { id: 'standard_clean', title: 'Standard Clean', price: 250 },
      { id: 'deep_clean', title: 'Deep Clean', price: 450 },
    ],
  },
];

test('parseRequestedServiceOptions supports single, comma-separated, and "and"-separated option inputs', () => {
  const barber = sampleCatalog[0];
  const single = parseRequestedServiceOptions(barber, 'Fade Cut');
  assert.deepEqual(single.matchedOptions.map((o) => o.id), ['fade_cut']);
  assert.deepEqual(single.unmatchedTokens, []);

  const multi = parseRequestedServiceOptions(barber, 'Fade Cut, Beard Trim and Kids Cut');
  assert.deepEqual(multi.matchedOptions.map((o) => o.id), ['fade_cut', 'beard_trim', 'kids_cut']);
  assert.deepEqual(multi.unmatchedTokens, []);

  const partial = parseRequestedServiceOptions(barber, 'Fade Cut, Unknown Style');
  assert.deepEqual(partial.matchedOptions.map((o) => o.id), ['fade_cut']);
  assert.deepEqual(partial.unmatchedTokens, ['Unknown Style']);
});

test('analyzeHelperServiceCatalog filters out already approved/pending options and allows re-applying declined ones', () => {
  const offerings = [
    { serviceId: 'barber_grooming', optionId: 'fade_cut', status: 'approved', photos: [{ uri: 'https://img/1.jpg' }] },
    { serviceId: 'barber_grooming', optionId: 'beard_trim', status: 'declined', photos: [] },
    { serviceId: 'home_cleaning', optionId: '', status: 'pending', photos: [{ uri: 'https://img/2.jpg' }] },
  ];

  const analyses = analyzeHelperServiceCatalog(sampleCatalog, offerings);
  const barber = analyses.find((item) => item.id === 'barber_grooming');
  assert.equal(barber.canApplyMore, true);
  assert.deepEqual(barber.availableOptions.map((opt) => opt.id), ['beard_trim', 'kids_cut']);

  const cleaning = analyses.find((item) => item.id === 'home_cleaning');
  assert.equal(cleaning.isPerOption, false);
  assert.equal(cleaning.canApplyMore, false);

  const serviceMenu = buildHelperAddServiceMenu(analyses);
  assert.equal(serviceMenu.eligibleCount, 1);
  assert.equal(serviceMenu.interactive.action.sections[0].rows[0].id, `${HELPER_ADD_BUTTONS.PICK_SERVICE_PREFIX}barber_grooming`);

  const optionMenu = buildHelperAddOptionMenu(barber, { selectedOptionIds: ['beard_trim'] });
  assert.equal(optionMenu.selectedCount, 1);
  assert.equal(optionMenu.remainingCount, 1);
  assert.equal(optionMenu.interactive.action.sections[0].rows[0].id, HELPER_ADD_BUTTONS.SUBMIT_OPTIONS);
  assert.equal(optionMenu.interactive.action.sections[0].rows[1].id, `${HELPER_ADD_BUTTONS.PICK_OPTION_PREFIX}kids_cut`);
});

test('matchCatalogService and prompt builders enforce WhatsApp interactive limits', () => {
  const matched = matchCatalogService(sampleCatalog, { query: 'barber' });
  assert.equal(matched?.id, 'barber_grooming');

  const prompt = buildHelperPhotoUploadPrompt({
    serviceName: 'Barber Grooming',
    submittedLabels: ['Barber Grooming — Fade Cut'],
    photoUploadUrl: 'https://helpers.bakayise.com/service-photos',
    needsPhotos: true,
  });
  assert.match(prompt.text, /Barber Grooming — Fade Cut/);
  assert.ok(prompt.interactive.action.buttons.every((btn) => btn.reply.title.length <= 20));
  assert.equal(isHelperServiceApplicationActive({ stage: 'awaiting_photos', expiresAtMs: Date.now() + 60_000 }), true);
  assert.equal(isHelperServiceApplicationActive({ stage: 'completed', expiresAtMs: Date.now() + 60_000 }), false);
});

test('Car Wash multi-option menu deduplicates rows and preserves Submit selected action', () => {
  const carWashCatalog = [
    {
      id: 'car_wash',
      label: 'Car Wash',
      categoryId: 'car_wash',
      categoryName: 'Car Wash',
      active: true,
      approved: true,
      optionApplicationMode: 'per_option',
      options: [
        { id: '', title: 'Hatchback/Sedan', price: 80, description: 'Small car' },
        { id: 'suv_bakkie', title: 'SUV/Bakkie (4-8 seaters)', price: 100 },
        { id: 'taxi_minibus', title: 'Taxis/Mini-Bus (9-21 seaters)', price: 120 },
        { id: 'buses', title: 'Buses (22+ seaters)', price: 250 },
        { id: 'motorbike', title: 'Motorbike', price: 60 },
      ],
    },
  ];
  const [carWash] = analyzeHelperServiceCatalog(carWashCatalog, []);
  assert.equal(carWash.availableOptions.length, 5);
  assert.equal(carWash.availableOptions[0].id, 'Hatchback/Sedan');

  const menu = buildHelperAddOptionMenu(carWash, {
    selectedOptionIds: ['Hatchback/Sedan', 'suv_bakkie', 'taxi_minibus', 'buses'],
  });
  const rows = menu.interactive.action.sections[0].rows;
  assert.equal(rows[0].id, HELPER_ADD_BUTTONS.SUBMIT_OPTIONS);
  assert.equal(rows.length, 2);
  assert.ok(HELPER_ADD_BUTTONS.SUBMIT_OPTIONS.startsWith(HELPER_ADD_BUTTONS.PICK_OPTION_PREFIX));
  assert.notEqual(rows[1].id, HELPER_ADD_BUTTONS.SUBMIT_OPTIONS);
});
