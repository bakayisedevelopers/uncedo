'use strict';

const { createVertexGeminiClient, generateVertexGeminiContent, geminiResponseText } = require('./whatsapp/vertexGemini');

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const ALLOWED_CATEGORY_IDS = new Set([
  'cleaning',
  'laundry',
  'gardening',
  'beauty',
  'yard_maintenance',
  'barber',
  'care',
  'car_wash',
]);

const CATEGORY_LABELS = {
  cleaning: 'Cleaning',
  laundry: 'Laundry',
  gardening: 'Gardening',
  beauty: 'Beauty',
  yard_maintenance: 'Yard Maintenance',
  barber: 'Barber',
  care: 'Care',
  car_wash: 'Car Wash',
};

const QUESTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    id: {
      type: 'STRING',
      description: 'Unique lowercase snake_case identifier for this question (e.g. nail_color, guest_count).',
    },
    prompt: {
      type: 'STRING',
      description: 'Customer-facing question text.',
    },
    type: {
      type: 'STRING',
      description: 'Either "standard" (always asked for every booking), "option-specific" (non-dependent; linked in Service Options selectedQuestionIds), or "dependent" (when dependsOnQuestionId is set; automatically follows parent question and must NOT be listed in selectedQuestionIds).',
    },
    answerType: {
      type: 'STRING',
      description: 'Either "enum" (multiple-choice options) or "text" (free text input).',
    },
    answerHint: {
      type: 'STRING',
      description: 'Helpful placeholder hint when answerType is "text"; empty string for "enum".',
    },
    dependsOnQuestionId: {
      type: 'STRING',
      description: 'ID of an earlier question that triggers this follow-up question, or "" if always applicable.',
    },
    dependsOnOptionValues: {
      type: 'ARRAY',
      description: 'One or more parent option value slugs (or exact text answers) that trigger this question. Empty array if no dependency.',
      items: { type: 'STRING' },
    },
    options: {
      type: 'ARRAY',
      description: 'Detailed selectable choices when answerType is "enum" (e.g., specific colors, guest-count tiers, lengths, sizes, rooms). Empty array when answerType is "text".',
      items: {
        type: 'OBJECT',
        properties: {
          value: { type: 'STRING', description: 'Lowercase snake_case slug.' },
          label: { type: 'STRING', description: 'Clear customer-facing option label.' },
          pricingType: { type: 'STRING', description: '"adder" (fixed ZAR addition) or "multiplier" (multiplies labor cost only).' },
          priceAdder: { type: 'NUMBER', description: 'Fixed ZAR amount added when pricingType is "adder"; 0 when "multiplier".' },
          factor: { type: 'NUMBER', description: 'Labor multiplier > 0 when pricingType is "multiplier" (e.g. 1.5, 2); 1 when "adder".' },
        },
        required: ['value', 'label', 'pricingType', 'priceAdder', 'factor'],
      },
    },
  },
  required: [
    'id',
    'prompt',
    'type',
    'answerType',
    'answerHint',
    'dependsOnQuestionId',
    'dependsOnOptionValues',
    'options',
  ],
};

const AI_SERVICE_DRAFT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: {
      type: 'STRING',
      description: 'Concise summary of the generated or updated service details, service options, questions, dependencies, and pricing.',
    },
    serviceId: { type: 'STRING', description: 'Lowercase snake_case service ID.' },
    categoryId: { type: 'STRING', description: 'One of the allowed category IDs.' },
    type: { type: 'STRING', description: '"service" or "bundle".' },
    label: { type: 'STRING', description: 'Customer-facing service title.' },
    promptLabel: { type: 'STRING', description: 'Natural customer intent phrase (e.g. "I need a gel manicure").' },
    description: { type: 'STRING', description: 'Detailed 1-3 sentence customer-facing service description.' },
    active: { type: 'BOOLEAN', description: 'Whether the service should be published (usually true).' },
    requiresPortfolioSelection: { type: 'BOOLEAN', description: 'True for visual craft services (braids, nails, makeup, barber).' },
    optionApplicationMode: { type: 'STRING', description: '"per_option" or "unified".' },
    includedServiceIds: {
      type: 'ARRAY',
      description: 'Existing non-bundle service IDs if type is "bundle"; empty array if type is "service".',
      items: { type: 'STRING' },
    },
    inheritBundleImages: {
      type: 'BOOLEAN',
      description: 'True if bundle inherits images from included services.',
    },
    pricing: {
      type: 'OBJECT',
      properties: {
        travelFee: { type: 'NUMBER', description: 'ZAR travel fee (0..150, typically 35).' },
        minimumTotal: { type: 'NUMBER', description: 'Fallback minimum ZAR (0..1500).' },
        maximumTotal: { type: 'NUMBER', description: 'Fallback maximum ZAR (50..3000).' },
      },
      required: ['travelFee', 'minimumTotal', 'maximumTotal'],
    },
    options: {
      type: 'ARRAY',
      description: 'Concrete customer-selectable Service Options/Packages (e.g. tiers, styles, vehicle types, packages), each with its own ZAR base price and linked option-specific question IDs. For standard services, always provide 2-6 realistic options unless instructed otherwise.',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING', description: 'Lowercase snake_case option ID.' },
          title: { type: 'STRING', description: 'Option package/style title.' },
          description: { type: 'STRING', description: 'What this specific option includes.' },
          price: { type: 'NUMBER', description: 'Base ZAR price for this option.' },
          requiresNoOptionSpecificQuestions: { type: 'BOOLEAN', description: 'True only if selecting this option skips all option-specific questions.' },
          selectedQuestionIds: {
            type: 'ARRAY',
            description: 'IDs of "option-specific" questions from questions[] that apply to this option. Empty if requiresNoOptionSpecificQuestions is true.',
            items: { type: 'STRING' },
          },
        },
        required: [
          'id',
          'title',
          'description',
          'price',
          'requiresNoOptionSpecificQuestions',
          'selectedQuestionIds',
        ],
      },
    },
    questions: {
      type: 'ARRAY',
      description: 'Complete list of detailed intake questions (standard + option-specific) with concrete options like colors, people counts, lengths, sizes, and dependencies.',
      items: QUESTION_SCHEMA,
    },
  },
  required: [
    'summary',
    'serviceId',
    'categoryId',
    'type',
    'label',
    'promptLabel',
    'description',
    'active',
    'requiresPortfolioSelection',
    'optionApplicationMode',
    'includedServiceIds',
    'inheritBundleImages',
    'pricing',
    'options',
    'questions',
  ],
};

function slugify(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function cleanText(value = '', maxLength = 500) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength);
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function snapToStep(value, step = 5) {
  if (!step) return value;
  return Math.round(value / step) * step;
}

function compactCatalogServices(catalogServices = []) {
  return (Array.isArray(catalogServices) ? catalogServices : [])
    .slice(0, 60)
    .map((entry) => {
      const id = slugify(entry?.id || entry?.serviceId || '');
      if (!id) return null;
      const reqCount = Array.isArray(entry?.questionnaire?.required) ? entry.questionnaire.required.length : 0;
      const optCount = Array.isArray(entry?.questionnaire?.optional) ? entry.questionnaire.optional.length : 0;
      return {
        id,
        label: cleanText(entry?.label || id, 80),
        categoryId: slugify(entry?.categoryId || ''),
        type: entry?.type === 'bundle' ? 'bundle' : 'service',
        optionApplicationMode: entry?.optionApplicationMode === 'unified' ? 'unified' : 'per_option',
        options: (Array.isArray(entry?.options) ? entry.options : []).slice(0, 8).map((opt) => ({
          id: slugify(opt?.id || opt?.title || ''),
          title: cleanText(opt?.title || opt?.label || '', 60),
          price: Number(opt?.price || 0),
        })),
        questionCount: reqCount + optCount,
      };
    })
    .filter(Boolean);
}

function compactCurrentDraft(currentDraft = {}) {
  const cleanQuestion = (question = {}) => {
    const depQuestionId = cleanText(
      question?.dependencyRule?.dependsOnQuestionId || question?.dependsOnQuestionId || question?.dependsOn?.questionId || '',
      80,
    );
    const depValues = [
      ...(Array.isArray(question?.dependencyRule?.dependsOnOptionValues) ? question.dependencyRule.dependsOnOptionValues : []),
      ...(Array.isArray(question?.dependsOnOptionValues) ? question.dependsOnOptionValues : []),
      ...(Array.isArray(question?.dependsOn?.optionValues) ? question.dependsOn.optionValues : []),
      question?.dependencyRule?.dependsOnOptionValue || question?.dependsOn?.optionValue || '',
    ].map((item) => cleanText(item, 80)).filter(Boolean);

    return {
      id: slugify(question?.id || ''),
      prompt: cleanText(question?.prompt || question?.label || '', 220),
      type: depQuestionId
        ? 'dependent'
        : (String(question?.type || '').toLowerCase() === 'standard' ? 'standard' : 'option-specific'),
      answerType: String(question?.answerType || '').toLowerCase() === 'text' ? 'text' : 'enum',
      answerHint: cleanText(question?.answerHint || '', 120),
      dependsOnQuestionId: depQuestionId,
      dependsOnOptionValues: [...new Set(depValues)],
      options: (Array.isArray(question?.options) ? question.options : []).slice(0, 15).map((opt) => ({
        value: slugify(opt?.value || opt?.label || ''),
        label: cleanText(opt?.label || opt?.value || '', 80),
        pricingType: String(opt?.pricingType || '').toLowerCase() === 'multiplier' ? 'multiplier' : 'adder',
        priceAdder: Number(opt?.priceAdder || 0),
        factor: Number(opt?.factor ?? opt?.multiplier ?? 1),
      })),
    };
  };

  const combinedQuestions = [
    ...(Array.isArray(currentDraft?.questions) ? currentDraft.questions : []),
    ...(Array.isArray(currentDraft?.requiredQuestions) ? currentDraft.requiredQuestions : []),
    ...(Array.isArray(currentDraft?.optionalQuestions) ? currentDraft.optionalQuestions : []),
  ];

  return {
    serviceId: slugify(currentDraft?.serviceId || ''),
    type: currentDraft?.type === 'bundle' ? 'bundle' : 'service',
    label: cleanText(currentDraft?.label || '', 120),
    promptLabel: cleanText(currentDraft?.promptLabel || '', 160),
    description: cleanText(currentDraft?.description || '', 800),
    categoryId: slugify(currentDraft?.categoryId || ''),
    active: currentDraft?.active !== false,
    requiresPortfolioSelection: Boolean(currentDraft?.requiresPortfolioSelection),
    optionApplicationMode: currentDraft?.optionApplicationMode === 'unified' ? 'unified' : 'per_option',
    includedServiceIds: (Array.isArray(currentDraft?.includedServiceIds) ? currentDraft.includedServiceIds : [])
      .map((item) => slugify(item))
      .filter(Boolean)
      .slice(0, 15),
    inheritBundleImages: currentDraft?.inheritBundleImages !== false,
    pricing: {
      travelFee: Number(currentDraft?.pricing?.travelFee ?? 35),
      minimumTotal: Number(currentDraft?.pricing?.minimumTotal ?? 80),
      maximumTotal: Number(currentDraft?.pricing?.maximumTotal ?? 500),
    },
    options: (Array.isArray(currentDraft?.options) ? currentDraft.options : []).slice(0, 15).map((opt, idx) => ({
      id: slugify(opt?.id || opt?.title || `option_${idx + 1}`),
      title: cleanText(opt?.title || '', 100),
      description: cleanText(opt?.description || '', 260),
      price: Number(opt?.price || 0),
      requiresNoOptionSpecificQuestions: Boolean(opt?.requiresNoOptionSpecificQuestions),
      selectedQuestionIds: (Array.isArray(opt?.selectedQuestionIds) ? opt.selectedQuestionIds : [])
        .map((id) => cleanText(id, 80))
        .filter(Boolean),
    })),
    questions: combinedQuestions.slice(0, 30).map(cleanQuestion),
  };
}

function buildAdminServicePrompt({
  mode = 'create',
  instructions = '',
  currentDraft = {},
  catalogServices = [],
} = {}) {
  const normalizedMode = mode === 'edit' ? 'edit' : 'create';
  const compactedDraft = compactCurrentDraft(currentDraft);
  const compactedCatalog = compactCatalogServices(catalogServices);

  return [
    'You are the Uncedo Admin Service Catalog Architect.',
    'Generate or refine a COMPLETE, DETAILED, PRODUCTION-READY service configuration in South African Rand (ZAR) covering EVERY editable section in the Uncedo Admin Service Details form.',
    'Do NOT give vague, high-level placeholders. Be thorough and concrete: provide specific service options/packages, specific detailed questions, and rich domain-appropriate answer choices (such as specific colors/finishes, number-of-people bands, sizes, lengths, room counts, vehicle categories, equipment options, durations, etc.) with realistic ZAR adders and labor-only multipliers.',
    'Everything in currentDraft is what the admin has filled in so far. Read it carefully as context: preserve intentional admin choices and enrich/expand/fix all missing or incomplete parts (service details, pricing, service options, questions, sub-options, and dependencies).',
    '',
    'CRITICAL ARCHITECTURAL RULES:',
    '1. CATEGORIES, ID & SERVICE TYPE:',
    `   - categoryId MUST be one of: ${[...ALLOWED_CATEGORY_IDS].join(', ')}.`,
    '   - serviceId MUST be lowercase snake_case (e.g., "gel_manicure", "executive_car_wash", "event_dishwashing").',
    normalizedMode === 'edit'
      ? `   - Mode is EDIT: KEEP serviceId strictly as "${compactedDraft.serviceId}". Never rename serviceId.`
      : '   - Mode is CREATE: choose a clean, descriptive snake_case serviceId that does not collide with any id in existingCatalogContext.',
    '   - type must be "service" or "bundle". If "bundle", populate includedServiceIds from valid non-bundle IDs in existingCatalogContext and set inheritBundleImages appropriately; otherwise includedServiceIds must be [].',
    '',
    '2. ALL SERVICE DETAILS & SETTINGS:',
    '   - label: clear service title.',
    '   - promptLabel: customer request phrase (e.g., "I need a gel manicure").',
    '   - description: helpful 1-3 sentence description covering scope and what helpers provide.',
    '   - active: boolean (usually true so the service is ready to publish once reviewed).',
    '   - requiresPortfolioSelection: true for visual craft services (braiding, nails, makeup, lashes, barbering, etc.), false otherwise.',
    '   - optionApplicationMode: "per_option" when helpers upload proof & qualify per option (beauty styles, barber cuts, specialized tiers); "unified" when one application covers all options (cleaning, dishwashing, laundry, yard_maintenance, car_wash).',
    '   - pricing: basePrice lives on each Service Option; set travelFee (integer 0..150, usually 35), minimumTotal (0..1500), and maximumTotal (50..3000) consistent with option prices + adders/multipliers.',
    '',
    '3. SERVICE OPTIONS (`options[]`) — MANDATORY FOR SERVICES:',
    '   - Service Options are the top-level packages/variants/tiers a customer picks FIRST when booking this service (and that helpers apply to offer). NEVER leave `options[]` empty on a service!',
    '   - For example:',
    '     * Manicure: "Normal Gel Nails" (R160), "Press-On Nails" (R200), "Natural Nail Care" (R110).',
    '     * Dishwashing: "Home Kitchen Wash" (R90), "Event & Function Wash" (R220), "Deep Pots & Oven Tray Clean" (R150).',
    '     * Car Wash: "Exterior Body Wash" (R100), "Full Inside & Outside Wash" (R180), "Full Valet & Seat Detailing" (R320).',
    '   - For EACH Service Option in `options[]`, provide:',
    '     * id (lowercase snake_case), title, description, price (ZAR, multiple of 5), requiresNoOptionSpecificQuestions (boolean), selectedQuestionIds (string[]).',
    '     * If a simple/basic option needs only standard questions (like timing & address), set requiresNoOptionSpecificQuestions: true and selectedQuestionIds: [].',
    '     * Otherwise set requiresNoOptionSpecificQuestions: false and put the exact IDs of ALL relevant non-dependent `option-specific` questions into selectedQuestionIds (NEVER put `standard` or `dependent` question IDs in selectedQuestionIds!).',
    '',
    '4. DETAILED QUESTIONS (`questions[]`) — NO OPTIONAL SECTION:',
    '   - All questions go into `questions[]` (there is only ONE unified questions list in the UI now).',
    '   - Include BOTH:',
    '     * "standard" questions: asked on EVERY booking regardless of Service Option (e.g. timing_preference "Do you need this help now or later?", service_address_target "Where should the helper come?", or universal household/event context).',
    '     * "option-specific" questions (no dependency): linked via Service Option selectedQuestionIds for details specific to chosen packages.',
    '     * "dependent" questions (has dependsOnQuestionId): MUST NOT be added to selectedQuestionIds — they automatically inherit their parent question\'s Service Option scope once their parent answer matches.',
    '   - Be GRANULAR AND CONCRETE inside each question\'s `options[]`! Examples of concrete details AI should add when relevant:',
    '     * Colors / finishes (e.g., Nude, French Tip, Gloss Black, Ruby Red, Pastel Pink, Chrome / Glitter, Natural Clear).',
    '     * Number of people / guest tiers (e.g., "1–10 people", "11–30 people", "31–60 people", "61–100 people", "100+ people").',
    '     * Quantities / sizes / lengths / counts (e.g., Short, Medium, Long, XL; 1–2 rooms, 3–4 rooms, 5+ rooms; Hatchback/Sedan, SUV/Bakkie, Minibus; 2 hours, 4 hours, Full day).',
    '     * Add-on extras, supplies/equipment source, condition buildup, or free-text follow-ups (`answerType: "text"` with helpful `answerHint`).',
    '   - Keep enum option lists between 2 and 10 options so WhatsApp menus and carousels stay within limits.',
    '   - PRICING ON QUESTION OPTIONS:',
    '     * "adder": adds fixed ZAR (`priceAdder >= 0`, `factor: 1`) for flat extras (e.g. +R30 French tip, +R35 helper brings supplies, +R50 deep stain treatment).',
    '     * "multiplier": multiplies ONLY the labor cost (never multiplies travelFee!) by `factor > 0` (`priceAdder: 0`), ideal for scale/people/duration/intensity (e.g., ×1.5 for 31–60 people, ×2 for 61–100 people or extra heavy condition, ×3 for 100+ people).',
    '   - Standard schedule follow-up pattern: when timing_preference ("Now", "Later") exists, add `scheduled_for_text` (`answerType: "text"`, `type: "dependent"`, `dependsOnQuestionId: "timing_preference"`, `dependsOnOptionValues: ["later"]`).',
    '',
    '5. MULTI-SELECT QUESTION DEPENDENCIES:',
    '   - Use `dependsOnQuestionId` + `dependsOnOptionValues` whenever a follow-up question only makes sense after specific answer(s) on an earlier question.',
    '   - Multiple triggers in `dependsOnOptionValues` work as OR (e.g. `dependsOnOptionValues: ["normal_nails", "press_ons"]` shows Nail Length & Nail Color for both Normal nails and Press-ons, but skips them for Natural nails; or `dependsOnOptionValues: ["event", "corporate_function"]` shows Guest Count!).',
    '   - Dependent questions MUST have `type: "dependent"` and CANNOT be assigned as option-specific questions in `selectedQuestionIds`. Once their parent question is selected for an option (or is standard), all dependent follow-ups become available automatically when triggered.',
    '   - Never create self-dependencies or cycles.',
    '',
    '6. OUTPUT:',
    '   - Return valid JSON matching the schema. Write a clear summary listing what was added/updated across service details, service options, questions, pricing, and dependencies.',
    '',
    JSON.stringify({
      mode: normalizedMode,
      adminInstructions: cleanText(instructions, 2000),
      availableCategories: Object.entries(CATEGORY_LABELS).map(([id, name]) => ({ id, name })),
      currentDraft: compactedDraft,
      existingCatalogContext: compactedCatalog,
    }),
  ].join('\n');
}

function wouldCreateCycle(questionId, candidateParentId, questionById) {
  const startId = String(questionId || '').trim();
  let currentId = String(candidateParentId || '').trim();
  if (!startId || !currentId) return false;
  if (startId === currentId) return true;
  const seen = new Set([startId]);
  while (currentId) {
    if (seen.has(currentId)) return true;
    seen.add(currentId);
    const parent = questionById.get(currentId);
    currentId = String(parent?.dependsOnQuestionId || '').trim();
  }
  return false;
}

function sanitizeQuestion(rawQuestion = {}, index = 0, usedIds = new Set()) {
  const prompt = cleanText(rawQuestion?.prompt || rawQuestion?.label || '', 240);
  if (!prompt) return null;

  const baseId = slugify(rawQuestion?.id || prompt || `question_${index + 1}`) || `question_${index + 1}`;
  let id = baseId;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${baseId}_${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);

  const type = String(rawQuestion?.type || '').trim().toLowerCase() === 'standard'
    ? 'standard'
    : 'option-specific';
  const rawAnswerType = String(rawQuestion?.answerType || '').trim().toLowerCase();
  const rawOptions = Array.isArray(rawQuestion?.options) ? rawQuestion.options : [];
  const answerType = rawAnswerType === 'text' || (rawAnswerType !== 'enum' && rawOptions.length === 0)
    ? 'text'
    : 'enum';

  const seenOptionValues = new Set();
  const options = answerType === 'enum'
    ? rawOptions
      .map((opt, optIdx) => {
        const label = cleanText(
          typeof opt === 'string' ? opt : (opt?.label || opt?.value || ''),
          80,
        );
        if (!label) return null;
        let value = slugify(
          typeof opt === 'string' ? opt : (opt?.value || label || `option_${optIdx + 1}`),
        ) || `option_${optIdx + 1}`;
        while (seenOptionValues.has(value)) {
          value = `${value}_${optIdx + 1}`;
        }
        seenOptionValues.add(value);

        const rawPricingType = String(opt?.pricingType || '').trim().toLowerCase();
        const rawFactor = Number(opt?.factor ?? opt?.multiplier ?? 1);
        const pricingType = rawPricingType === 'multiplier' || (rawPricingType !== 'adder' && Number.isFinite(rawFactor) && rawFactor !== 1)
          ? 'multiplier'
          : 'adder';

        if (pricingType === 'multiplier') {
          const safeFactor = Number(clampNumber(rawFactor, 0.01, 1000, 1).toFixed(2));
          return {
            value,
            label,
            pricingType: 'multiplier',
            priceAdder: 0,
            materialAdder: 0,
            factor: safeFactor,
            multiplier: safeFactor,
          };
        }

        const safeAdder = Math.round(clampNumber(opt?.priceAdder ?? opt?.price ?? 0, 0, 5000, 0));
        return {
          value,
          label,
          pricingType: 'adder',
          priceAdder: safeAdder,
          materialAdder: 0,
          factor: 1,
          multiplier: 1,
        };
      })
      .filter(Boolean)
      .slice(0, 15)
    : [];

  const finalAnswerType = answerType === 'enum' && options.length === 0 ? 'text' : answerType;

  const rawDepQuestionId = slugify(
    rawQuestion?.dependsOnQuestionId
    || rawQuestion?.dependencyRule?.dependsOnQuestionId
    || rawQuestion?.dependsOn?.questionId
    || '',
  );
  const rawDepValues = [
    ...(Array.isArray(rawQuestion?.dependsOnOptionValues) ? rawQuestion.dependsOnOptionValues : []),
    ...(Array.isArray(rawQuestion?.dependencyRule?.dependsOnOptionValues) ? rawQuestion.dependencyRule.dependsOnOptionValues : []),
    ...(Array.isArray(rawQuestion?.dependsOn?.optionValues) ? rawQuestion.dependsOn.optionValues : []),
    rawQuestion?.dependencyRule?.dependsOnOptionValue || rawQuestion?.dependsOn?.optionValue || '',
  ]
    .map((val) => cleanText(val, 80))
    .filter(Boolean);

  return {
    id,
    prompt,
    type,
    answerType: finalAnswerType,
    answerHint: finalAnswerType === 'text' ? cleanText(rawQuestion?.answerHint || '', 160) : '',
    required: true,
    dependsOnQuestionId: rawDepQuestionId,
    dependsOnOptionValues: rawDepValues,
    options,
  };
}

function resolveDependencies(allQuestions = []) {
  const byId = new Map(allQuestions.map((q) => [q.id, q]));

  allQuestions.forEach((question) => {
    const depId = question.dependsOnQuestionId;
    if (!depId || !byId.has(depId) || wouldCreateCycle(question.id, depId, byId)) {
      question.dependencyRule = null;
      delete question.dependsOnQuestionId;
      delete question.dependsOnOptionValues;
      return;
    }

    const parent = byId.get(depId);
    const rawTriggers = Array.isArray(question.dependsOnOptionValues) ? question.dependsOnOptionValues : [];
    const resolvedTriggers = [];

    if (parent.answerType === 'enum' && Array.isArray(parent.options) && parent.options.length > 0) {
      const seen = new Set();
      rawTriggers.forEach((trigger) => {
        const triggerLower = String(trigger || '').trim().toLowerCase();
        const triggerSlug = slugify(trigger);
        const match = parent.options.find((opt) => (
          opt.value.toLowerCase() === triggerLower
          || opt.value.toLowerCase() === triggerSlug
          || opt.label.toLowerCase() === triggerLower
        ));
        if (match && !seen.has(match.value)) {
          seen.add(match.value);
          resolvedTriggers.push(match.value);
        }
      });
    } else {
      const seen = new Set();
      rawTriggers.forEach((trigger) => {
        const clean = cleanText(trigger, 80);
        const key = clean.toLowerCase();
        if (!clean || seen.has(key)) return;
        seen.add(key);
        resolvedTriggers.push(clean);
      });
    }

    if (resolvedTriggers.length === 0) {
      question.dependencyRule = null;
      if (question.type === 'dependent') {
        question.type = 'option-specific';
      }
    } else {
      question.dependencyRule = {
        dependsOnQuestionId: parent.id,
        dependsOnOptionValue: resolvedTriggers[0],
        dependsOnOptionValues: resolvedTriggers,
      };
      question.type = 'dependent';
    }

    delete question.dependsOnQuestionId;
    delete question.dependsOnOptionValues;
  });

  allQuestions.forEach((question) => {
    if (!question.dependencyRule?.dependsOnQuestionId && question.type !== 'standard') {
      question.type = 'option-specific';
    }
  });

  return allQuestions;
}

function sanitizeAiServiceDraft(rawDraft = {}, {
  mode = 'create',
  currentDraft = {},
  catalogServices = [],
} = {}) {
  if (!rawDraft || typeof rawDraft !== 'object' || Array.isArray(rawDraft)) {
    throw new Error('AI returned an invalid service draft format.');
  }

  const normalizedMode = mode === 'edit' ? 'edit' : 'create';
  const fallbackCategoryId = ALLOWED_CATEGORY_IDS.has(slugify(currentDraft?.categoryId))
    ? slugify(currentDraft.categoryId)
    : 'cleaning';
  const candidateCategoryId = slugify(rawDraft.categoryId || '');
  const categoryId = ALLOWED_CATEGORY_IDS.has(candidateCategoryId) ? candidateCategoryId : fallbackCategoryId;

  const label = cleanText(rawDraft.label || currentDraft?.label || '', 120) || 'New service';
  const serviceId = normalizedMode === 'edit' && slugify(currentDraft?.serviceId)
    ? slugify(currentDraft.serviceId)
    : (slugify(rawDraft.serviceId || currentDraft?.serviceId || label) || 'new_service');

  const promptLabel = cleanText(rawDraft.promptLabel || currentDraft?.promptLabel || `I need ${label.toLowerCase()}`, 160);
  const description = cleanText(rawDraft.description || currentDraft?.description || '', 900);
  const type = String(rawDraft.type || currentDraft?.type || 'service').trim().toLowerCase() === 'bundle'
    ? 'bundle'
    : 'service';
  const active = typeof rawDraft.active === 'boolean'
    ? rawDraft.active
    : (currentDraft?.active !== false);
  const optionApplicationMode = String(rawDraft.optionApplicationMode || currentDraft?.optionApplicationMode || 'per_option')
    .trim()
    .toLowerCase() === 'unified'
    ? 'unified'
    : 'per_option';
  const requiresPortfolioSelection = typeof rawDraft.requiresPortfolioSelection === 'boolean'
    ? rawDraft.requiresPortfolioSelection
    : Boolean(currentDraft?.requiresPortfolioSelection);
  const inheritBundleImages = typeof rawDraft.inheritBundleImages === 'boolean'
    ? rawDraft.inheritBundleImages
    : (currentDraft?.inheritBundleImages !== false);

  const nonBundleCatalogIds = new Set(
    (Array.isArray(catalogServices) ? catalogServices : [])
      .filter((entry) => entry?.type !== 'bundle' && slugify(entry?.id || entry?.serviceId) !== serviceId)
      .map((entry) => slugify(entry?.id || entry?.serviceId))
      .filter(Boolean),
  );
  const includedServiceIds = type === 'bundle'
    ? [...new Set(
      (Array.isArray(rawDraft.includedServiceIds) ? rawDraft.includedServiceIds : [])
        .map((id) => slugify(id))
        .filter((id) => id && nonBundleCatalogIds.has(id)),
    )]
    : [];

  const travelFee = snapToStep(clampNumber(rawDraft.pricing?.travelFee, 0, 150, 35), 5);
  const minimumTotal = snapToStep(clampNumber(rawDraft.pricing?.minimumTotal, 0, 1500, 80), 5);
  const maximumTotal = Math.max(
    Math.max(50, minimumTotal),
    snapToStep(clampNumber(rawDraft.pricing?.maximumTotal, 50, 3000, 500), 5),
  );

  const usedQuestionIds = new Set();
  const rawCombinedQuestions = [
    ...(Array.isArray(rawDraft.questions) ? rawDraft.questions : []),
    ...(Array.isArray(rawDraft.requiredQuestions) ? rawDraft.requiredQuestions : []),
    ...(Array.isArray(rawDraft.optionalQuestions) ? rawDraft.optionalQuestions : []),
  ];
  const questions = rawCombinedQuestions
    .slice(0, 35)
    .map((q, idx) => sanitizeQuestion(q, idx, usedQuestionIds))
    .filter(Boolean);

  resolveDependencies(questions);

  const questionById = new Map(questions.map((q) => [q.id, q]));
  const optionSpecificQuestionIds = new Set(
    questions
      .filter((q) => q.type !== 'standard' && !q.dependencyRule?.dependsOnQuestionId)
      .map((q) => q.id),
  );

  const usedOptionIds = new Set();
  let options = (Array.isArray(rawDraft.options) ? rawDraft.options : [])
    .slice(0, 15)
    .map((opt, idx) => {
      const title = cleanText(opt?.title || opt?.label || '', 100);
      if (!title) return null;
      let id = slugify(opt?.id || title || `option_${idx + 1}`) || `option_${idx + 1}`;
      let suffix = 2;
      while (usedOptionIds.has(id)) {
        id = `${id}_${suffix}`;
        suffix += 1;
      }
      usedOptionIds.add(id);

      const price = snapToStep(clampNumber(opt?.price ?? opt?.priceAdder ?? 0, 0, 2000, 0), 5);
      const requiresNoOptionSpecificQuestions = Boolean(opt?.requiresNoOptionSpecificQuestions);
      let selectedQuestionIds = [];

      if (!requiresNoOptionSpecificQuestions) {
        const expanded = new Set();
        (Array.isArray(opt?.selectedQuestionIds) ? opt.selectedQuestionIds : [])
          .map((qid) => slugify(qid))
          .filter((qid) => questionById.has(qid))
          .forEach((qid) => {
            if (optionSpecificQuestionIds.has(qid)) {
              expanded.add(qid);
              return;
            }
            // Dependent questions cannot be directly assigned as option-specific,
            // so ensure their non-dependent option-specific root ancestor is included instead.
            let current = questionById.get(qid);
            const visited = new Set([qid]);
            while (current?.dependencyRule?.dependsOnQuestionId) {
              const parentId = current.dependencyRule.dependsOnQuestionId;
              if (visited.has(parentId)) break;
              visited.add(parentId);
              if (optionSpecificQuestionIds.has(parentId)) {
                expanded.add(parentId);
                break;
              }
              current = questionById.get(parentId);
            }
          });
        selectedQuestionIds = questions
          .filter((q) => expanded.has(q.id))
          .map((q) => q.id);
      }

      return {
        id,
        title,
        description: cleanText(opt?.description || `${title} service option.`, 280),
        price,
        requiresNoOptionSpecificQuestions,
        selectedQuestionIds,
      };
    })
    .filter(Boolean);

  // If AI omitted options on a non-bundle service while existing draft had options, preserve them;
  // otherwise ensure option-specific questions can be reached cleanly.
  if (!options.length && Array.isArray(currentDraft?.options) && currentDraft.options.length > 0) {
    options = currentDraft.options
      .map((opt, idx) => {
        const title = cleanText(opt?.title || '', 100);
        if (!title) return null;
        return {
          id: slugify(opt?.id || title || `option_${idx + 1}`),
          title,
          description: cleanText(opt?.description || `${title} service option.`, 280),
          price: snapToStep(clampNumber(opt?.price ?? 0, 0, 2000, 0), 5),
          requiresNoOptionSpecificQuestions: Boolean(opt?.requiresNoOptionSpecificQuestions),
          selectedQuestionIds: opt?.requiresNoOptionSpecificQuestions
            ? []
            : [...optionSpecificQuestionIds],
        };
      })
      .filter(Boolean);
  }

  return {
    summary: cleanText(rawDraft.summary || `Drafted ${label} with service options, detailed questions, and pricing.`, 400),
    serviceId,
    categoryId,
    categoryName: CATEGORY_LABELS[categoryId] || categoryId,
    type,
    label,
    promptLabel,
    description,
    active,
    requiresPortfolioSelection,
    optionApplicationMode,
    includedServiceIds,
    inheritBundleImages,
    pricing: {
      travelFee,
      minimumTotal,
      maximumTotal,
    },
    options,
    questions,
    requiredQuestions: questions,
    optionalQuestions: [],
  };
}

function parseJsonResponse(rawText = '') {
  const trimmed = String(rawText || '').trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (!trimmed) {
    throw new Error('AI returned an empty response.');
  }
  return JSON.parse(trimmed);
}

async function generateAdminServiceDraft({
  mode = 'create',
  instructions = '',
  currentDraft = {},
  catalogServices = [],
  geminiProjectId = '',
  geminiLocation = 'global',
  geminiModel = DEFAULT_MODEL,
  timeoutMs = 55_000,
  clientFactory = createVertexGeminiClient,
  client = null,
} = {}) {
  const modelId = String(geminiModel || DEFAULT_MODEL).trim();
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(modelId)) {
    throw new Error('Gemini model configuration is invalid.');
  }

  const geminiClient = client || clientFactory({
    projectId: geminiProjectId,
    location: geminiLocation,
    timeoutMs,
  });

  const prompt = buildAdminServicePrompt({
    mode,
    instructions,
    currentDraft,
    catalogServices,
  });

  const response = await generateVertexGeminiContent({
    client: geminiClient,
    model: modelId,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      temperature: 0.25,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: AI_SERVICE_DRAFT_SCHEMA,
    },
  });

  const rawJson = parseJsonResponse(geminiResponseText(response));
  const draft = sanitizeAiServiceDraft(rawJson, {
    mode,
    currentDraft,
    catalogServices,
  });

  return {
    draft,
    summary: draft.summary,
    model: modelId,
  };
}

module.exports = {
  ALLOWED_CATEGORY_IDS,
  AI_SERVICE_DRAFT_SCHEMA,
  DEFAULT_MODEL,
  buildAdminServicePrompt,
  generateAdminServiceDraft,
  sanitizeAiServiceDraft,
};
