'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { retentionDays, retentionExpiryMs, shouldDeleteConversationMessage } = require('./retentionPolicy');

test('retention policy uses bounded defaults and configured values', () => {
  assert.equal(retentionDays({}, 'WHATSAPP_MESSAGE_RETENTION_DAYS'), 180);
  assert.equal(retentionDays({ WHATSAPP_MESSAGE_RETENTION_DAYS: '45' }, 'WHATSAPP_MESSAGE_RETENTION_DAYS'), 45);
  assert.equal(retentionDays({ WHATSAPP_MESSAGE_RETENTION_DAYS: '0' }, 'WHATSAPP_MESSAGE_RETENTION_DAYS'), 1);
  assert.equal(retentionDays({ WHATSAPP_MESSAGE_RETENTION_DAYS: '5000' }, 'WHATSAPP_MESSAGE_RETENTION_DAYS'), 3650);
  assert.equal(retentionExpiryMs({ WHATSAPP_JOB_RETENTION_DAYS: '7' }, 'WHATSAPP_JOB_RETENTION_DAYS', 100), 604800100);
});

test('open support tickets keep linked conversation messages past ordinary message retention', () => {
  const expired = { ticketId: 'ticket', retentionExpiresAtMs: 1 };
  assert.equal(shouldDeleteConversationMessage(expired, 'open'), false);
  assert.equal(shouldDeleteConversationMessage(expired, 'resolved'), true);
  assert.equal(shouldDeleteConversationMessage(expired, null), true);
  assert.equal(shouldDeleteConversationMessage(expired, null), true);
  assert.equal(shouldDeleteConversationMessage({ retentionExpiresAtMs: Date.now() + 10000 }), false);
});
