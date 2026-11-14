'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  WHATSAPP_ONBOARDING_BUTTONS,
  getWhatsAppAccountSetupMode,
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

test('account choice uses sign-in for an existing account and sign-up for a new account', () => {
  assert.equal(getWhatsAppAccountSetupMode('link-customer-account'), 'signin');
  assert.equal(getWhatsAppAccountSetupMode('link-helper-account'), 'signin');
  assert.equal(getWhatsAppAccountSetupMode('create-customer-signup-link'), 'signup');
  assert.equal(getWhatsAppAccountSetupMode('create-helper-signup-link'), 'signup');
  assert.equal(getWhatsAppAccountSetupMode('unexpected-action'), '');
});

test('matched guest account-link retries preserve their server-selected link mode', () => {
  const retry = transitionWhatsAppOnboarding({
    state: { stage: 'awaiting_account_signup', role: 'customer', accountMode: 'link-existing', accountMatchMode: 'auth-phone' },
    text: 'resend account link',
  });
  assert.equal(retry.action, 'link-customer-account');
  assert.equal(retry.state.accountMatchMode, 'auth-phone');
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

test('police-clearance onboarding accepts only document or image messages and waits for admin review', () => {
  const stage = { stage: 'awaiting_helper_police_clearance', role: 'helper', accountMode: 'account' };
  const document = transitionWhatsAppOnboarding({ state: stage, inboundType: 'document' });
  assert.equal(document.action, 'submit-helper-police-clearance');
  assert.equal(document.state.stage, 'awaiting_helper_police_clearance_review');

  const image = transitionWhatsAppOnboarding({ state: stage, inboundType: 'image' });
  assert.equal(image.action, 'submit-helper-police-clearance');
  const text = transitionWhatsAppOnboarding({ state: stage, inboundType: 'text', text: 'I will upload later' });
  assert.equal(text.action, 'await-helper-police-clearance');
  assert.match(text.reply, /PDF or a clear JPG\/PNG image/);

  const pending = transitionWhatsAppOnboarding({ state: { ...stage, stage: 'awaiting_helper_police_clearance_review' }, inboundType: 'document' });
  assert.equal(pending.action, 'await-helper-police-clearance-review');
  assert.match(pending.reply, /awaiting Uncedo review/);
});

test('profile photo onboarding accepts images and prompts link for non-image messages', () => {
  const stage = { stage: 'awaiting_helper_profile_photo', role: 'helper', accountMode: 'account' };
  const image = transitionWhatsAppOnboarding({ state: stage, inboundType: 'image' });
  assert.equal(image.action, 'submit-helper-profile-photo');
  const text = transitionWhatsAppOnboarding({ state: stage, inboundType: 'text', text: 'where do I upload?' });
  assert.equal(text.action, 'await-helper-profile-photo');
});

test('payout and admin verification onboarding stages return deterministic wait actions', () => {
  const payout = transitionWhatsAppOnboarding({
    state: { stage: 'awaiting_helper_payout', role: 'helper', accountMode: 'account' },
    inboundType: 'text',
    text: '1234567890',
  });
  assert.equal(payout.action, 'await-helper-payout');

  const adminWait = transitionWhatsAppOnboarding({
    state: { stage: 'awaiting_helper_admin_verification', role: 'helper', accountMode: 'account' },
    inboundType: 'text',
    text: 'Hi',
  });
  assert.equal(adminWait.action, 'await-helper-admin-verification');
});

test('invalid onboarding input is re-prompted and control characters are removed', () => {
  const invalidName = transitionWhatsAppOnboarding({ state: { stage: 'awaiting_preferred_name' }, text: '\u0000   ' });
  assert.equal(invalidName.action, 'reask-preferred-name');
  const invalidAddress = transitionWhatsAppOnboarding({ state: { stage: 'awaiting_home_address' }, text: '123' });
  assert.equal(invalidAddress.action, 'reask-home-address');
});

test('helper service onboarding supports option selection before proceeding to photo upload', () => {
  const pickedService = transitionWhatsAppOnboarding({
    state: { stage: 'awaiting_helper_services', role: 'helper', onboardingPath: 'helper' },
    buttonId: 'wa_helper_service_hairstyles',
  });
  assert.equal(pickedService.action, 'select-helper-service');
  assert.equal(pickedService.serviceId, 'hairstyles');
  assert.deepEqual(pickedService.state.selectedServiceIds, ['hairstyles']);

  const pickedOpt = transitionWhatsAppOnboarding({
    state: { ...pickedService.state, stage: 'awaiting_helper_service_options', pendingOptionServiceId: 'hairstyles' },
    buttonId: 'wa_helper_opt_sel_knotless_braids',
  });
  assert.equal(pickedOpt.action, 'select-helper-service-option');
  assert.equal(pickedOpt.optionId, 'knotless_braids');
  assert.equal(pickedOpt.state.selectedServiceOptions.length, 1);
  assert.equal(pickedOpt.state.selectedServiceOptions[0].optionId, 'knotless_braids');

  const doneOpts = transitionWhatsAppOnboarding({
    state: pickedOpt.state,
    buttonId: WHATSAPP_ONBOARDING_BUTTONS.DONE_HELPER_SERVICE_OPTIONS,
  });
  assert.equal(doneOpts.action, 'ask-helper-service-more');
  assert.equal(doneOpts.state.stage, 'awaiting_helper_service_more');

  const submit = transitionWhatsAppOnboarding({
    state: doneOpts.state,
    buttonId: WHATSAPP_ONBOARDING_BUTTONS.DONE_HELPER_SERVICES,
  });
  assert.equal(submit.action, 'submit-helper-services');
  assert.deepEqual(submit.requestedServiceIds, ['hairstyles']);
  assert.equal(submit.requestedServiceOptions.length, 1);
  assert.equal(submit.requestedServiceOptions[0].optionId, 'knotless_braids');
});

