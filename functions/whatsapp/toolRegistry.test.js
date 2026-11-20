'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TOOL_DEFINITIONS, createWhatsAppToolRegistry } = require('./toolRegistry');

const linkedCustomer = { uid: 'customer-1', role: 'customer', linked: true, verified: true };
const linkedHelper = { uid: 'helper-1', role: 'helper', linked: true, verified: true, helperVerified: true };

test('guests get profile/account lookup and service tools while linked customers and helpers also get confirmed name change and helper application tool', () => {
  const registry = createWhatsAppToolRegistry();
  const linkedCustomerNames = ['getMyProfile', 'proposeProfileChange', 'getAvailableServices', 'sendServicesToUser', 'getServiceDetails', 'initiateServiceBooking', 'cancelServiceRequest'];
  const linkedHelperNames = ['getMyProfile', 'proposeProfileChange', 'getAvailableServices', 'sendServicesToUser', 'getServiceDetails', 'initiateServiceBooking', 'applyForHelperService'];
  assert.deepEqual(Object.keys(TOOL_DEFINITIONS), ['getMyProfile', 'checkMyAccountByWhatsAppNumber', 'proposeProfileChange', 'getAvailableServices', 'sendServicesToUser', 'getServiceDetails', 'initiateServiceBooking', 'applyForHelperService', 'relayMessageToHelper', 'cancelServiceRequest']);
  const guestTools = registry.definitions({ identity: { guestPrincipalId: 'guest-1' }, authorization: { role: 'guest' } });
  assert.deepEqual(guestTools.map((tool) => tool.name), ['getMyProfile', 'checkMyAccountByWhatsAppNumber', 'getAvailableServices', 'sendServicesToUser', 'getServiceDetails', 'initiateServiceBooking', 'cancelServiceRequest']);
  assert.deepEqual(registry.definitions({ authorization: linkedCustomer }).map((tool) => tool.name), linkedCustomerNames);
  assert.deepEqual(registry.definitions({ authorization: linkedHelper }).map((tool) => tool.name), linkedHelperNames);

  const tools = registry.definitions({ authorization: linkedCustomer });
  assert.equal(tools[0].stateChanging, false);
  assert.equal(tools[0].inputSchema.additionalProperties, false);
  assert.deepEqual(tools[1].inputSchema.properties.field.enum, ['firstName', 'lastName']);
  assert.equal(tools[1].stateChanging, true);
  assert.equal(tools[1].confirmation, 'user-confirmation');
  assert.equal(tools[4].name, 'getServiceDetails');
  assert.equal(tools[4].stateChanging, false);
  assert.equal(tools[5].name, 'initiateServiceBooking');
  assert.equal(tools[5].stateChanging, true);

  const helperTools = registry.definitions({ authorization: linkedHelper });
  const applyTool = helperTools.find((tool) => tool.name === 'applyForHelperService');
  assert.ok(applyTool);
  assert.equal(applyTool.stateChanging, true);
  assert.equal(applyTool.auth, 'verified-linked');
});

test('profile lookup requires a verified linked account and returns only its declared fields', async () => {
  let profileReads = 0;
  const registry = createWhatsAppToolRegistry({ handlers: {
    getMyProfile: async (_args, context) => {
      profileReads += 1;
      assert.equal(context.authorization.uid, 'customer-1');
      return {
        firstName: 'Avery', lastName: 'Customer', email: 'avery@example.test',
        phoneNumber: '+27111111111', whatsappPhoneNumber: '+27222222222',
        preferredName: 'Avery', role: 'customer', accountType: 'linked', homeAddress: '', verificationStatus: '',
      };
    },
  } });

  await assert.rejects(registry.execute('getMyProfile', {}, {
    role: 'customer', authorization: { ...linkedCustomer, linked: false },
  }), { code: 'identity-verification-required' });
  assert.equal(profileReads, 0);

  const result = await registry.execute('getMyProfile', {}, { role: 'customer', authorization: linkedCustomer });
  assert.equal(result.phoneNumber, '+27111111111');
  assert.equal(result.whatsappPhoneNumber, '+27222222222');
  assert.equal(result.role, 'customer');
  assert.equal(profileReads, 1);

  const leakingRegistry = createWhatsAppToolRegistry({ handlers: {
    getMyProfile: async () => ({ firstName: 'Avery', accessToken: 'private-token' }),
  } });
  await assert.rejects(leakingRegistry.execute('getMyProfile', {}, { role: 'customer', authorization: linkedCustomer }), { code: 'tool-output-invalid' });
});

test('a guest profile lookup is bound to the current guest principal and exposes no linked-account fields', async () => {
  let profileReads = 0;
  const registry = createWhatsAppToolRegistry({ handlers: {
    getMyProfile: async (_args, context) => {
      profileReads += 1;
      assert.equal(context.identity.guestPrincipalId, 'guest-1');
      return {
        firstName: '', lastName: '', preferredName: 'Avery', email: '', phoneNumber: '',
        whatsappPhoneNumber: '', role: 'customer', accountType: 'guest',
        homeAddress: '12 Example Road', verificationStatus: '',
      };
    },
  } });

  const result = await registry.execute('getMyProfile', {}, {
    identity: { guestPrincipalId: 'guest-1', waId: '27111111111' },
    authorization: { role: 'guest', verified: false, linked: false },
  });
  assert.equal(result.preferredName, 'Avery');
  assert.equal(result.accountType, 'guest');
  assert.equal(result.whatsappPhoneNumber, '');
  assert.equal(profileReads, 1);

  await assert.rejects(registry.execute('getMyProfile', {}, {
    authorization: { role: 'guest', verified: false, linked: false },
  }), { code: 'identity-verification-required' });
  await assert.rejects(registry.execute('getMyProfile', {}, {
    identity: { guestPrincipalId: 'guest-1', linkedFirebaseUid: 'unexpected-linked-uid' },
    authorization: { role: 'guest', verified: false, linked: false },
  }), { code: 'identity-verification-required' });
  await assert.rejects(registry.execute('proposeProfileChange', { field: 'firstName', value: 'Avery' }, {
    identity: { guestPrincipalId: 'guest-1' }, authorization: { role: 'guest', verified: false, linked: false },
  }), { code: 'tool-permission-denied' });
});

test('guest account matching tool is read-only, sender-bound, and returns only a match status', async () => {
  let called = 0;
  const registry = createWhatsAppToolRegistry({ handlers: {
    checkMyAccountByWhatsAppNumber: async (_args, context) => {
      called += 1;
      assert.equal(context.identity.guestPrincipalId, 'guest-1');
      return { matchStatus: 'found' };
    },
  } });
  const result = await registry.execute('checkMyAccountByWhatsAppNumber', {}, {
    identity: { guestPrincipalId: 'guest-1', waId: '27600000001' },
    authorization: { role: 'guest', verified: false, linked: false },
  });
  assert.deepEqual(result, { matchStatus: 'found' });
  assert.equal(called, 1);
  assert.equal(registry.isReadOnly('checkMyAccountByWhatsAppNumber'), true);

  await assert.rejects(registry.execute('checkMyAccountByWhatsAppNumber', {}, {
    identity: { waId: '27600000001' },
    authorization: { role: 'guest', verified: false, linked: false },
  }), { code: 'identity-verification-required' });
  await assert.rejects(registry.execute('checkMyAccountByWhatsAppNumber', { phoneNumber: '+27600000001' }, {
    identity: { guestPrincipalId: 'guest-1', waId: '27600000001' },
    authorization: { role: 'guest', verified: false, linked: false },
  }), /unsupported fields/);
  await assert.rejects(registry.execute('checkMyAccountByWhatsAppNumber', {}, {
    identity: { guestPrincipalId: 'guest-1', waId: '27600000001' },
    authorization: linkedCustomer,
  }), { code: 'tool-permission-denied' });
});

test('profile changes can only propose a first-name or surname change and require the existing confirmation flow', async () => {
  let received;
  const registry = createWhatsAppToolRegistry({ handlers: {
    proposeProfileChange: async (args, context) => {
      received = { args, uid: context.authorization.uid };
      return { code: 'confirmation-required', proposalId: 'proposal-123', field: args.field, value: args.value };
    },
  } });

  await assert.rejects(registry.execute('proposeProfileChange', { field: 'role', value: 'admin' }, { role: 'customer', authorization: linkedCustomer }), /Only first name or surname/);
  await assert.rejects(registry.execute('proposeProfileChange', { field: 'firstName', value: 'Avery', uid: 'other-user' }, { role: 'customer', authorization: linkedCustomer }), /unsupported fields/);
  const result = await registry.execute('proposeProfileChange', { field: 'firstName', value: '  Avery   Rae  ' }, { role: 'customer', authorization: linkedCustomer });
  assert.deepEqual(received, { args: { field: 'firstName', value: 'Avery Rae' }, uid: 'customer-1' });
  assert.equal(result.code, 'confirmation-required');
  assert.equal(registry.isReadOnly('proposeProfileChange'), false);

  for (const field of ['phoneNumber', 'whatsappPhoneNumber', 'email', 'role']) {
    await assert.rejects(registry.execute('proposeProfileChange', { field, value: 'new value' }, { role: 'customer', authorization: linkedCustomer }), /Only first name or surname/);
  }
});

test('removed service, booking, payment, support, finance and relay commands cannot be executed', async () => {
  const registry = createWhatsAppToolRegistry({ handlers: {
    listAvailableServices: async () => ({ services: [] }),
    getBookingStatus: async () => ({ code: 'found' }),
    requestHumanSupport: async () => ({ code: 'handed_off' }),
  } });
  for (const name of [
    'listAvailableServices', 'getServiceQuestionnaire', 'getServicePricingInformation',
    'getSupportKnowledge', 'listMyBookings', 'getBookingStatus', 'previewRequestCancellation',
    'relayToAssignedParticipant', 'getMyPaymentSummary', 'getMyWalletSummary', 'listMyWalletTransactions',
    'getMyPayoutStatus', 'listMyAvailableOffers', 'getMyEarningsSummary', 'requestHumanSupport',
  ]) {
    await assert.rejects(registry.execute(name, {}, { role: 'customer', authorization: linkedCustomer }), { code: 'tool-not-available' });
  }
});

test('getServiceDetails tool executes for guests and linked accounts', async () => {
  const registry = createWhatsAppToolRegistry({ handlers: {
    getServiceDetails: async (args) => {
      assert.equal(args.query, 'barber');
      return {
        code: 'found',
        id: 'svc_barber',
        label: 'Barber Grooming',
        category: 'Personal Care',
        description: 'Professional barber cuts at your home.',
        priceRange: 'R150.00 - R300.00 ZAR',
        helperCount: 3,
        serviceOptions: [{ id: 'fade', title: 'Fade Cut', price: 150, description: 'Clean fade' }],
        options: [{ id: 'style', prompt: 'Haircut style', options: ['Fade', 'Buzz'] }],
      };
    },
  } });
  const result = await registry.execute('getServiceDetails', { query: 'barber' }, {
    role: 'guest',
    identity: { guestPrincipalId: 'guest-1' },
    authorization: { role: 'guest', verified: false, linked: false },
  });
  assert.equal(result.code, 'found');
  assert.equal(result.label, 'Barber Grooming');
  assert.equal(result.serviceOptions[0].title, 'Fade Cut');
});

test('service discovery, detail, and booking tools allow optional empty string arguments and error codes', async () => {
  const guestContext = {
    role: 'guest',
    identity: { guestPrincipalId: 'guest-1' },
    authorization: { role: 'guest', verified: false, linked: false },
  };
  const registry = createWhatsAppToolRegistry({
    handlers: {
      sendServicesToUser: async (args) => {
        assert.deepEqual(args, {});
        return { code: 'sent', sentCount: 4 };
      },
      getServiceDetails: async (args) => {
        assert.deepEqual(args, { serviceId: 'barber' });
        return { code: 'not-found', query: 'barber', availableServices: ['Haircuts', 'Cleaning'] };
      },
      initiateServiceBooking: async (args) => {
        assert.deepEqual(args, {});
        return { code: 'missing-query', error: 'Please specify the service you wish to book.' };
      },
    },
  });

  const sent = await registry.execute('sendServicesToUser', { category: '' }, guestContext);
  assert.deepEqual(sent, { code: 'sent', sentCount: 4 });

  const details = await registry.execute('getServiceDetails', { serviceId: 'barber', query: '', serviceOption: '' }, guestContext);
  assert.equal(details.code, 'not-found');

  const booking = await registry.execute('initiateServiceBooking', { serviceId: '', query: null }, guestContext);
  assert.equal(booking.code, 'missing-query');
});

test('applyForHelperService is restricted to verified linked helpers and validates multi-option input and output schema', async () => {
  let receivedArgs;
  const registry = createWhatsAppToolRegistry({
    handlers: {
      applyForHelperService: async (args, context) => {
        receivedArgs = { args, uid: context.authorization.uid };
        return {
          code: 'submitted',
          serviceId: 'hair_styling',
          serviceName: 'Hair Styling',
          optionApplicationMode: 'per_option',
          submittedNames: ['Hair Styling — Box Braids', 'Hair Styling — Cornrows'],
          appliedOptions: [
            { serviceId: 'hair_styling', serviceName: 'Hair Styling', optionId: 'box_braids', optionTitle: 'Box Braids', status: 'pending', hasPhotos: false },
            { serviceId: 'hair_styling', serviceName: 'Hair Styling', optionId: 'cornrows', optionTitle: 'Cornrows', status: 'pending', hasPhotos: false },
          ],
          photoUploadUrl: 'https://helpers.bakayise.com/onboarding',
          needsPhotos: true,
        };
      },
    },
  });

  await assert.rejects(
    registry.execute('applyForHelperService', {}, {
      role: 'guest',
      identity: { guestPrincipalId: 'guest-1' },
      authorization: { role: 'guest', verified: false, linked: false },
    }),
    { code: 'tool-permission-denied' },
  );

  await assert.rejects(
    registry.execute('applyForHelperService', {}, { role: 'customer', authorization: linkedCustomer }),
    { code: 'tool-permission-denied' },
  );

  await assert.rejects(
    registry.execute('applyForHelperService', {}, {
      role: 'helper',
      authorization: { ...linkedHelper, verified: false },
    }),
    { code: 'identity-verification-required' },
  );

  await assert.rejects(
    registry.execute('applyForHelperService', { helperId: 'other-helper' }, { role: 'helper', authorization: linkedHelper }),
    /unsupported fields/,
  );

  const result = await registry.execute(
    'applyForHelperService',
    { query: '  Hair Styling ', serviceOption: '  Box Braids,   Cornrows  ' },
    { role: 'helper', authorization: linkedHelper },
  );
  assert.deepEqual(receivedArgs, {
    args: { query: 'Hair Styling', serviceOption: 'Box Braids, Cornrows' },
    uid: 'helper-1',
  });
  assert.equal(result.code, 'submitted');
  assert.equal(result.appliedOptions.length, 2);

  const badOutputRegistry = createWhatsAppToolRegistry({
    handlers: {
      applyForHelperService: async () => ({ code: 'submitted', secretUidLeak: 'helper-1' }),
    },
  });
  await assert.rejects(
    badOutputRegistry.execute('applyForHelperService', {}, { role: 'helper', authorization: linkedHelper }),
    { code: 'tool-output-invalid' },
  );
});

test('relayMessageToHelper is exposed only with an open activeServiceRequest and validates payload', async () => {
  let relayedArgs = null;
  const registry = createWhatsAppToolRegistry({
    handlers: {
      relayMessageToHelper: async (args) => {
        relayedArgs = args;
        return {
          code: 'relayed',
          requestId: 'req_123',
          deliveredToInAppChat: true,
          relayedToHelperWhatsApp: false,
        };
      },
    },
  });

  const closedTools = registry.definitions({
    role: 'customer',
    authorization: linkedCustomer,
    activeServiceRequest: { isOpen: false },
  });
  assert.equal(closedTools.some((tool) => tool.name === 'relayMessageToHelper'), false);

  const openTools = registry.definitions({
    role: 'customer',
    authorization: linkedCustomer,
    activeServiceRequest: { isOpen: true },
  });
  assert.equal(openTools.some((tool) => tool.name === 'relayMessageToHelper'), true);

  const res = await registry.execute(
    'relayMessageToHelper',
    { messageText: '  Gate code is 1234#  ', category: 'arrival' },
    { role: 'customer', authorization: linkedCustomer },
  );
  assert.deepEqual(relayedArgs, { messageText: 'Gate code is 1234#', category: 'arrival' });
  assert.equal(res.code, 'relayed');
  assert.equal(res.deliveredToInAppChat, true);
});

test('cancelServiceRequest is exposed for guest and customer roles and validates optional requestId and output schema', async () => {
  let receivedArgs;
  const registry = createWhatsAppToolRegistry({
    handlers: {
      cancelServiceRequest: async (args) => {
        receivedArgs = args;
        return {
          code: 'canceled',
          requestId: args.requestId || 'wa_req_auto_1',
          publicRequestReference: 'UNC-1042',
          serviceSummary: 'Home Cleaning',
          previousStatus: 'matching',
          status: 'canceled',
          cancellationAmount: 0,
          billingRule: 'pre_assignment',
          chargeConfirmed: true,
          pendingReconciliation: false,
          confirmationRequired: false,
        };
      },
    },
  });

  const helperTools = registry.definitions({ role: 'helper', authorization: linkedHelper });
  assert.equal(helperTools.some((tool) => tool.name === 'cancelServiceRequest'), false);

  const guestRes = await registry.execute(
    'cancelServiceRequest',
    { requestId: '', reason: '' },
    { role: 'guest', identity: { guestPrincipalId: 'guest-1' }, authorization: { role: 'guest', verified: false, linked: false } },
  );
  assert.deepEqual(receivedArgs, {});
  assert.equal(guestRes.code, 'canceled');
  assert.equal(guestRes.requestId, 'wa_req_auto_1');

  const explicitRes = await registry.execute(
    'cancelServiceRequest',
    { requestId: 'wa_req_999', reason: 'Changed plans' },
    { role: 'customer', authorization: linkedCustomer },
  );
  assert.deepEqual(receivedArgs, { requestId: 'wa_req_999', reason: 'Changed plans' });
  assert.equal(explicitRes.requestId, 'wa_req_999');

  await assert.rejects(
    registry.execute('cancelServiceRequest', { customerId: 'other' }, { role: 'customer', authorization: linkedCustomer }),
    /unsupported fields/,
  );

  const badRegistry = createWhatsAppToolRegistry({
    handlers: {
      cancelServiceRequest: async () => ({ code: 'canceled', secretToken: 'leak' }),
    },
  });
  await assert.rejects(
    badRegistry.execute('cancelServiceRequest', {}, { role: 'customer', authorization: linkedCustomer }),
    { code: 'tool-output-invalid' },
  );
});


