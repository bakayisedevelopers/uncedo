'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAdminServicePrompt,
  generateAdminServiceDraft,
  sanitizeAiServiceDraft,
} = require('./adminAiServiceAssistant');

test('buildAdminServicePrompt includes existing form draft, catalog context, and detailed option rules', () => {
  const prompt = buildAdminServicePrompt({
    mode: 'create',
    instructions: 'Create a manicure service with normal nails, press-ons, and natural nails.',
    currentDraft: {
      categoryId: 'beauty',
      label: 'Gel Manicure',
      active: true,
      options: [{ id: 'normal_nails', title: 'Normal nails', price: 150 }],
      questions: [],
    },
    catalogServices: [
      { id: 'beauty_braiding', label: 'Braiding', categoryId: 'beauty', type: 'service', options: [] },
    ],
  });

  assert.match(prompt, /multi-select/i);
  assert.match(prompt, /Colors \/ finishes/i);
  assert.match(prompt, /Number of people/i);
  assert.match(prompt, /adder/i);
  assert.match(prompt, /multiplier/i);
  assert.match(prompt, /Gel Manicure/);
  assert.match(prompt, /beauty_braiding/);
  assert.match(prompt, /normal_nails/);
});

test('sanitizeAiServiceDraft enforces edit serviceId lock, unified questions, option scoping, multi-select dependencies, and adder/multiplier pricing', () => {
  const sanitized = sanitizeAiServiceDraft({
    summary: 'Configured Manicure options, nail length multi-select dependency, color choices, and tiered pricing.',
    serviceId: 'renamed_id_attempt',
    categoryId: 'beauty',
    type: 'service',
    label: 'Gel Manicure',
    promptLabel: 'I need a gel manicure',
    description: 'At-home gel manicure for natural, press-on, and acrylic nails.',
    active: true,
    requiresPortfolioSelection: true,
    optionApplicationMode: 'per_option',
    includedServiceIds: ['beauty_braiding'],
    inheritBundleImages: true,
    pricing: {
      travelFee: 35,
      minimumTotal: 120,
      maximumTotal: 650,
    },
    options: [
      {
        id: 'normal',
        title: 'Normal Manicure',
        description: 'Classic gel overlay',
        price: 150,
        requiresNoOptionSpecificQuestions: false,
        selectedQuestionIds: ['timing_preference', 'nail_length'],
      },
      {
        id: 'natural',
        title: 'Natural Care',
        description: 'Cuticle care & buffing only',
        price: 100,
        requiresNoOptionSpecificQuestions: true,
        selectedQuestionIds: ['manicure_style'],
      },
    ],
    questions: [
      {
        id: 'timing_preference',
        prompt: 'Do you need this help now or later?',
        type: 'standard',
        answerType: 'enum',
        answerHint: '',
        dependsOnQuestionId: '',
        dependsOnOptionValues: [],
        options: [
          { value: 'now', label: 'Now', pricingType: 'adder', priceAdder: 0, factor: 1 },
          { value: 'later', label: 'Later', pricingType: 'adder', priceAdder: 0, factor: 1 },
        ],
      },
      {
        id: 'manicure_style',
        prompt: 'Which nail finish do you want?',
        type: 'option-specific',
        answerType: 'enum',
        answerHint: '',
        dependsOnQuestionId: '',
        dependsOnOptionValues: [],
        options: [
          { value: 'normal_nails', label: 'Normal nails', pricingType: 'adder', priceAdder: 0, factor: 1 },
          { value: 'press_ons', label: 'Press-ons', pricingType: 'adder', priceAdder: 30, factor: 1 },
          { value: 'natural_nails', label: 'Natural nails', pricingType: 'adder', priceAdder: 0, factor: 1 },
        ],
      },
      {
        id: 'nail_length',
        prompt: 'What nail length do you prefer?',
        type: 'option-specific',
        answerType: 'enum',
        answerHint: '',
        dependsOnQuestionId: 'manicure_style',
        dependsOnOptionValues: ['Normal nails', 'press_ons', 'nonexistent_option'],
        options: [
          { value: 'short', label: 'Short', pricingType: 'adder', priceAdder: 0, factor: 2 },
          { value: 'long', label: 'Long', pricingType: 'multiplier', priceAdder: 99, factor: 1.5 },
        ],
      },
      {
        id: 'cyclic_question',
        prompt: 'Cyclic check',
        type: 'standard',
        answerType: 'text',
        answerHint: 'Any notes',
        dependsOnQuestionId: 'cyclic_question',
        dependsOnOptionValues: ['yes'],
        options: [],
      },
    ],
  }, {
    mode: 'edit',
    currentDraft: { serviceId: 'beauty_nail_care', categoryId: 'beauty' },
    catalogServices: [{ id: 'beauty_braiding', type: 'service' }],
  });

  // Edit mode keeps existing serviceId
  assert.equal(sanitized.serviceId, 'beauty_nail_care');
  assert.deepEqual(sanitized.includedServiceIds, []);
  assert.equal(sanitized.active, true);
  assert.deepEqual(sanitized.optionalQuestions, []);
  assert.equal(sanitized.questions.length, 4);

  // Option 1: standard question 'timing_preference' and dependent question 'nail_length' stripped;
  // parent 'manicure_style' auto-included because 'nail_length' depends on it.
  assert.deepEqual(sanitized.options[0].selectedQuestionIds, ['manicure_style']);
  // Option 2: requiresNoOptionSpecificQuestions clears selectedQuestionIds
  assert.deepEqual(sanitized.options[1].selectedQuestionIds, []);

  // Multi-select dependency matched labels -> slugs & dropped nonexistent option; type set to 'dependent'
  const nailLength = sanitized.questions.find((q) => q.id === 'nail_length');
  assert.equal(nailLength.type, 'dependent');
  assert.deepEqual(nailLength.dependencyRule, {
    dependsOnQuestionId: 'manicure_style',
    dependsOnOptionValue: 'normal_nails',
    dependsOnOptionValues: ['normal_nails', 'press_ons'],
  });

  // Adder forces factor=1; multiplier forces priceAdder=0
  assert.equal(nailLength.options[0].pricingType, 'adder');
  assert.equal(nailLength.options[0].factor, 1);
  assert.equal(nailLength.options[1].pricingType, 'multiplier');
  assert.equal(nailLength.options[1].priceAdder, 0);
  assert.equal(nailLength.options[1].factor, 1.5);

  // Self-cycle removed cleanly
  const cyclic = sanitized.questions.find((q) => q.id === 'cyclic_question');
  assert.equal(cyclic.dependencyRule, null);
});

test('generateAdminServiceDraft invokes gemini-3.5-flash-lite via Vertex Gemini and populates Service Options + unified questions', async () => {
  let capturedRequest = null;
  const fakeClient = {
    models: {
      async generateContent(req) {
        capturedRequest = req;
        return {
          text: JSON.stringify({
            summary: 'Created Dishwashing draft with Service Options, event dependency, and people-count multipliers.',
            serviceId: 'cleaning_dishwashing',
            categoryId: 'cleaning',
            type: 'service',
            label: 'Dishwashing',
            promptLabel: 'I need help with dishwashing',
            description: 'Home and event dishwashing service.',
            active: true,
            requiresPortfolioSelection: false,
            optionApplicationMode: 'unified',
            includedServiceIds: [],
            inheritBundleImages: true,
            pricing: { travelFee: 35, minimumTotal: 90, maximumTotal: 600 },
            options: [
              {
                id: 'home_wash',
                title: 'Household Dishwashing',
                description: 'Daily kitchen dishes, pots, and surfaces',
                price: 90,
                requiresNoOptionSpecificQuestions: false,
                selectedQuestionIds: ['occasion_type', 'guest_count'],
              },
              {
                id: 'event_wash',
                title: 'Event & Catering Dishwashing',
                description: 'Post-event trays, cutlery, glassware, and pots',
                price: 220,
                requiresNoOptionSpecificQuestions: false,
                selectedQuestionIds: ['occasion_type', 'guest_count'],
              },
            ],
            questions: [
              {
                id: 'occasion_type',
                prompt: 'Is this for a household or an event?',
                type: 'option-specific',
                answerType: 'enum',
                answerHint: '',
                dependsOnQuestionId: '',
                dependsOnOptionValues: [],
                options: [
                  { value: 'home', label: 'Home', pricingType: 'adder', priceAdder: 0, factor: 1 },
                  { value: 'event', label: 'Event', pricingType: 'adder', priceAdder: 40, factor: 1 },
                ],
              },
              {
                id: 'guest_count',
                prompt: 'How many people are at the event?',
                type: 'option-specific',
                answerType: 'enum',
                answerHint: '',
                dependsOnQuestionId: 'occasion_type',
                dependsOnOptionValues: ['event'],
                options: [
                  { value: '1_to_30', label: '1 to 30 people', pricingType: 'multiplier', priceAdder: 0, factor: 1.5 },
                  { value: '31_to_80', label: '31 to 80 people', pricingType: 'multiplier', priceAdder: 0, factor: 2 },
                ],
              },
            ],
          }),
        };
      },
    },
  };

  const result = await generateAdminServiceDraft({
    mode: 'create',
    instructions: 'Make a dishwashing service with event dependency.',
    currentDraft: { categoryId: 'cleaning' },
    catalogServices: [],
    client: fakeClient,
  });

  assert.equal(capturedRequest.model, 'gemini-3.5-flash-lite');
  assert.equal(capturedRequest.config.responseMimeType, 'application/json');
  assert.equal(result.model, 'gemini-3.5-flash-lite');
  assert.equal(result.draft.serviceId, 'cleaning_dishwashing');
  assert.equal(result.draft.options.length, 2);
  assert.equal(result.draft.questions.length, 2);
  assert.equal(result.draft.questions[1].dependencyRule.dependsOnQuestionId, 'occasion_type');
  assert.deepEqual(result.draft.questions[1].dependencyRule.dependsOnOptionValues, ['event']);
});
