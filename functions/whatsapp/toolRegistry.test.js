'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TOOL_DEFINITIONS, createWhatsAppToolRegistry } = require('./toolRegistry');

const linkedCustomer = { uid: 'customer-1', role: 'customer', linked: true, verified: true };
const linkedHelper = { uid: 'helper-1', role: 'helper', linked: true, verified: true, helperVerified: true };

test('guests get profile/account lookup and customer service tools while linked customers and helpers also get confirmed name change and role-specific operational tools', () => {
  const registry = createWhatsAppToolRegistry();
  const linkedCustomerNames = [
    'getMyProfile', 'proposeProfileChange', 'getAvailableServices', 'sendServicesToUser',
    'getServiceDetails', 'initiateServiceBooking', 'cancelServiceRequest',
    'getCustomerRequestHistory', 'getServiceRequestDetails', 'getRequestPaymentDetails',
    'createRequestPaymentLink', 'rateServiceHelper', 'escalateToHumanSupport',
    'checkWalletBalance',
  ];
  const linkedHelperNames = [
    'getMyProfile', 'proposeProfileChange', 'getAvailableServices', 'sendServicesToUser',
    'getServiceDetails', 'initiateServiceBooking', 'applyForHelperService',
    'getServiceRequestDetails', 'escalateToHumanSupport',
    'getHelperOnboardingStatus', 'getHelperWalletAndPayouts', 'getHelperJobsAndOffers',
    'setHelperAvailability', 'respondToHelperJobOffer', 'confirmCashPaymentReceipt',
    'checkWalletBalance',
  ];
  assert.deepEqual(Object.keys(TOOL_DEFINITIONS), [
    'getMyProfile', 'checkMyAccountByWhatsAppNumber', 'proposeProfileChange',
    'getAvailableServices', 'sendServicesToUser', 'getServiceDetails',
    'initiateServiceBooking', 'applyForHelperService', 'relayMessageToHelper',
    'cancelServiceRequest',
    'getCustomerRequestHistory', 'getServiceRequestDetails', 'getRequestPaymentDetails',
    'createRequestPaymentLink', 'rateServiceHelper', 'escalateToHumanSupport',
    'getHelperOnboardingStatus', 'getHelperWalletAndPayouts', 'getHelperJobsAndOffers',
    'setHelperAvailability', 'respondToHelperJobOffer', 'relayMessageToCustomer',
    'confirmCashPaymentReceipt', 'checkWalletBalance',
  ]);
  const guestTools = registry.definitions({ identity: { guestPrincipalId: 'guest-1' }, authorization: { role: 'guest' } });
  assert.deepEqual(guestTools.map((tool) => tool.name), [
    'getMyProfile', 'checkMyAccountByWhatsAppNumber', 'getAvailableServices', 'sendServicesToUser',
    'getServiceDetails', 'initiateServiceBooking', 'cancelServiceRequest',
    'getCustomerRequestHistory', 'getServiceRequestDetails', 'getRequestPaymentDetails',
    'createRequestPaymentLink', 'rateServiceHelper', 'escalateToHumanSupport',
    'checkWalletBalance',
  ]);
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

  const helperNameRegistry = createWhatsAppToolRegistry({
    handlers: {
      relayMessageToHelper: async () => ({
        code: 'relayed',
        requestId: 'req_456',
        helperName: 'Thabo M.',
        deliveredToInAppChat: true,
        relayedToHelperWhatsApp: true,
      }),
    },
  });
  const helperNameRes = await helperNameRegistry.execute(
    'relayMessageToHelper',
    { messageText: 'I am outside now' },
    { role: 'customer', authorization: linkedCustomer },
  );
  assert.equal(helperNameRes.helperName, 'Thabo M.');
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
          paymentUrl: 'https://uncedo.example.test/payment?token=abc',
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
  assert.equal(explicitRes.paymentUrl, 'https://uncedo.example.test/payment?token=abc');

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

test('customer and guest history, details, payment, rating, and support tools validate roles, arguments, and outputs', async () => {
  const guestContext = {
    role: 'guest',
    identity: { guestPrincipalId: 'guest-1' },
    authorization: { role: 'guest', verified: false, linked: false },
  };
  const customerContext = { role: 'customer', authorization: linkedCustomer };
  const helperContext = { role: 'helper', authorization: linkedHelper };

  const registry = createWhatsAppToolRegistry({
    handlers: {
      getCustomerRequestHistory: async () => ({
        code: 'found',
        requests: [{
          requestId: 'req_1',
          publicRequestReference: 'UNC-1001',
          serviceSummary: 'Home Cleaning',
          status: 'completed',
          statusLabel: 'Completed',
          helperName: 'Thabo M.',
          amount: 250,
          paymentStatus: 'paid',
        }],
        activeDraftServiceId: '',
        activeDraftStatus: '',
      }),
      getServiceRequestDetails: async (args) => ({
        code: 'found',
        requestId: args.requestId || 'req_1',
        publicRequestReference: 'UNC-1001',
        serviceSummary: 'Home Cleaning',
        status: 'arrived',
        statusLabel: 'Helper arrived',
        helperName: 'Thabo M.',
        customerName: 'Avery Customer',
        serviceAddress: '12 Example Road',
        estimatedAmount: 250,
        finalAmount: null,
        paymentStatus: 'unpaid',
        arrivalPin: '654321',
        canCancel: true,
        canRate: true,
        ratingScore: null,
        workspaceUrl: '',
      }),
      getRequestPaymentDetails: async () => ({
        code: 'found',
        requestId: 'req_1',
        publicRequestReference: 'UNC-1001',
        serviceSummary: 'Home Cleaning',
        requestStatus: 'completed',
        paymentStatus: 'unpaid',
        state: 'awaiting_payment',
        amount: 250,
        currency: 'ZAR',
        settledDate: '',
        walletBalance: 40,
        savedCardCount: 1,
        savedCardSummary: 'Visa •••• 4242',
        cashAllowed: true,
      }),
      createRequestPaymentLink: async () => ({
        code: 'created',
        requestId: 'req_1',
        publicRequestReference: 'UNC-1001',
        serviceSummary: 'Home Cleaning',
        amount: 250,
        currency: 'ZAR',
        paymentUrl: 'https://uncedo.example.test/payment?token=pay123',
        cashAllowed: true,
        savedCardCount: 1,
        pendingRequests: [],
      }),
      rateServiceHelper: async (args) => ({
        code: 'rated',
        requestId: args.requestId || 'req_1',
        publicRequestReference: 'UNC-1001',
        helperName: 'Thabo M.',
        score: args.score,
        comment: args.comment || '',
      }),
      escalateToHumanSupport: async (args) => ({
        code: 'escalated',
        ticketId: 'ticket_1',
        requestId: args.requestId || '',
      }),
    },
  });

  assert.equal(registry.isReadOnly('getCustomerRequestHistory'), true);
  assert.equal(registry.isReadOnly('getServiceRequestDetails'), true);
  assert.equal(registry.isReadOnly('getRequestPaymentDetails'), true);
  assert.equal(registry.isReadOnly('createRequestPaymentLink'), false);
  assert.equal(registry.isReadOnly('rateServiceHelper'), false);
  assert.equal(registry.isReadOnly('escalateToHumanSupport'), false);

  const history = await registry.execute('getCustomerRequestHistory', {}, guestContext);
  assert.equal(history.requests[0].publicRequestReference, 'UNC-1001');

  const details = await registry.execute('getServiceRequestDetails', {}, customerContext);
  assert.equal(details.arrivalPin, '654321');
  const helperDetails = await registry.execute('getServiceRequestDetails', { requestId: 'req_1' }, helperContext);
  assert.equal(helperDetails.code, 'found');

  const paymentSummary = await registry.execute('getRequestPaymentDetails', {}, guestContext);
  assert.equal(paymentSummary.savedCardCount, 1);
  assert.equal(paymentSummary.walletBalance, 40);

  const paymentLink = await registry.execute('createRequestPaymentLink', {}, guestContext);
  assert.equal(paymentLink.code, 'created');
  assert.match(paymentLink.paymentUrl, /^https:/);

  const rating = await registry.execute('rateServiceHelper', { score: 5, comment: '  Great work!  ' }, guestContext);
  assert.equal(rating.score, 5);
  assert.equal(rating.comment, 'Great work!');

  await assert.rejects(registry.execute('rateServiceHelper', { score: 6 }, customerContext), /between 1 and 5/);
  await assert.rejects(registry.execute('rateServiceHelper', { score: 4.5 }, customerContext), /between 1 and 5/);
  await assert.rejects(registry.execute('rateServiceHelper', { score: 0 }, customerContext), /between 1 and 5/);
  await assert.rejects(registry.execute('rateServiceHelper', { score: 5 }, helperContext), { code: 'tool-permission-denied' });
  await assert.rejects(registry.execute('getCustomerRequestHistory', {}, helperContext), { code: 'tool-permission-denied' });
  await assert.rejects(registry.execute('getRequestPaymentDetails', {}, helperContext), { code: 'tool-permission-denied' });
  await assert.rejects(registry.execute('createRequestPaymentLink', {}, helperContext), { code: 'tool-permission-denied' });

  const guestSupport = await registry.execute('escalateToHumanSupport', { summary: 'Need billing help' }, guestContext);
  assert.equal(guestSupport.ticketId, 'ticket_1');
  const helperSupport = await registry.execute('escalateToHumanSupport', { summary: 'Customer unreachable' }, helperContext);
  assert.equal(helperSupport.code, 'escalated');
});

test('helper operational tools require verified-linked helper auth, enforce enum actions, and gate relayMessageToCustomer cleanly', async () => {
  const guestContext = {
    role: 'guest',
    identity: { guestPrincipalId: 'guest-1' },
    authorization: { role: 'guest', verified: false, linked: false },
  };
  const customerContext = { role: 'customer', authorization: linkedCustomer };
  const helperContext = { role: 'helper', authorization: linkedHelper };

  const registry = createWhatsAppToolRegistry({
    handlers: {
      getHelperOnboardingStatus: async () => ({
        code: 'ready',
        readyToGoOnline: true,
        helperVerified: true,
        payoutVerified: true,
        agreementCurrent: true,
        policeClearanceStatus: 'approved',
        hasProfilePhoto: true,
        hasApprovedOffering: true,
        onlineStatus: 'online',
        missingRequirements: [],
        offerings: [{ serviceId: 'cleaning', serviceName: 'Home Cleaning', optionTitle: 'Standard', status: 'approved', hasPhotos: true }],
        onboardingUrl: 'https://helpers.example.test/onboarding',
      }),
      getHelperWalletAndPayouts: async () => ({
        code: 'found',
        currency: 'ZAR',
        availableBalance: 420.5,
        reservedBalance: 0,
        outstandingCommission: 25,
        payoutVerified: true,
        reconciliationBlocked: false,
        pendingCashConfirmationsCount: 1,
        recentTransactions: [{ entryType: 'payout', amount: -200, description: 'Weekly payout', date: '2026-11-20' }],
        recentPayouts: [{ status: 'paid', amount: 200, date: '2026-11-20' }],
        workspaceUrl: 'https://helpers.example.test/wallet',
      }),
      getHelperJobsAndOffers: async () => ({
        code: 'found',
        onlineStatus: 'online',
        pendingOffer: {
          requestId: 'req_offer_1',
          publicRequestReference: 'UNC-2001',
          serviceSummary: 'Car Wash',
          estimatedPayout: 140,
          offerType: 'primary',
          expiresInMinutes: 3,
        },
        activeJob: null,
        queuedJob: null,
        recentJobs: [{ requestId: 'req_prev_1', publicRequestReference: 'UNC-1990', serviceSummary: 'Car Wash', status: 'completed', amount: 180, paymentStatus: 'paid' }],
        workspaceUrl: 'https://helpers.example.test/workspace',
      }),
      setHelperAvailability: async (args) => ({
        code: args.action === 'offline' ? 'set_offline' : 'location_required_for_online',
        onlineStatus: args.action === 'offline' ? 'offline' : 'offline',
        hasFreshLocation: false,
        missingRequirements: [],
        workspaceUrl: 'https://helpers.example.test/workspace',
        onboardingUrl: '',
      }),
      respondToHelperJobOffer: async (args) => ({
        code: args.action === 'accept' ? 'accepted' : 'declined',
        requestId: args.requestId || 'req_offer_1',
        publicRequestReference: 'UNC-2001',
        serviceSummary: 'Car Wash',
        busyFallbackAccepted: false,
        requestUrl: 'https://helpers.example.test/requests/req_offer_1',
        workspaceUrl: 'https://helpers.example.test/workspace',
      }),
      relayMessageToCustomer: async (args) => ({
        code: 'relayed',
        requestId: 'req_active_1',
        customerName: 'Avery',
        deliveredToInAppChat: true,
        relayedToCustomerWhatsApp: true,
        ...(args.messageText === 'leak' ? { secret: 'bad' } : {}),
      }),
      confirmCashPaymentReceipt: async (args) => ({
        code: args.action === 'confirm' ? 'confirmed' : 'rejected',
        requestId: args.requestId || 'req_cash_1',
        publicRequestReference: 'UNC-1995',
        amount: 200,
        currency: 'ZAR',
        pendingRequests: [],
      }),
    },
  });

  // Dynamic relay visibility gating per role and open activeServiceRequest
  assert.equal(registry.definitions({ ...helperContext, activeServiceRequest: { isOpen: false } }).some((t) => t.name === 'relayMessageToCustomer'), false);
  const openHelperDefs = registry.definitions({ ...helperContext, activeServiceRequest: { isOpen: true } });
  assert.equal(openHelperDefs.some((t) => t.name === 'relayMessageToCustomer'), true);
  assert.equal(openHelperDefs.some((t) => t.name === 'relayMessageToHelper'), false);
  const openCustomerDefs = registry.definitions({ ...customerContext, activeServiceRequest: { isOpen: true } });
  assert.equal(openCustomerDefs.some((t) => t.name === 'relayMessageToCustomer'), false);
  assert.equal(openCustomerDefs.some((t) => t.name === 'relayMessageToHelper'), true);

  for (const helperTool of [
    ['getHelperOnboardingStatus', {}],
    ['getHelperWalletAndPayouts', {}],
    ['getHelperJobsAndOffers', {}],
    ['setHelperAvailability', { action: 'status' }],
    ['respondToHelperJobOffer', { action: 'accept' }],
    ['relayMessageToCustomer', { messageText: 'Outside now' }],
    ['confirmCashPaymentReceipt', { action: 'confirm' }],
  ]) {
    await assert.rejects(registry.execute(helperTool[0], helperTool[1], guestContext), { code: 'tool-permission-denied' });
    await assert.rejects(registry.execute(helperTool[0], helperTool[1], customerContext), { code: 'tool-permission-denied' });
    await assert.rejects(
      registry.execute(helperTool[0], helperTool[1], { role: 'helper', authorization: { ...linkedHelper, verified: false } }),
      { code: 'identity-verification-required' },
    );
  }

  const onboarding = await registry.execute('getHelperOnboardingStatus', {}, helperContext);
  assert.equal(onboarding.readyToGoOnline, true);
  const wallet = await registry.execute('getHelperWalletAndPayouts', {}, helperContext);
  assert.equal(wallet.availableBalance, 420.5);
  const jobs = await registry.execute('getHelperJobsAndOffers', {}, helperContext);
  assert.equal(jobs.pendingOffer.publicRequestReference, 'UNC-2001');

  const avail = await registry.execute('setHelperAvailability', { action: 'OFFLINE' }, helperContext);
  assert.equal(avail.code, 'set_offline');
  await assert.rejects(registry.execute('setHelperAvailability', { action: 'paused' }, helperContext), /online, offline, or status/);

  const offer = await registry.execute('respondToHelperJobOffer', { action: 'ACCEPT', requestId: 'req_offer_1' }, helperContext);
  assert.equal(offer.code, 'accepted');
  await assert.rejects(registry.execute('respondToHelperJobOffer', { action: 'hold' }, helperContext), /accept or decline/);

  const relay = await registry.execute('relayMessageToCustomer', { messageText: 'I am 5 mins away', category: 'eta' }, helperContext);
  assert.equal(relay.relayedToCustomerWhatsApp, true);
  await assert.rejects(registry.execute('relayMessageToCustomer', { messageText: 'leak' }, helperContext), { code: 'tool-output-invalid' });

  const cash = await registry.execute('confirmCashPaymentReceipt', { action: 'CONFIRM' }, helperContext);
  assert.equal(cash.code, 'confirmed');
  await assert.rejects(registry.execute('confirmCashPaymentReceipt', { action: 'refund' }, helperContext), /confirm or reject/);
});

test('checkWalletBalance enforces self-profile authorization and validates negative customer links and helper Capitec details', async () => {
  const guestContext = {
    role: 'guest',
    identity: { guestPrincipalId: 'guest-1' },
    authorization: { role: 'guest', verified: false, linked: false },
  };
  const customerContext = { role: 'customer', authorization: linkedCustomer };
  const helperContext = { role: 'helper', authorization: linkedHelper };

  const registry = createWhatsAppToolRegistry({
    handlers: {
      checkWalletBalance: async (_args, context) => {
        if (context.authorization?.role === 'helper') {
          return {
            code: 'found',
            role: 'helper',
            currency: 'ZAR',
            walletBalance: -85,
            availableBalance: 0,
            reservedBalance: 0,
            outstandingCommission: 85,
            isNegative: true,
            outstandingAmount: 85,
            settlementMessage: 'Your wallet balance is negative (-R85.00 ZAR). Please send R85.00 ZAR to Capitec 1569166828 with Reference: WhatsApp number.',
            paymentUrl: '',
            paymentLinks: [],
            bankDetails: {
              bankName: 'Capitec',
              accountNumber: '1569166828',
              reference: 'WhatsApp number',
            },
            workspaceUrl: 'https://helpers.example.test/earnings',
          };
        }
        return {
          code: 'found',
          role: context.authorization?.role === 'customer' ? 'customer' : 'guest',
          currency: 'ZAR',
          walletBalance: -120,
          availableBalance: -120,
          reservedBalance: 0,
          outstandingCommission: 0,
          isNegative: true,
          outstandingAmount: 120,
          settlementMessage: 'Your wallet balance is negative (-R120.00 ZAR). Pay here: https://uncedo.example.test/payment?token=abc',
          paymentUrl: 'https://uncedo.example.test/payment?token=abc',
          requestId: 'req_debt_1',
          publicRequestReference: 'UNC-3001',
          paymentLinks: [{
            requestId: 'req_debt_1',
            publicRequestReference: 'UNC-3001',
            serviceSummary: 'Home Cleaning',
            amount: 120,
            paymentUrl: 'https://uncedo.example.test/payment?token=abc',
          }],
          bankDetails: null,
        };
      },
    },
  });

  await assert.rejects(
    registry.execute('checkWalletBalance', {}, { role: 'customer', authorization: { ...linkedCustomer, linked: false } }),
    { code: 'identity-verification-required' },
  );
  await assert.rejects(
    registry.execute('checkWalletBalance', { uid: 'other' }, customerContext),
    /unsupported fields/,
  );

  const guestRes = await registry.execute('checkWalletBalance', {}, guestContext);
  assert.equal(guestRes.isNegative, true);
  assert.equal(guestRes.outstandingAmount, 120);
  assert.match(guestRes.paymentUrl, /^https:\/\/uncedo\.example\.test\/payment\?token=/);
  assert.equal(guestRes.bankDetails, null);

  const customerRes = await registry.execute('checkWalletBalance', {}, customerContext);
  assert.equal(customerRes.role, 'customer');
  assert.equal(customerRes.paymentLinks.length, 1);

  const helperRes = await registry.execute('checkWalletBalance', {}, helperContext);
  assert.equal(helperRes.role, 'helper');
  assert.equal(helperRes.isNegative, true);
  assert.deepEqual(helperRes.bankDetails, {
    bankName: 'Capitec',
    accountNumber: '1569166828',
    reference: 'WhatsApp number',
  });
});

test('getHelperWalletAndPayouts permits signed walletBalance and transaction delta in strict outputSchema', async () => {
  const helperContext = { role: 'helper', authorization: linkedHelper };
  const registry = createWhatsAppToolRegistry({
    handlers: {
      getHelperWalletAndPayouts: async () => ({
        code: 'found',
        currency: 'ZAR',
        walletBalance: -15.5,
        availableBalance: 0,
        reservedBalance: 0,
        outstandingCommission: 15.5,
        payoutVerified: true,
        reconciliationBlocked: false,
        pendingCashConfirmationsCount: 0,
        recentTransactions: [
          {
            entryType: 'cash_commission_assessed',
            amount: 15.5,
            delta: -15.5,
            description: 'Cash commission deducted from wallet balance.',
            date: '2026-11-23',
          },
        ],
        recentPayouts: [{ status: 'unsuccessful', amount: 120, date: '2026-11-16' }],
        workspaceUrl: 'https://helpers.example.test/earnings',
      }),
    },
  });

  const walletSummary = await registry.execute('getHelperWalletAndPayouts', {}, helperContext);
  assert.equal(walletSummary.walletBalance, -15.5);
  assert.equal(walletSummary.recentTransactions[0].delta, -15.5);
});





