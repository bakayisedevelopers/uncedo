'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { decodeHistoryCursor, encodeHistoryCursor, getWhatsAppConversationHistory, sanitizeConversationMessage } = require('./conversationHistory');

test('conversation history cursor is bounded and round-trips a timestamp and message ID', () => {
  const cursor = encodeHistoryCursor({ createdAtMs: 1000, id: 'wa_message_1' });
  assert.deepEqual(decodeHistoryCursor(cursor), { createdAtMs: 1000, id: 'wa_message_1' });
  assert.equal(decodeHistoryCursor('invalid!'), null);
  const precise = encodeHistoryCursor({ createdAtMs: 1000, createdAtSeconds: 1, createdAtNanoseconds: 456789, id: 'message_2' });
  assert.deepEqual(decodeHistoryCursor(precise), { createdAtMs: 1000, id: 'message_2', createdAtSeconds: 1, createdAtNanoseconds: 456789 });
});

test('conversation history strips phone identifiers, gateway data, storage paths, and arbitrary fields', () => {
  const message = sanitizeConversationMessage('message-1', {
    direction: 'outbound', text: 'Hello', to: '27710000000', phoneNumberId: 'meta-id', authorizationCode: 'secret',
    media: { assetId: 'asset-1', storagePath: 'private/path', mimeType: 'image/jpeg', filename: 'image.jpg' },
    createdAt: { toMillis: () => 1234 },
  });
  assert.deepEqual(message.media, { assetId: 'asset-1', mimeType: 'image/jpeg', mediaType: '', filename: 'image.jpg' });
  assert.equal('to' in message, false);
  assert.equal('authorizationCode' in message, false);
  assert.equal(message.createdAtMs, 1234);
});

test('history query paginates in deterministic newest-first query order and returns chronological pages', async () => {
  const calls = [];
  const docs = [
    { id: 'm2', data: () => ({ identityId: 'a'.repeat(64), text: 'second', createdAt: { toMillis: () => 2000 } }) },
    { id: 'm1', data: () => ({ identityId: 'a'.repeat(64), text: 'first', createdAt: { toMillis: () => 1000 } }) },
  ];
  const query = {
    where(...args) { calls.push(['where', ...args]); return this; },
    orderBy(...args) { calls.push(['orderBy', ...args]); return this; },
    startAfter(...args) { calls.push(['startAfter', ...args]); return this; },
    limit(value) { calls.push(['limit', value]); return this; },
    async get() { return { docs }; },
  };
  const result = await getWhatsAppConversationHistory({ db: { collection: () => query }, documentIdField: 'document-id', identityId: 'a'.repeat(64), pageSize: 1 });
  assert.equal(calls[0][0], 'where');
  assert.equal(calls[1][0], 'orderBy');
  assert.deepEqual(result.messages.map((item) => item.text), ['second']);
  assert.equal(result.hasMore, true);
  assert.ok(result.nextCursor);
});
