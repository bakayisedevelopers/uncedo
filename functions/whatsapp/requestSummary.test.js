'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWhatsAppRequestSummary, formatWhatsAppRequestHistory, formatWhatsAppRequestSummary } = require('./requestSummary');

test('request summary reveals only authorized service status and assigned helper name', () => {
  const summary = buildWhatsAppRequestSummary({
    id: 'request-12345678',
    serviceSummary: 'House cleaning',
    status: 'work_started',
    serviceAddress: 'private address',
    customerPhone: 'private phone',
    helperAssignment: { helperName: 'Helper One', helperPhone: 'private helper phone' },
  });
  const response = formatWhatsAppRequestSummary(summary);
  assert.match(response, /House cleaning is in progress/);
  assert.match(response, /Helper One/);
  assert.doesNotMatch(response, /private address|private phone/);
});

test('request history is bounded and does not include addresses or phone numbers', () => {
  const history = formatWhatsAppRequestHistory(Array.from({ length: 9 }, (_, index) => ({
    id: `request-${String(index).padStart(8, '0')}`,
    subject: `Service ${index}`,
    status: index % 2 ? 'completed' : 'matching',
    serviceAddress: 'private address',
    customerPhone: 'private phone',
  })));
  assert.equal((history.match(/• /g) || []).length, 5);
  assert.doesNotMatch(history, /private address|private phone/);
  assert.match(history, /payment status request/);
});

test('unknown lifecycle states are not represented as confirmed states', () => {
  assert.equal(buildWhatsAppRequestSummary({ id: 'request-12345678', status: 'future_state' }).statusLabel, 'not available in WhatsApp');
});
