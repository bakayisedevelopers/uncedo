'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { formatWhatsAppText, getWhatsAppDisplayName } = require('./messageFormatting');

test('normalizes common Markdown into WhatsApp text formatting', () => {
  assert.equal(formatWhatsAppText('## Services\n- **Home cleaning**\n- Gardening\n\n\nAsk me.'),
    '*Services*\n• *Home cleaning*\n• Gardening\n\nAsk me.');
  assert.equal(formatWhatsAppText('1) First step\n2) Second step'), '1. First step\n2. Second step');
});

test('keeps WhatsApp bold and bullet syntax and respects the message limit', () => {
  assert.equal(formatWhatsAppText('*Welcome*\n• Cleaning'), '*Welcome*\n• Cleaning');
  assert.equal(formatWhatsAppText('x'.repeat(5000)).length, 4096);
});

test('chooses a human-readable preferred name and falls back for emoji-only names', () => {
  assert.equal(getWhatsAppDisplayName({ preferredName: 'Jabu ✨', profileName: 'Other Name' }), 'Jabu');
  assert.equal(getWhatsAppDisplayName({ profileName: '🌟💚' }), '');
  assert.equal(getWhatsAppDisplayName({ firstName: 'Anele' }), 'Anele');
});
