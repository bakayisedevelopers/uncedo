'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildWaitingGraceStartedWhatsAppText,
  executeWaitingGraceNotice,
} = require('./waitingGraceNotificationService');

function makeDb(initial = {}) {
  const store = new Map();
  for (const [path, data] of Object.entries(initial)) {
    store.set(path, structuredClone(data));
  }
  const makeRef = (path) => ({
    id: path.split('/').pop(),
    path,
    collection: (sub) => makeCol(`${path}/${sub}`),
    async get() {
      const data = store.get(path);
      return {
        exists: data !== undefined,
        id: path.split('/').pop(),
        ref: makeRef(path),
        data: () => (data === undefined ? undefined : structuredClone(data)),
      };
    },
    async set(data, opts = {}) {
      if (opts.merge && store.has(path)) {
        store.set(path, { ...store.get(path), ...structuredClone(data) });
      } else {
        store.set(path, structuredClone(data));
      }
    },
  });
  const makeCol = (prefix) => ({
    doc: (id) => makeRef(`${prefix}/${id}`),
  });
  return {
    store,
    collection: (name) => makeCol(name),
    async runTransaction(fn) {
      let wrote = false;
      const pending = [];
      const tx = {
        async get(ref) {
          if (wrote) throw new Error('Read after write!');
          return ref.get();
        },
        create(ref, data) {
          wrote = true;
          pending.push({ type: 'create', ref, data });
        },
        set(ref, data, opts) {
          wrote = true;
          pending.push({ type: 'set', ref, data, opts });
        },
      };
      const result = await fn(tx);
      for (const op of pending) {
        if (op.type === 'create') {
          if (store.has(op.ref.path)) throw new Error(`Doc already exists: ${op.ref.path}`);
          store.set(op.ref.path, structuredClone(op.data));
        } else {
          await op.ref.set(op.data, op.opts);
        }
      }
      return result;
    },
  };
}

const adminStub = {
  firestore: {
    FieldValue: {
      serverTimestamp: () => 'SERVER_TIMESTAMP',
    },
  },
};

test('executeWaitingGraceNotice sends WhatsApp R1/min notice once after 2 free minutes while still arrived', async () => {
  const arrivedAtMs = 1_700_000_000_000;
  const now = arrivedAtMs + 121_000;
  const db = makeDb({
    'serviceRequests/req-1': {
      status: 'arrived',
      arrivedAt: arrivedAtMs,
      customerId: 'cust-1',
      publicRequestReference: 'UNC-101',
      serviceSummary: 'Plumbing repair',
      helperAssignment: { helperId: 'helper-1', helperName: 'Thabo' },
    },
    'whatsappIdentities/id-1': {
      waId: '27710000001',
      phoneNumberId: 'pn-1',
      whatsappNotificationsEnabled: true,
    },
    'whatsappConversations/id-1': {
      lastInboundMessageAtMs: now - 10_000,
    },
  });

  const sentTexts = [];
  const notifications = [];
  const baseArgs = {
    db,
    admin: adminStub,
    requestId: 'req-1',
    expectedArrivedAtMs: arrivedAtMs,
    now,
    timestampToMillis: (v) => Number(v || 0),
    resolveCustomerWhatsAppIdentityId: async () => 'id-1',
    whatsappNotificationsEnabled: () => true,
    whatsappMessagingEnabled: () => true,
    getWhatsAppSecrets: () => ({ accessToken: 'tok', phoneNumberId: 'pn-1', graphApiVersion: 'v26.0', approvedTemplateNames: [] }),
    createMetaWhatsAppClient: () => ({
      sendText: async (payload) => {
        sentTexts.push(payload);
        return { messageId: 'wamid-1' };
      },
      sendTemplate: async () => ({ messageId: 'wamid-tmpl' }),
    }),
    isWhatsAppRecipientAllowed: () => true,
    isWithinCustomerServiceWindow: () => true,
    buildServiceUpdateTemplateComponents: ({ service, update }) => [{ service, update }],
    formatWhatsAppText: (t) => t,
    stableEventId: (s) => `ev_${s.replace(/[^a-zA-Z0-9]/g, '_')}`,
    createUserNotificationOnce: async (n) => notifications.push(n),
  };

  const first = await executeWaitingGraceNotice(baseArgs);
  assert.equal(first.skipped, false);
  assert.equal(first.whatsappSent, true);
  assert.equal(sentTexts.length, 1);
  assert.match(sentTexts[0].text, /2 free waiting minutes/i);
  assert.match(sentTexts[0].text, /R1\/min/i);
  assert.match(sentTexts[0].text, /UNC-101/);
  assert.equal(notifications.length, 1);

  // Duplicate invocation is safely skipped
  const second = await executeWaitingGraceNotice({ ...baseArgs, now: now + 5000 });
  assert.equal(second.skipped, true);
  assert.equal(second.reason, 'already-sent');
  assert.equal(sentTexts.length, 1);
});

test('executeWaitingGraceNotice skips if work already started before 2 free minutes ended', async () => {
  const arrivedAtMs = 1_700_000_000_000;
  const db = makeDb({
    'serviceRequests/req-2': {
      status: 'work_started',
      arrivedAt: arrivedAtMs,
      customerId: 'cust-2',
    },
  });
  let sendCalled = false;
  const res = await executeWaitingGraceNotice({
    db,
    admin: adminStub,
    requestId: 'req-2',
    expectedArrivedAtMs: arrivedAtMs,
    now: arrivedAtMs + 130_000,
    timestampToMillis: (v) => Number(v || 0),
    resolveCustomerWhatsAppIdentityId: async () => 'id-2',
    createMetaWhatsAppClient: () => ({
      sendText: async () => { sendCalled = true; return { messageId: 'x' }; },
    }),
  });
  assert.equal(res.skipped, true);
  assert.equal(res.reason, 'no-longer-arrived');
  assert.equal(sendCalled, false);
});

test('executeWaitingGraceNotice requeues if dispatched before 2-minute grace window expires', async () => {
  const arrivedAtMs = 1_700_000_000_000;
  const db = makeDb({
    'serviceRequests/req-3': {
      status: 'arrived',
      arrivedAt: arrivedAtMs,
      customerId: 'cust-3',
    },
  });
  let requeued = null;
  const res = await executeWaitingGraceNotice({
    db,
    admin: adminStub,
    requestId: 'req-3',
    expectedArrivedAtMs: arrivedAtMs,
    now: arrivedAtMs + 60_000,
    timestampToMillis: (v) => Number(v || 0),
    onRequeueEarly: async (payload) => { requeued = payload; },
  });
  assert.equal(res.skipped, true);
  assert.equal(res.reason, 'requeued-until-grace-ends');
  assert.equal(requeued?.delaySeconds, 60);
});

test('buildWaitingGraceStartedWhatsAppText formats helper, ref, and R1/min message cleanly', () => {
  const txt = buildWaitingGraceStartedWhatsAppText({
    request: {
      publicRequestReference: 'UNC-77',
      serviceSummary: 'House cleaning',
      helperAssignment: { helperName: 'Lerato' },
    },
  });
  assert.match(txt, /\[\*UNC-77\*\]/);
  assert.match(txt, /Lerato/);
  assert.match(txt, /R1\/min/);
});

test('executeWaitingGraceNotice retries cleanly after failed Meta send and sends template outside 24h window', async () => {
  const arrivedAtMs = 1_700_000_000_000;
  const now = arrivedAtMs + 130_000;
  const db = makeDb({
    'serviceRequests/req-retry': {
      status: 'arrived',
      arrivedAt: arrivedAtMs,
      customerId: 'cust-retry',
      publicRequestReference: 'UNC-202',
      serviceSummary: 'Hand washing & Laundry',
      helperAssignment: { helperId: 'helper-1', helperName: 'Precious' },
    },
    'whatsappIdentities/id-retry': {
      waId: '27710000002',
      phoneNumberId: 'pn-1',
      whatsappNotificationsEnabled: true,
      whatsappNotificationsConsentAtMs: arrivedAtMs - 10_000,
    },
    'whatsappConversations/id-retry': {
      lastInboundMessageAtMs: 0,
    },
  });

  let attempt = 0;
  const templateCalls = [];
  const args = {
    db,
    admin: adminStub,
    requestId: 'req-retry',
    expectedArrivedAtMs: arrivedAtMs,
    now,
    timestampToMillis: (v) => Number(v || 0),
    resolveCustomerWhatsAppIdentityId: async () => 'id-retry',
    whatsappNotificationsEnabled: () => true,
    whatsappMessagingEnabled: () => true,
    getWhatsAppSecrets: () => ({
      accessToken: 'tok',
      phoneNumberId: 'pn-1',
      graphApiVersion: 'v26.0',
      approvedTemplateNames: ['uncedo_service_update'],
    }),
    createMetaWhatsAppClient: () => ({
      sendText: async () => ({ messageId: 'txt-1' }),
      sendTemplate: async (payload) => {
        attempt += 1;
        if (attempt === 1) throw new Error('Transient Meta error');
        templateCalls.push(payload);
        return { messageId: 'tmpl-1' };
      },
    }),
    isWhatsAppRecipientAllowed: () => true,
    isWithinCustomerServiceWindow: () => false,
    buildServiceUpdateTemplateComponents: ({ service, update }) => [{ service, update }],
    formatWhatsAppText: (t) => t,
    stableEventId: (s) => `ev_${s.replace(/[^a-zA-Z0-9]/g, '_')}`,
  };

  const firstFail = await executeWaitingGraceNotice(args);
  assert.equal(firstFail.whatsappSent, false);
  assert.equal(templateCalls.length, 0);

  // waitingChargeNoticeSentAtMs must not have been marked after failed send so retry/sweep succeeds
  const secondOk = await executeWaitingGraceNotice({ ...args, now: now + 60_000 });
  assert.equal(secondOk.whatsappSent, true);
  assert.equal(templateCalls.length, 1);
  assert.equal(templateCalls[0].name, 'uncedo_service_update');
});
