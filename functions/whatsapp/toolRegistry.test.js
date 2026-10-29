'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TOOL_DEFINITIONS, createWhatsAppToolRegistry } = require('./toolRegistry');

const linkedCustomer = { uid: 'customer-1', role: 'customer', linked: true, verified: true };
const linkedHelper = { uid: 'helper-1', role: 'helper', linked: true, verified: true, helperVerified: true };

test('only profile read is available to guests, while linked customers and helpers also get the confirmed name-change tool', () => {
  const registry = createWhatsAppToolRegistry();
  const expectedNames = ['getMyProfile', 'proposeProfileChange'];
  assert.deepEqual(Object.keys(TOOL_DEFINITIONS), expectedNames);
  const guestTools = registry.definitions({ identity: { guestPrincipalId: 'guest-1' }, authorization: { role: 'guest' } });
  assert.deepEqual(guestTools.map((tool) => tool.name), ['getMyProfile']);
  assert.deepEqual(registry.definitions({ authorization: linkedCustomer }).map((tool) => tool.name), expectedNames);
  assert.deepEqual(registry.definitions({ authorization: linkedHelper }).map((tool) => tool.name), expectedNames);

  const tools = registry.definitions({ authorization: linkedCustomer });
  assert.equal(tools[0].stateChanging, false);
  assert.equal(tools[0].inputSchema.additionalProperties, false);
  assert.deepEqual(tools[1].inputSchema.properties.field.enum, ['firstName', 'lastName']);
  assert.equal(tools[1].stateChanging, true);
  assert.equal(tools[1].confirmation, 'user-confirmation');
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
        whatsappPhoneNumber: '+27111111111', role: 'customer', accountType: 'guest',
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
  assert.equal(result.whatsappPhoneNumber, '+27111111111');
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
    'listAvailableServices', 'getServiceDetails', 'getServiceQuestionnaire', 'getServicePricingInformation',
    'getSupportKnowledge', 'listMyBookings', 'getBookingStatus', 'previewRequestCancellation',
    'relayToAssignedParticipant', 'getMyPaymentSummary', 'getMyWalletSummary', 'listMyWalletTransactions',
    'getMyPayoutStatus', 'listMyAvailableOffers', 'getMyEarningsSummary', 'requestHumanSupport',
  ]) {
    await assert.rejects(registry.execute(name, {}, { role: 'customer', authorization: linkedCustomer }), { code: 'tool-not-available' });
  }
});
