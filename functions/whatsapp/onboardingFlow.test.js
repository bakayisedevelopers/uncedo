'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  WHATSAPP_ONBOARDING_BUTTONS,
  roleSelectionPrompt,
  transitionWhatsAppOnboarding,
} = require('./onboardingFlow');

test('new identity receives deterministic role choices only after policy acceptance is handled by caller', () => {
  const prompt = roleSelectionPrompt();
  assert.match(prompt.text, /service or joining as a helper/);
  assert.deepEqual(prompt.interactive.action.buttons.map((button) => button.reply.id), [
    WHATSAPP_ONBOARDING_BUTTONS.CUSTOMER,
    WHATSAPP_ONBOARDING_BUTTONS.HELPER,
  ]);
});

test('customer can continue as a guest without creating a Firebase account', () => {
  const choice = transitionWhatsAppOnboarding({
    state: { stage: 'awaiting_role' },
    buttonId: WHATSAPP_ONBOARDING_BUTTONS.CUSTOMER,
  });
  assert.equal(choice.state.role, 'customer');
  assert.equal(choice.state.stage, 'awaiting_customer_choice');

  const guest = transitionWhatsAppOnboarding({
    state: choice.state,
    buttonId: WHATSAPP_ONBOARDING_BUTTONS.CONTINUE_AS_GUEST,
  });
  assert.equal(guest.state.accountMode, 'guest');
  assert.equal(guest.state.stage, 'awaiting_preferred_name');
});

test('customer account creation uses a secure signup link', () => {
  const customer = transitionWhatsAppOnboarding({
    state: { stage: 'awaiting_role', role: '' },
    buttonId: WHATSAPP_ONBOARDING_BUTTONS.CUSTOMER,
  });
  const customerLink = transitionWhatsAppOnboarding({
    state: customer.state,
    buttonId: WHATSAPP_ONBOARDING_BUTTONS.CREATE_ACCOUNT,
  });
  assert.equal(customerLink.action, 'create-customer-signup-link');
  assert.equal(customerLink.state.accountMode, 'account');

});

test('helper account creation or linking is selected before a secure link is issued', () => {
  const helperChoice = transitionWhatsAppOnboarding({
    state: { stage: 'awaiting_role' },
    buttonId: WHATSAPP_ONBOARDING_BUTTONS.HELPER,
  });
  assert.equal(helperChoice.action, 'choose-helper-account-mode');
  assert.equal(helperChoice.state.stage, 'awaiting_helper_account_choice');

  const helperCreate = transitionWhatsAppOnboarding({
    state: helperChoice.state,
    buttonId: WHATSAPP_ONBOARDING_BUTTONS.CREATE_HELPER_ACCOUNT,
  });
  assert.equal(helperCreate.action, 'create-helper-signup-link');
  assert.equal(helperCreate.state.accountMode, 'account');

  const helperLink = transitionWhatsAppOnboarding({
    state: helperChoice.state,
    buttonId: WHATSAPP_ONBOARDING_BUTTONS.LINK_HELPER_ACCOUNT,
  });
  assert.equal(helperLink.action, 'link-helper-account');
  assert.equal(helperLink.state.accountMode, 'link-existing');
});

test('guest preferred name and home address are explicit and optional', () => {
  const named = transitionWhatsAppOnboarding({
    state: { stage: 'awaiting_preferred_name', role: 'customer', accountMode: 'guest' },
    text: '  Jabu ✨  ',
  });
  assert.equal(named.preferredName, 'Jabu ✨');
  assert.equal(named.state.stage, 'awaiting_address_choice');

  const address = transitionWhatsAppOnboarding({
    state: named.state,
    buttonId: WHATSAPP_ONBOARDING_BUTTONS.ADD_HOME_ADDRESS,
  });
  assert.equal(address.state.stage, 'awaiting_home_address');

  const completed = transitionWhatsAppOnboarding({ state: address.state, text: '12 Main Road, Johannesburg' });
  assert.equal(completed.homeAddress, '12 Main Road, Johannesburg');
  assert.equal(completed.state.stage, 'complete');
  assert.equal(completed.action, 'complete-customer-onboarding');
});

test('linked helpers must provide their home address before readiness is checked', () => {
  const named = transitionWhatsAppOnboarding({
    state: { stage: 'awaiting_preferred_name', role: 'helper', accountMode: 'account' },
    text: 'Jabu Msiza',
  });
  assert.equal(named.state.stage, 'awaiting_home_address');
  const addressed = transitionWhatsAppOnboarding({ state: named.state, text: '12 Main Road, Johannesburg' });
  assert.equal(addressed.state.stage, 'helper_readiness');
  assert.equal(addressed.action, 'check-helper-readiness');
});

test('helper agreement stage waits for acceptance and can issue a replacement link', () => {
  const waiting = transitionWhatsAppOnboarding({ state: { stage: 'awaiting_helper_agreement', role: 'helper' }, text: 'okay' });
  assert.equal(waiting.action, 'await-helper-agreement');
  const replacement = transitionWhatsAppOnboarding({ state: waiting.state, text: 'new agreement link' });
  assert.equal(replacement.action, 'create-helper-agreement-link');
});

test('invalid onboarding input is re-prompted and control characters are removed', () => {
  const invalidName = transitionWhatsAppOnboarding({ state: { stage: 'awaiting_preferred_name' }, text: '\u0000   ' });
  assert.equal(invalidName.action, 'reask-preferred-name');
  const invalidAddress = transitionWhatsAppOnboarding({ state: { stage: 'awaiting_home_address' }, text: '123' });
  assert.equal(invalidAddress.action, 'reask-home-address');
});
