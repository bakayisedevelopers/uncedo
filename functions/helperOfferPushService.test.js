const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildHelperOfferPushPayload,
  isInvalidFcmRegistrationError,
  sendHelperOfferWebPush,
} = require('./helperOfferPushService');

test('buildHelperOfferPushPayload formats complete offer details as string-only FCM data', () => {
  const nowMs = 1_700_000_000_000;
  const payload = buildHelperOfferPushPayload({
    requestId: 'req_123',
    helperId: 'helper_abc',
    payoutAmount: 195,
    nowMs,
    request: {
      topic: 'Laundry Basket Wash & Fold',
      customerName: 'Nomsa Dlamini',
      offerToken: 'tok_xyz',
      offerRevision: 2,
      offerExpiresAt: nowMs + 30_000,
      lastOfferAt: nowMs,
      preSelectedPaymentType: 'card',
      requestPayload: {
        serviceAddress: '14 Main Rd, Rondebosch',
        timingPreference: 'now',
        structuredAnswers: {
          basket_size: 'medium_load',
          ironing_included: true,
        },
        notes: 'Please ring the gate bell.',
      },
    },
  });

  assert.equal(payload.data.type, 'uncedo-job-offer');
  assert.equal(payload.data.requestId, 'req_123');
  assert.equal(payload.data.helperId, 'helper_abc');
  assert.equal(payload.data.offerToken, 'tok_xyz');
  assert.equal(payload.data.offerRevision, '2');
  assert.equal(payload.data.tag, 'uncedo-offer-req_123');
  assert.equal(payload.data.title, 'New Job Offer · Laundry Basket Wash & Fold (R195.00)');
  assert.match(payload.data.body, /Nomsa Dlamini \| 14 Main Rd, Rondebosch/);
  assert.match(payload.data.body, /Payment: Card · Timing: Now · 30s window/);
  assert.match(payload.data.body, /Basket size: Medium load · Ironing included: Yes/);
  assert.match(payload.data.body, /Notes: Please ring the gate bell\./);
  assert.equal(
    payload.data.acceptPath,
    '/home?offerId=req_123&offerAction=accept&offerToken=tok_xyz&offerRevision=2',
  );
  assert.equal(
    payload.data.declinePath,
    '/home?offerId=req_123&offerAction=decline&offerToken=tok_xyz&offerRevision=2',
  );
  assert.equal(
    payload.data.focusPath,
    '/home?offerId=req_123&offerAction=view&offerToken=tok_xyz&offerRevision=2',
  );
  assert.equal(payload.webpush.headers.Urgency, 'high');

  for (const [k, v] of Object.entries(payload.data)) {
    assert.equal(typeof v, 'string', `Expected FCM data.${k} to be string`);
  }
});

test('isInvalidFcmRegistrationError detects expired or invalid FCM tokens', () => {
  assert.equal(isInvalidFcmRegistrationError({ code: 'messaging/registration-token-not-registered' }), true);
  assert.equal(isInvalidFcmRegistrationError({ code: 'messaging/invalid-registration-token' }), true);
  assert.equal(isInvalidFcmRegistrationError({ code: 'messaging/internal-error' }), false);
});

test('sendHelperOfferWebPush sends to registered helper tokens and prunes stale tokens', async () => {
  const nowMs = 1_700_000_000_000;
  const deletedTokens = [];
  const deliveries = new Map();
  const sentBatches = [];

  const tokenDocs = [
    {
      id: 'tok_good',
      data: () => ({ token: 'fcm_good_token', enabled: true }),
      ref: { delete: async () => deletedTokens.push('tok_good') },
    },
    {
      id: 'tok_stale',
      data: () => ({ token: 'fcm_stale_token', enabled: true }),
      ref: { delete: async () => deletedTokens.push('tok_stale') },
    },
    {
      id: 'tok_disabled',
      data: () => ({ token: 'fcm_disabled_token', enabled: false }),
      ref: { delete: async () => deletedTokens.push('tok_disabled') },
    },
  ];

  const requestState = {
    status: 'helper_found',
    currentOfferHelperId: 'helper_1',
    offerToken: 'offer_tok_1',
    offerRevision: 3,
    offerExpiresAt: nowMs + 25_000,
    customerName: 'Sipho',
    topic: 'Car Wash',
  };

  const fakeDb = {
    collection(name) {
      if (name === 'users') {
        return {
          doc: () => ({
            collection: () => ({
              get: async () => ({ docs: tokenDocs }),
            }),
          }),
        };
      }
      if (name === 'webPushOfferDeliveries') {
        return {
          doc: (id) => ({
            _kind: 'delivery',
            id,
            set: async (data) => {
              deliveries.set(id, { ...(deliveries.get(id) || {}), ...data });
            },
          }),
        };
      }
      if (name === 'serviceRequests') {
        return {
          doc: (id) => ({ _kind: 'request', id }),
        };
      }
      throw new Error(`Unexpected collection ${name}`);
    },
    async runTransaction(fn) {
      const tx = {
        async get(ref) {
          if (ref._kind === 'delivery') {
            return { exists: deliveries.has(ref.id), data: () => deliveries.get(ref.id) };
          }
          if (ref._kind === 'request') {
            return { exists: true, data: () => requestState };
          }
          return { exists: false };
        },
        create(ref, data) {
          deliveries.set(ref.id, data);
        },
      };
      return fn(tx);
    },
  };

  const fakeMessaging = {
    async sendEach(messages) {
      sentBatches.push(messages);
      return {
        responses: [
          { success: true, messageId: 'msg_1' },
          { success: false, error: { code: 'messaging/registration-token-not-registered' } },
        ],
      };
    },
  };

  const res = await sendHelperOfferWebPush({
    db: fakeDb,
    messaging: fakeMessaging,
    serverTimestamp: 'SERVER_TS',
    requestId: 'req_push_1',
    helperId: 'helper_1',
    after: requestState,
    payoutAmount: 140,
    nowMs,
  });

  assert.equal(res.sent, 1);
  assert.equal(res.pruned, 1);
  assert.equal(res.totalTokens, 2);
  assert.deepEqual(deletedTokens, ['tok_stale']);
  assert.equal(sentBatches[0].length, 2);
  assert.equal(sentBatches[0][0].token, 'fcm_good_token');

  // Re-running same offerRevision should be skipped cleanly (idempotent)
  const retry = await sendHelperOfferWebPush({
    db: fakeDb,
    messaging: fakeMessaging,
    serverTimestamp: 'SERVER_TS',
    requestId: 'req_push_1',
    helperId: 'helper_1',
    after: requestState,
    payoutAmount: 140,
    nowMs,
  });
  assert.equal(retry.skipped, true);
  assert.equal(retry.reason, 'already-dispatched-or-stale');
});
