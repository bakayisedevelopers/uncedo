'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateSavedAddressWorkflow,
  extractSavedAddressFromRecords,
  extractSavedHomeLocationFromRecords,
  getValidDraftServiceLocation,
  resolveExplicitServiceAddressTargetReply,
  resolveSavedAddressConfirmationReply,
} = require('./serviceAddressHelpers');

test('extractSavedAddressFromRecords checks WhatsApp identity and linked customerProfile fields', () => {
  assert.equal(
    extractSavedAddressFromRecords(
      { homeAddress: '' },
      { customerProfile: { serviceAddress: '17 Iris Street Witbank Mpumalanga 1035' } },
    ),
    '17 Iris Street Witbank Mpumalanga 1035',
  );
  assert.equal(
    extractSavedAddressFromRecords(
      { homeAddress: '12 Main Road' },
      { customerProfile: { serviceAddress: 'Other Address' } },
    ),
    '12 Main Road',
  );
  assert.equal(extractSavedAddressFromRecords({}, null), '');
});

test('extractSavedHomeLocationFromRecords ignores (0,0) and returns valid saved coordinates', () => {
  assert.equal(
    extractSavedHomeLocationFromRecords({ homeLocation: { latitude: 0, longitude: 0 } }),
    null,
  );
  assert.deepEqual(
    extractSavedHomeLocationFromRecords({}, { homeLocation: { latitude: -25.8735, longitude: 29.2284 } }),
    { latitude: -25.8735, longitude: 29.2284 },
  );
});

test('getValidDraftServiceLocation keeps typed or saved street addresses without timestamps while dropping stale GPS-only pins', () => {
  const textAddress = getValidDraftServiceLocation({ address: '17 Iris Street Witbank' }, 10_000, () => false);
  assert.deepEqual(textAddress, {
    address: '17 Iris Street Witbank',
    name: '',
    latitude: null,
    longitude: null,
  });

  const stalePin = getValidDraftServiceLocation({ latitude: -25.87, longitude: 29.22, updatedAtMs: 1 }, 10_000, () => false);
  assert.equal(stalePin, null);

  const nullIsland = getValidDraftServiceLocation({ latitude: 0, longitude: 0 }, 10_000, () => true);
  assert.equal(nullIsland, null);
});

test('resolveExplicitServiceAddressTargetReply matches natural phrases like use saved address', () => {
  const opts = {
    allowedQuestionIds: ['service_address_target', 'timing_preference'],
    missingQuestionIds: ['service_address_target'],
    questionOptions: ['current_location', 'saved_home_address', 'another_address'],
  };
  assert.equal(resolveExplicitServiceAddressTargetReply('use saved address', opts), 'saved_home_address');
  assert.equal(resolveExplicitServiceAddressTargetReply('Please use my saved address and do it now', opts), 'saved_home_address');
  assert.equal(resolveExplicitServiceAddressTargetReply('saved address', opts), 'saved_home_address');
  assert.equal(resolveExplicitServiceAddressTargetReply('2', opts), 'saved_home_address');
  assert.equal(resolveExplicitServiceAddressTargetReply('use another address', opts), 'another_address');
  assert.equal(resolveExplicitServiceAddressTargetReply('17 Iris Street Witbank', opts), '');
});

test('resolveSavedAddressConfirmationReply distinguishes confirm vs change replies', () => {
  assert.equal(resolveSavedAddressConfirmationReply('Yes'), 'confirm');
  assert.equal(resolveSavedAddressConfirmationReply('Confirm address!'), 'confirm');
  assert.equal(resolveSavedAddressConfirmationReply('1'), 'confirm');
  assert.equal(resolveSavedAddressConfirmationReply('No'), 'change');
  assert.equal(resolveSavedAddressConfirmationReply('Provide new address'), 'change');
  assert.equal(resolveSavedAddressConfirmationReply('2'), 'change');
  assert.equal(resolveSavedAddressConfirmationReply('17 Iris Street Witbank'), '');
});

test('evaluateSavedAddressWorkflow prompts for home address when missing, then persists when provided', () => {
  const missing = evaluateSavedAddressWorkflow({
    serviceId: 'hand_washing_laundry',
    targetRequiresSavedAddress: true,
    savedHomeAddress: '',
    activeDraft: null,
    inbound: { type: 'text' },
    originalUserText: 'use saved address',
    explicitAddressTargetReply: 'saved_home_address',
  });
  assert.equal(missing.promptKind, 'missing_home_address');
  assert.equal(missing.awaitingSavedAddressInput, true);
  assert.equal(missing.savedAddressConfirmed, false);

  const provided = evaluateSavedAddressWorkflow({
    serviceId: 'hand_washing_laundry',
    targetRequiresSavedAddress: true,
    savedHomeAddress: '',
    activeDraft: { serviceId: 'hand_washing_laundry', awaitingSavedAddressInput: true },
    inbound: { type: 'text' },
    originalUserText: '17 Iris Street, Witbank, 1035',
  });
  assert.equal(provided.promptKind, '');
  assert.equal(provided.savedAddressConfirmed, true);
  assert.equal(provided.shouldPersistHomeAddress, '17 Iris Street, Witbank, 1035');
  assert.equal(provided.effectiveLocation?.address, '17 Iris Street, Witbank, 1035');
});

test('evaluateSavedAddressWorkflow asks confirmation when saved address exists and handles confirm or change', () => {
  const askConfirm = evaluateSavedAddressWorkflow({
    serviceId: 'hand_washing_laundry',
    targetRequiresSavedAddress: true,
    savedHomeAddress: '17 Iris Street, Witbank, 1035',
    savedHomeCoordinates: { latitude: -25.8735, longitude: 29.2284 },
    activeDraft: null,
    inbound: { type: 'text', actionChoice: { type: 'service_address_target', value: 'saved_home_address' } },
  });
  assert.equal(askConfirm.promptKind, 'confirm_saved_address');
  assert.equal(askConfirm.awaitingSavedAddressConfirmation, true);
  assert.equal(askConfirm.savedAddressConfirmed, false);

  const confirmedByButton = evaluateSavedAddressWorkflow({
    serviceId: 'hand_washing_laundry',
    targetRequiresSavedAddress: true,
    savedHomeAddress: '17 Iris Street, Witbank, 1035',
    savedHomeCoordinates: { latitude: -25.8735, longitude: 29.2284 },
    activeDraft: { serviceId: 'hand_washing_laundry', awaitingSavedAddressConfirmation: true },
    inbound: { type: 'text', actionChoice: { type: 'saved_address_confirmation', action: 'confirm' } },
  });
  assert.equal(confirmedByButton.promptKind, '');
  assert.equal(confirmedByButton.savedAddressConfirmed, true);
  assert.equal(confirmedByButton.confirmedSavedAddress, '17 Iris Street, Witbank, 1035');

  const changedByText = evaluateSavedAddressWorkflow({
    serviceId: 'hand_washing_laundry',
    targetRequiresSavedAddress: true,
    savedHomeAddress: '17 Iris Street, Witbank, 1035',
    activeDraft: { serviceId: 'hand_washing_laundry', awaitingSavedAddressConfirmation: true },
    inbound: { type: 'text' },
    originalUserText: 'No',
  });
  assert.equal(changedByText.promptKind, 'provide_new_address');
  assert.equal(changedByText.switchTargetTo, 'another_address');
  assert.equal(changedByText.awaitingAnotherAddress, true);
  assert.equal(changedByText.effectiveLocation, null);
});
