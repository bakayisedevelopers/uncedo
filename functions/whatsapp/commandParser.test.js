'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseWhatsAppCommand } = require('./commandParser');

test('parses bounded booking and payment enquiry commands', () => {
  assert.deepEqual(parseWhatsAppCommand('  booking history '), { type: 'booking_history' });
  assert.deepEqual(parseWhatsAppCommand('status request request_123456'), { type: 'booking_status', requestId: 'request_123456' });
  assert.deepEqual(parseWhatsAppCommand('details'), { type: 'booking_details', requestId: null });
  assert.deepEqual(parseWhatsAppCommand('payment status request request_123456'), { type: 'payment_status', requestId: 'request_123456' });
  assert.deepEqual(parseWhatsAppCommand('payment status'), { type: 'payment_status', requestId: null });
});

test('payment initiation remains a non-mutating intent and cancellation requires the workflow', () => {
  assert.deepEqual(parseWhatsAppCommand('pay now'), { type: 'payment_initiation' });
  assert.deepEqual(parseWhatsAppCommand('cancel my booking'), { type: 'cancellation_request', requestId: null });
  assert.deepEqual(parseWhatsAppCommand('cancel request request_123456'), { type: 'cancellation_request', requestId: 'request_123456' });
  assert.deepEqual(parseWhatsAppCommand('confirm cancellation'), { type: 'cancellation_confirm' });
  assert.deepEqual(parseWhatsAppCommand('keep booking'), { type: 'cancellation_abort' });
  assert.equal(parseWhatsAppCommand('set my price to 1'), null);
});
