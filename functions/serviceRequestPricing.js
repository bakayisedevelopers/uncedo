'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { createCategoryPricingEngine } = require('./shared/categoryPricingEngineFactory.cjs');
const {
  isQuestionIncludedForOption,
  normalizeServiceCatalogEntry,
  resolveSelectedServiceOption,
} = require('./serviceMarketplacePricing');

const PRICING_CONTROL_ANSWER_IDS = new Set(['travel_distance_km']);

function normalizeAnswer(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  return value == null ? '' : value;
}

function hasAnswer(value) {
  if (Array.isArray(value)) return value.length > 0;
  return String(value == null ? '' : value).trim().length > 0;
}

function getServiceQuestionnaire(service) {
  const questionnaire = service?.questionnaire || {};
  return {
    required: Array.isArray(questionnaire.required) ? questionnaire.required : [],
    optional: Array.isArray(questionnaire.optional) ? questionnaire.optional : [],
  };
}

function getQuestionnaireForSelection({ services = [], selectedPackageId = '', selectedOptionId = '' }) {
  const selected = new Map();
  const addQuestions = (service, required) => {
    const selectedOption = resolveSelectedServiceOption(service, selectedOptionId);
    const questionnaire = getServiceQuestionnaire(service);
    const questions = required ? questionnaire.required : questionnaire.optional;
    questions.forEach((question) => {
      if (!question?.id || selected.has(question.id)) return;
      if (!isQuestionIncludedForOption(question, service, selectedOption)) return;
      selected.set(question.id, { ...question, required });
    });
  };

  const packageService = services.find((service) => service.id === selectedPackageId);
  if (packageService) {
    addQuestions(packageService, true);
    addQuestions(packageService, false);
  }
  services
    .filter((service) => service.id !== selectedPackageId)
    .forEach((service) => {
      addQuestions(service, true);
      addQuestions(service, false);
    });

  return [...selected.values()];
}

function isQuestionApplicable(question, normalizedAnswers) {
  const rule = question?.dependencyRule;
  const depQuestionId = rule?.dependsOnQuestionId || question?.dependsOn?.questionId;
  const depOptionValue = rule?.dependsOnOptionValue || question?.dependsOn?.optionValue;
  if (!depQuestionId) return true;
  const parentValue = normalizedAnswers[depQuestionId];
  if (!parentValue) return false;
  const expected = String(depOptionValue || '').trim().toLowerCase();
  const actualValues = Array.isArray(parentValue) ? parentValue.map((v) => String(v).toLowerCase()) : [String(parentValue).toLowerCase()];
  return actualValues.includes(expected);
}

function normalizeAndValidateAnswers({ answers = {}, questions = [], strictUnknown = true } = {}) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    throw new Error('Service answers must be an object.');
  }
  const questionMap = new Map(questions.map((question) => [question.id, question]));
  const normalized = {};

  Object.entries(answers).forEach(([rawQuestionId, rawValue]) => {
    const questionId = String(rawQuestionId || '').trim();
    if (!questionId) return;
    if (questionId === 'travel_distance_km') {
      const distance = Number(rawValue);
      if (!Number.isFinite(distance) || distance < 0 || distance > 500) {
        throw new Error('Travel distance is invalid.');
      }
      normalized[questionId] = distance;
      return;
    }
    const question = questionMap.get(questionId);
    if (!question) {
      if (strictUnknown) throw new Error(`Unknown service answer field: ${questionId}.`);
      return;
    }

    const answer = normalizeAnswer(rawValue);
    if (String(question.answerType || '').toLowerCase() === 'enum') {
      const options = Array.isArray(question.options) ? question.options : [];
      const rawValues = Array.isArray(answer) ? answer : [answer];
      const canonicalValues = rawValues.map((value) => {
        const option = options.find((candidate) => String(candidate.value || '').toLowerCase() === String(value || '').toLowerCase());
        if (!option) throw new Error(`Invalid option for ${questionId}.`);
        return option.value;
      });
      normalized[questionId] = Array.isArray(answer) ? canonicalValues : canonicalValues[0];
      return;
    }

    if (typeof answer === 'object' && answer !== null && !Array.isArray(answer)) {
      throw new Error(`Invalid answer format for ${questionId}.`);
    }
    normalized[questionId] = answer;
  });

  const applicableQuestions = questions.filter((question) => isQuestionApplicable(question, normalized));
  const missingRequired = applicableQuestions
    .filter((question) => question.required === true && !hasAnswer(normalized[question.id]))
    .map((question) => question.id);
  if (String(normalized.timing_preference || '').trim().toLowerCase() === 'later'
    && !hasAnswer(normalized.scheduled_for_text)
    && questions.some((question) => question.id === 'scheduled_for_text')) {
    if (!missingRequired.includes('scheduled_for_text')) missingRequired.push('scheduled_for_text');
  }

  return { answers: normalized, missingRequired };
}

function buildQuestionnaireHash(services = [], selectedOptionId = '') {
  const source = {
    selectedOptionId: String(selectedOptionId || '').trim().toLowerCase() || '',
    services: services
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((service) => ({
        id: service.id,
        categoryId: service.categoryId,
        active: service.active,
        approved: service.approved,
        optionApplicationMode: service.optionApplicationMode || 'per_option',
        options: Array.isArray(service.options) ? service.options : [],
        pricing: service.pricing,
        includedServiceIds: service.includedServiceIds,
        questionnaire: service.questionnaire,
      })),
  };
  return createHash('sha256').update(JSON.stringify(source)).digest('hex');
}

function validateAndResolveOptionSelection(services = [], selectedOptionId = '') {
  const normalizedOptionId = String(selectedOptionId || '').trim().toLowerCase();
  const optionServices = (Array.isArray(services) ? services : [])
    .filter((service) => Array.isArray(service?.options) && service.options.length > 0);
  if (!optionServices.length) {
    return { selectedOption: null, selectedOptionId: '' };
  }
  if (!normalizedOptionId) {
    const error = new Error('Please choose a service option before requesting a quote.');
    error.code = 'missing-service-option';
    throw error;
  }
  for (const service of optionServices) {
    const match = resolveSelectedServiceOption(service, normalizedOptionId);
    if (match) {
      return { selectedOption: match, selectedOptionId: match.id };
    }
  }
  const error = new Error('The selected service option is unavailable.');
  error.code = 'invalid-service-option';
  throw error;
}

function quoteFromCatalogEntries({
  entries = [],
  categoryId = '',
  serviceIds = [],
  selectedPackageId = '',
  selectedOptionId = '',
  structuredAnswers = {},
  strictUnknownAnswers = true,
  currency = 'ZAR',
} = {}) {
  const normalizedCategoryId = String(categoryId || '').trim().toLowerCase();
  let normalizedServiceIds = [...new Set((Array.isArray(serviceIds) ? serviceIds : [])
    .map((serviceId) => String(serviceId || '').trim().toLowerCase())
    .filter(Boolean))];
  if (!normalizedCategoryId) throw new Error('A category is required.');

  const catalogEntries = entries.map((entry) => normalizeServiceCatalogEntry(entry)).filter(Boolean);
  const catalogById = new Map(catalogEntries.map((service) => [service.id, service]));
  const packageId = String(selectedPackageId || '').trim().toLowerCase();
  const packageService = packageId ? catalogById.get(packageId) : null;
  if (packageId && (!packageService || packageService.categoryId !== normalizedCategoryId || !packageService.active || !packageService.approved)) {
    throw new Error('The selected service package is unavailable.');
  }
  if (!normalizedServiceIds.length && packageService) {
    normalizedServiceIds = packageService.includedServiceIds.length
      ? [...packageService.includedServiceIds]
      : [packageId];
  }
  if (!normalizedServiceIds.length) throw new Error('At least one service is required.');
  const missingIds = normalizedServiceIds.filter((serviceId) => !catalogById.has(serviceId));
  if (missingIds.length) throw new Error('One or more selected services are unavailable.');

  const selectedServices = normalizedServiceIds.map((serviceId) => catalogById.get(serviceId));
  if (selectedServices.some((service) => service.categoryId !== normalizedCategoryId || service.active !== true || service.approved !== true)) {
    throw new Error('One or more selected services are no longer available for quoting.');
  }
  const selectedQuestionnaireServices = packageId && !normalizedServiceIds.includes(packageId)
    ? [...selectedServices, catalogById.get(packageId)]
    : selectedServices;
  const resolvedOptionSelection = validateAndResolveOptionSelection(selectedQuestionnaireServices, selectedOptionId);
  const questions = getQuestionnaireForSelection({
    services: selectedQuestionnaireServices,
    selectedPackageId: packageId,
    selectedOptionId: resolvedOptionSelection.selectedOptionId,
  });
  const validation = normalizeAndValidateAnswers({
    answers: structuredAnswers,
    questions,
    strictUnknown: strictUnknownAnswers,
  });
  if (validation.missingRequired.length) {
    const error = new Error('Required service details are missing.');
    error.code = 'missing-required-answers';
    error.missingQuestionIds = validation.missingRequired;
    throw error;
  }

  const getServiceById = (serviceId) => catalogById.get(String(serviceId || '').trim().toLowerCase()) || null;
  const firstService = selectedServices[0];
  const engine = createCategoryPricingEngine(normalizedCategoryId, {
    getCategoryById: () => ({ id: normalizedCategoryId, label: firstService.categoryName || normalizedCategoryId }),
    getServiceById,
  });
  const result = engine({
    serviceIds: normalizedServiceIds,
    selectedOptionId: resolvedOptionSelection.selectedOptionId,
    structuredAnswers: validation.answers,
    currency,
  });
  return {
    ...result,
    quoteId: `service_quote_${randomUUID()}`,
    selectedPackageId: packageId || null,
    selectedOptionId: resolvedOptionSelection.selectedOption?.id || null,
    selectedOptionTitle: resolvedOptionSelection.selectedOption?.title || null,
    structuredAnswers: validation.answers,
    questionnaireVersion: buildQuestionnaireHash(selectedQuestionnaireServices, resolvedOptionSelection.selectedOptionId),
    serviceCatalogVersion: buildQuestionnaireHash(selectedServices, resolvedOptionSelection.selectedOptionId),
    quotedAt: new Date().toISOString(),
  };
}

async function quoteFromFirestore({ db, ...input }) {
  const packageId = String(input.selectedPackageId || '').trim().toLowerCase();
  let requestedServiceIds = Array.isArray(input.serviceIds) ? input.serviceIds : [];
  if (!requestedServiceIds.length && packageId) {
    const packageSnap = await db.collection('serviceCatalog').doc(packageId).get();
    const packageData = packageSnap.exists ? packageSnap.data() || {} : {};
    requestedServiceIds = Array.isArray(packageData.includedServiceIds) && packageData.includedServiceIds.length
      ? packageData.includedServiceIds
      : [packageId];
  }
  const serviceIds = [...new Set(requestedServiceIds
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean))];
  const catalogIds = [...new Set([...serviceIds, ...(packageId ? [packageId] : [])])];
  if (!serviceIds.length || serviceIds.length > 30 || catalogIds.length > 31) throw new Error('A valid selection of services is required.');
  const snapshots = await db.getAll(...catalogIds.map((serviceId) => db.collection('serviceCatalog').doc(serviceId)));
  const entries = snapshots
    .filter((snapshot) => snapshot.exists)
    .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }));
  return quoteFromCatalogEntries({ ...input, serviceIds, entries });
}

module.exports = {
  buildQuestionnaireHash,
  getQuestionnaireForSelection,
  normalizeAndValidateAnswers,
  quoteFromCatalogEntries,
  quoteFromFirestore,
  validateAndResolveOptionSelection,
};
