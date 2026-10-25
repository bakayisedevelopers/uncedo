'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMetaWhatsAppClient } = require('./metaClient');

test('media relay uploads privately through Meta then sends only the returned media ID', async () => {
  const requests = [];
  const client = createMetaWhatsAppClient({
    accessToken: 'test-access-token', phoneNumberId: 'sender-1', graphApiVersion: 'v99.0',
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
