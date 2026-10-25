'use strict';

const { getQuestionnaireForSelection, normalizeAndValidateAnswers } = require('../serviceRequestPricing');

const PUBLIC_TOOLS = new Set([
  'listAvailableServices',
  'getServiceDetails',
  'getServiceQuestionnaire',
  'getServicePricingInformation',
]);

const TOOL_INPUTS = {
  listAvailableServices: [],
  getServiceDetails: ['serviceId'],
  getServiceQuestionnaire: ['serviceId'],
  getServicePricingInformation: ['serviceId'],
};

function normalizeId(value) {
  return String(value || '').trim().toLowerCase();
}

function requirePlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Tool input must be an object.');
  }
}

function validateToolInput(toolName, input = {}) {
  requirePlainObject(input);
  const allowed = TOOL_INPUTS[toolName];
  if (!allowed) throw new Error('Tool is not available.');
  const unknown = Object.keys(input).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new Error('Tool input contains unsupported fields.');
  if (allowed.includes('serviceId') && !normalizeId(input.serviceId)) {
    throw new Error('A service ID is required.');
  }
  return Object.fromEntries(allowed.map((key) => [key, normalizeId(input[key])]));
}

function publicService(service) {
  return {
    id: service.id,
    categoryId: service.categoryId,
    categoryName: service.categoryName,
    label: service.label,
    description: service.description,
    type: service.type,
    includedServiceIds: service.includedServiceIds,
    pricing: {
      pricingMode: service.pricing.pricingMode,
      basePrice: service.pricing.basePrice,
      materialFee: service.pricing.materialFee,
      minimumTotal: service.pricing.minimumTotal,
      currency: 'ZAR',
    },
  };
}

function createWhatsAppToolRegistry({ getCatalogEntries } = {}) {
  if (typeof getCatalogEntries !== 'function') throw new Error('A service catalogue reader is required.');

  async function execute(toolName, rawInput = {}, identity = { kind: 'guest' }) {
    const input = validateToolInput(toolName, rawInput);
    if (!PUBLIC_TOOLS.has(toolName)) throw new Error('This tool requires a configured backend authorization handler.');
    if (!identity || !['guest', 'customer', 'helper'].includes(identity.kind)) {
      throw new Error('The WhatsApp identity is invalid.');
    }

    const catalog = (await getCatalogEntries())
      .filter((service) => service && service.active === true && service.approved === true);
    const service = input.serviceId ? catalog.find((item) => item.id === input.serviceId) : null;
    if (input.serviceId && !service) {
      const error = new Error('The requested service is unavailable.');
      error.code = 'service-not-found';
      throw error;
    }

    if (toolName === 'listAvailableServices') {
      return {
        services: catalog.map(publicService).slice(0, 100),
      };
    }
    if (toolName === 'getServiceDetails') return publicService(service);
    if (toolName === 'getServicePricingInformation') {
      return {
        serviceId: service.id,
        pricing: publicService(service).pricing,
        requiredQuestionIds: service.questionnaire.required.map((question) => question.id),
        note: 'The final quote requires validated questionnaire answers and must come from the authoritative pricing engine.',
      };
    }
    if (toolName === 'getServiceQuestionnaire') {
      const selectedServices = service.includedServiceIds.length
        ? catalog.filter((item) => service.includedServiceIds.includes(item.id) || item.id === service.id)
        : [service];
      const questions = getQuestionnaireForSelection({
        services: selectedServices,
        selectedPackageId: service.id,
      });
      return {
        serviceId: service.id,
        categoryId: service.categoryId,
        questions,
      };
    }
    throw new Error('Tool is not available.');
  }

  return {
    async execute(toolName, input, identity) {
      return execute(toolName, input, identity);
    },
    async validateServiceAnswers({ serviceId, answers = {} } = {}) {
      const input = validateToolInput('getServiceQuestionnaire', { serviceId });
      const catalog = (await getCatalogEntries())
        .filter((service) => service && service.active === true && service.approved === true);
      const service = catalog.find((item) => item.id === input.serviceId);
      if (!service) {
        const error = new Error('The requested service is unavailable.');
        error.code = 'service-not-found';
        throw error;
      }
      const selectedServices = service.includedServiceIds.length
        ? catalog.filter((item) => service.includedServiceIds.includes(item.id) || item.id === service.id)
        : [service];
      const questions = getQuestionnaireForSelection({ services: selectedServices, selectedPackageId: service.id });
      return normalizeAndValidateAnswers({ answers, questions, strictUnknown: true });
    },
  };
}

module.exports = {
  createWhatsAppToolRegistry,
  publicService,
  validateToolInput,
};
