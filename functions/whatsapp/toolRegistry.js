'use strict';

const resultSchema = (properties, required = []) => Object.freeze({
  type: 'object', additionalProperties: false,
  properties: Object.freeze(properties), required: Object.freeze(required),
});
const stringSchema = Object.freeze({ type: 'string' });

// Keep the WhatsApp model's callable surface intentionally small. Greetings
// and ordinary conversation are generated directly by the model and do not
// need a backend tool.
const TOOL_DEFINITIONS = Object.freeze({
  getMyProfile: {
    description: 'Read only the sender’s own saved profile details. For linked customers and helpers, this includes their name, email, contact and WhatsApp numbers, role, and helper verification status when applicable. For a guest customer, return only the saved preferred name, customer role, guest account type, and saved home address. Never return another person’s data, include the guest WhatsApp number, or imply a guest has linked-account details.',
    roles: ['guest', 'customer', 'helper'], auth: 'self-profile', fields: {},
    handler: 'getMyProfile', canonicalBackend: 'selfIdentityOrVerifiedLinkedProfileReader',
    outputSchema: resultSchema({
      firstName: stringSchema,
      lastName: stringSchema,
      preferredName: stringSchema,
      email: stringSchema,
      phoneNumber: stringSchema,
      whatsappPhoneNumber: stringSchema,
      role: stringSchema,
      accountType: stringSchema,
      homeAddress: stringSchema,
      verificationStatus: stringSchema,
    }),
  },
  checkMyAccountByWhatsAppNumber: {
    description: 'Check whether the current guest customer’s own WhatsApp number matches one linkable Uncedo customer account. The backend derives the number from the verified current WhatsApp sender; never request or provide a phone number. Returns only a match status, never account identifiers or personal details.',
    roles: ['guest'], auth: 'self-profile', fields: {},
    handler: 'checkMyAccountByWhatsAppNumber', canonicalBackend: 'currentWhatsAppAccountMatcher',
    outputSchema: resultSchema({ matchStatus: stringSchema }, ['matchStatus']),
  },
  proposeProfileChange: {
    description: 'Propose changing only the authenticated account owner’s first name or surname. This creates a one-time confirmation prompt and never applies the change without the user’s separate confirmation. Do not use for phone number, email, role, or verification changes.',
    roles: ['customer', 'helper'], auth: 'verified-linked',
    fields: { field: 'profile-field', value: 'short-text' }, required: ['field', 'value'],
    handler: 'proposeProfileChange', canonicalBackend: 'confirmedProfileChangeWorkflow',
    stateChanging: true, confirmation: 'user-confirmation', idempotency: 'inbound-event-id',
    outputSchema: resultSchema({ code: stringSchema, proposalId: stringSchema, field: stringSchema, value: stringSchema }),
  },
  getAvailableServices: {
    description: 'Get a lightweight summary list of all active published Uncedo services (IDs, labels, categories, and descriptions) for internal AI reasoning and catalog inspection.',
    roles: ['guest', 'customer', 'helper'], auth: 'public', fields: {},
    handler: 'getAvailableServices', canonicalBackend: 'liveServiceCatalogSummaryReader',
    outputSchema: resultSchema({
      services: Object.freeze({
        type: 'array',
        items: resultSchema({
          id: stringSchema,
          label: stringSchema,
          categoryName: stringSchema,
          description: stringSchema,
        }, ['id', 'label']),
      }),
    }, ['services']),
  },
  sendServicesToUser: {
    description: 'Send an interactive WhatsApp carousel card message to the user showing available Uncedo services with primary images, descriptions, and Book/Details quick-reply buttons.',
    roles: ['guest', 'customer', 'helper'], auth: 'public', fields: { category: 'short-text' }, required: [],
    handler: 'sendServicesToUser', canonicalBackend: 'interactiveServiceCarouselSender',
    stateChanging: true, confirmation: 'not-required', idempotency: 'inbound-event-id',
    outputSchema: resultSchema({
      code: stringSchema,
      sentCount: Object.freeze({ type: 'integer' }),
    }, ['code']),
  },
  getServiceDetails: {
    description: 'Read full details of a specific Uncedo service by serviceId or keyword query. Returns service options, questionnaire options, description, category, price estimate range, and active helper availability count.',
    roles: ['guest', 'customer', 'helper'], auth: 'public',
    fields: { serviceId: 'short-text', query: 'short-text', serviceOption: 'short-text' }, required: [],
    handler: 'getServiceDetails', canonicalBackend: 'liveServiceCatalogReader',
    outputSchema: resultSchema({
      code: stringSchema,
      error: stringSchema,
      query: stringSchema,
      availableServices: Object.freeze({ type: 'array', items: stringSchema }),
      id: stringSchema,
      label: stringSchema,
      description: stringSchema,
      category: stringSchema,
      priceRange: stringSchema,
      helperCount: Object.freeze({ type: 'integer' }),
      serviceOptions: Object.freeze({
        type: 'array',
        items: resultSchema({
          id: stringSchema,
          title: stringSchema,
          price: Object.freeze({ type: 'number' }),
          description: stringSchema,
        }, ['id', 'title']),
      }),
      options: Object.freeze({
        type: 'array',
        items: resultSchema({
          id: stringSchema,
          prompt: stringSchema,
          options: Object.freeze({
            type: 'array',
            items: stringSchema,
          }),
        }, ['id', 'prompt']),
      }),
    }, ['code']),
  },
  initiateServiceBooking: {
    description: 'Initiate a service booking by serviceId or keyword, optionally including the chosen serviceOption. Loads the service options or questionnaire and starts the booking intake flow.',
    roles: ['guest', 'customer', 'helper'], auth: 'public',
    fields: { serviceId: 'short-text', query: 'short-text', serviceOption: 'short-text' }, required: [],
    handler: 'initiateServiceBooking', canonicalBackend: 'serviceBookingInitiator',
    stateChanging: true, confirmation: 'not-required', idempotency: 'inbound-event-id',
    outputSchema: resultSchema({
      code: stringSchema,
      error: stringSchema,
      query: stringSchema,
      serviceId: stringSchema,
      serviceName: stringSchema,
      categoryName: stringSchema,
      selectedOptionId: stringSchema,
      selectedOptionTitle: stringSchema,
      serviceOptions: Object.freeze({
        type: 'array',
        items: resultSchema({
          id: stringSchema,
          title: stringSchema,
          price: Object.freeze({ type: 'number' }),
          description: stringSchema,
        }, ['id', 'title']),
      }),
      questions: Object.freeze({
        type: 'array',
        items: resultSchema({
          id: stringSchema,
          prompt: stringSchema,
          required: Object.freeze({ type: 'boolean' }),
          options: Object.freeze({
            type: 'array',
            items: stringSchema,
          }),
        }, ['id', 'prompt']),
      }),
    }, ['code']),
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
  const requiredFields = new Set(definition.required || []);
  const normalized = {};
  for (const [key, type] of Object.entries(definition.fields || {})) {
    if (args[key] === undefined || args[key] === null) continue;
    const value = args[key];
    if (type === 'short-text') {
      const item = safeText(value, 120);
      if (!item) {
        if (requiredFields.has(key)) throw new Error(`Tool argument ${key} is required.`);
        continue;
      }
      normalized[key] = item;
    } else if (type === 'profile-field') {
      const item = safeText(value, 40);
      if (!['firstName', 'lastName'].includes(item)) throw new Error('Only first name or surname can be changed here.');
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

function createWhatsAppToolRegistry({ handlers = {} } = {}) {
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
            kind === 'profile-field'
              ? { type: 'string', enum: ['firstName', 'lastName'] }
              : { type: 'string', maxLength: 120 },
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
    const authorization = context.authorization || {};
    const isVerifiedLinkedAccount = Boolean(authorization.uid && authorization.verified === true && authorization.linked === true);
    const isBoundGuest = role === 'guest'
      && Boolean(String(context.identity?.guestPrincipalId || '').trim())
      && !String(context.identity?.linkedFirebaseUid || '').trim();
    if (definition.auth === 'self-profile' && !isVerifiedLinkedAccount && !isBoundGuest) {
      throw Object.assign(new Error('A verified linked account or bound WhatsApp guest profile is required.'), { code: 'identity-verification-required' });
    }
    if (definition.auth === 'verified-linked' && !isVerifiedLinkedAccount) {
      throw Object.assign(new Error('Verify and link your WhatsApp identity to access account information.'), { code: 'identity-verification-required' });
    }
    const args = validateToolArguments(definition, rawArgs);
    const handler = handlers[definition.handler];
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

  return {
    definitions,
    execute,
    isReadOnly(name) { return Boolean(TOOL_DEFINITIONS[name] && TOOL_DEFINITIONS[name].stateChanging !== true); },
  };
}

module.exports = { TOOL_DEFINITIONS, createWhatsAppToolRegistry, validateToolArguments };
