'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyMetaDeliveryError } = require('./deliveryStatus');
const { createMetaWhatsAppClient, DEFAULT_SEND_TIMEOUT_MS, MAX_SEND_TIMEOUT_MS, normalizeSendTimeout } = require('./metaClient');

test('media relay uploads privately through Meta then sends only the returned media ID', async () => {
  const requests = [];
  const client = createMetaWhatsAppClient({
    accessToken: 'test-access-token', phoneNumberId: 'sender-1', graphApiVersion: 'v99.0',
    isRecipientAllowed: () => true,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return requests.length === 1
        ? { ok: true, status: 200, json: async () => ({ id: 'meta-media-id' }) }
        : { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.outbound' }] }) };
    },
  });
  const result = await client.sendMedia({
    to: '+27820001111', buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]), mimeType: 'image/jpeg',
    mediaType: 'image', caption: 'Here is the image', lastInboundAtMs: Date.now(),
  });
  assert.equal(result.messageId, 'wamid.outbound');
  assert.match(requests[0].url, /\/sender-1\/media$/);
  assert.equal(requests[0].options.body.get('messaging_product'), 'whatsapp');
  assert.equal(requests[1].url.endsWith('/sender-1/messages'), true);
  const messageBody = JSON.parse(requests[1].options.body);
  assert.equal(messageBody.type, 'image');
  assert.equal(messageBody.image.id, 'meta-media-id');
  assert.equal(messageBody.image.caption, 'Here is the image');
  assert.equal(requests[1].options.body.includes('data:image'), false);
});

test('media relay does not upload or send when the recipient service window is closed', async () => {
  let calls = 0;
  const client = createMetaWhatsAppClient({
    accessToken: 'test-access-token', phoneNumberId: 'sender-1', graphApiVersion: 'v99.0',
    fetchImpl: async () => { calls += 1; },
  });
  await assert.rejects(client.sendMedia({
    to: '27820001111', buffer: Buffer.from([0xff, 0xd8, 0xff]), mimeType: 'image/jpeg', mediaType: 'image',
    lastInboundAtMs: Date.now() - 25 * 60 * 60 * 1000,
  }), { code: 'template-required' });
  assert.equal(calls, 0);
});

test('ordinary sends use a bounded timeout and ambiguous network outcomes are not retryable successes', async () => {
  let calls = 0;
  let signal;
  const client = createMetaWhatsAppClient({
    accessToken: 'test-access-token', phoneNumberId: 'sender-1', graphApiVersion: 'v99.0', requestTimeoutMs: 60_000,
    isRecipientAllowed: () => true,
    fetchImpl: async (_url, options) => {
      calls += 1;
      signal = options.signal;
      throw Object.assign(new Error('private transport detail'), { name: 'TimeoutError', code: 'ETIMEDOUT' });
    },
  });
  await assert.rejects(client.sendText({ to: '27820001111', text: 'Test only', lastInboundAtMs: Date.now() }), (error) => {
    assert.equal(error.code, 'meta_send_timeout');
    assert.equal(error.message, 'WhatsApp send outcome is unknown because Meta returned no response.');
    assert.doesNotMatch(error.message, /private transport detail/);
    assert.equal(classifyMetaDeliveryError(error), 'outcome_unknown');
    return true;
  });
  assert.equal(calls, 1);
  assert.ok(signal);
  assert.equal(normalizeSendTimeout(60_000), MAX_SEND_TIMEOUT_MS);
  assert.equal(normalizeSendTimeout(500), 1_000);
  assert.equal(normalizeSendTimeout('not-a-number'), DEFAULT_SEND_TIMEOUT_MS);
});

test('a success response without a Meta message ID is recorded as an unknown outcome', async () => {
  const client = createMetaWhatsAppClient({
    accessToken: 'test-access-token', phoneNumberId: 'sender-1', graphApiVersion: 'v99.0',
    isRecipientAllowed: () => true,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ messages: [] }) }),
  });
  await assert.rejects(client.sendText({ to: '27820001111', text: 'Test only', lastInboundAtMs: Date.now() }), (error) => {
    assert.equal(error.code, 'meta_response_missing_message_id');
    assert.equal(classifyMetaDeliveryError(error), 'outcome_unknown');
    return true;
  });
});

test('unapproved recipients are blocked before an HTTP send or media upload', async () => {
  let calls = 0;
  const client = createMetaWhatsAppClient({
    accessToken: 'test-access-token', phoneNumberId: 'sender-1', graphApiVersion: 'v99.0',
    isRecipientAllowed: () => false,
    fetchImpl: async () => { calls += 1; throw new Error('must not be called'); },
  });
  await assert.rejects(client.sendText({ to: '27820001111', text: 'No send', lastInboundAtMs: Date.now() }), { code: 'recipient-not-allowlisted' });
  await assert.rejects(client.sendMedia({
    to: '27820001111', buffer: Buffer.from([0xff, 0xd8, 0xff]), mimeType: 'image/jpeg', mediaType: 'image', lastInboundAtMs: Date.now(),
  }), { code: 'recipient-not-allowlisted' });
  assert.equal(calls, 0);
});
