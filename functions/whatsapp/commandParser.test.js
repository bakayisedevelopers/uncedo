'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseWhatsAppCommand } = require('./commandParser');

test('natural-language booking and payment questions are left for the assistant command loop', () => {
  for (const text of [
    'booking history', 'status request request_123456', 'details',
    'payment status request request_123456', 'payment status', 'cancel my request',
    'please cancel request_123456', 'I want to cancel my booking',
  ]) assert.equal(parseWhatsAppCommand(text), null);
});

test('explicit payment and cancellation confirmation actions remain deterministic', () => {
  assert.deepEqual(parseWhatsAppCommand('pay now'), { type: 'payment_initiation' });
  assert.deepEqual(parseWhatsAppCommand('confirm cancellation'), { type: 'cancellation_confirm' });
  assert.deepEqual(parseWhatsAppCommand('keep booking'), { type: 'cancellation_abort' });
  assert.equal(parseWhatsAppCommand('set my price to 1'), null);
});
