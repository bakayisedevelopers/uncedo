'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCashConfirmationTemplateComponents,
  buildHelperOfferTemplateComponents,
  buildOtpTemplateComponents,
  buildServiceUpdateTemplateComponents,
  buildSupportReplyTemplateComponents,
} = require('./templatePayloads');

function bodyValues(components) {
  return components.find((component) => component.type === 'body').parameters.map(({ text }) => text);
}

test('OTP runtime payload supplies one body code parameter for the authentication template', () => {
  assert.deepEqual(bodyValues(buildOtpTemplateComponents('123456')), ['123456']);
  assert.throws(() => buildOtpTemplateComponents('12345'), /six digit/);
});

test('helper offer runtime payload preserves two body parameters and Accept/Decline payload order', () => {
  const components = buildHelperOfferTemplateComponents({
    serviceSummary: 'Car wash', amountText: 'R250.00', acceptActionId: `wa_${'a'.repeat(64)}`, declineActionId: `wa_${'b'.repeat(64)}`,
  });
  assert.deepEqual(bodyValues(components), ['Car wash', 'R250.00']);
  assert.deepEqual(components.slice(1).map(({ index, parameters }) => [index, parameters[0].payload]), [
    ['0', `wa_offer_accept_wa_${'a'.repeat(64)}`],
    ['1', `wa_offer_decline_wa_${'b'.repeat(64)}`],
  ]);
  assert.throws(() => buildHelperOfferTemplateComponents({ acceptActionId: 'untrusted', declineActionId: 'untrusted' }), /server-created/);
});

test('support reply and shared service update match their one and two body parameter contracts', () => {
  assert.deepEqual(bodyValues(buildSupportReplyTemplateComponents('We have replied to your request.')), ['We have replied to your request.']);
  assert.deepEqual(bodyValues(buildServiceUpdateTemplateComponents({ service: 'Car wash', update: 'Your helper is assigned.' })), ['Car wash', 'Your helper is assigned.']);
});

test('cash confirmation uses request reference then amount and does not add unsupported buttons', () => {
  const components = buildCashConfirmationTemplateComponents({ requestReference: 'REQ-123456', amountText: 'R500.00' });
  assert.deepEqual(bodyValues(components), ['REQ-123456', 'R500.00']);
  assert.equal(components.some((component) => component.type === 'button'), false);
});
