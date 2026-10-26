'use strict';

const GRAPH_API_BASE = 'https://graph.facebook.com';
const TEMPLATE_FIELDS = 'id,name,status,category,language,components';
const MAX_PAGES = 100;
const MAX_RETRIES = 3;

const TEMPLATE_BINDINGS = Object.freeze({
  uncedo_auth_otp: Object.freeze([
    ['WHATSAPP_AUTH_TEMPLATE_NAME', 'WHATSAPP_AUTH_TEMPLATE_LANGUAGE'],
  ]),
  uncedo_helper_offer: Object.freeze([
    ['WHATSAPP_HELPER_OFFER_TEMPLATE_NAME', 'WHATSAPP_HELPER_OFFER_TEMPLATE_LANGUAGE'],
  ]),
  uncedo_support_reply: Object.freeze([
    ['WHATSAPP_SUPPORT_REPLY_TEMPLATE_NAME', 'WHATSAPP_SUPPORT_REPLY_TEMPLATE_LANGUAGE'],
  ]),
  uncedo_service_update: Object.freeze([
    ['WHATSAPP_TEMPLATE_BOOKING_CONFIRMED_NAME', 'WHATSAPP_TEMPLATE_BOOKING_CONFIRMED_LANGUAGE'],
    ['WHATSAPP_TEMPLATE_HELPER_ASSIGNED_NAME', 'WHATSAPP_TEMPLATE_HELPER_ASSIGNED_LANGUAGE'],
    ['WHATSAPP_TEMPLATE_HELPER_ON_THE_WAY_NAME', 'WHATSAPP_TEMPLATE_HELPER_ON_THE_WAY_LANGUAGE'],
    ['WHATSAPP_TEMPLATE_SERVICE_STARTED_NAME', 'WHATSAPP_TEMPLATE_SERVICE_STARTED_LANGUAGE'],
    ['WHATSAPP_TEMPLATE_SERVICE_COMPLETED_NAME', 'WHATSAPP_TEMPLATE_SERVICE_COMPLETED_LANGUAGE'],
    ['WHATSAPP_TEMPLATE_BOOKING_CANCELED_NAME', 'WHATSAPP_TEMPLATE_BOOKING_CANCELED_LANGUAGE'],
    ['WHATSAPP_TEMPLATE_PAYMENT_CONFIRMED_NAME', 'WHATSAPP_TEMPLATE_PAYMENT_CONFIRMED_LANGUAGE'],
    ['WHATSAPP_TEMPLATE_PAYMENT_REQUIRED_NAME', 'WHATSAPP_TEMPLATE_PAYMENT_REQUIRED_LANGUAGE'],
  ]),
  uncedo_cash_confirmation: Object.freeze([
    ['WHATSAPP_CASH_CONFIRMATION_TEMPLATE_NAME', 'WHATSAPP_CASH_CONFIRMATION_TEMPLATE_LANGUAGE'],
  ]),
});

class MetaTemplateError extends Error {
  constructor(message, { status = 0, code = '', subcode = '', fbtraceId = '', retryable = false, category = 'unknown', networkCode = '' } = {}) {
    super(message);
    this.name = 'MetaTemplateError';
    this.status = status;
    this.metaCode = String(code || '');
    this.metaSubcode = String(subcode || '');
    this.fbtraceId = String(fbtraceId || '');
    this.retryable = Boolean(retryable);
    this.category = String(category || 'unknown');
    this.networkCode = /^[A-Z0-9_]{2,40}$/i.test(String(networkCode || '')) ? String(networkCode) : '';
  }

  toSafeJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      metaCode: this.metaCode,
      metaSubcode: this.metaSubcode,
      fbtraceId: this.fbtraceId,
      retryable: this.retryable,
      category: this.category,
      ...(this.networkCode ? { networkCode: this.networkCode } : {}),
    };
  }
}

function classifyTemplateApiError(status, code) {
  const httpStatus = Number(status) || 0;
  const metaCode = String(code || '');
  if (httpStatus === 401 || metaCode === '190') {
    return {
      category: 'oauth_token',
      message: 'Meta rejected the access token. Check token validity, expiry, app assignment, and WABA access.',
    };
  }
  if (httpStatus === 403 || ['10', '200'].includes(metaCode)) {
    return {
      category: 'permission_or_asset_access',
      message: 'Meta denied template access. Check whatsapp_business_management permission and assignment of this WABA to the app or system user.',
    };
  }
  if (metaCode === '12') {
    return {
      category: 'graph_api_version',
      message: 'Meta rejected the Graph API version. Check that the configured version is currently supported.',
    };
  }
  if (metaCode === '100') {
    return {
      category: 'template_request',
      message: 'Meta rejected the template request. Check its components, language, category, and required fields.',
    };
  }
  if (httpStatus === 429 || ['4', '17', '32', '613'].includes(metaCode)) {
    return { category: 'rate_limit', message: 'Meta rate limited the template-management request.' };
  }
  if (httpStatus >= 500) {
    return { category: 'meta_unavailable', message: 'Meta template management is temporarily unavailable.' };
  }
  return { category: 'api_rejection', message: 'Meta rejected the template-management request.' };
}

function validateGraphApiVersion(value) {
  const version = String(value || '').trim();
  if (!/^v\d{2}\.\d$/.test(version)) throw new Error('GRAPH_API_VERSION must look like vNN.N.');
  return version;
}

function validateLanguageCode(value) {
  const language = String(value || '').trim();
  if (!/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(language)) {
    throw new Error('Template language must use a Meta language code such as en_US.');
  }
  return language;
}

function validateTemplateName(value) {
  const name = String(value || '').trim();
  if (!/^[a-z0-9_]{1,512}$/.test(name)) throw new Error('Template names must contain lowercase letters, digits, and underscores only.');
  return name;
}

function getRequiredEnvironment(env = process.env) {
  const wabaId = String(env.META_WABA_ID || '').trim();
  const accessToken = String(env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const graphApiVersion = validateGraphApiVersion(env.GRAPH_API_VERSION);
  if (!/^\d{5,30}$/.test(wabaId)) throw new Error('META_WABA_ID is missing or invalid.');
  if (!accessToken) throw new Error('WHATSAPP_ACCESS_TOKEN is missing.');
  return { wabaId, accessToken, graphApiVersion };
}

function bodyComponent(text, exampleValues) {
  return {
    type: 'BODY',
    text,
    example: { body_text: [exampleValues] },
  };
}

function buildUncedoTemplateCatalogue({ languageCode = 'en_US' } = {}) {
  const language = validateLanguageCode(languageCode);
  const catalogue = [
    {
      name: 'uncedo_auth_otp',
      language,
      category: 'AUTHENTICATION',
      purpose: 'WhatsApp one-time code delivery',
      senderContract: { bodyParameterCount: 1, quickReplyButtons: [] },
      components: [
        { type: 'BODY', add_security_recommendation: true },
        { type: 'FOOTER', code_expiration_minutes: 5 },
        { type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: 'Copy code' }] },
      ],
    },
    {
      name: 'uncedo_helper_offer',
      language,
      category: 'UTILITY',
      purpose: 'Offer a service request to a linked helper',
      senderContract: { bodyParameterCount: 2, quickReplyButtons: ['Accept', 'Decline'] },
      components: [
        bodyComponent('New Uncedo service offer: {{1}}. Indicative amount: {{2}}. Please respond within about 30 seconds.', ['Car wash', 'R250.00']),
        { type: 'BUTTONS', buttons: [
          { type: 'QUICK_REPLY', text: 'Accept' },
          { type: 'QUICK_REPLY', text: 'Decline' },
        ] },
      ],
    },
    {
      name: 'uncedo_support_reply',
      language,
      category: 'UTILITY',
      purpose: 'Deliver an administrator support reply outside the service window',
      senderContract: { bodyParameterCount: 1, quickReplyButtons: [] },
      components: [bodyComponent('Uncedo support update: {{1}}. Please reply to this message if you need further help.', ['Our team has replied to your request.'])],
    },
    {
      name: 'uncedo_service_update',
      language,
      category: 'UTILITY',
      purpose: 'Shared booking, service, and payment status update',
      senderContract: { bodyParameterCount: 2, quickReplyButtons: [] },
      components: [bodyComponent('Update for {{1}}: {{2}}. Reply to this message if you need help.', ['Car wash', 'Your helper has been assigned.'])],
    },
    {
      name: 'uncedo_cash_confirmation',
      language,
      category: 'UTILITY',
      purpose: 'Ask the assigned helper to confirm or reject reported direct payment',
      senderContract: { bodyParameterCount: 2, quickReplyButtons: [] },
      components: [bodyComponent(
        'For request {{1}}, the customer reports a direct payment of {{2}}. Reply “cash received request” or “cash not received request”, followed by the request reference shown above.',
        ['REQ-123456', 'R500.00'],
      )],
    },
  ];
  for (const template of catalogue) validateTemplateDefinition(template);
  return catalogue;
}

function countPlaceholders(text) {
  const matches = String(text || '').match(/\{\{\d+\}\}/g) || [];
  return matches.length;
}

function hasOrderedPlaceholders(text, expectedCount) {
  const matches = String(text || '').match(/\{\{(\d+)\}\}/g) || [];
  return matches.length === expectedCount
    && matches.every((match, index) => match === `{{${index + 1}}}`);
}

function getTemplateBodyText(components = []) {
  return components.find((component) => String(component?.type || '').toUpperCase() === 'BODY')?.text || '';
}

function getButtons(components = []) {
  const component = components.find((item) => String(item?.type || '').toUpperCase() === 'BUTTONS');
  return Array.isArray(component?.buttons) ? component.buttons : [];
}

function validateTemplateDefinition(template) {
  validateTemplateName(template?.name);
  validateLanguageCode(template?.language);
  const category = String(template?.category || '').toUpperCase();
  if (!['AUTHENTICATION', 'UTILITY'].includes(category)) throw new Error(`Unsupported category for ${template?.name || 'template'}.`);
  if (!Array.isArray(template?.components) || !template.components.length) throw new Error('A template must define components.');
  const body = template.components.find((component) => String(component.type || '').toUpperCase() === 'BODY');
  if (!body) throw new Error(`Template ${template.name} is missing a body component.`);
  const bodyCount = category === 'AUTHENTICATION' ? 1 : countPlaceholders(body.text);
  if (bodyCount !== Number(template.senderContract?.bodyParameterCount)) {
    throw new Error(`Body parameter count for ${template.name} does not match its sender payload.`);
  }
  if (category !== 'AUTHENTICATION' && !hasOrderedPlaceholders(body.text, bodyCount)) {
    throw new Error(`Body parameter ordering for ${template.name} does not match its sender payload.`);
  }
  if (category !== 'AUTHENTICATION' && (/^\s*\{\{\d+\}\}/.test(body.text) || /\{\{\d+\}\}\s*$/.test(body.text))) {
    throw new Error(`Template body for ${template.name} cannot start or end with a variable.`);
  }
  const buttons = getButtons(template.components);
  const expectedButtons = template.senderContract?.quickReplyButtons || [];
  const buttonTypes = buttons.map((button) => String(button.type || '').toUpperCase());
  const expectedType = category === 'AUTHENTICATION' ? ['OTP'] : expectedButtons.map(() => 'QUICK_REPLY');
  if (buttonTypes.length !== expectedType.length || buttonTypes.some((type, index) => type !== expectedType[index])) {
    throw new Error(`Button components for ${template.name} do not match the existing send payload.`);
  }
  if (expectedButtons.some((label, index) => String(buttons[index]?.text || '').trim().toLowerCase() !== String(label).toLowerCase())) {
    throw new Error(`Quick-reply button order for ${template.name} must match the backend payload.`);
  }
  if (category === 'AUTHENTICATION' && String(buttons[0]?.otp_type || '').toUpperCase() !== 'COPY_CODE') {
    throw new Error('The OTP template must use the supported COPY_CODE authentication button.');
  }
  return { valid: true, bodyParameterCount: bodyCount, buttons: buttonTypes };
}

function validateExistingTemplate(template, expected) {
  const errors = [];
  if (String(template?.name || '') !== expected.name) errors.push('name');
  if (String(template?.language || '') !== expected.language) errors.push('language');
  if (String(template?.category || '').toUpperCase() !== expected.category) errors.push('category');
  const components = Array.isArray(template?.components) ? template.components : [];
  const body = components.find((component) => String(component?.type || '').toUpperCase() === 'BODY');
  if (!body) errors.push('body_component');
  else if (expected.category !== 'AUTHENTICATION'
    && (countPlaceholders(body.text) !== expected.senderContract.bodyParameterCount
      || !hasOrderedPlaceholders(body.text, expected.senderContract.bodyParameterCount))) errors.push('body_parameter_count_or_order');
  const actualButtons = getButtons(components);
  const desiredButtons = expected.senderContract.quickReplyButtons || [];
  if (expected.category === 'AUTHENTICATION') {
    const otpButton = actualButtons[0];
    if (actualButtons.length !== 1
      || String(otpButton?.type || '').toUpperCase() !== 'OTP'
      || String(otpButton?.otp_type || '').toUpperCase() !== 'COPY_CODE') errors.push('otp_button');
    if (!body) errors.push('authentication_body');
  } else {
    if (actualButtons.length !== desiredButtons.length) errors.push('button_count');
    else {
      for (let index = 0; index < desiredButtons.length; index += 1) {
        if (String(actualButtons[index]?.type || '').toUpperCase() !== 'QUICK_REPLY'
          || String(actualButtons[index]?.text || '').trim().toLowerCase() !== desiredButtons[index].toLowerCase()) {
          errors.push(`button_${index}`);
        }
      }
    }
  }
  return { compatible: errors.length === 0, errors };
}

function isRateLimited(status, metaCode) {
  return Number(status) === 429 || ['4', '17', '32', '613'].includes(String(metaCode || ''));
}

function parseRetryAfter(response, attempt) {
  const header = Number(response?.headers?.get?.('retry-after'));
  if (Number.isFinite(header) && header >= 0) return Math.min(header * 1000, 30_000);
  return Math.min(500 * (2 ** attempt), 8_000);
}

function createMetaTemplateManager({
  wabaId,
  accessToken,
  graphApiVersion,
  fetchImpl = globalThis.fetch,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  maxRetries = MAX_RETRIES,
}) {
  const accountId = String(wabaId || '').trim();
  const token = String(accessToken || '').trim();
  const version = validateGraphApiVersion(graphApiVersion);
  if (!/^\d{5,30}$/.test(accountId)) throw new Error('A valid WhatsApp Business Account ID is required.');
  if (!token) throw new Error('A Meta access token is required.');
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable in this Node.js runtime.');
  const endpoint = `${GRAPH_API_BASE}/${version}/${encodeURIComponent(accountId)}/message_templates`;

  async function request({ method = 'GET', query = {}, body = null, retryGet = true } = {}) {
    const url = new URL(endpoint);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    let attempt = 0;
    while (true) {
      let response;
      try {
        response = await fetchImpl(url.toString(), {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(20_000),
        });
      } catch (error) {
        if (method === 'GET' && retryGet && attempt < maxRetries) {
          await sleep(Math.min(500 * (2 ** attempt), 8_000));
          attempt += 1;
          continue;
        }
        const networkCode = String(error?.cause?.code || error?.code || '');
        throw new MetaTemplateError(method === 'POST'
          ? 'Meta did not return a definite template submission result; check the WABA before retrying.'
          : `Unable to reach the Meta Graph API${/^[A-Z0-9_]{2,40}$/i.test(networkCode) ? ` (${networkCode})` : ''}.`, {
          retryable: method === 'GET',
          category: 'network',
          networkCode,
        });
      }

      let result = null;
      try { result = await response.json(); } catch { /* response body is intentionally not logged */ }
      const metaError = result?.error || {};
      const limited = isRateLimited(response.status, metaError.code);
      const transient = response.status >= 500;
      if (response.ok) return result || {};
      if (method === 'GET' && retryGet && (limited || transient) && attempt < maxRetries) {
        await sleep(parseRetryAfter(response, attempt));
        attempt += 1;
        continue;
      }
      const diagnosis = classifyTemplateApiError(response.status, metaError.code);
      throw new MetaTemplateError(diagnosis.message, {
        status: Number(response.status || 0),
        code: metaError.code,
        subcode: metaError.error_subcode,
        fbtraceId: metaError.fbtrace_id,
        retryable: method === 'GET' && (limited || transient),
        category: diagnosis.category,
      });
    }
  }

  async function listTemplates({ pageSize = 100, maxPages = MAX_PAGES, filters = {} } = {}) {
    const normalizedPageSize = Math.max(1, Math.min(Number(pageSize) || 100, 100));
    const normalizedMaxPages = Math.max(1, Math.min(Number(maxPages) || MAX_PAGES, MAX_PAGES));
    const records = [];
    let after = '';
    for (let page = 0; page < normalizedMaxPages; page += 1) {
      const response = await request({
        method: 'GET',
        query: { fields: TEMPLATE_FIELDS, limit: normalizedPageSize, ...(after ? { after } : {}) },
      });
      records.push(...(Array.isArray(response.data) ? response.data : []));
      const cursor = String(response?.paging?.cursors?.after || '');
      const hasNext = Boolean(response?.paging?.next);
      if (!hasNext) return filterTemplates(records, filters);
      if (!cursor || cursor === after) throw new MetaTemplateError('Meta pagination did not provide a usable cursor.');
      if (page === normalizedMaxPages - 1) throw new MetaTemplateError('Template listing exceeded the configured page safety limit.');
      after = cursor;
    }
    return filterTemplates(records, filters);
  }

  async function submitMissingTemplates({ catalogue, approvedTemplateNames = [], existingTemplates = null }) {
    const approved = new Set((Array.isArray(approvedTemplateNames) ? approvedTemplateNames : [])
      .map((name) => String(name || '').trim()).filter(Boolean));
    if (!approved.size) throw new Error('Explicit approval of at least one exact template name is required before submission.');
    const current = Array.isArray(existingTemplates) ? existingTemplates : await listTemplates();
    const results = [];
    for (const template of catalogue || []) {
      validateTemplateDefinition(template);
      if (!approved.has(template.name)) {
        results.push({ name: template.name, language: template.language, outcome: 'approval-required' });
        continue;
      }
      const match = current.find((record) => String(record?.name || '') === template.name
        && String(record?.language || '') === template.language);
      if (match) {
        const compatibility = validateExistingTemplate(match, template);
        results.push({
          name: template.name,
          language: template.language,
          outcome: compatibility.compatible && String(match.status || '').toUpperCase() === 'APPROVED'
            ? 'already-approved'
            : compatibility.compatible ? `existing-${String(match.status || 'unknown').toLowerCase()}` : 'existing-incompatible',
          status: String(match.status || 'UNKNOWN').toUpperCase(),
          compatibility,
        });
        continue;
      }
      const response = await request({
        method: 'POST',
        retryGet: false,
        body: {
          name: template.name,
          language: template.language,
          category: template.category,
          components: template.components,
        },
      });
      results.push({
        name: template.name,
        language: template.language,
        outcome: 'submitted',
        id: String(response.id || ''),
        status: String(response.status || 'PENDING').toUpperCase(),
      });
    }
    return results;
  }

  return Object.freeze({ listTemplates, submitMissingTemplates });
}

function filterTemplates(records, filters = {}) {
  const name = String(filters.name || '').trim();
  const status = String(filters.status || '').trim().toUpperCase();
  const language = String(filters.language || '').trim();
  const category = String(filters.category || '').trim().toUpperCase();
  return records.filter((template) => (!name || template.name === name)
    && (!status || String(template.status || '').toUpperCase() === status)
    && (!language || String(template.language || '') === language)
    && (!category || String(template.category || '').toUpperCase() === category));
}

function generateFirebaseConfiguration(catalogue, existingTemplates) {
  const compatibleApproved = (catalogue || []).filter((expected) => {
    const actual = (existingTemplates || []).find((record) => record.name === expected.name && record.language === expected.language);
    return actual
      && String(actual.status || '').toUpperCase() === 'APPROVED'
      && validateExistingTemplate(actual, expected).compatible;
  });
  const approvedNames = compatibleApproved.map((template) => template.name).sort();
  const approvedSet = new Set(approvedNames);
  const lines = [
    '# Generated by functions/scripts/manage-whatsapp-templates.js --check.',
    '# Review before copying into functions/.env; this output includes only compatible APPROVED templates.',
    `APPROVED_TEMPLATE_NAMES=${approvedNames.join(',')}`,
  ];
  for (const [templateName, bindings] of Object.entries(TEMPLATE_BINDINGS)) {
    const usable = approvedSet.has(templateName);
    const language = usable ? compatibleApproved.find((item) => item.name === templateName).language : '';
    for (const [nameKey, languageKey] of bindings) {
      lines.push(`${nameKey}=${usable ? templateName : ''}`);
      lines.push(`${languageKey}=${language}`);
    }
  }
  return { approvedNames, compatibleApproved, text: lines.join('\n') };
}

function toPreviewJSON(catalogue) {
  return JSON.stringify({
    mode: 'preview-only',
    note: 'Proposed payloads only. No Meta endpoint was contacted and no templates were submitted.',
    templates: catalogue.map(({ name, language, category, purpose, senderContract, components }) => ({
      name, language, category, purpose, senderContract, components,
    })),
  }, null, 2);
}

module.exports = {
  MetaTemplateError,
  TEMPLATE_BINDINGS,
  buildUncedoTemplateCatalogue,
  classifyTemplateApiError,
  createMetaTemplateManager,
  generateFirebaseConfiguration,
  getRequiredEnvironment,
  toPreviewJSON,
  validateExistingTemplate,
  validateGraphApiVersion,
  validateLanguageCode,
  validateTemplateDefinition,
};
