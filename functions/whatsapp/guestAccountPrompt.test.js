'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { GUEST_ACCOUNT_BUTTONS, buildGuestAccountPrompt } = require('./guestAccountPrompt');

test('a missing account offers customer account creation or continuing as guest', () => {
  const prompt = buildGuestAccountPrompt('not-found');
  assert.equal(prompt.action, 'create-account');
  assert.match(prompt.text, /guest/);
  assert.match(prompt.text, /create (?:a )?customer account/i);
  assert.doesNotMatch(prompt.text, /\+?\d{8,}/);
  assert.deepEqual(prompt.interactive.action.buttons.map((button) => button.reply.id), [
    GUEST_ACCOUNT_BUTTONS.CREATE_ACCOUNT,
    GUEST_ACCOUNT_BUTTONS.CONTINUE_AS_GUEST,
  ]);
});

test('a unique account match offers linking or continuing as guest', () => {
  const prompt = buildGuestAccountPrompt('found');
  assert.equal(prompt.action, 'link-account');
  assert.match(prompt.text, /found one customer account/i);
  assert.match(prompt.text, /link that account/i);
  assert.deepEqual(prompt.interactive.action.buttons.map((button) => button.reply.id), [
    GUEST_ACCOUNT_BUTTONS.LINK_ACCOUNT,
    GUEST_ACCOUNT_BUTTONS.CONTINUE_AS_GUEST,
  ]);
});

test('ambiguous or unavailable account lookup does not offer unsafe create or link actions', () => {
  for (const status of ['ambiguous', 'unsupported', 'unavailable']) {
    const prompt = buildGuestAccountPrompt(status);
    assert.equal(prompt.interactive.action.buttons.length, 1);
    assert.equal(prompt.interactive.action.buttons[0].reply.id, GUEST_ACCOUNT_BUTTONS.CONTINUE_AS_GUEST);
  }
});
