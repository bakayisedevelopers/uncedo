const test = require('node:test');
const assert = require('node:assert/strict');

const {
  admin,
  clearFirestore,
  createAdminDb,
  seedRewardConfig,
  shutdownAdminApps,
  timestampFromDate,
} = require('./testEnv');
const {
  applyRewardTransaction,
  processExpiredCustomerPoints,
  reverseReward,
} = require('../rewards/rewardService');
const {
  attachReferral,
  ensureReferralCode,
  evaluateCustomerReferralStageOne,
  evaluateReferralStageTwoFromFirstPaidBooking,
} = require('../rewards/referralService');
const { submitServiceRequestRating } = require('../rewards/ratingService');
const {
  incrementCompletedPaid,
  recalculateMastery,
  recalculateMembership,
} = require('../rewards/progressionService');
const {
  ACCOUNT_TYPES,
  REWARD_REASON_CODES,
  REWARD_TRANSACTION_DIRECTIONS,
} = require('../../shared/rewards');

const db = createAdminDb('rewards-integration-tests');

async function getRewardAccount(userId) {
  const snapshot = await db.collection('rewardAccounts').doc(userId).get();
  return snapshot.exists ? (snapshot.data() || {}) : null;
}

async function getTransactions(userId) {
  const snapshot = await db.collection('rewardAccounts').doc(userId).collection('transactions').get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
}

test.beforeEach(async () => {
  await clearFirestore();
  await seedRewardConfig(db);
});

test.after(async () => {
  await shutdownAdminApps();
});

test('reward ledger applies credits, debits, duplicate idempotency, reversals, metadata sanitization, notifications, and account consistency', async () => {
  const userId = 'customer-ledger';

  const [first, duplicate] = await Promise.all([
    applyRewardTransaction({
      db,
      admin,
      userId,
      accountType: ACCOUNT_TYPES.CUSTOMER,
      direction: REWARD_TRANSACTION_DIRECTIONS.CREDIT,
      points: 120,
      reasonCode: REWARD_REASON_CODES.PAYMENT_METHOD_VERIFIED,
      reasonLabel: 'Verified payment method',
      sourceType: 'paystack',
      sourceId: 'ref-1',
      idempotencyKey: 'reward:credit:120',
      metadata: {
        safe: true,
        secretToken: 'remove-me',
        cardPayload: 'remove-me-too',
      },
      notifyUser: true,
    }),
    applyRewardTransaction({
      db,
      admin,
      userId,
      accountType: ACCOUNT_TYPES.CUSTOMER,
      direction: REWARD_TRANSACTION_DIRECTIONS.CREDIT,
      points: 120,
      reasonCode: REWARD_REASON_CODES.PAYMENT_METHOD_VERIFIED,
      reasonLabel: 'Verified payment method',
      sourceType: 'paystack',
      sourceId: 'ref-1',
      idempotencyKey: 'reward:credit:120',
    }),
  ]);

  assert.equal(
    [first.applied, duplicate.applied].filter(Boolean).length,
    1,
  );
  assert.equal(
    [first.duplicate, duplicate.duplicate].filter(Boolean).length,
    1,
  );

  await applyRewardTransaction({
    db,
    admin,
    userId,
    accountType: ACCOUNT_TYPES.CUSTOMER,
    direction: REWARD_TRANSACTION_DIRECTIONS.DEBIT,
    points: 40,
    reasonCode: REWARD_REASON_CODES.RATING_RECEIVED_EFFECT,
    reasonLabel: 'Rating adjustment',
    sourceType: 'rating',
    sourceId: 'rating-1',
    idempotencyKey: 'reward:debit:40',
  });

  await reverseReward({
    db,
    admin,
    userId,
    accountType: ACCOUNT_TYPES.CUSTOMER,
    originalTransactionId: first.transactionId,
    points: 15,
    idempotencyKey: 'reward:reverse:15',
    notifyUser: true,
  });

  const account = await getRewardAccount(userId);
  const transactions = await getTransactions(userId);
  const rewardNotification = await db.collection('notifications').doc(`reward_${first.transactionId}`).get();

  assert.equal(account.availablePoints, 65);
  assert.equal(account.lifetimeEarnedPoints, 120);
  assert.equal(account.lifetimeRedeemedPoints, 40);
  assert.equal(account.lifetimeReversedPoints, 15);
  assert.equal(transactions.length, 3);
  assert.equal(transactions.find((entry) => entry.transactionId === first.transactionId).metadata.safe, true);
  assert.equal('secretToken' in transactions.find((entry) => entry.transactionId === first.transactionId).metadata, false);
  assert.equal(rewardNotification.exists, true);

  await assert.rejects(
    applyRewardTransaction({
      db,
      admin,
      userId: 'fractional',
      accountType: ACCOUNT_TYPES.CUSTOMER,
      direction: REWARD_TRANSACTION_DIRECTIONS.CREDIT,
      points: 1.5,
      reasonCode: REWARD_REASON_CODES.PAYMENT_METHOD_VERIFIED,
      idempotencyKey: 'fractional',
    }),
    /integer/,
  );

  await assert.rejects(
    applyRewardTransaction({
      db,
      admin,
      userId,
      accountType: ACCOUNT_TYPES.HELPER,
      direction: REWARD_TRANSACTION_DIRECTIONS.CREDIT,
      points: 10,
      reasonCode: REWARD_REASON_CODES.HELPER_COMPLETED_PAID_JOB,
      idempotencyKey: 'mismatch',
    }),
    /account type mismatch/,
  );
});

test('customer expiry only expires remaining eligible customer credit points and stays idempotent', async () => {
  const customerId = 'expiry-customer';
  const helperId = 'expiry-helper';

  const customerCredit = await applyRewardTransaction({
    db,
    admin,
    userId: customerId,
    accountType: ACCOUNT_TYPES.CUSTOMER,
    direction: REWARD_TRANSACTION_DIRECTIONS.CREDIT,
    points: 30,
    reasonCode: REWARD_REASON_CODES.CUSTOMER_COMPLETED_PAID_BOOKING,
    idempotencyKey: 'expiry:customer:credit',
  });

  await applyRewardTransaction({
    db,
    admin,
    userId: customerId,
    accountType: ACCOUNT_TYPES.CUSTOMER,
    direction: REWARD_TRANSACTION_DIRECTIONS.DEBIT,
    points: 10,
    reasonCode: REWARD_REASON_CODES.RATING_RECEIVED_EFFECT,
    idempotencyKey: 'expiry:customer:debit',
    allowNegativeBalance: false,
  });

  await applyRewardTransaction({
    db,
    admin,
    userId: helperId,
    accountType: ACCOUNT_TYPES.HELPER,
    direction: REWARD_TRANSACTION_DIRECTIONS.CREDIT,
    points: 45,
    reasonCode: REWARD_REASON_CODES.HELPER_COMPLETED_PAID_JOB,
    idempotencyKey: 'expiry:helper:credit',
  });

  await db.collection('rewardAccounts').doc(customerId).collection('transactions').doc(customerCredit.transactionId).set({
    expiresAt: timestampFromDate(new Date(Date.now() - 60_000)),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  const firstRun = await processExpiredCustomerPoints({ db, admin, limit: 20 });
  const secondRun = await processExpiredCustomerPoints({ db, admin, limit: 20 });
  const customerAccount = await getRewardAccount(customerId);
  const helperAccount = await getRewardAccount(helperId);
  const customerTransactions = await getTransactions(customerId);

  assert.equal(firstRun.processed, 1);
  assert.equal(secondRun.processed, 0);
  assert.equal(customerAccount.availablePoints, 0);
  assert.equal(customerAccount.lifetimeExpiredPoints, 20);
  assert.equal(helperAccount.availablePoints, 45);
  assert.equal(customerTransactions.some((entry) => entry.reasonCode === REWARD_REASON_CODES.POINTS_EXPIRED && entry.points === 20), true);
});

test('referral stage one requires both trusted profile completion and verified payment, prevents self-referral, and rejects existing accounts', async () => {
  await db.collection('users').doc('referrer').set({
    uid: 'referrer',
    role: 'customer',
    activeRole: 'customer',
    roles: ['customer'],
    fullName: 'Referrer User',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  const { code } = await ensureReferralCode({
    db,
    admin,
    userId: 'referrer',
    accountType: ACCOUNT_TYPES.CUSTOMER,
    displayName: 'Referrer User',
  });

  await db.collection('users').doc('referred').set({
    uid: 'referred',
    role: 'customer',
    activeRole: 'customer',
    roles: ['customer'],
    fullName: 'Referred User',
    displayName: 'Referred User',
    phoneNumber: '',
    customerProfile: {},
    paymentMethods: [],
    createdAt: timestampFromDate(new Date()),
  });

  await attachReferral({
    db,
    admin,
    referralCode: code,
    referredUserId: 'referred',
    referredAccountType: ACCOUNT_TYPES.CUSTOMER,
  });

  const profileOnly = await evaluateCustomerReferralStageOne({
    db,
    admin,
    referredUserId: 'referred',
  });
  assert.equal(profileOnly.reason, 'requirements_not_met');

  await db.collection('users').doc('referred').set({
    paymentMethods: [{ id: 'card-1', brand: 'visa', last4: '1111', isDefault: true }],
  }, { merge: true });

  const cardOnly = await evaluateCustomerReferralStageOne({
    db,
    admin,
    referredUserId: 'referred',
  });
  assert.equal(cardOnly.reason, 'requirements_not_met');

  await db.collection('users').doc('referred').set({
    phoneNumber: '+27 71 000 0000',
    customerProfile: {
      accountType: 'individual',
      customerType: 'family',
      serviceAddress: '1 Main Street',
      discoverySource: 'friend',
      preferredServiceCategories: ['cleaning'],
    },
  }, { merge: true });

  const qualified = await evaluateCustomerReferralStageOne({
    db,
    admin,
    referredUserId: 'referred',
  });
  const retried = await evaluateCustomerReferralStageOne({
    db,
    admin,
    referredUserId: 'referred',
  });
  const referrerAccount = await getRewardAccount('referrer');

  assert.equal(qualified.applied, true);
  assert.equal(retried.duplicate, true);
  assert.equal(referrerAccount.availablePoints, 100);

  await assert.rejects(
    attachReferral({
      db,
      admin,
      referralCode: code,
      referredUserId: 'referrer',
      referredAccountType: ACCOUNT_TYPES.CUSTOMER,
    }),
    /Self-referral/,
  );

  await db.collection('users').doc('old-account').set({
    uid: 'old-account',
    role: 'customer',
    activeRole: 'customer',
    roles: ['customer'],
    fullName: 'Old Account',
    createdAt: timestampFromDate(new Date(Date.now() - (9 * 24 * 60 * 60 * 1000))),
  });

  await assert.rejects(
    attachReferral({
      db,
      admin,
      referralCode: code,
      referredUserId: 'old-account',
      referredAccountType: ACCOUNT_TYPES.CUSTOMER,
    }),
    /new account/,
  );
});

test('referral stage two only qualifies on the authoritative first paid booking request', async () => {
  await db.collection('users').doc('referrer-2').set({
    uid: 'referrer-2',
    role: 'customer',
    activeRole: 'customer',
    roles: ['customer'],
    fullName: 'Referrer Two',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  const { code } = await ensureReferralCode({
    db,
    admin,
    userId: 'referrer-2',
    accountType: ACCOUNT_TYPES.CUSTOMER,
    displayName: 'Referrer Two',
  });

  await db.collection('users').doc('referred-2').set({
    uid: 'referred-2',
    role: 'customer',
    activeRole: 'customer',
    roles: ['customer'],
    fullName: 'Referred Two',
    displayName: 'Referred Two',
    phoneNumber: '+27 71 000 0000',
    paymentMethods: [],
    customerProfile: {
      accountType: 'individual',
      customerType: 'family',
      serviceAddress: '2 Main Street',
      discoverySource: 'friend',
    },
    createdAt: timestampFromDate(new Date()),
  });

  await attachReferral({
    db,
    admin,
    referralCode: code,
    referredUserId: 'referred-2',
    referredAccountType: ACCOUNT_TYPES.CUSTOMER,
  });
  await db.collection('users').doc('referred-2').set({
    paymentMethods: [{ id: 'card-2', brand: 'visa', last4: '2222', isDefault: true }],
  }, { merge: true });
  await evaluateCustomerReferralStageOne({ db, admin, referredUserId: 'referred-2' });

  await applyRewardTransaction({
    db,
    admin,
    userId: 'referred-2',
    accountType: ACCOUNT_TYPES.CUSTOMER,
    direction: REWARD_TRANSACTION_DIRECTIONS.CREDIT,
    points: 100,
    reasonCode: REWARD_REASON_CODES.CUSTOMER_FIRST_COMPLETED_PAID_BOOKING,
    reasonLabel: 'First completed paid booking',
    sourceType: 'service_request',
    sourceId: 'request-first',
    requestId: 'request-first',
    idempotencyKey: 'customer:referred-2:request:first-booking-bonus',
  });

  const nonFirst = await evaluateReferralStageTwoFromFirstPaidBooking({
    db,
    admin,
    referredUserId: 'referred-2',
    requestId: 'request-second',
  });
  const firstPaid = await evaluateReferralStageTwoFromFirstPaidBooking({
    db,
    admin,
    referredUserId: 'referred-2',
    requestId: 'request-first',
  });
  const retried = await evaluateReferralStageTwoFromFirstPaidBooking({
    db,
    admin,
    referredUserId: 'referred-2',
    requestId: 'request-first',
  });
  const referrerAccount = await getRewardAccount('referrer-2');

  assert.equal(nonFirst.reason, 'not_first_paid_booking');
  assert.equal(firstPaid.applied, true);
  assert.equal(retried.duplicate, true);
  assert.equal(referrerAccount.availablePoints, 250);
});

test('trusted rating workflow updates deterministic records, aggregates, edits, and multi-service accounting safely', async () => {
  await Promise.all([
    db.collection('users').doc('customer-rate').set({
      uid: 'customer-rate',
      role: 'customer',
      activeRole: 'customer',
      roles: ['customer'],
      fullName: 'Rated Customer',
    }),
    db.collection('users').doc('helper-rate').set({
      uid: 'helper-rate',
      role: 'helper',
      activeRole: 'helper',
      roles: ['helper'],
      verificationStatus: 'verified',
      metrics: {
        completionRate: 0.95,
        cancellationRate: 0.02,
      },
    }),
    db.collection('serviceRequests').doc('request-rating').set({
      customerId: 'customer-rate',
      status: 'completed',
      categoryId: 'cleaning',
      serviceIds: ['svc-a', 'svc-b'],
      selectedPackageId: 'bundle-x',
      helperAssignment: {
        helperId: 'helper-rate',
      },
      ratings: {},
    }),
  ]);

  const created = await submitServiceRequestRating({
    db,
    admin,
    requestId: 'request-rating',
    raterUserId: 'customer-rate',
    score: 5,
    comment: 'Excellent\u0000 work',
  });
  const edited = await submitServiceRequestRating({
    db,
    admin,
    requestId: 'request-rating',
    raterUserId: 'customer-rate',
    score: 4,
    comment: 'Still good after edit',
  });
  await submitServiceRequestRating({
    db,
    admin,
    requestId: 'request-rating',
    raterUserId: 'helper-rate',
    score: 2,
    comment: 'Late payment',
  });
  await recalculateMembership({ db, admin, userId: 'helper-rate', accountType: ACCOUNT_TYPES.HELPER });
  for (const serviceId of edited.expandedServiceIds) {
    await recalculateMastery({ db, admin, helperId: 'helper-rate', serviceId });
  }

  const helperRatings = await db.collection('ratingAccounts').doc('helper-rate').get();
  const helperServiceA = await db.collection('ratingAccounts').doc('helper-rate').collection('services').doc('svc-a').get();
  const helperServiceB = await db.collection('ratingAccounts').doc('helper-rate').collection('services').doc('svc-b').get();
  const helperBundle = await db.collection('ratingAccounts').doc('helper-rate').collection('services').doc('bundle-x').get();
  const helperRewardAccount = await getRewardAccount('helper-rate');
  const customerRatingAccount = await db.collection('ratingAccounts').doc('customer-rate').get();
  const normalizedRating = await db.collection('ratings').doc(created.ratingId).get();
  const requestSnapshot = await db.collection('serviceRequests').doc('request-rating').get();

  assert.equal(normalizedRating.data().comment.includes('\u0000'), false);
  assert.equal(helperRatings.data().overallCount, 1);
  assert.equal(helperRatings.data().overallAverage, 4);
  assert.equal(helperServiceA.data().count, 1);
  assert.equal(helperServiceA.data().average, 4);
  assert.equal(helperServiceB.data().count, 1);
  assert.equal(helperServiceB.data().average, 4);
  assert.equal(helperBundle.exists, false);
  assert.equal(helperRewardAccount.availablePoints, 20);
  assert.equal(customerRatingAccount.data().overallCount, 1);
  assert.equal(customerRatingAccount.data().overallAverage, 2);
  assert.equal(requestSnapshot.data().ratings.customer.score, 4);
  assert.equal(requestSnapshot.data().ratings.helper.score, 2);

  await assert.rejects(
    submitServiceRequestRating({
      db,
      admin,
      requestId: 'request-rating',
      raterUserId: 'stranger',
      score: 5,
      comment: 'bad',
    }),
    /participants/,
  );
});

test('membership and mastery progression honour thresholds, preserve highest achieved levels, and keep per-request increments idempotent', async () => {
  await Promise.all([
    db.collection('users').doc('membership-customer').set({
      uid: 'membership-customer',
      role: 'customer',
      activeRole: 'customer',
      roles: ['customer'],
    }),
    db.collection('users').doc('membership-helper').set({
      uid: 'membership-helper',
      role: 'helper',
      activeRole: 'helper',
      roles: ['helper'],
      verificationStatus: 'verified',
      metrics: {
        completionRate: 0.92,
        cancellationRate: 0.05,
      },
    }),
  ]);

  await incrementCompletedPaid({
    db,
    admin,
    userId: 'membership-customer',
    accountType: ACCOUNT_TYPES.CUSTOMER,
    requestId: 'customer-booking-1',
  });
  await incrementCompletedPaid({
    db,
    admin,
    userId: 'membership-customer',
    accountType: ACCOUNT_TYPES.CUSTOMER,
    requestId: 'customer-booking-1',
  });
  await db.collection('rewardAccounts').doc('membership-customer').set({
    eligibleCompletedPaidBookings: 10,
  }, { merge: true });
  await db.collection('ratingAccounts').doc('membership-customer').set({
    overallAverage: 4.1,
    overallCount: 3,
  }, { merge: true });

  const customerPartner = await recalculateMembership({
    db,
    admin,
    userId: 'membership-customer',
    accountType: ACCOUNT_TYPES.CUSTOMER,
  });
  await db.collection('ratingAccounts').doc('membership-customer').set({
    overallCount: 2,
  }, { merge: true });
  const customerDowngraded = await recalculateMembership({
    db,
    admin,
    userId: 'membership-customer',
    accountType: ACCOUNT_TYPES.CUSTOMER,
  });

  await db.collection('rewardAccounts').doc('membership-helper').set({
    eligibleCompletedPaidJobs: 100,
  }, { merge: true });
  await db.collection('ratingAccounts').doc('membership-helper').set({
    overallAverage: 4.7,
    overallCount: 20,
  }, { merge: true });
  await incrementCompletedPaid({
    db,
    admin,
    userId: 'membership-helper',
    accountType: ACCOUNT_TYPES.HELPER,
    requestId: 'helper-job-1',
    serviceIds: ['svc-mastery'],
    categoryId: 'cleaning',
  });
  await incrementCompletedPaid({
    db,
    admin,
    userId: 'membership-helper',
    accountType: ACCOUNT_TYPES.HELPER,
    requestId: 'helper-job-1',
    serviceIds: ['svc-mastery'],
    categoryId: 'cleaning',
  });
  await db.collection('helperMastery').doc('membership-helper').collection('services').doc('svc-mastery').set({
    eligibleCompletedJobCount: 220,
  }, { merge: true });
  await db.collection('ratingAccounts').doc('membership-helper').collection('services').doc('svc-mastery').set({
    average: 4.85,
    count: 45,
  }, { merge: true });

  const helperFriend = await recalculateMembership({
    db,
    admin,
    userId: 'membership-helper',
    accountType: ACCOUNT_TYPES.HELPER,
  });
  const helperMaster = await recalculateMastery({
    db,
    admin,
    helperId: 'membership-helper',
    serviceId: 'svc-mastery',
  });

  await db.collection('ratingAccounts').doc('membership-helper').collection('services').doc('svc-mastery').set({
    average: 4.2,
    count: 8,
  }, { merge: true });
  const helperMasterAfterDrop = await recalculateMastery({
    db,
    admin,
    helperId: 'membership-helper',
    serviceId: 'svc-mastery',
  });
  const helperProgress = await db.collection('rewardAccounts').doc('membership-helper').collection('requestProgress').doc('helper_helper-job-1').get();
  const helperMasteryDoc = await db.collection('helperMastery').doc('membership-helper').collection('services').doc('svc-mastery').get();

  assert.equal(customerPartner.currentLevel, 'partner');
  assert.equal(customerDowngraded.currentLevel, 'neighbour');
  assert.equal(customerDowngraded.highestLevel, 'partner');
  assert.equal(helperFriend.currentLevel, 'friend');
  assert.equal(helperMaster.level, 'master');
  assert.equal(helperMasterAfterDrop.level, 'beginner');
  assert.equal(helperMasterAfterDrop.highestLevel, 'master');
  assert.equal(helperProgress.exists, true);
  assert.equal(helperMasteryDoc.data().eligibleCompletedJobCount, 220);
});
