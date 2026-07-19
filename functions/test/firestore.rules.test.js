const fs = require('fs');
const path = require('path');
const test = require('node:test');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');

const { clearFirestore, PROJECT_ID } = require('./testEnv');

let testEnv;

function authedDb(uid, token = {}) {
  return testEnv.authenticatedContext(uid, token).firestore();
}

async function seedDocument(documentPath, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(documentPath).set(data);
  });
}

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
    },
  });
});

test.beforeEach(async () => {
  await clearFirestore();
  await seedDocument('users/admin-user', {
    uid: 'admin-user',
    role: 'admin',
    activeRole: 'admin',
    roles: ['admin'],
    isAdmin: true,
  });
});

test.after(async () => {
  await testEnv.cleanup();
});

test('reward accounts and transactions are read-only to owners and private from other users', async () => {
  await seedDocument('rewardAccounts/customer-1', {
    userId: 'customer-1',
    accountType: 'customer',
    availablePoints: 50,
  });
  await seedDocument('rewardAccounts/customer-1/transactions/tx-1', {
    transactionId: 'tx-1',
    userId: 'customer-1',
    accountType: 'customer',
    points: 50,
    direction: 'credit',
    status: 'applied',
  });

  const customerDb = authedDb('customer-1');
  const helperDb = authedDb('helper-1');
  const adminDb = authedDb('admin-user', { email: 'jabuobed1@gmail.com' });

  await assertSucceeds(customerDb.doc('rewardAccounts/customer-1').get());
  await assertFails(customerDb.doc('rewardAccounts/customer-1').set({ availablePoints: 999 }, { merge: true }));
  await assertSucceeds(customerDb.collection('rewardAccounts/customer-1/transactions').get());
  await assertFails(helperDb.doc('rewardAccounts/customer-1').get());
  await assertFails(helperDb.doc('rewardAccounts/customer-1/transactions/tx-2').set({ points: 10 }));
  await assertSucceeds(adminDb.doc('rewardAccounts/customer-1').get());
});

test('referrals, referral milestones, and normalized ratings stay endpoint-only for clients', async () => {
  await seedDocument('referrals/referred-1', {
    referredUserId: 'referred-1',
    referrerUserId: 'referrer-1',
    stageOneAwardedAt: null,
    stageTwoAwardedAt: null,
  });
  await seedDocument('ratings/request-1_customer_to_helper', {
    ratingId: 'request-1_customer_to_helper',
    raterUserId: 'customer-1',
    ratedUserId: 'helper-1',
  });
  await seedDocument('ratingAccounts/helper-1', {
    userId: 'helper-1',
    overallCount: 1,
    overallAverage: 5,
  });

  const customerDb = authedDb('customer-1');

  await assertFails(customerDb.doc('referrals/referred-1').set({
    referrerUserId: 'customer-1',
    stageOneAwardedAt: 'forged',
  }, { merge: true }));
  await assertFails(customerDb.doc('ratings/request-1_customer_to_helper').set({
    score: 1,
    comment: 'forged',
  }, { merge: true }));
  await assertFails(customerDb.doc('ratingAccounts/helper-1').set({
    overallAverage: 1,
  }, { merge: true }));
});

test('users allow safe profile updates but reject protected fields and privilege changes', async () => {
  await seedDocument('users/customer-1', {
    uid: 'customer-1',
    role: 'customer',
    activeRole: 'customer',
    roles: ['customer'],
    fullName: 'Customer One',
    phoneNumber: '',
    customerProfile: {
      accountType: 'individual',
      customerType: 'family',
      serviceAddress: '1 Main Street',
      discoverySource: 'friend',
    },
    paymentMethods: [],
    membership: {
      currentLevel: 'neighbour',
    },
  });

  const customerDb = authedDb('customer-1');

  await assertSucceeds(customerDb.doc('users/customer-1').update({
    fullName: 'Customer One Updated',
    phoneNumber: '+27 71 000 0000',
  }));
  await assertFails(customerDb.doc('users/customer-1').update({
    role: 'admin',
  }));
  await assertFails(customerDb.doc('users/customer-1').update({
    isAdmin: true,
  }));
  await assertFails(customerDb.doc('users/customer-1').update({
    paymentMethods: [{ id: 'card-1' }],
  }));
  await assertFails(customerDb.doc('users/customer-1').update({
    membership: { currentLevel: 'family' },
  }));
  await assertFails(customerDb.doc('users/customer-1').update({
    verificationStatus: 'verified',
  }));
  await assertFails(customerDb.doc('users/customer-1').update({
    metrics: { completionRate: 1 },
  }));
});

test('service requests enforce customer ownership on create and block payment or helper assignment forgery', async () => {
  const customerDb = authedDb('customer-1');

  await assertSucceeds(customerDb.collection('serviceRequests').doc('valid').set({
    customerId: 'customer-1',
    customerName: 'Customer One',
    customerEmail: 'c1@example.com',
    customerPhone: '+27 71 000 0000',
    location: { latitude: -26.1, longitude: 28.0 },
    status: 'collecting_details',
    statusDetail: 'Collecting details.',
    requestType: 'customer_service',
    intakeMode: 'guided_chat',
    requestPayload: {},
    categoryId: 'cleaning',
    serviceIds: ['svc-a'],
    selectedPackageId: '',
    subject: 'Cleaning',
    topic: 'Cleaning',
    description: 'Cleaning request',
    serviceSummary: 'Cleaning request',
    pricingSnapshot: null,
    aiUsageSnapshot: null,
    helperAssignment: null,
    helperQueue: [],
    currentOfferHelperId: null,
    offerExpiresAt: null,
    offerToken: null,
    offerCycleExcludedHelperIds: [],
    declinedHelperIds: [],
    offerRevision: 0,
    lastOfferAt: null,
    transcript: [],
    structuredAnswers: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  await assertFails(customerDb.collection('serviceRequests').doc('wrong-owner').set({
    customerId: 'someone-else',
    status: 'collecting_details',
    helperAssignment: null,
    helperQueue: [],
    currentOfferHelperId: null,
    offerExpiresAt: null,
    offerToken: null,
    offerCycleExcludedHelperIds: [],
    declinedHelperIds: [],
    offerRevision: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  await assertFails(customerDb.collection('serviceRequests').doc('forged').set({
    customerId: 'customer-1',
    customerName: 'Customer One',
    customerEmail: 'c1@example.com',
    customerPhone: '+27 71 000 0000',
    location: { latitude: -26.1, longitude: 28.0 },
    status: 'collecting_details',
    statusDetail: 'Collecting details.',
    requestType: 'customer_service',
    intakeMode: 'guided_chat',
    requestPayload: {},
    categoryId: 'cleaning',
    serviceIds: ['svc-a'],
    selectedPackageId: '',
    subject: 'Cleaning',
    topic: 'Cleaning',
    description: 'Cleaning request',
    serviceSummary: 'Cleaning request',
    pricingSnapshot: null,
    aiUsageSnapshot: null,
    helperAssignment: { helperId: 'helper-1' },
    helperQueue: [],
    currentOfferHelperId: null,
    offerExpiresAt: null,
    offerToken: null,
    offerCycleExcludedHelperIds: [],
    declinedHelperIds: [],
    offerRevision: 0,
    paymentStatus: 'paid',
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
});

test('service requests only allow the offered helper to accept and the assigned helper to perform limited transitions', async () => {
  await seedDocument('serviceRequests/request-1', {
    customerId: 'customer-1',
    status: 'helper_found',
    statusDetail: 'Waiting for helper.',
    categoryId: 'cleaning',
    serviceIds: ['svc-a'],
    helperAssignment: null,
    helperQueue: ['helper-1'],
    currentOfferHelperId: 'helper-1',
    offerExpiresAt: Date.now() + 60_000,
    offerToken: 'token-1',
    offerCycleExcludedHelperIds: [],
    declinedHelperIds: [],
    offerRevision: 1,
    lastOfferAt: Date.now(),
    pricingSnapshot: null,
    paymentStatus: null,
    paymentTransactionId: null,
    chargedCardLast4: null,
    helperPayoutBreakdown: null,
    cancellationFeeAmount: null,
  });

  const offeredHelperDb = authedDb('helper-1');
  const strangerHelperDb = authedDb('helper-2');
  const customerDb = authedDb('customer-1');

  await assertSucceeds(offeredHelperDb.doc('serviceRequests/request-1').update({
    status: 'accepted',
    statusDetail: 'Helper accepted.',
    currentOfferHelperId: null,
    offerExpiresAt: null,
    offerToken: null,
    offerCycleExcludedHelperIds: [],
    declinedHelperIds: [],
    helperQueue: [],
    helperAssignment: {
      helperId: 'helper-1',
      helperName: 'Helper One',
      acceptedAt: '2026-07-12T10:00:00.000Z',
      categoryId: 'cleaning',
      serviceIds: ['svc-a'],
    },
    updatedAt: new Date(),
  }));

  await seedDocument('serviceRequests/request-2', {
    customerId: 'customer-1',
    status: 'helper_found',
    statusDetail: 'Waiting for helper.',
    categoryId: 'cleaning',
    serviceIds: ['svc-a'],
    helperAssignment: null,
    helperQueue: ['helper-1'],
    currentOfferHelperId: 'helper-1',
    offerExpiresAt: Date.now() + 60_000,
    offerToken: 'token-2',
    offerCycleExcludedHelperIds: [],
    declinedHelperIds: [],
    offerRevision: 1,
    lastOfferAt: Date.now(),
    pricingSnapshot: null,
    paymentStatus: null,
    paymentTransactionId: null,
    chargedCardLast4: null,
    helperPayoutBreakdown: null,
    cancellationFeeAmount: null,
  });

  await assertFails(strangerHelperDb.doc('serviceRequests/request-2').update({
    status: 'accepted',
    helperAssignment: { helperId: 'helper-2' },
    currentOfferHelperId: null,
    offerExpiresAt: null,
    offerToken: null,
    helperQueue: [],
    offerCycleExcludedHelperIds: [],
    declinedHelperIds: [],
    updatedAt: new Date(),
  }));

  await seedDocument('serviceRequests/request-3', {
    customerId: 'customer-1',
    status: 'accepted',
    statusDetail: 'Accepted.',
    categoryId: 'cleaning',
    serviceIds: ['svc-a'],
    helperAssignment: {
      helperId: 'helper-1',
      helperName: 'Helper One',
    },
    helperQueue: [],
    currentOfferHelperId: null,
    offerExpiresAt: null,
    offerToken: null,
    offerCycleExcludedHelperIds: [],
    declinedHelperIds: [],
    offerRevision: 1,
    lastOfferAt: Date.now(),
    pricingSnapshot: {
      total: 100,
    },
    paymentStatus: null,
    paymentTransactionId: null,
    chargedCardLast4: null,
    helperPayoutBreakdown: null,
    cancellationFeeAmount: null,
    completionProofAttachments: [],
    completionProofCount: 0,
    completionProofCapturedAt: null,
    arrivedAt: null,
    workStartedAt: null,
    endedAt: null,
    completedAt: null,
    canceledAt: null,
    canceledBy: null,
  });

  await assertSucceeds(offeredHelperDb.doc('serviceRequests/request-3').update({
    status: 'arrived',
    statusDetail: 'Helper arrived.',
    arrivedAt: new Date(),
    updatedAt: new Date(),
  }));
  await assertSucceeds(offeredHelperDb.doc('serviceRequests/request-3').update({
    completionProofAttachments: [{ path: 'proof.jpg' }],
    completionProofCount: 1,
    completionProofCapturedAt: new Date(),
    updatedAt: new Date(),
  }));
  await assertFails(offeredHelperDb.doc('serviceRequests/request-3').update({
    pricingSnapshot: { total: 0 },
  }));
  await assertFails(customerDb.doc('serviceRequests/request-3').update({
    paymentStatus: 'paid',
  }));
});

test('service requests stay private to participants and admin', async () => {
  await seedDocument('serviceRequests/request-private', {
    customerId: 'customer-1',
    status: 'accepted',
    helperAssignment: {
      helperId: 'helper-1',
    },
    currentOfferHelperId: null,
  });

  const customerDb = authedDb('customer-1');
  const helperDb = authedDb('helper-1');
  const strangerDb = authedDb('stranger-1');
  const adminDb = authedDb('admin-user', { email: 'jabuobed1@gmail.com' });

  await assertSucceeds(customerDb.doc('serviceRequests/request-private').get());
  await assertSucceeds(helperDb.doc('serviceRequests/request-private').get());
  await assertFails(strangerDb.doc('serviceRequests/request-private').get());
  await assertSucceeds(adminDb.doc('serviceRequests/request-private').get());
});

test('helper weekly payouts are readable only by the owning helper and admin', async () => {
  await seedDocument('helperWeeklyPayouts/2026-W29_helper-1', {
    helperId: 'helper-1',
    weekKey: '2026-W29',
    helperAmount: 250,
    status: 'unpaid',
  });
  await seedDocument('helperWeeklyPayouts/2026-W29_helper-2', {
    helperId: 'helper-2',
    weekKey: '2026-W29',
    helperAmount: 400,
    status: 'paid',
  });

  const helperDb = authedDb('helper-1');
  const strangerDb = authedDb('helper-2');
  const adminDb = authedDb('admin-user', { email: 'jabuobed1@gmail.com' });

  await assertSucceeds(helperDb.doc('helperWeeklyPayouts/2026-W29_helper-1').get());
  await assertSucceeds(helperDb.collection('helperWeeklyPayouts').where('helperId', '==', 'helper-1').get());
  await assertFails(helperDb.doc('helperWeeklyPayouts/2026-W29_helper-1').set({ status: 'paid' }, { merge: true }));
  await assertFails(strangerDb.doc('helperWeeklyPayouts/2026-W29_helper-1').get());
  await assertFails(strangerDb.collection('helperWeeklyPayouts').where('helperId', '==', 'helper-1').get());
  await assertSucceeds(adminDb.collection('helperWeeklyPayouts').get());
});
