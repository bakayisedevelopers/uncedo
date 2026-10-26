'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MetaTemplateError,
  buildUncedoTemplateCatalogue,
  createMetaTemplateManager,
  generateFirebaseConfiguration,
  toPreviewJSON,
  validateExistingTemplate,
  validateTemplateDefinition,
} = require('./templateManagement');
const { main: runCli, parseArguments } = require('../scripts/manage-whatsapp-templates');

const credentials = {
  wabaId: '123456789012345',
  accessToken: 'mock-secret-token',
  graphApiVersion: 'v99.0',
};

test('catalogue includes minimal current contracts for OTP, offers, support, lifecycle, and cash', () => {
  const catalogue = buildUncedoTemplateCatalogue({ languageCode: 'en_US' });
  assert.deepEqual(catalogue.map(({ name }) => name), [
    'uncedo_auth_otp', 'uncedo_helper_offer', 'uncedo_support_reply', 'uncedo_service_update', 'uncedo_cash_confirmation',
  ]);
  assert.equal(catalogue[0].category, 'AUTHENTICATION');
  assert.equal(catalogue[0].components.at(-1).buttons[0].otp_type, 'COPY_CODE');
  assert.deepEqual(catalogue[1].senderContract.quickReplyButtons, ['Accept', 'Decline']);
  assert.equal(catalogue[1].components.at(-1).buttons.length, 2);
  assert.equal(catalogue[4].senderContract.bodyParameterCount, 2);
  assert.deepEqual(catalogue[4].senderContract.quickReplyButtons, []);
  for (const template of catalogue) assert.equal(validateTemplateDefinition(template).valid, true);
});

test('cash template instructions match the helper text command without adding unsupported buttons', () => {
  const cash = buildUncedoTemplateCatalogue().find(({ name }) => name === 'uncedo_cash_confirmation');
  const body = cash.components[0].text;
  assert.match(body, /\{\{1\}\}.*\{\{2\}\}/);
  assert.match(body, /cash received request/);
  assert.match(body, /cash not received request/);
  assert.equal(cash.components.some(({ type }) => type === 'BUTTONS'), false);
});

test('definition validation rejects wrong language, parameter order, and helper button order', () => {
  assert.throws(() => buildUncedoTemplateCatalogue({ languageCode: 'EN-us' }), /language code/);
  const [auth, offer] = buildUncedoTemplateCatalogue();
  assert.throws(() => validateTemplateDefinition({ ...auth, language: 'invalid' }), /language code/);
  assert.throws(() => validateTemplateDefinition({
    ...offer,
    components: [
      { ...offer.components[0], text: 'New request {{2}} costs {{1}}.' },
      offer.components[1],
    ],
  }), /parameter ordering/);
  assert.throws(() => validateTemplateDefinition({
    ...offer,
    components: [offer.components[0], {
      type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Decline' }, { type: 'QUICK_REPLY', text: 'Accept' }],
    }],
  }), /button order/);
});

test('definition validation rejects body variables at the first or last position', () => {
  const catalogue = buildUncedoTemplateCatalogue();
  const support = catalogue.find(({ name }) => name === 'uncedo_support_reply');
  const serviceUpdate = catalogue.find(({ name }) => name === 'uncedo_service_update');
  assert.throws(() => validateTemplateDefinition({
    ...support,
    components: [{ ...support.components[0], text: 'Uncedo update: {{1}}' }],
  }), /cannot start or end/);
  assert.throws(() => validateTemplateDefinition({
    ...serviceUpdate,
    components: [{ ...serviceUpdate.components[0], text: '{{1}} update {{2}}' }],
  }), /cannot start or end/);
});

test('existing template compatibility validates approval payload structure, OTP button, and quick replies', () => {
  const catalogue = buildUncedoTemplateCatalogue();
  const authResult = validateExistingTemplate({
    ...catalogue[0], status: 'APPROVED',
  }, catalogue[0]);
  assert.equal(authResult.compatible, true);
  const offerResult = validateExistingTemplate({
    ...catalogue[1], status: 'APPROVED',
  }, catalogue[1]);
  assert.equal(offerResult.compatible, true);
  const wrongOffer = validateExistingTemplate({
    ...catalogue[1],
    components: [catalogue[1].components[0], {
      type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Decline' }, { type: 'QUICK_REPLY', text: 'Accept' }],
    }],
  }, catalogue[1]);
  assert.equal(wrongOffer.compatible, false);
  assert.ok(wrongOffer.errors.includes('button_0'));
});

test('preview is JSON and explicitly states that it performs no Meta request', () => {
  const preview = JSON.parse(toPreviewJSON(buildUncedoTemplateCatalogue()));
  assert.equal(preview.mode, 'preview-only');
  assert.match(preview.note, /No Meta endpoint was contacted/);
  assert.equal(preview.templates.length, 5);
});

test('CLI preview needs no cloud credentials and approval submission requires an exact target WABA', async () => {
  let output = '';
  await runCli(['--preview'], {}, { write: (value) => { output += value; } });
  assert.equal(JSON.parse(output).templates.length, 5);
  const parsed = parseArguments(['--submit', '--approve-template', 'uncedo_helper_offer', '--confirm-waba', '123456789012345']);
  assert.equal(parsed.mode, 'submit');
  assert.deepEqual(parsed.approvedNames, ['uncedo_helper_offer']);
  assert.equal(parsed.confirmWaba, '123456789012345');
  assert.throws(() => parseArguments(['--submit', '--approve-template']), /exact template name/);
});

test('template listing handles cursor pagination and keeps the bearer token out of URLs', async () => {
  const requests = [];
  const manager = createMetaTemplateManager({
    ...credentials,
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      const page = requests.length === 1
        ? { data: [{ name: 'one', status: 'APPROVED' }], paging: { next: 'opaque-next', cursors: { after: 'cursor-1' } } }
        : { data: [{ name: 'two', status: 'PENDING' }] };
      return { ok: true, status: 200, json: async () => page };
    },
  });
  const result = await manager.listTemplates({ pageSize: 1 });
  assert.deepEqual(result.map(({ name }) => name), ['one', 'two']);
  assert.match(requests[0].url, /\/v99\.0\/123456789012345\/message_templates/);
  assert.match(requests[1].url, /after=cursor-1/);
  assert.doesNotMatch(requests[0].url, /mock-secret-token/);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer mock-secret-token');
});

test('GET listing retries a rate limit using bounded backoff', async () => {
  let calls = 0;
  const delays = [];
  const manager = createMetaTemplateManager({
    ...credentials,
    sleep: async (ms) => delays.push(ms),
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return {
        ok: false, status: 429, headers: { get: () => '2' },
        json: async () => ({ error: { code: 613, message: 'do not expose this response text' } }),
      };
      return { ok: true, status: 200, json: async () => ({ data: [] }) };
    },
  });
  assert.deepEqual(await manager.listTemplates(), []);
  assert.equal(calls, 2);
  assert.deepEqual(delays, [2000]);
});

test('Meta errors are sanitized and never include credentials or raw provider messages', async () => {
  const manager = createMetaTemplateManager({
    ...credentials,
    fetchImpl: async () => ({
      ok: false, status: 403, headers: { get: () => null },
      json: async () => ({ error: { code: 10, error_subcode: 2, message: 'mock-secret-token leaked by provider', fbtrace_id: 'trace-1' } }),
    }),
  });
  await assert.rejects(manager.listTemplates(), (error) => {
    assert.ok(error instanceof MetaTemplateError);
    assert.equal(JSON.stringify(error.toSafeJSON()).includes('mock-secret-token'), false);
    assert.equal(JSON.stringify(error.toSafeJSON()).includes('leaked by provider'), false);
    assert.equal(error.metaCode, '10');
    return true;
  });
});

test('submission requires explicit exact-name approval and submits only approved missing templates', async () => {
  const catalogue = buildUncedoTemplateCatalogue();
  const requests = [];
  const manager = createMetaTemplateManager({
    ...credentials,
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      if (options.method === 'GET') return { ok: true, status: 200, json: async () => ({ data: [] }) };
      return { ok: true, status: 200, json: async () => ({ id: 'template-id-1', status: 'PENDING' }) };
    },
  });
  await assert.rejects(manager.submitMissingTemplates({ catalogue }), /Explicit approval/);
  const results = await manager.submitMissingTemplates({
    catalogue,
    approvedTemplateNames: ['uncedo_helper_offer'],
    existingTemplates: [],
  });
  assert.equal(results.find(({ name }) => name === 'uncedo_helper_offer').outcome, 'submitted');
  assert.equal(results.filter(({ outcome }) => outcome === 'submitted').length, 1);
  const post = requests.find(({ options }) => options.method === 'POST');
  assert.ok(post);
  assert.equal(post.options.headers.Authorization, 'Bearer mock-secret-token');
  const payload = JSON.parse(post.options.body);
  assert.equal(payload.name, 'uncedo_helper_offer');
  assert.deepEqual(payload.components[1].buttons.map(({ text }) => text), ['Accept', 'Decline']);
});

test('submission never duplicates or silently replaces existing rejected/incompatible templates', async () => {
  const catalogue = buildUncedoTemplateCatalogue();
  let postCount = 0;
  const manager = createMetaTemplateManager({
    ...credentials,
    fetchImpl: async (_url, options) => {
      if (options.method === 'POST') postCount += 1;
      return { ok: true, status: 200, json: async () => ({ data: [] }) };
    },
  });
  const results = await manager.submitMissingTemplates({
    catalogue,
    approvedTemplateNames: ['uncedo_service_update'],
    existingTemplates: [{
      name: 'uncedo_service_update', language: 'en_US', status: 'REJECTED', category: 'UTILITY',
      components: catalogue[3].components,
    }],
  });
  assert.equal(results.find(({ name }) => name === 'uncedo_service_update').outcome, 'existing-rejected');
  assert.equal(postCount, 0);
});

test('Firebase config output includes only compatible approved templates', () => {
  const catalogue = buildUncedoTemplateCatalogue();
  const existing = [
    { ...catalogue[0], status: 'APPROVED' },
    { ...catalogue[1], status: 'APPROVED' },
    { ...catalogue[2], status: 'PENDING' },
    { ...catalogue[3], status: 'APPROVED' },
    { ...catalogue[4], status: 'APPROVED' },
  ];
  const generated = generateFirebaseConfiguration(catalogue, existing);
  assert.deepEqual(generated.approvedNames, ['uncedo_auth_otp', 'uncedo_cash_confirmation', 'uncedo_helper_offer', 'uncedo_service_update']);
  assert.match(generated.text, /^APPROVED_TEMPLATE_NAMES=uncedo_auth_otp,uncedo_cash_confirmation,uncedo_helper_offer,uncedo_service_update$/m);
  assert.match(generated.text, /^WHATSAPP_TEMPLATE_PAYMENT_REQUIRED_NAME=uncedo_service_update$/m);
  assert.match(generated.text, /^WHATSAPP_SUPPORT_REPLY_TEMPLATE_NAME=$/m);
  assert.doesNotMatch(generated.text, /uncedo_support_reply/);
});
