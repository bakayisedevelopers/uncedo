'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createWhatsAppToolRegistry } = require('./toolRegistry');

const services = [
  {
    id: 'wash', categoryId: 'car_wash', categoryName: 'Car wash', label: 'Full wash',
    description: 'An approved vehicle wash service.', type: 'service', active: true, approved: true,
    includedServiceIds: [], pricing: { pricingMode: 'fixed', basePrice: 100, materialFee: 0, minimumTotal: 0 },
    questionnaire: { required: [{ id: 'vehicle_type', prompt: 'Vehicle type?', required: true, answerType: 'enum', options: [{ value: 'sedan', label: 'Sedan' }] }], optional: [] },
  },
  {
    id: 'hidden', categoryId: 'car_wash', label: 'Hidden', description: '', type: 'service', active: false, approved: true,
    includedServiceIds: [], pricing: {}, questionnaire: { required: [], optional: [] },
  },
];

test('public catalogue tools expose only active approved services and no internal fields', async () => {
  const registry = createWhatsAppToolRegistry({ getCatalogEntries: async () => services });
  const result = await registry.execute('listAvailableServices', {}, { kind: 'guest' });
  assert.deepEqual(result.services.map((service) => service.id), ['wash']);
  assert.equal(result.services[0].pricing.basePrice, 100);
  assert.equal('createdBy' in result.services[0], false);
});

test('tool input rejects unknown fields, unknown services and unsupported tools', async () => {
  const registry = createWhatsAppToolRegistry({ getCatalogEntries: async () => services });
  await assert.rejects(registry.execute('listAvailableServices', { uid: 'forged' }, { kind: 'guest' }), /unsupported fields/);
  await assert.rejects(registry.execute('getServiceDetails', { serviceId: 'made_up' }, { kind: 'guest' }), { code: 'service-not-found' });
  await assert.rejects(registry.execute('confirmServiceRequest', {}, { kind: 'guest' }), /not available/);
});

test('questionnaire tool returns exact active service question IDs and validates them', async () => {
  const registry = createWhatsAppToolRegistry({ getCatalogEntries: async () => services });
  const questionnaire = await registry.execute('getServiceQuestionnaire', { serviceId: 'wash' }, { kind: 'guest' });
  assert.deepEqual(questionnaire.questions.map((question) => question.id), ['vehicle_type']);
  assert.deepEqual(await registry.validateServiceAnswers({ serviceId: 'wash', answers: { vehicle_type: 'sedan' } }), {
    answers: { vehicle_type: 'sedan' }, missingRequired: [],
  });
  await assert.rejects(registry.validateServiceAnswers({ serviceId: 'wash', answers: { vehicle_type: 'truck' } }), /Invalid option/);
});

test('account tools are role scoped and require an independently verified linked identity', async () => {
  let profileReads = 0;
  const registry = createWhatsAppToolRegistry({ handlers: { getMyProfile: async (_args, context) => { profileReads += 1; return { firstName: context.authorization.uid }; } } });
  await assert.rejects(registry.execute('getMyProfile', {}, { role: 'customer', authorization: { uid: 'forged-uid', role: 'customer', linked: false, verified: false } }), { code: 'identity-verification-required' });
  await assert.rejects(registry.execute('getMyWalletSummary', {}, { role: 'customer', authorization: { uid: 'uid', role: 'customer', linked: true, verified: true } }), { code: 'tool-permission-denied' });
  const result = await registry.execute('getMyProfile', {}, { role: 'customer', authorization: { uid: 'verified-uid', role: 'customer', linked: true, verified: true } });
  assert.deepEqual(result, { firstName: 'verified-uid' });
  assert.equal(profileReads, 1);
});

test('helper financial tools require verified helper status and profile changes cannot target privileged fields', async () => {
  const registry = createWhatsAppToolRegistry({ handlers: { getMyWalletSummary: async () => ({ availableMinor: 1200 }) } });
  await assert.rejects(registry.execute('getMyWalletSummary', {}, { role: 'helper', authorization: { uid: 'helper-1', role: 'helper', linked: true, verified: true, helperVerified: false } }), { code: 'helper-verification-required' });
  assert.deepEqual(await registry.execute('getMyWalletSummary', {}, { role: 'helper', authorization: { uid: 'helper-1', role: 'helper', linked: true, verified: true, helperVerified: true } }), { availableMinor: 1200 });
  await assert.rejects(registry.execute('proposeProfileChange', { field: 'role', value: 'admin' }, { role: 'customer', authorization: { uid: 'uid', role: 'customer', linked: true, verified: true } }), /Only first name or surname/);
});

test('tool definitions expose only role-appropriate tools and bounded inputs', () => {
  const registry = createWhatsAppToolRegistry();
  const guestTools = registry.definitions({ authorization: { role: 'guest' } });
  assert.equal(guestTools.some((tool) => tool.name === 'getMyWalletSummary'), false);
  assert.equal(guestTools.some((tool) => tool.name === 'getSupportKnowledge'), true);
  const helperTools = registry.definitions({ authorization: { role: 'helper' } });
  const change = helperTools.find((tool) => tool.name === 'proposeProfileChange');
  assert.deepEqual(change.inputSchema.properties.field.enum, ['firstName', 'lastName']);
  assert.equal(change.stateChanging, true);
  assert.ok(helperTools.every((tool) => tool.canonicalBackend && tool.outputSchema?.type === 'object'));
});

test('tool output rejects undeclared fields that could expose backend secrets', async () => {
  const registry = createWhatsAppToolRegistry({
    handlers: { getMyProfile: async () => ({ firstName: 'Customer', authorizationCode: 'private-provider-value' }) },
  });
  await assert.rejects(registry.execute('getMyProfile', {}, {
    role: 'customer',
    authorization: { uid: 'customer-1', role: 'customer', linked: true, verified: true },
  }), { code: 'tool-output-invalid' });
});

test('human escalation requires a user request, a recognized issue, or a backend knowledge miss', async () => {
  const registry = createWhatsAppToolRegistry({
    handlers: { requestHumanSupport: async () => ({ code: 'handed_off', ticketId: 'wa_support_123', duplicate: false }) },
  });
  const authorization = { role: 'guest', verified: false, linked: false };
  await assert.rejects(registry.execute('requestHumanSupport', { reason: 'General question' }, { role: 'guest', authorization, originalUserText: 'What is Uncedo?' }), { code: 'escalation-not-authorized' });
  const result = await registry.execute('requestHumanSupport', { reason: 'Please help' }, { role: 'guest', authorization, originalUserText: 'I want to talk to a person.' });
  assert.equal(result.code, 'handed_off');
  const backendEscalation = await registry.execute('requestHumanSupport', { reason: 'No approved answer' }, { role: 'guest', authorization, escalationRequired: true });
  assert.equal(backendEscalation.code, 'handed_off');
});
