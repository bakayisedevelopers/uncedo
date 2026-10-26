'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const {
  normalizeWebhookPayload,
  verifyWebhookChallenge,
  verifyWebhookSignature,
} = require('./metaWebhook');
const { createWhatsAppWebhookHandler } = require('./webhookHandler');

function makeHarness({ messagingEnabled = false, verifyToken = 'local-test-token', appSecret = 'local-test-app-secret', isRecipientAllowed = () => true } = {}) {
  const calls = { signatures: 0, normalizations: 0, collections: 0, transactions: 0, writes: 0 };
  const db = {
    collection(name) {
      calls.collections += 1;
      assert.equal(name, 'whatsappWebhookEvents');
      return { doc: (id) => ({ id }) };
    },
    async runTransaction(callback) {
      calls.transactions += 1;
      return callback({
        get: async () => ({ exists: false }),
        create: () => { calls.writes += 1; },
      });
    },
  };
  const admin = { firestore: { FieldValue: { serverTimestamp: () => 'server-timestamp' } } };
  const logger = { error() {}, warn() {}, info() {} };
  const handler = createWhatsAppWebhookHandler({
    getSecrets: () => ({ verifyToken, appSecret, phoneNumberId: 'phone-number-1' }),
    isMessagingEnabled: () => messagingEnabled,
    isRecipientAllowed,
    verifyWebhookChallenge,
    verifyWebhookSignature(rawBody, signature, secret) {
      calls.signatures += 1;
      return verifyWebhookSignature(rawBody, signature, secret);
    },
    normalizeWebhookPayload(payload) {
      calls.normalizations += 1;
      return normalizeWebhookPayload(payload);
    },
    db,
    admin,
    logger,
  });
  return { handler, calls };
}

function makeResponse() {
  return {
    statusCode: null,
    contentType: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    type(value) { this.contentType = value; return this; },
    send(value) { this.body = value; return this; },
  };
}

test('valid Meta GET challenge succeeds while messaging is disabled', async () => {
  const { handler, calls } = makeHarness({ messagingEnabled: false });
  const res = makeResponse();
  await handler({ method: 'GET', query: {
    'hub.mode': 'subscribe',
    'hub.verify_token': 'local-test-token',
    'hub.challenge': 'challenge-exactly-as-sent',
  } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.contentType, 'text/plain');
  assert.equal(res.body, 'challenge-exactly-as-sent');
  assert.deepEqual(calls, { signatures: 0, normalizations: 0, collections: 0, transactions: 0, writes: 0 });
});

test('invalid verify token is rejected without disclosing the expected token', async () => {
  const { handler } = makeHarness();
  const res = makeResponse();
  await handler({ method: 'GET', query: {
    'hub.mode': 'subscribe',
    'hub.verify_token': 'wrong-token',
    'hub.challenge': 'challenge',
  } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body, 'Forbidden');
  assert.doesNotMatch(res.body, /local-test-token/);
});

test('missing verify token is rejected', async () => {
  const { handler } = makeHarness();
  const res = makeResponse();
  await handler({ method: 'GET', query: { 'hub.mode': 'subscribe', 'hub.challenge': 'challenge' } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body, 'Forbidden');
});

test('invalid Meta verification mode is rejected', async () => {
  const { handler } = makeHarness();
  const res = makeResponse();
  await handler({ method: 'GET', query: {
    'hub.mode': 'unsubscribe',
    'hub.verify_token': 'local-test-token',
    'hub.challenge': 'challenge',
  } }, res);
  assert.equal(res.statusCode, 403);
});

test('POST stays disabled before signature checks, persistence, or assistant processing', async () => {
  const { handler, calls } = makeHarness({ messagingEnabled: false });
  const res = makeResponse();
  await handler({
    method: 'POST',
    rawBody: Buffer.from('{"object":"whatsapp_business_account"}'),
    body: { object: 'whatsapp_business_account' },
    get() { return 'irrelevant'; },
  }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body, 'WhatsApp messaging is disabled.');
  assert.deepEqual(calls, { signatures: 0, normalizations: 0, collections: 0, transactions: 0, writes: 0 });
});

test('enabled POST still requires a valid raw-body HMAC signature before persistence', async () => {
  const { handler, calls } = makeHarness({ messagingEnabled: true });
  const rawBody = Buffer.from('{"object":"whatsapp_business_account"}');
  const badResponse = makeResponse();
  await handler({
    method: 'POST', rawBody, body: { object: 'whatsapp_business_account' },
    get: () => 'sha256=' + '0'.repeat(64), headers: {},
  }, badResponse);
  assert.equal(badResponse.statusCode, 403);
  assert.equal(calls.signatures, 1);
  assert.equal(calls.collections, 0);

  const signature = `sha256=${createHmac('sha256', 'local-test-app-secret').update(rawBody).digest('hex')}`;
  const validResponse = makeResponse();
  await handler({
    method: 'POST', rawBody,
    body: {
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { metadata: { phone_number_id: 'phone-number-1' } } }] }],
    },
    get: () => signature,
    headers: {},
  }, validResponse);
  assert.equal(validResponse.statusCode, 200);
  assert.equal(validResponse.body, 'EVENT_RECEIVED');
  assert.equal(calls.signatures, 2);
  assert.equal(calls.normalizations, 1);
  assert.equal(calls.collections, 0);
});

test('enabled signed messages retain transactional, duplicate-safe event persistence', async () => {
  const { handler, calls } = makeHarness({ messagingEnabled: true });
  const body = {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: 'phone-number-1' },
      messages: [{ id: 'wamid.test', from: '27820000000', timestamp: '1792828800', type: 'text', text: { body: 'test' } }],
    } }] }],
  };
  const rawBody = Buffer.from(JSON.stringify(body));
  const signature = `sha256=${createHmac('sha256', 'local-test-app-secret').update(rawBody).digest('hex')}`;
  const res = makeResponse();
  await handler({ method: 'POST', rawBody, body, get: () => signature, headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.signatures, 1);
  assert.equal(calls.normalizations, 1);
  assert.equal(calls.collections, 1);
  assert.equal(calls.transactions, 1);
  assert.equal(calls.writes, 1);
});

test('signed events from outside the test cohort are acknowledged but not persisted', async () => {
  const { handler, calls } = makeHarness({ messagingEnabled: true, isRecipientAllowed: () => false });
  const body = {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: 'phone-number-1' },
      messages: [{ id: 'wamid.not-allowlisted', from: '27820000000', timestamp: '1792828800', type: 'text', text: { body: 'Hi' } }],
    } }] }],
  };
  const rawBody = Buffer.from(JSON.stringify(body));
  const signature = `sha256=${createHmac('sha256', 'local-test-app-secret').update(rawBody).digest('hex')}`;
  const res = makeResponse();
  await handler({ method: 'POST', rawBody, body, get: () => signature, headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, 'EVENT_RECEIVED');
  assert.equal(calls.signatures, 1);
  assert.equal(calls.normalizations, 1);
  assert.equal(calls.collections, 0);
  assert.equal(calls.transactions, 0);
  assert.equal(calls.writes, 0);
});
