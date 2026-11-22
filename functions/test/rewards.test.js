const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_REWARD_CONFIG } = require('../rewards/config');
const { txIdFromKey } = require('../rewards/rewardService');
const shared = require('../../shared/rewards');
const functionsShared = require('../shared/rewards');
const { bookingEligibleSubtotal, hashId } = require('../rewards/phase3Service');
const { isServiceRequestEligibleForRating, serviceOptionsFor, submitServiceRequestRating } = require('../rewards/ratingService');
const {
  incrementCompletedPaid,
  recalculateServiceOptionMastery,
} = require('../rewards/progressionService');

function createInMemoryFirestore() {
  const store = new Map();
  const clone = (val) => (val && typeof val === 'object' ? JSON.parse(JSON.stringify(val)) : val);
  const setAtPath = (obj, pathParts, val) => {
    let cur = obj;
    for (let i = 0; i < pathParts.length - 1; i += 1) {
      const k = pathParts[i];
      if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
      cur = cur[k];
    }
    const leaf = pathParts[pathParts.length - 1];
    if (val && val.__op === 'increment') {
      cur[leaf] = Number(cur[leaf] || 0) + val.amount;
    } else if (val && val.__op === 'serverTimestamp') {
      cur[leaf] = 'SERVER_TIMESTAMP';
    } else {
      cur[leaf] = val;
    }
  };
  const deepMerge = (target, src) => {
    const out = { ...target };
    for (const [k, v] of Object.entries(src || {})) {
      if (k.includes('.')) {
        setAtPath(out, k.split('.'), v);
      } else if (v && v.__op === 'increment') {
        out[k] = Number(out[k] || 0) + v.amount;
      } else if (v && v.__op === 'serverTimestamp') {
        out[k] = 'SERVER_TIMESTAMP';
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        out[k] = deepMerge(out[k] && typeof out[k] === 'object' ? out[k] : {}, v);
      } else {
        out[k] = v;
      }
    }
    return out;
  };
  const docRef = (path) => ({
    path,
    id: path.split('/').pop(),
    collection: (sub) => ({
      doc: (id) => docRef(`${path}/${sub}/${id}`),
    }),
    async get() {
      const data = store.get(path);
      return {
        id: path.split('/').pop(),
        exists: data !== undefined,
        data: () => (data === undefined ? undefined : clone(data)),
      };
    },
    async set(data, opts = {}) {
      const prev = opts.merge && store.has(path) ? store.get(path) : {};
      store.set(path, deepMerge(prev, data));
    },
  });
  const fakeAdmin = {
    firestore: {
      FieldValue: {
        increment: (amount) => ({ __op: 'increment', amount }),
        serverTimestamp: () => ({ __op: 'serverTimestamp' }),
      },
    },
  };
  const fakeDb = {
    collection: (name) => ({ doc: (id) => docRef(`${name}/${id}`) }),
    async runTransaction(fn) {
      const tx = {
        get: (ref) => ref.get(),
        set: (ref, data, opts) => ref.set(data, opts),
      };
      return fn(tx);
    },
    _store: store,
  };
  return { db: fakeDb, admin: fakeAdmin };
}

test('shared constants expose required levels and directions', () => {
  assert.deepEqual(shared.MEMBERSHIP_LEVELS, ['neighbour', 'partner', 'friend', 'family']);
  assert.deepEqual(shared.MASTERY_LEVELS, ['beginner', 'specialist', 'master', 'legend']);
  assert.equal(shared.RATING_DIRECTIONS.CUSTOMER_TO_HELPER, 'customer_to_helper');
  assert.equal(shared.RATING_DIRECTIONS.HELPER_TO_CUSTOMER, 'helper_to_customer');
  assert.equal(functionsShared.buildServiceOptionMasteryKey('hair_styling', 'Knotless Braids'), 'hair_styling__knotless_braids');
  assert.equal(shared.buildServiceOptionMasteryKey('hair_styling', ''), 'hair_styling');
});
test('default reward config contains required global and customer values', () => {
  assert.equal(DEFAULT_REWARD_CONFIG.global.pointsPerRand, 10);
  assert.equal(DEFAULT_REWARD_CONFIG.global.customerPointExpiryMonths, 6);
  assert.equal(DEFAULT_REWARD_CONFIG.customer.rewards.profileCompleted, 20);
  assert.equal(DEFAULT_REWARD_CONFIG.customer.rewards.paymentMethodVerified, 50);
  assert.equal(DEFAULT_REWARD_CONFIG.customer.rewards.firstCompletedPaidBooking, 100);
  assert.equal(DEFAULT_REWARD_CONFIG.customer.ratingReceivedEffects[1], -50);
  assert.equal(DEFAULT_REWARD_CONFIG.customer.ratingReceivedEffects[5], 50);
});
test('idempotency transaction ids are deterministic and safe', () => {
  assert.equal(txIdFromKey('customer:u1:request:r1:completed-paid'), txIdFromKey('customer:u1:request:r1:completed-paid'));
  assert.notEqual(txIdFromKey('a'), txIdFromKey('b'));
  assert.match(txIdFromKey('a'), /^[a-f0-9]{40}$/);
});
test('integer point validation rejects fractional values', () => {
  assert.equal(shared.assertIntegerPoints(10), 10);
  assert.throws(() => shared.assertIntegerPoints(1.5), /integer/);
});
test('referral code normalization removes unsafe characters', () => {
  assert.equal(shared.normalizeReferralCode(' ab-12 uid '), 'AB12UID');
});
test('Phase 3 redemption configuration and deterministic identifiers remain safe', () => {
  assert.equal(DEFAULT_REWARD_CONFIG.global.minimumCustomerRedemptionPoints, 100);
  assert.equal(DEFAULT_REWARD_CONFIG.global.redemptionIncrementPoints, 10);
  assert.equal(DEFAULT_REWARD_CONFIG.global.maximumServiceCreditPercentagePerBooking, 20);
  assert.equal(DEFAULT_REWARD_CONFIG.global.featureFlags.redemptionEnabled, false);
  assert.equal(hashId('service_credit', 'u1:r1'), hashId('service_credit', 'u1:r1'));
  assert.notEqual(hashId('service_credit', 'u1:r1'), hashId('service_credit', 'u1:r2'));
});
test('Phase 3 only reads trusted pricing snapshot fields for eligible service credit', () => {
  assert.equal(bookingEligibleSubtotal({ pricingSnapshot: { subtotal: 123.456 } }), 123.46);
  assert.equal(bookingEligibleSubtotal({ pricingSnapshot: { serviceSubtotal: 75 } }), 75);
  assert.equal(bookingEligibleSubtotal({ totalAmount: 999 }), 0);
});
test('serviceOptionsFor extracts single-service options, breakdown options, and optionless fallback keys', () => {
  assert.deepEqual(
    serviceOptionsFor({
      serviceIds: ['hair_styling'],
      selectedOptionId: 'knotless_braids',
      selectedOptionTitle: 'Knotless Braids',
    }),
    [
      {
        serviceId: 'hair_styling',
        optionId: 'knotless_braids',
        optionTitle: 'Knotless Braids',
        masteryKey: 'hair_styling__knotless_braids',
      },
    ],
  );
  assert.deepEqual(
    serviceOptionsFor({
      serviceIds: ['plumbing_bundle', 'tap_repair'],
      pricingSnapshot: {
        serviceBreakdown: [
          { serviceId: 'tap_repair', selectedOptionId: 'standard_visit', selectedOptionTitle: 'Standard Visit' },
        ],
      },
    }),
    [
      { serviceId: 'plumbing_bundle', optionId: '', optionTitle: '', masteryKey: 'plumbing_bundle' },
      { serviceId: 'tap_repair', optionId: 'standard_visit', optionTitle: 'Standard Visit', masteryKey: 'tap_repair__standard_visit' },
    ],
  );
});
test('dual mastery tracks option-specific jobs and ratings independently from parent service rollup', async () => {
  const { db, admin } = createInMemoryFirestore();
  await db.collection('rewardConfig').doc('mastery').set(DEFAULT_REWARD_CONFIG.mastery);
  await db.collection('rewardConfig').doc('customer').set(DEFAULT_REWARD_CONFIG.customer);
  await db.collection('rewardConfig').doc('helper').set(DEFAULT_REWARD_CONFIG.helper);
  await db.collection('rewardConfig').doc('global').set(DEFAULT_REWARD_CONFIG.global);

  const req1 = {
    status: 'completed',
    customerId: 'cust_1',
    helperId: 'helper_1',
    categoryId: 'beauty',
    serviceIds: ['hair_styling'],
    selectedOptionId: 'knotless_braids',
    selectedOptionTitle: 'Knotless Braids',
  };
  const req2 = {
    status: 'completed',
    customerId: 'cust_1',
    helperId: 'helper_1',
    categoryId: 'beauty',
    serviceIds: ['hair_styling'],
    selectedOptionId: 'box_braids',
    selectedOptionTitle: 'Box Braids',
  };
  await db.collection('serviceRequests').doc('req_opt_1').set(req1);
  await db.collection('serviceRequests').doc('req_opt_2').set(req2);

  await incrementCompletedPaid({
    db,
    admin,
    userId: 'helper_1',
    accountType: 'helper',
    requestId: 'req_opt_1',
    serviceIds: ['hair_styling'],
    serviceOptions: serviceOptionsFor(req1),
    categoryId: 'beauty',
  });
  await incrementCompletedPaid({
    db,
    admin,
    userId: 'helper_1',
    accountType: 'helper',
    requestId: 'req_opt_2',
    serviceIds: ['hair_styling'],
    serviceOptions: serviceOptionsFor(req2),
    categoryId: 'beauty',
  });

  const rating1 = await submitServiceRequestRating({
    db,
    admin,
    requestId: 'req_opt_1',
    raterUserId: 'cust_1',
    score: 5,
    comment: 'Super clean knotless braids',
  });
  await submitServiceRequestRating({
    db,
    admin,
    requestId: 'req_opt_2',
    raterUserId: 'cust_1',
    score: 3,
    comment: 'Okay box braids',
  });

  assert.equal(rating1.serviceOptions[0].masteryKey, 'hair_styling__knotless_braids');

  // Simulate meeting Specialist threshold strictly on knotless_braids
  await db.collection('helperMastery').doc('helper_1').collection('serviceOptions').doc('hair_styling__knotless_braids').set({
    eligibleCompletedJobCount: 55,
  }, { merge: true });
  await db.collection('ratingAccounts').doc('helper_1').collection('serviceOptions').doc('hair_styling__knotless_braids').set({
    average: 4.9,
    count: 12,
  }, { merge: true });

  const knotlessMastery = await recalculateServiceOptionMastery({
    db,
    admin,
    helperId: 'helper_1',
    serviceId: 'hair_styling',
    optionId: 'knotless_braids',
  });
  const boxMastery = await recalculateServiceOptionMastery({
    db,
    admin,
    helperId: 'helper_1',
    serviceId: 'hair_styling',
    optionId: 'box_braids',
  });

  const parentServiceMastery = (await db.collection('helperMastery').doc('helper_1').collection('services').doc('hair_styling').get()).data();
  const parentServiceRating = (await db.collection('ratingAccounts').doc('helper_1').collection('services').doc('hair_styling').get()).data();
  const boxRating = (await db.collection('ratingAccounts').doc('helper_1').collection('serviceOptions').doc('hair_styling__box_braids').get()).data();

  assert.equal(knotlessMastery.level, 'specialist');
  assert.equal(knotlessMastery.highestLevel, 'specialist');
  assert.equal(knotlessMastery.optionTitle, 'Knotless Braids');
  assert.equal(boxMastery.level, 'beginner');
  assert.equal(boxRating.count, 1);
  assert.equal(boxRating.average, 3);
  assert.equal(parentServiceMastery.eligibleCompletedJobCount, 2);
  assert.equal(parentServiceRating.count, 2);
  assert.equal(parentServiceRating.average, 4);
});

test('arrived and work_started cancellations are eligible for customer and helper ratings while pre-arrival cancellations are rejected', async () => {
  const { db, admin } = createInMemoryFirestore();
  await db.collection('rewardConfig').doc('customer').set(DEFAULT_REWARD_CONFIG.customer);
  await db.collection('rewardConfig').doc('helper').set(DEFAULT_REWARD_CONFIG.helper);
  await db.collection('rewardConfig').doc('global').set(DEFAULT_REWARD_CONFIG.global);

  assert.equal(isServiceRequestEligibleForRating({
    status: 'canceled',
    customerId: 'cust_pre',
    helperAssignment: { helperId: 'helper_pre' },
    canceledFromStatus: 'accepted',
  }), false);

  assert.equal(isServiceRequestEligibleForRating({
    status: 'canceled',
    customerId: 'cust_arr',
    helperAssignment: { helperId: 'helper_arr' },
    arrivedAt: '2026-11-22T08:00:00Z',
    canceledFromStatus: 'arrived',
  }), true);

  assert.equal(isServiceRequestEligibleForRating({
    status: 'canceled',
    customerId: 'cust_work',
    helperAssignment: { helperId: 'helper_work' },
    canceledFromStatus: 'work_started',
  }), true);

  await db.collection('serviceRequests').doc('req_pre_cancel').set({
    status: 'canceled',
    customerId: 'cust_pre',
    helperAssignment: { helperId: 'helper_pre' },
    canceledFromStatus: 'accepted',
    serviceIds: ['car_wash'],
  });
  await db.collection('serviceRequests').doc('req_arrived_cancel').set({
    status: 'canceled',
    customerId: 'cust_arr',
    helperAssignment: { helperId: 'helper_arr' },
    arrivedAt: '2026-11-22T08:00:00Z',
    canceledFromStatus: 'arrived',
    categoryId: 'car_wash',
    serviceIds: ['standard_wash'],
    selectedOptionId: 'hatchback',
  });

  await assert.rejects(
    () => submitServiceRequestRating({
      db,
      admin,
      requestId: 'req_pre_cancel',
      raterUserId: 'cust_pre',
      score: 4,
      comment: 'Before arrival',
    }),
    /not eligible for rating/i,
  );

  const custRating = await submitServiceRequestRating({
    db,
    admin,
    requestId: 'req_arrived_cancel',
    raterUserId: 'cust_arr',
    score: 5,
    comment: 'Arrived promptly before cancel',
  });
  const helperRating = await submitServiceRequestRating({
    db,
    admin,
    requestId: 'req_arrived_cancel',
    raterUserId: 'helper_arr',
    score: 4,
    comment: 'Respectful customer',
  });

  assert.equal(custRating.score, 5);
  assert.equal(helperRating.score, 4);
  const updatedReq = (await db.collection('serviceRequests').doc('req_arrived_cancel').get()).data();
  assert.equal(updatedReq.ratings.customer.score, 5);
  assert.equal(updatedReq.ratings.helper.score, 4);
});
