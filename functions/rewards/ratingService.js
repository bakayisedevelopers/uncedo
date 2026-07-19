const { logger } = require('firebase-functions');

const {
  ACCOUNT_TYPES,
  RATING_DIRECTIONS,
  REWARD_REASON_CODES,
  REWARD_TRANSACTION_DIRECTIONS,
  SCHEMA_VERSION,
} = require('../shared/rewards');
const { getRewardConfig } = require('./config');
const { applyRewardTransaction } = require('./rewardService');

const MAX_COMMENT_LENGTH = 500;

function clampScore(score) {
  const numeric = Number(score);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 5) {
    throw new Error('score must be an integer from 1 to 5');
  }
  return numeric;
}

function cleanComment(value = '') {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_COMMENT_LENGTH);
}

function getParticipants(request = {}) {
  return {
    customerId: String(request.customerId || request.studentId || '').trim(),
    helperId: String(request.helperAssignment?.helperId || request.helperId || request.tutorId || '').trim(),
  };
}

function serviceIdsFor(request = {}) {
  const ids = [
    ...(Array.isArray(request.serviceIds) ? request.serviceIds : []),
    ...(Array.isArray(request.includedServiceIds) ? request.includedServiceIds : []),
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  if (!ids.length && request.selectedPackageId) {
    ids.push(String(request.selectedPackageId || '').trim());
  }

  return [...new Set(ids)].slice(0, 25);
}

function distributionPatch(field, oldScore, newScore, admin) {
  const patch = {};
  if (oldScore) {
    patch[`${field}.${oldScore}`] = admin.firestore.FieldValue.increment(-1);
  }
  if (newScore) {
    patch[`${field}.${newScore}`] = admin.firestore.FieldValue.increment(1);
  }
  return patch;
}

function aggregatePatch(existing = {}, deltaCount, deltaScore, oldScore, newScore, admin) {
  const nextCount = Math.max(0, Number(existing.count ?? existing.overallCount ?? 0) + deltaCount);
  const nextTotalScore = Number(existing.totalScore || 0) + deltaScore;
  const nextAverage = nextCount > 0 ? Number((nextTotalScore / nextCount).toFixed(3)) : 0;

  return {
    count: nextCount,
    overallCount: nextCount,
    totalScore: nextTotalScore,
    average: nextAverage,
    overallAverage: nextAverage,
    ...distributionPatch('distribution', oldScore, newScore, admin),
  };
}

async function submitServiceRequestRating({
  db,
  admin,
  requestId,
  raterUserId,
  score,
  comment,
}) {
  const normalizedRequestId = String(requestId || '').trim();
  if (!normalizedRequestId) {
    throw new Error('requestId is required');
  }

  const scoreValue = clampScore(score);
  const commentValue = cleanComment(comment);
  const requestRef = db.collection('serviceRequests').doc(normalizedRequestId);
  const requestSnapshot = await requestRef.get();
  if (!requestSnapshot.exists) {
    throw new Error('service request not found');
  }

  const request = requestSnapshot.data() || {};
  const { customerId, helperId } = getParticipants(request);
  let direction = '';
  let ratedUserId = '';
  let raterRole = '';
  let ratedRole = '';
  let embeddedKey = '';

  if (raterUserId === customerId) {
    direction = RATING_DIRECTIONS.CUSTOMER_TO_HELPER;
    ratedUserId = helperId;
    raterRole = 'customer';
    ratedRole = 'helper';
    embeddedKey = 'customer';
  } else if (raterUserId === helperId) {
    direction = RATING_DIRECTIONS.HELPER_TO_CUSTOMER;
    ratedUserId = customerId;
    raterRole = 'helper';
    ratedRole = 'customer';
    embeddedKey = 'helper';
  } else {
    throw new Error('Only request participants can submit ratings.');
  }

  if (!ratedUserId) {
    throw new Error('No valid rating target was found for this request.');
  }

  const requestStatus = String(request.status || '').trim().toLowerCase();
  if (!['completed', 'closed'].includes(requestStatus)) {
    throw new Error('This request is not eligible for rating yet.');
  }

  const expandedServiceIds = serviceIdsFor(request);
  const primaryServiceId = expandedServiceIds[0] || '';
  const ratingId = `${normalizedRequestId}_${direction}`;
  const ratingRef = db.collection('ratings').doc(ratingId);
  let previousRating = null;

  await db.runTransaction(async (tx) => {
    const ratingSnapshot = await tx.get(ratingRef);
    previousRating = ratingSnapshot.exists ? (ratingSnapshot.data() || {}) : null;
    const oldScore = previousRating?.score || null;
    const deltaCount = previousRating ? 0 : 1;
    const deltaScore = scoreValue - Number(oldScore || 0);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const ratingAccountRef = db.collection('ratingAccounts').doc(ratedUserId);
    const ratingAccountSnapshot = await tx.get(ratingAccountRef);
    const ratingAccount = ratingAccountSnapshot.exists ? (ratingAccountSnapshot.data() || {}) : {};
    const serviceSnapshots = {};
    for (const serviceId of expandedServiceIds) {
      serviceSnapshots[serviceId] = await tx.get(ratingAccountRef.collection('services').doc(serviceId));
    }

    const ratingRecord = {
      ratingId,
      requestId: normalizedRequestId,
      direction,
      raterUserId,
      raterRole,
      ratedUserId,
      ratedRole,
      categoryId: String(request.categoryId || '').trim(),
      serviceIds: Array.isArray(request.serviceIds) ? request.serviceIds : [],
      expandedServiceIds,
      primaryServiceId,
      selectedPackageId: String(request.selectedPackageId || '').trim() || null,
      score: scoreValue,
      comment: commentValue,
      status: 'active',
      moderationStatus: 'unreviewed',
      createdAt: previousRating?.createdAt || now,
      updatedAt: now,
      schemaVersion: SCHEMA_VERSION,
    };

    tx.set(ratingRef, ratingRecord, { merge: true });
    tx.set(requestRef, {
      ratings: {
        ...(request.ratings || {}),
        [embeddedKey]: {
          score: scoreValue,
          comment: commentValue,
          ratedUserId,
          createdAt: previousRating?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
      updatedAt: now,
    }, { merge: true });

    const overallPatch = aggregatePatch(ratingAccount, deltaCount, deltaScore, oldScore, scoreValue, admin);

    tx.set(ratingAccountRef, {
      userId: ratedUserId,
      accountType: ratedRole,
      overallCount: overallPatch.overallCount,
      totalScore: overallPatch.totalScore,
      overallAverage: overallPatch.overallAverage,
      distribution: {
        ...(ratingAccount.distribution || {}),
      },
      ...distributionPatch('distribution', oldScore, scoreValue, admin),
      updatedAt: now,
      schemaVersion: SCHEMA_VERSION,
    }, { merge: true });

    for (const serviceId of expandedServiceIds) {
      const serviceRef = ratingAccountRef.collection('services').doc(serviceId);
      const serviceSnapshot = serviceSnapshots[serviceId];
      const serviceAccount = serviceSnapshot.exists ? (serviceSnapshot.data() || {}) : {};
      const servicePatch = aggregatePatch(serviceAccount, deltaCount, deltaScore, oldScore, scoreValue, admin);

      tx.set(serviceRef, {
        userId: ratedUserId,
        serviceId,
        categoryId: String(request.categoryId || '').trim(),
        count: servicePatch.count,
        totalScore: servicePatch.totalScore,
        average: servicePatch.average,
        distribution: {
          ...(serviceAccount.distribution || {}),
        },
        ...distributionPatch('distribution', oldScore, scoreValue, admin),
        updatedAt: now,
        schemaVersion: SCHEMA_VERSION,
      }, { merge: true });
    }
  });

  const ratedAccountType = ratedRole === 'helper' ? ACCOUNT_TYPES.HELPER : ACCOUNT_TYPES.CUSTOMER;
  const raterAccountType = raterRole === 'helper' ? ACCOUNT_TYPES.HELPER : ACCOUNT_TYPES.CUSTOMER;
  const ratingConfig = await getRewardConfig(db, ratedAccountType);
  const ratingEffects = ratingConfig.ratingReceivedEffects || {};
  const previousEffect = previousRating ? Number(ratingEffects[previousRating.score] || 0) : 0;
  const nextEffect = Number(ratingEffects[scoreValue] || 0);
  const rewardDelta = nextEffect - previousEffect;
  let ratingSubmittedReward = null;
  let ratingReceivedEffectReward = null;

  const raterRewardConfig = await getRewardConfig(db, raterAccountType);
  const ratingSubmittedPoints = Number(raterRewardConfig.rewards?.ratingSubmitted || 0);
  if (ratingSubmittedPoints > 0) {
    ratingSubmittedReward = await applyRewardTransaction({
      db,
      admin,
      userId: raterUserId,
      accountType: raterAccountType,
      direction: REWARD_TRANSACTION_DIRECTIONS.CREDIT,
      points: ratingSubmittedPoints,
      reasonCode: REWARD_REASON_CODES.RATING_SUBMITTED,
      reasonLabel: 'Rating submitted',
      sourceType: 'rating',
      sourceId: ratingId,
      idempotencyKey: `${raterAccountType}:${raterUserId}:rating:${ratingId}:submitted`,
      requestId: normalizedRequestId,
      ratingId,
      relatedUserId: ratedUserId,
      categoryId: String(request.categoryId || '').trim(),
      serviceIds: expandedServiceIds,
      primaryServiceId,
      notifyUser: true,
    });
  }

  if (rewardDelta !== 0) {
    ratingReceivedEffectReward = await applyRewardTransaction({
      db,
      admin,
      userId: ratedUserId,
      accountType: ratedAccountType,
      direction: rewardDelta > 0
        ? REWARD_TRANSACTION_DIRECTIONS.CREDIT
        : REWARD_TRANSACTION_DIRECTIONS.DEBIT,
      points: Math.abs(rewardDelta),
      reasonCode: REWARD_REASON_CODES.RATING_RECEIVED_EFFECT,
      reasonLabel: 'Rating received effect',
      sourceType: 'rating',
      sourceId: ratingId,
      idempotencyKey: `${ratedAccountType}:${ratedUserId}:rating:${ratingId}:received-effect:${previousRating?.score || 0}->${scoreValue}`,
      requestId: normalizedRequestId,
      ratingId,
      relatedUserId: raterUserId,
      categoryId: String(request.categoryId || '').trim(),
      serviceIds: expandedServiceIds,
      primaryServiceId,
      allowNegativeBalance: rewardDelta < 0,
      notifyUser: true,
    });
  }

  logger.info('rating_normalized', {
    ratingId,
    requestId: normalizedRequestId,
    raterUserId,
    ratedUserId,
    direction,
    result: 'ok',
  });

  return {
    ratingId,
    requestId: normalizedRequestId,
    direction,
    ratedUserId,
    score: scoreValue,
    expandedServiceIds,
    ratedAccountType,
    raterAccountType,
    rewards: {
      ratingSubmitted: ratingSubmittedReward,
      ratingReceivedEffect: ratingReceivedEffectReward,
    },
  };
}

module.exports = {
  submitServiceRequestRating,
  serviceIdsFor,
};
