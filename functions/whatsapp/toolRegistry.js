'use strict';

const { getQuestionnaireForSelection, normalizeAndValidateAnswers } = require('../serviceRequestPricing');
const { getConfiguredServicePriceRange } = require('./servicePresentation');

const MAX_CATALOG_RESULTS = 100;
const MAX_ARTICLE_RESULTS = 5;

const resultSchema = (properties, required = []) => Object.freeze({
  type: 'object', additionalProperties: false,
  properties: Object.freeze(properties), required: Object.freeze(required),
});
const stringSchema = Object.freeze({ type: 'string' });
const numberSchema = Object.freeze({ type: 'number' });
const booleanSchema = Object.freeze({ type: 'boolean' });
const nullableNumberSchema = Object.freeze({ type: ['number', 'null'] });
const PUBLIC_PRICE_RANGE_SCHEMA = resultSchema({
  currency: stringSchema,
  minimum: nullableNumberSchema,
  maximum: nullableNumberSchema,
}, ['currency', 'minimum', 'maximum']);
const PUBLIC_QUESTION_OPTION_SCHEMA = resultSchema({ value: stringSchema, label: stringSchema }, ['value', 'label']);
const PUBLIC_QUESTION_SCHEMA = resultSchema({
  id: stringSchema,
  prompt: stringSchema,
  label: stringSchema,
  answerType: stringSchema,
  type: stringSchema,
  required: booleanSchema,
  options: { type: 'array', items: PUBLIC_QUESTION_OPTION_SCHEMA },
  placeholder: stringSchema,
  helpText: stringSchema,
  unit: stringSchema,
  minimum: nullableNumberSchema,
  maximum: nullableNumberSchema,
  multiple: booleanSchema,
}, ['id', 'required']);
const BOOKING_SUMMARY_SCHEMA = resultSchema({
  requestId: stringSchema, summary: stringSchema, status: stringSchema, statusLabel: stringSchema, helperName: stringSchema,
  createdAtMs: nullableNumberSchema,
}, ['requestId', 'status', 'statusLabel']);
const PUBLIC_SERVICE_SCHEMA = resultSchema({
  id: stringSchema, categoryId: stringSchema, categoryName: stringSchema, label: stringSchema,
  description: stringSchema, type: stringSchema, includedServiceIds: { type: 'array', items: stringSchema },
  priceRange: { ...PUBLIC_PRICE_RANGE_SCHEMA, type: ['object', 'null'] },
}, ['id', 'label']);

const TOOL_DEFINITIONS = Object.freeze({
  listAvailableServices: {
    description: 'List active, approved public Uncedo services.', roles: ['guest', 'customer', 'helper'], auth: 'public',
    fields: {}, handler: 'listAvailableServices', canonicalBackend: 'liveServiceCatalogReader',
    outputSchema: resultSchema({ services: { type: 'array', items: PUBLIC_SERVICE_SCHEMA } }, ['services']),
  },
  getServiceDetails: {
    description: 'Read public details for one active service ID from the live catalogue.', roles: ['guest', 'customer', 'helper'], auth: 'public',
    fields: { serviceId: 'service-id' }, required: ['serviceId'], handler: 'getServiceDetails', canonicalBackend: 'liveServiceCatalogReader',
    outputSchema: PUBLIC_SERVICE_SCHEMA,
  },
  getServiceQuestionnaire: {
    description: 'Read the exact active questionnaire for one real catalogue service.', roles: ['guest', 'customer', 'helper'], auth: 'public',
    fields: { serviceId: 'service-id' }, required: ['serviceId'], handler: 'getServiceQuestionnaire', canonicalBackend: 'serviceRequestPricing.getQuestionnaireForSelection',
    outputSchema: resultSchema({ serviceId: stringSchema, categoryId: stringSchema, questions: { type: 'array', items: PUBLIC_QUESTION_SCHEMA } }, ['serviceId', 'questions']),
  },
  getServicePricingInformation: {
    description: 'For an explicit customer price question, return only a configured minimum-to-maximum total range. Do not provide base prices, fees, estimates, or calculate a quote.', roles: ['guest', 'customer', 'helper'], auth: 'public',
    fields: { serviceId: 'service-id' }, required: ['serviceId'], handler: 'getServicePricingInformation', canonicalBackend: 'liveServiceCatalogReader',
    outputSchema: resultSchema({
      serviceId: stringSchema,
      serviceName: stringSchema,
      priceRange: { ...PUBLIC_PRICE_RANGE_SCHEMA, type: ['object', 'null'] },
      requiredQuestionIds: { type: 'array', items: stringSchema },
      note: stringSchema,
    }, ['serviceId', 'serviceName', 'priceRange', 'requiredQuestionIds', 'note']),
  },
  getSupportKnowledge: {
    description: 'Search administrator-approved, published public support articles.', roles: ['guest', 'customer', 'helper'], auth: 'public',
    fields: { query: 'short-text' }, required: ['query'], handler: 'getSupportKnowledge', canonicalBackend: 'publishedSupportArticleReader',
    outputSchema: resultSchema({ found: booleanSchema, articles: { type: 'array', items: resultSchema({ id: stringSchema, title: stringSchema, category: stringSchema, content: stringSchema, keywords: { type: 'array', items: stringSchema } }) } }, ['found', 'articles']),
  },
  getMyProfile: {
    description: 'Read a minimal profile summary for the authenticated WhatsApp account owner.', roles: ['customer', 'helper'], auth: 'verified-linked',
    fields: {}, handler: 'getMyProfile', canonicalBackend: 'verifiedLinkedProfileReader',
    outputSchema: resultSchema({ code: stringSchema, firstName: stringSchema, lastName: stringSchema, email: stringSchema, role: stringSchema, verificationStatus: stringSchema }),
  },
  proposeProfileChange: {
    description: 'Propose changing only the account owner’s first name or surname. This never applies the change; it creates a one-time confirmation prompt.', roles: ['customer', 'helper'], auth: 'verified-linked',
    fields: { field: 'profile-field', value: 'short-text' }, required: ['field', 'value'], handler: 'proposeProfileChange', canonicalBackend: 'confirmedProfileChangeWorkflow',
    stateChanging: true, confirmation: 'user-confirmation', idempotency: 'inbound-event-id',
    outputSchema: resultSchema({ code: stringSchema, proposalId: stringSchema, field: stringSchema, value: stringSchema }),
  },
  listMyBookings: {
    description: 'Read recent requests owned by this customer or assigned to this helper. Use scope "cancelable" to find customer requests that may still be canceled, and inspect the returned current statuses before taking any next step.', roles: ['guest', 'customer', 'helper'], auth: 'conversation-owner',
    fields: { scope: 'booking-scope', limit: 'small-limit' }, handler: 'listMyBookings', canonicalBackend: 'listWhatsAppRequests',
    outputSchema: resultSchema({ bookings: { type: 'array', items: BOOKING_SUMMARY_SCHEMA } }, ['bookings']),
  },
  getBookingStatus: {
    description: 'Read the current authorized status and minimal details for a booking. Use a request ID returned by listMyBookings or supplied by the customer.', roles: ['guest', 'customer', 'helper'], auth: 'conversation-owner',
    fields: { requestId: 'request-id' }, required: ['requestId'], handler: 'getBookingStatus', canonicalBackend: 'getWhatsAppRequestForIdentity',
    outputSchema: resultSchema({ code: stringSchema, booking: BOOKING_SUMMARY_SCHEMA }),
  },
  previewRequestCancellation: {
    description: 'Check whether one of the customer’s requests can currently be canceled and return the authoritative fee. This only prepares an expiring confirmation; it never cancels the request. The customer must explicitly confirm through the separate confirmation flow.', roles: ['guest', 'customer'], auth: 'conversation-owner',
    fields: { requestId: 'request-id' }, required: ['requestId'], handler: 'previewRequestCancellation', canonicalBackend: 'getWhatsAppCustomerCancellationPreview',
    stateChanging: true, confirmation: 'required-before-cancellation', idempotency: 'inbound-event-id',
    outputSchema: resultSchema({ code: stringSchema, requestId: stringSchema, status: stringSchema, cancellationAmount: numberSchema, currency: stringSchema, eligible: booleanSchema }, ['code', 'eligible']),
  },
  relayToAssignedParticipant: {
    description: 'Forward the customer’s or assigned helper’s original message to the other participant on the current open, assigned request. Use only for practical coordination clearly directed to that participant. Do not use for cancellation, request status, payment, support, or Uncedo information. The backend verifies that the sender and recipient are the exact request participants.', roles: ['guest', 'customer', 'helper'], auth: 'conversation-owner',
    fields: {}, handler: 'relayToAssignedParticipant', canonicalBackend: 'relayWhatsAppText',
    stateChanging: true, confirmation: 'the-user-authored-message-is-the-authorization', idempotency: 'inbound-event-id',
    outputSchema: resultSchema({ code: stringSchema, sent: booleanSchema }, ['code', 'sent']),
  },
  getMyPaymentSummary: {
    description: 'Read the canonical payment status and amount due for one owned booking. Never returns card or gateway credentials.', roles: ['customer'], auth: 'verified-linked',
    fields: { requestId: 'request-id' }, required: ['requestId'], handler: 'getMyPaymentSummary', canonicalBackend: 'requestPaymentService.readPaymentState',
    outputSchema: resultSchema({ code: stringSchema, requestId: stringSchema, state: stringSchema, amount: { type: ['number', 'null'] }, currency: stringSchema, settledAtMs: { type: ['number', 'null'] } }),
  },
  getMyWalletSummary: {
    description: 'Read the authenticated helper’s available, reserved and outstanding commission balances.', roles: ['helper'], auth: 'verified-verified-helper',
    fields: {}, handler: 'getMyWalletSummary', canonicalBackend: 'helperWalletService.readOwnWallet',
    outputSchema: resultSchema({ currency: stringSchema, availableMinor: numberSchema, reservedMinor: numberSchema, outstandingCommissionMinor: numberSchema, reconciliationBlocked: booleanSchema, updatedAtMs: numberSchema }),
  },
  listMyWalletTransactions: {
    description: 'Read recent helper wallet ledger summaries without bank or Paystack credentials.', roles: ['helper'], auth: 'verified-verified-helper',
    fields: { limit: 'small-limit' }, handler: 'listMyWalletTransactions', canonicalBackend: 'helperWalletService.readOwnLedger',
    outputSchema: resultSchema({ transactions: { type: 'array', items: resultSchema({
      entryType: stringSchema, amountMinor: numberSchema, availableDeltaMinor: numberSchema,
      outstandingCommissionDeltaMinor: numberSchema, description: stringSchema, createdAtMs: numberSchema,
    }) } }, ['transactions']),
  },
  getMyPayoutStatus: {
    description: 'Read recent weekly payout statuses and amounts for the authenticated helper.', roles: ['helper'], auth: 'verified-verified-helper',
    fields: {}, handler: 'getMyPayoutStatus', canonicalBackend: 'helperWeeklyPayoutReader',
    outputSchema: resultSchema({ payouts: { type: 'array', items: resultSchema({
      status: stringSchema, amount: numberSchema, currency: stringSchema, periodStart: stringSchema,
      periodEnd: stringSchema, weekKey: stringSchema, scheduledAtMs: { type: ['number', 'null'] }, reason: stringSchema,
    }) } }, ['payouts']),
  },
  listMyAvailableOffers: {
    description: 'List current unexpired service offers addressed to the authenticated helper. This does not accept or decline offers.', roles: ['helper'], auth: 'verified-verified-helper',
    fields: {}, handler: 'listMyAvailableOffers', canonicalBackend: 'serviceRequestOfferReader',
    outputSchema: resultSchema({ offers: { type: 'array', items: resultSchema({ serviceSummary: stringSchema, amount: { type: ['number', 'null'] }, currency: stringSchema, expiresAtMs: numberSchema }) } }, ['offers']),
  },
  getMyEarningsSummary: {
    description: 'Read recent canonical weekly earnings and payout records for the authenticated helper.', roles: ['helper'], auth: 'verified-verified-helper',
    fields: {}, handler: 'getMyEarningsSummary', canonicalBackend: 'helperWeeklyPayoutReader',
    outputSchema: resultSchema({
      currency: stringSchema,
      availableWalletMinor: numberSchema,
      reservedWalletMinor: numberSchema,
      outstandingCommissionMinor: numberSchema,
      recentPeriods: {
        type: 'array',
        items: resultSchema({
          weekKey: stringSchema,
          status: stringSchema,
          completedJobs: numberSchema,
          helperAmount: { type: ['number', 'null'] },
          platformAmount: { type: ['number', 'null'] },
          paidAtMs: { type: ['number', 'null'] },
          scheduledAtMs: { type: ['number', 'null'] },
        }),
      },
    }, ['currency', 'recentPeriods']),
  },
  requestHumanSupport: {
    description: 'Create or reuse a support handoff for a user who asks for a person or whose issue requires human judgement.', roles: ['guest', 'customer', 'helper'], auth: 'conversation',
    fields: { reason: 'short-text' }, required: ['reason'], handler: 'requestHumanSupport', canonicalBackend: 'supportTicketService.createOrAppendWhatsAppSupportMessage',
    stateChanging: true, confirmation: 'explicit-request-or-escalation-policy', idempotency: 'inbound-event-id',
    outputSchema: resultSchema({ code: stringSchema, ticketId: stringSchema, duplicate: booleanSchema }),
  },
});

function safeText(value, max = 500) {
  return String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function roleForContext(context = {}) {
  return String(context.authorization?.role || context.role || context.kind || (context.identity?.guestPrincipalId ? 'customer' : 'guest')).trim().toLowerCase();
}

function validateToolArguments(definition, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Tool arguments must be an object.');
  const allowed = new Set(Object.keys(definition.fields || {}));
  const unknown = Object.keys(args).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error('Tool arguments contain unsupported fields.');
  for (const key of definition.required || []) {
    if (args[key] === undefined || args[key] === null || args[key] === '') throw new Error(`Tool argument ${key} is required.`);
  }
  const normalized = {};
  for (const [key, type] of Object.entries(definition.fields || {})) {
    if (args[key] === undefined) continue;
    const value = args[key];
    if (type === 'service-id') {
      const item = safeText(value, 160);
      if (!/^[A-Za-z0-9_-]{1,160}$/.test(item)) throw new Error('A valid service ID is required.');
      normalized[key] = item;
    } else if (type === 'request-id') {
      const item = safeText(value, 128);
      if (!/^[A-Za-z0-9_-]{6,128}$/.test(item)) throw new Error('A valid request ID is required.');
      normalized[key] = item;
    } else if (type === 'short-text') {
      const item = safeText(value, 300);
      if (!item) throw new Error(`Tool argument ${key} is required.`);
      normalized[key] = item;
    } else if (type === 'profile-field') {
      const item = safeText(value, 40);
      if (!['firstName', 'lastName'].includes(item)) throw new Error('Only first name or surname can be changed here.');
      normalized[key] = item;
    } else if (type === 'small-limit') {
      const item = Number(value);
      if (!Number.isInteger(item) || item < 1 || item > 20) throw new Error('The requested page size is invalid.');
      normalized[key] = item;
    } else if (type === 'booking-scope') {
      const item = safeText(value, 20).toLowerCase();
      if (!['recent', 'active', 'cancelable'].includes(item)) throw new Error('The requested booking filter is invalid.');
      normalized[key] = item;
    }
  }
  return normalized;
}

function matchesOutputSchema(value, schema) {
  const allowedTypes = Array.isArray(schema?.type) ? schema.type : [schema?.type];
  const matchesType = (type) => {
    if (type === 'null') return value === null;
    if (type === 'array') return Array.isArray(value);
    if (type === 'object') return Boolean(value && typeof value === 'object' && !Array.isArray(value));
    if (type === 'integer') return Number.isInteger(value);
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
    if (type === 'string') return typeof value === 'string';
    if (type === 'boolean') return typeof value === 'boolean';
    return false;
  };
  if (!allowedTypes.some(matchesType)) return false;
  if (value === null || typeof value !== 'object') return true;
  if (Array.isArray(value)) return !schema.items || value.every((item) => matchesOutputSchema(item, schema.items));
  const properties = schema.properties || {};
  if (schema.additionalProperties === false && Object.keys(value).some((key) => !Object.hasOwn(properties, key))) return false;
  if ((schema.required || []).some((key) => value[key] === undefined)) return false;
  return Object.entries(value).every(([key, nested]) => !properties[key] || matchesOutputSchema(nested, properties[key]));
}

function isHumanEscalationEligible(context = {}) {
  if (context.escalationRequired === true) return true;
  const text = safeText(context.originalUserText || context.inbound?.text || context.inbound?.media?.caption, 1200).toLowerCase();
  return /\b(human|real person|support person|support team|agent|representative|speak to (?:someone|a person)|talk to (?:someone|a person)|contact support)\b/.test(text)
    || /\b(charged incorrectly|wrong charge|payment dispute|refund|never arrived|did not arrive|not completed|service complaint|unsafe|harass(?:ment)?|fraud|account takeover|cannot access my account)\b/.test(text);
}

function publicService(service = {}) {
  return {
    id: String(service.id || ''),
    categoryId: String(service.categoryId || ''),
    categoryName: String(service.categoryName || ''),
    label: String(service.label || ''),
    description: String(service.description || '').slice(0, 1500),
    type: String(service.type || 'service'),
    includedServiceIds: (Array.isArray(service.includedServiceIds) ? service.includedServiceIds : []).slice(0, 50).map(String),
    priceRange: getConfiguredServicePriceRange(service),
  };
}

function createWhatsAppToolRegistry({ getCatalogEntries = async () => [], getSupportArticles = async () => [], handlers = {} } = {}) {
  async function activeCatalog() {
    const entries = await getCatalogEntries();
    return (Array.isArray(entries) ? entries : []).filter((service) => service.active === true && service.approved === true);
  }

  const builtIn = {
    async listAvailableServices() {
      return { services: (await activeCatalog()).slice(0, MAX_CATALOG_RESULTS).map(publicService) };
    },
    async getServiceDetails({ serviceId }) {
      const service = (await activeCatalog()).find((item) => String(item.id) === serviceId);
      if (!service) throw Object.assign(new Error('Service not found.'), { code: 'service-not-found' });
      return publicService(service);
    },
    async getServiceQuestionnaire({ serviceId }) {
      const service = (await activeCatalog()).find((item) => String(item.id) === serviceId);
      if (!service) throw Object.assign(new Error('Service not found.'), { code: 'service-not-found' });
      const selectedServices = service.includedServiceIds?.length
        ? (await activeCatalog()).filter((item) => service.includedServiceIds.includes(item.id) || item.id === service.id)
        : [service];
      const questions = getQuestionnaireForSelection({ services: selectedServices, selectedPackageId: service.id });
      return {
        serviceId,
        categoryId: safeText(service.categoryId, 120),
        questions: questions.slice(0, 80).map((question) => ({
          id: safeText(question.id, 120),
          prompt: safeText(question.prompt || question.label || '', 400),
          ...(question.label ? { label: safeText(question.label, 200) } : {}),
          ...(question.answerType ? { answerType: safeText(question.answerType, 40) } : {}),
          ...(question.type ? { type: safeText(question.type, 40) } : {}),
          required: question.required === true,
          options: (Array.isArray(question.options) ? question.options : []).slice(0, 50).map((option) => typeof option === 'string'
            ? { value: safeText(option, 160), label: safeText(option, 200) }
            : { value: safeText(option?.value, 160), label: safeText(option?.label || option?.value, 200) }),
          ...(question.placeholder ? { placeholder: safeText(question.placeholder, 200) } : {}),
          ...(question.helpText ? { helpText: safeText(question.helpText, 400) } : {}),
          ...(question.unit ? { unit: safeText(question.unit, 40) } : {}),
          ...(question.minimum != null && Number.isFinite(Number(question.minimum)) ? { minimum: Number(question.minimum) } : {}),
          ...(question.maximum != null && Number.isFinite(Number(question.maximum)) ? { maximum: Number(question.maximum) } : {}),
          ...(typeof question.multiple === 'boolean' ? { multiple: question.multiple } : {}),
        })),
      };
    },
    async getServicePricingInformation({ serviceId }) {
      const service = (await activeCatalog()).find((item) => String(item.id) === serviceId);
      if (!service) throw Object.assign(new Error('Service not found.'), { code: 'service-not-found' });
      const questionnaire = service.questionnaire || {};
      return {
        serviceId: service.id,
        serviceName: String(service.label || service.id).slice(0, 160),
        priceRange: getConfiguredServicePriceRange(service),
        requiredQuestionIds: (questionnaire.required || []).map((question) => String(question.id || '')).filter(Boolean),
        note: 'The final quote requires validated questionnaire answers and must come from the authoritative pricing engine.',
      };
    },
    async getSupportKnowledge({ query }) {
      const queryWords = [...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g) || [])].slice(0, 12);
      const articles = await getSupportArticles();
      const matched = (Array.isArray(articles) ? articles : [])
        .filter((item) => item?.published === true && item?.active !== false)
        .map((item) => ({
          id: String(item.id || ''), title: safeText(item.title, 180), category: safeText(item.category, 80),
          content: safeText(item.content, 5000), keywords: Array.isArray(item.keywords) ? item.keywords.slice(0, 20).map((word) => safeText(word, 60)) : [],
        }))
        .map((item) => {
          const text = [item.title, item.category, item.content, ...item.keywords].join(' ').toLowerCase();
          const score = queryWords.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
          return { ...item, score };
        })
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, MAX_ARTICLE_RESULTS)
        .map(({ score, ...item }) => item);
      return { articles: matched, found: matched.length > 0 };
    },
  };

  function definitions(context = {}) {
    const role = roleForContext(context);
    return Object.entries(TOOL_DEFINITIONS)
      .filter(([, definition]) => definition.roles.includes(role))
      .map(([name, definition]) => ({
        name,
        description: definition.description,
        inputSchema: {
          type: 'object', additionalProperties: false,
          properties: Object.fromEntries(Object.entries(definition.fields || {}).map(([key, kind]) => [key,
            kind === 'small-limit' ? { type: 'integer', minimum: 1, maximum: 20 }
              : kind === 'profile-field' ? { type: 'string', enum: ['firstName', 'lastName'] }
                : kind === 'booking-scope' ? { type: 'string', enum: ['recent', 'active', 'cancelable'] }
                : { type: 'string', maxLength: kind === 'request-id' ? 128 : kind === 'service-id' ? 160 : 300 },
          ])),
          required: definition.required || [],
        },
        stateChanging: definition.stateChanging === true,
        readOnly: definition.stateChanging !== true,
        auth: definition.auth,
        confirmation: definition.confirmation || 'not-required',
        idempotency: definition.idempotency || 'read-only',
        canonicalBackend: definition.canonicalBackend,
        outputSchema: definition.outputSchema,
      }));
  }

  async function execute(name, rawArgs = {}, context = {}) {
    const definition = TOOL_DEFINITIONS[name];
    if (!definition) throw Object.assign(new Error('Tool is not available.'), { code: 'tool-not-available' });
    const role = roleForContext(context);
    if (!definition.roles.includes(role)) throw Object.assign(new Error('This tool is not available for this account.'), { code: 'tool-permission-denied' });
    if (definition.handler === 'requestHumanSupport' && !isHumanEscalationEligible(context)) {
      throw Object.assign(new Error('A support handoff requires an explicit request or a recognized issue requiring human review.'), { code: 'escalation-not-authorized' });
    }
    const authorization = context.authorization || {};
    if (definition.auth === 'verified-linked' && (!authorization.uid || authorization.verified !== true || authorization.linked !== true)) {
      throw Object.assign(new Error('Verify and link your WhatsApp identity to access account information.'), { code: 'identity-verification-required' });
    }
    if (definition.auth === 'conversation-owner') {
      const guestIsBoundToConversation = role === 'guest' && String(context.identity?.guestPrincipalId || '').trim();
      const linkedAccountIsVerified = Boolean(authorization.uid && authorization.verified === true && authorization.linked === true);
      if (!guestIsBoundToConversation && !linkedAccountIsVerified) {
        throw Object.assign(new Error('Verify and link your WhatsApp identity before accessing this request.'), { code: 'identity-verification-required' });
      }
    }
    if (definition.auth === 'verified-verified-helper' && (!authorization.uid || authorization.verified !== true || authorization.linked !== true || authorization.helperVerified !== true)) {
      throw Object.assign(new Error('A verified linked helper account is required for this information.'), { code: 'helper-verification-required' });
    }
    const args = validateToolArguments(definition, rawArgs);
    const handler = handlers[definition.handler] || builtIn[definition.handler];
    if (typeof handler !== 'function') throw Object.assign(new Error('This approved operation is not configured.'), { code: 'tool-unavailable' });
    const result = await handler(args, context);
    if (!result || typeof result !== 'object' || Array.isArray(result) || Buffer.byteLength(JSON.stringify(result)) > 50_000) {
      throw Object.assign(new Error('The approved operation returned an invalid result.'), { code: 'tool-output-invalid' });
    }
    const schemaWithSafeCode = {
      ...definition.outputSchema,
      properties: { ...(definition.outputSchema.properties || {}), code: stringSchema },
    };
    if (!matchesOutputSchema(result, schemaWithSafeCode)) {
      throw Object.assign(new Error('The approved operation returned a result outside its declared schema.'), { code: 'tool-output-invalid' });
    }
    return result;
  }

  async function validateServiceAnswers({ serviceId, answers = {} } = {}) {
    const normalizedServiceId = safeText(serviceId, 160);
    if (!normalizedServiceId) throw new Error('A service ID is required.');
    const catalog = await activeCatalog();
    const service = catalog.find((item) => String(item.id) === normalizedServiceId);
    if (!service) throw Object.assign(new Error('Service not found.'), { code: 'service-not-found' });
    const selectedServices = service.includedServiceIds?.length
      ? catalog.filter((item) => service.includedServiceIds.includes(item.id) || item.id === service.id)
      : [service];
    const questions = getQuestionnaireForSelection({ services: selectedServices, selectedPackageId: service.id });
    return normalizeAndValidateAnswers({ answers, questions, strictUnknown: true });
  }

  return {
    definitions,
    execute,
    isReadOnly(name) { return Boolean(TOOL_DEFINITIONS[name] && TOOL_DEFINITIONS[name].stateChanging !== true); },
    validateServiceAnswers,
  };
}

module.exports = { TOOL_DEFINITIONS, createWhatsAppToolRegistry, isHumanEscalationEligible, publicService, validateToolArguments };
