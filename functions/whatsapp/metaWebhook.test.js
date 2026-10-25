'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const {
  getWhatsAppOutboundMode,
  normalizeWebhookPayload,
  verifyWebhookChallenge,
  verifyWebhookSignature,
} = require('./metaWebhook');

test('Meta verification accepts only the matching subscribe challenge', () => {
  assert.equal(verifyWebhookChallenge({
    mode: 'subscribe', token: 'verify-me', challenge: 'challenge-1', expectedToken: 'verify-me',
  }), 'challenge-1');
  assert.equal(verifyWebhookChallenge({
    mode: 'subscribe', token: 'wrong', challenge: 'challenge-1', expectedToken: 'verify-me',
  }), null);
  assert.equal(verifyWebhookChallenge({
    mode: 'unsubscribe', token: 'verify-me', challenge: 'challenge-1', expectedToken: 'verify-me',
  }), null);
});

test('Meta webhook signature checks the unmodified raw request body', () => {
  const secret = 'test-meta-app-secret';
  const rawBody = Buffer.from('{"object":"whatsapp_business_account"}');
  const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  assert.equal(verifyWebhookSignature(rawBody, signature, secret), true);
  assert.equal(verifyWebhookSignature(Buffer.from(`${rawBody.toString()} `), signature, secret), false);
  assert.equal(verifyWebhookSignature(rawBody, 'sha256=bad', secret), false);
  assert.equal(verifyWebhookSignature(rawBody, signature, ''), false);
});

test('webhook normalization creates stable, bounded message and status events', () => {
  const events = normalizeWebhookPayload({
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: '100200300' },
          contacts: [{ wa_id: '27820001111', profile: { name: 'Customer' } }],
          messages: [
            { id: 'wamid.1', from: '27820001111', timestamp: '1792828800', type: 'text', text: { body: 'Hello' } },
            { id: 'wamid.2', from: '27820001111', timestamp: '1792828801', type: 'location', location: { latitude: -25.8, longitude: 28.2, address: 'Centurion' } },
            { id: 'wamid.3', from: '27820001111', timestamp: '1792828802', type: 'image', image: { id: 'media-1', mime_type: 'image/jpeg', caption: 'My car' } },
          ],
          statuses: [{ id: 'wamid.out', recipient_id: '27820001111', status: 'delivered', timestamp: '1792828803' }],
        },
      }],
    }],
  });
  assert.equal(events.length, 4);
  assert.equal(events[0].eventType, 'message');
  assert.equal(events[0].text, 'Hello');
  assert.equal(events[1].location.latitude, -25.8);
  assert.equal(events[2].media.mediaId, 'media-1');
  assert.equal(events[3].eventType, 'message_status');
  assert.equal(events[0].eventId, normalizeWebhookPayload({
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: '100200300' },
      messages: [{ id: 'wamid.1', from: '27820001111', timestamp: '1792828800', type: 'text', text: { body: 'Hello' } }],
    } }] }],
  })[0].eventId);
});

test('24-hour window is based on the latest inbound customer timestamp', () => {
  const now = 1_800_000_000_000;
  assert.equal(getWhatsAppOutboundMode(now - (23 * 60 * 60 * 1000), now), 'free_form_allowed');
  assert.equal(getWhatsAppOutboundMode(now - (24 * 60 * 60 * 1000), now), 'approved_template_required');
  assert.equal(getWhatsAppOutboundMode(now + 1000, now), 'approved_template_required');
});
