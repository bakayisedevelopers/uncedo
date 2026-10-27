'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TOOL_DEFINITIONS, createWhatsAppToolRegistry } = require('./toolRegistry');

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
  assert.equal(result.services[0].priceRange, null);
  assert.equal('pricing' in result.services[0], false);
  assert.equal('createdBy' in result.services[0], false);
  assert.equal('pricing' in TOOL_DEFINITIONS.listAvailableServices.outputSchema.properties.services.items.properties, false);
  assert.equal('priceRange' in TOOL_DEFINITIONS.listAvailableServices.outputSchema.properties.services.items.properties, true);
});

test('explicit service price lookup returns only a configured min-max total range', async () => {
  const pricedServices = [{
    ...services[0],
    pricing: { currency: 'ZAR', basePrice: 100, materialFee: 30, minimumTotal: 250, maximumTotal: 900 },
  }];
  const registry = createWhatsAppToolRegistry({ getCatalogEntries: async () => pricedServices });
  const result = await registry.execute('getServicePricingInformation', { serviceId: 'wash' }, { kind: 'guest' });
  assert.deepEqual(result.priceRange, { currency: 'ZAR', minimum: 250, maximum: 900 });
  assert.equal('basePrice' in result, false);
  assert.equal('materialFee' in result, false);

  const noRangeRegistry = createWhatsAppToolRegistry({ getCatalogEntries: async () => services });
  const noRange = await noRangeRegistry.execute('getServicePricingInformation', { serviceId: 'wash' }, { kind: 'guest' });
  assert.equal(noRange.priceRange, null);

  const listed = await registry.execute('listAvailableServices', {}, { kind: 'guest' });
  assert.deepEqual(listed.services[0].priceRange, { currency: 'ZAR', minimum: 250, maximum: 900 });
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

test('read tools reject fields outside the minimized booking, wallet, and payout projections', async () => {
  const authorization = { uid: 'helper-1', role: 'helper', linked: true, verified: true, helperVerified: true };
  const validBooking = {
    requestId: 'request-123', summary: 'Car wash', status: 'completed', statusLabel: 'Completed',
    helperName: 'Alex', createdAtMs: null,
  };
  const bookings = createWhatsAppToolRegistry({ handlers: {
    listMyBookings: async () => ({ bookings: [validBooking] }),
  } });
  assert.equal((await bookings.execute('listMyBookings', {}, { role: 'helper', authorization })).bookings.length, 1);

  const leakedBooking = createWhatsAppToolRegistry({ handlers: {
    listMyBookings: async () => ({ bookings: [{ ...validBooking, serviceAddress: 'private address' }] }),
  } });
  await assert.rejects(leakedBooking.execute('listMyBookings', {}, { role: 'helper', authorization }), { code: 'tool-output-invalid' });

  const validWalletEntry = {
    entryType: 'commission_deduction', amountMinor: 100, availableDeltaMinor: -100,
    outstandingCommissionDeltaMinor: 0, description: 'Commission collected', createdAtMs: 1000,
  };
  const wallet = createWhatsAppToolRegistry({ handlers: {
    listMyWalletTransactions: async () => ({ transactions: [validWalletEntry] }),
  } });
  assert.equal((await wallet.execute('listMyWalletTransactions', { limit: 5 }, { role: 'helper', authorization })).transactions.length, 1);
  const leakedWallet = createWhatsAppToolRegistry({ handlers: {
    listMyWalletTransactions: async () => ({ transactions: [{ ...validWalletEntry, payoutId: 'private-operation-id' }] }),
  } });
  await assert.rejects(leakedWallet.execute('listMyWalletTransactions', { limit: 5 }, { role: 'helper', authorization }), { code: 'tool-output-invalid' });

  const validPayout = {
    status: 'pending', amount: 120, currency: 'ZAR', periodStart: '', periodEnd: '', weekKey: '2026-W42',
    scheduledAtMs: null, reason: '',
  };
  const payouts = createWhatsAppToolRegistry({ handlers: {
    getMyPayoutStatus: async () => ({ payouts: [validPayout] }),
  } });
  assert.equal((await payouts.execute('getMyPayoutStatus', {}, { role: 'helper', authorization })).payouts.length, 1);
  const leakedPayout = createWhatsAppToolRegistry({ handlers: {
    getMyPayoutStatus: async () => ({ payouts: [{ ...validPayout, payoutId: 'private-operation-id' }] }),
  } });
  await assert.rejects(leakedPayout.execute('getMyPayoutStatus', {}, { role: 'helper', authorization }), { code: 'tool-output-invalid' });
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

test('helper offer and earnings tools are read-only, helper-only, and require a verified helper identity', async () => {
  const registry = createWhatsAppToolRegistry({ handlers: {
    listMyAvailableOffers: async (_args, context) => ({ offers: [{ serviceSummary: 'Car wash', amount: 350, currency: 'ZAR', expiresAtMs: 1000 }] }),
    getMyEarningsSummary: async (_args, context) => ({
      currency: 'ZAR', availableWalletMinor: 1200, reservedWalletMinor: 300, outstandingCommissionMinor: 50,
      recentPeriods: [{ weekKey: '2026-W42', status: 'pending', completedJobs: 2, helperAmount: 300, platformAmount: 30, paidAtMs: null, scheduledAtMs: null }],
    }),
  } });
  const auth = { uid: 'helper-1', role: 'helper', linked: true, verified: true, helperVerified: true };
  await assert.rejects(registry.execute('listMyAvailableOffers', {}, { role: 'customer', authorization: { ...auth, role: 'customer' } }), { code: 'tool-permission-denied' });
  await assert.rejects(registry.execute('getMyEarningsSummary', {}, { role: 'helper', authorization: { ...auth, helperVerified: false } }), { code: 'helper-verification-required' });
  const offers = await registry.execute('listMyAvailableOffers', {}, { role: 'helper', authorization: auth });
  const earnings = await registry.execute('getMyEarningsSummary', {}, { role: 'helper', authorization: auth });
  assert.equal(offers.offers[0].serviceSummary, 'Car wash');
  assert.equal(earnings.recentPeriods[0].helperAmount, 300);
  assert.equal(registry.isReadOnly('listMyAvailableOffers'), true);
  assert.equal(registry.isReadOnly('getMyEarningsSummary'), true);
  assert.equal(registry.definitions({ authorization: { role: 'guest' } }).some((tool) => tool.name === 'listMyAvailableOffers'), false);
});

test('registry exposes the existing fourteen approved tools plus the two read-only helper tools', () => {
  const registry = createWhatsAppToolRegistry();
  const tools = registry.definitions({ authorization: { role: 'helper' } });
  assert.equal(Object.keys(TOOL_DEFINITIONS).length, 16);
  assert.equal(tools.length, 15);
  assert.ok(tools.some((tool) => tool.name === 'listMyAvailableOffers'));
  assert.ok(tools.some((tool) => tool.name === 'getMyEarningsSummary'));
  assert.equal(tools.filter((tool) => tool.stateChanging).length, 2);
});
