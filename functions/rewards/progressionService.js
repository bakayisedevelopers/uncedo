const {
  MEMBERSHIP_LEVELS,
  MASTERY_LEVELS,
  SCHEMA_VERSION,
} = require('../shared/rewards');
const { getRewardConfig } = require('./config');

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function meetsMinimum(value, minimum) {
  return toNumber(value) >= toNumber(minimum);
}

function meetsMaximum(value, maximum) {
  if (maximum === null || typeof maximum === 'undefined') {
    return true;
  }
  return toNumber(value) <= toNumber(maximum);
}

function resolveNextLevel(levels, currentLevel) {
  const currentIndex = Math.max(0, levels.indexOf(currentLevel));
  return levels[currentIndex + 1] || null;
}

function buildMembershipProgress({
  currentJobs,
  ratingAverage,
  ratingCount,
  completionRate,
  cancellationRate,
  nextRule = {},
  accountType,
}) {
  if (!nextRule || !Object.keys(nextRule).length) {
    return {};
  }

  return {
    accountType,
    minCompletedPaid: toNumber(nextRule.minCompletedPaidJobs ?? nextRule.minCompletedPaidBookings),
    completedPaid: currentJobs,
    minAverageRating: toNumber(nextRule.minAverageRating),
    averageRating: ratingAverage,
    minRatingCount: toNumber(nextRule.minRatingCount),
    ratingCount,
    minCompletionRate: toNumber(nextRule.minCompletionRate, 0),
    completionRate,
    maxCancellationRate: nextRule.maxCancellationRate ?? null,
    cancellationRate,
  };
}

function isRestrictedUser(user = {}) {
  return Boolean(
    user?.blocked
    || user?.isBlocked
    || user?.suspended
    || user?.isSuspended
    || ['suspended', 'blocked', 'restricted'].includes(String(user?.restrictedStatus || '').trim().toLowerCase()),
  );
}

function qualifiesMembershipLevel({
  rule = {},
  accountType,
  eligibleCompletedPaid,
  ratingAverage,
  ratingCount,
  completionRate,
  cancellationRate,
  user = {},
}) {
  if (!meetsMinimum(eligibleCompletedPaid, rule.minCompletedPaidJobs ?? rule.minCompletedPaidBookings)) {
    return false;
  }
  if (!meetsMinimum(ratingAverage, rule.minAverageRating)) {
    return false;
  }
  if (!meetsMinimum(ratingCount, rule.minRatingCount)) {
    return false;
  }
  if (!meetsMinimum(completionRate, rule.minCompletionRate)) {
    return false;
  }
  if (!meetsMaximum(cancellationRate, rule.maxCancellationRate)) {
    return false;
  }
  if (rule.requireVerified && String(user.verificationStatus || '').trim().toLowerCase() !== 'verified') {
    return false;
  }
  if (rule.requireNoSevereConductRestriction && isRestrictedUser(user)) {
    return false;
  }

  if (accountType === 'helper' && isRestrictedUser(user)) {
    return false;
  }

  return true;
}

async function recalculateMembership({
  db,
  admin,
  userId,
  accountType,
}) {
  const [membershipConfig, accountSnapshot, ratingSnapshot, userSnapshot] = await Promise.all([
    getRewardConfig(db, 'membership'),
    db.collection('rewardAccounts').doc(userId).get(),
    db.collection('ratingAccounts').doc(userId).get(),
    db.collection('users').doc(userId).get(),
  ]);

  const account = accountSnapshot.data() || {};
  const rating = ratingSnapshot.data() || {};
  const user = userSnapshot.data() || {};
  const rules = membershipConfig?.[accountType] || membershipConfig?.customer || {};
  const eligibleCompletedPaid = accountType === 'helper'
    ? toNumber(account.eligibleCompletedPaidJobs)
    : toNumber(account.eligibleCompletedPaidBookings);
  const ratingAverage = toNumber(rating.overallAverage);
  const ratingCount = toNumber(rating.overallCount);
  const completionRate = toNumber(user?.metrics?.completionRate, 1);
  const cancellationRate = toNumber(user?.metrics?.cancellationRate, 0);

  let achievedLevel = MEMBERSHIP_LEVELS[0];
  for (const level of MEMBERSHIP_LEVELS) {
    if (qualifiesMembershipLevel({
      rule: rules[level] || {},
      accountType,
      eligibleCompletedPaid,
      ratingAverage,
      ratingCount,
      completionRate,
      cancellationRate,
      user,
    })) {
      achievedLevel = level;
    }
  }

  const previousMembership = account.membership || {};
  const currentIndex = MEMBERSHIP_LEVELS.indexOf(achievedLevel);
  const highestIndex = Math.max(
    currentIndex,
    MEMBERSHIP_LEVELS.indexOf(previousMembership.highestLevel || MEMBERSHIP_LEVELS[0]),
  );
  const nextLevel = resolveNextLevel(MEMBERSHIP_LEVELS, achievedLevel);
  const nextRule = nextLevel ? (rules[nextLevel] || {}) : null;

  const payload = {
    membership: {
      currentLevel: achievedLevel,
      highestLevel: MEMBERSHIP_LEVELS[highestIndex] || achievedLevel,
      currentLevelIndex: currentIndex,
      qualificationSnapshot: {
        eligibleCompletedPaidBookings: toNumber(account.eligibleCompletedPaidBookings),
        eligibleCompletedPaidJobs: toNumber(account.eligibleCompletedPaidJobs),
        overallAverage: ratingAverage,
        overallCount: ratingCount,
        completionRate,
        cancellationRate,
        verificationStatus: String(user.verificationStatus || '').trim().toLowerCase() || 'pending',
      },
      progressToNextLevel: buildMembershipProgress({
        currentJobs: eligibleCompletedPaid,
        ratingAverage,
        ratingCount,
        completionRate,
        cancellationRate,
        nextRule,
        accountType,
      }),
      achievedAt: currentIndex > toNumber(previousMembership.currentLevelIndex, 0)
        ? admin.firestore.FieldValue.serverTimestamp()
        : previousMembership.achievedAt || admin.firestore.FieldValue.serverTimestamp(),
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    schemaVersion: SCHEMA_VERSION,
  };

  await db.collection('rewardAccounts').doc(userId).set(payload, { merge: true });
  return payload.membership;
}

async function incrementCompletedPaid({
  db,
  admin,
  userId,
  accountType,
  requestId,
  serviceIds = [],
  categoryId = '',
}) {
  if (!userId || !requestId) {
    throw new Error('userId and requestId are required');
  }

  const normalizedServiceIds = [...new Set(
    (Array.isArray(serviceIds) ? serviceIds : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];

  await db.runTransaction(async (tx) => {
    const accountRef = db.collection('rewardAccounts').doc(userId);
    const markerRef = accountRef.collection('requestProgress').doc(`${accountType}_${requestId}`);
    const markerSnapshot = await tx.get(markerRef);
    if (markerSnapshot.exists) {
      return;
    }

    tx.set(accountRef, {
      userId,
      accountType,
      [accountType === 'helper' ? 'eligibleCompletedPaidJobs' : 'eligibleCompletedPaidBookings']:
        admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      schemaVersion: SCHEMA_VERSION,
    }, { merge: true });

    tx.set(markerRef, {
      userId,
      requestId,
      accountType,
      categoryId: String(categoryId || '').trim(),
      serviceIds: normalizedServiceIds,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      schemaVersion: SCHEMA_VERSION,
    });

    if (accountType === 'helper') {
      normalizedServiceIds.forEach((serviceId) => {
        const serviceRef = db.collection('helperMastery').doc(userId).collection('services').doc(serviceId);
        tx.set(serviceRef, {
          helperId: userId,
          serviceId,
          categoryId: String(categoryId || '').trim(),
          eligibleCompletedJobCount: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          schemaVersion: SCHEMA_VERSION,
        }, { merge: true });
      });
    }
  });

  if (accountType === 'helper') {
    for (const serviceId of normalizedServiceIds) {
      await recalculateMastery({
        db,
        admin,
        helperId: userId,
        serviceId,
      });
    }
  }

  return recalculateMembership({
    db,
    admin,
    userId,
    accountType,
  });
}

async function recalculateMastery({
  db,
  admin,
  helperId,
  serviceId,
}) {
  const [masteryConfig, masterySnapshot, ratingSnapshot] = await Promise.all([
    getRewardConfig(db, 'mastery'),
    db.collection('helperMastery').doc(helperId).collection('services').doc(serviceId).get(),
    db.collection('ratingAccounts').doc(helperId).collection('services').doc(serviceId).get(),
  ]);

  const mastery = masterySnapshot.data() || {};
  const rating = ratingSnapshot.data() || {};
  const eligibleCompletedJobCount = toNumber(mastery.eligibleCompletedJobCount);
  const averageRating = toNumber(rating.average);
  const ratingCount = toNumber(rating.count);

  let achievedLevel = MASTERY_LEVELS[0];
  for (const level of MASTERY_LEVELS) {
    const rule = masteryConfig[level] || {};
    if (
      meetsMinimum(eligibleCompletedJobCount, rule.minCompletedPaidJobs)
      && meetsMinimum(averageRating, rule.minAverageRating)
      && meetsMinimum(ratingCount, rule.minRatingCount)
    ) {
      achievedLevel = level;
    }
  }

  const highestIndex = Math.max(
    MASTERY_LEVELS.indexOf(achievedLevel),
    MASTERY_LEVELS.indexOf(mastery.highestLevel || MASTERY_LEVELS[0]),
  );

  const payload = {
    helperId,
    serviceId,
    categoryId: mastery.categoryId || '',
    level: achievedLevel,
    highestLevel: MASTERY_LEVELS[highestIndex] || achievedLevel,
    averageRating,
    ratingCount,
    qualificationSnapshot: {
      eligibleCompletedJobCount,
      averageRating,
      ratingCount,
    },
    achievedAt: MASTERY_LEVELS.indexOf(achievedLevel) > MASTERY_LEVELS.indexOf(mastery.level || MASTERY_LEVELS[0])
      ? admin.firestore.FieldValue.serverTimestamp()
      : mastery.achievedAt || admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    schemaVersion: SCHEMA_VERSION,
  };

  await db.collection('helperMastery').doc(helperId).collection('services').doc(serviceId).set(payload, { merge: true });
  return payload;
}

module.exports = {
  recalculateMembership,
  incrementCompletedPaid,
  recalculateMastery,
};
