const { createHash } = require('crypto');
const { logger } = require('firebase-functions');

const {
  ACCOUNT_TYPES,
  MEMBERSHIP_LEVELS,
  REWARD_REASON_CODES,
  REWARD_TRANSACTION_DIRECTIONS,
  REWARD_TRANSACTION_STATUSES,
  SCHEMA_VERSION,
  assertIntegerPoints,
} = require('../shared/rewards');
const { getRewardConfig } = require('./config');

function txIdFromKey(key) {
  return createHash('sha256').update(String(key || '')).digest('hex').slice(0, 40);
}

function monthsFrom(date, months) {
  const nextDate = new Date(date);
  nextDate.setMonth(nextDate.getMonth() + Number(months || 0));
  return nextDate;
}

function sanitizeMetadata(metadata = {}) {
  const safeEntries = Object.entries(metadata || {}).slice(0, 20);
  const output = {};

  safeEntries.forEach(([rawKey, rawValue]) => {
    const key = String(rawKey || '').trim();
    if (!key || /token|secret|authorization|card|payload|signature/i.test(key)) {
      return;
    }

    if (['string', 'number', 'boolean'].includes(typeof rawValue) || rawValue === null) {
      output[key] = rawValue;
    }
  });

  return output;
}

function normalizeServiceIdList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];
}

function rewardAccountBase(userId, accountType, admin) {
  return {
    userId,
    accountType,
    availablePoints: 0,
    pendingPoints: 0,
    lifetimeEarnedPoints: 0,
    lifetimeRedeemedPoints: 0,
    lifetimeExpiredPoints: 0,
    lifetimeDeductedPoints: 0,
    lifetimeReversedPoints: 0,
    eligibleCompletedPaidBookings: 0,
    eligibleCompletedPaidJobs: 0,
    membership: {
      currentLevel: MEMBERSHIP_LEVELS[0],
      highestLevel: MEMBERSHIP_LEVELS[0],
      currentLevelIndex: 0,
      qualificationSnapshot: {},
      progressToNextLevel: {},
      achievedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    referralSummary: {
      totalAttributed: 0,
      totalQualified: 0,
      totalRewarded: 0,
    },
    pointsExpiringSoon: 0,
    nextExpiryAt: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    schemaVersion: SCHEMA_VERSION,
  };
}

async function loadRewardAccount({ db, admin, tx, userId, accountType }) {
  const accountRef = db.collection('rewardAccounts').doc(userId);
  const snapshot = await tx.get(accountRef);

  if (snapshot.exists) {
    const account = snapshot.data() || {};
    const storedAccountType = String(account.accountType || '').trim();
    if (storedAccountType && storedAccountType !== accountType) {
      throw new Error(`reward account type mismatch for ${userId}`);
    }
    return {
      accountRef,
      account,
      existed: true,
    };
  }

  const base = rewardAccountBase(userId, accountType, admin);
  return {
    accountRef,
    account: base,
    existed: false,
  };
}

async function getCreditBuckets({ db, tx, userId }) {
  const creditsQuery = db
    .collection('rewardAccounts')
    .doc(userId)
    .collection('transactions')
    .where('direction', '==', REWARD_TRANSACTION_DIRECTIONS.CREDIT)
    .where('status', '==', REWARD_TRANSACTION_STATUSES.APPLIED);

  const snapshot = await tx.get(creditsQuery);
  return snapshot.docs
    .map((doc) => ({ ref: doc.ref, data: doc.data() || {} }))
    .filter((entry) => Number(entry.data.remainingPoints || 0) > 0)
    .sort((left, right) => {
      const leftTime = left.data.availableAt?.toMillis?.() || left.data.createdAt?.toMillis?.() || 0;
      const rightTime = right.data.availableAt?.toMillis?.() || right.data.createdAt?.toMillis?.() || 0;
      return leftTime - rightTime;
    });
}

async function allocatePointsFromCredits({
  db,
  admin,
  tx,
  userId,
  points,
  allowNegativeBalance = false,
}) {
  let remainingPoints = Number(points || 0);
  const creditBuckets = await getCreditBuckets({ db, tx, userId });
  const allocations = [];

  for (const bucket of creditBuckets) {
    if (remainingPoints <= 0) {
      break;
    }

    const bucketRemaining = Number(bucket.data.remainingPoints || 0);
    if (bucketRemaining <= 0) {
      continue;
    }

    const usedPoints = Math.min(bucketRemaining, remainingPoints);
    remainingPoints -= usedPoints;
    allocations.push({
      transactionId: String(bucket.data.transactionId || bucket.ref.id),
      points: usedPoints,
    });

    tx.set(bucket.ref, {
      remainingPoints: bucketRemaining - usedPoints,
      status: bucketRemaining - usedPoints <= 0
        ? REWARD_TRANSACTION_STATUSES.EXPIRED
        : bucket.data.status || REWARD_TRANSACTION_STATUSES.APPLIED,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  if (!allowNegativeBalance && remainingPoints > 0) {
    throw new Error('insufficient reward points');
  }

  return allocations;
}

function buildRewardNotification({
  userId,
  transactionId,
  direction,
  points,
  reasonCode,
  requestId = null,
  metadata = {},
}) {
  if (!userId) {
    return null;
  }

  let type = '';
  let title = '';
  let message = '';

  if (direction === REWARD_TRANSACTION_DIRECTIONS.CREDIT) {
    type = 'points_earned';
    title = 'Points added';
    message = `${points} Uncedo Points were added to your account.`;
  } else if (direction === REWARD_TRANSACTION_DIRECTIONS.DEBIT) {
    type = 'points_deducted';
    title = 'Points deducted';
    message = `${points} Uncedo Points were deducted from your account.`;
  } else if (direction === REWARD_TRANSACTION_DIRECTIONS.EXPIRY) {
    type = 'points_expired';
    title = 'Points expired';
    message = `${points} Uncedo Points expired.`;
  } else if (direction === REWARD_TRANSACTION_DIRECTIONS.REVERSAL) {
    type = 'reward_reversed';
    title = 'Reward reversed';
    message = `${points} Uncedo Points were reversed.`;
  }

  if (!type) {
    return null;
  }

  return {
    notificationId: `reward_${transactionId}`,
    payload: {
      userId,
      title,
      message,
      type,
      requestId: requestId || null,
      targetPath: '/rewards',
      metadata: {
        reasonCode,
        transactionId,
        ...sanitizeMetadata(metadata),
      },
      read: false,
      readAt: null,
      createdAt: null,
      updatedAt: null,
    },
  };
}

function applyAccountDelta({
  direction,
  points,
  fields,
  admin,
}) {
  if (direction === REWARD_TRANSACTION_DIRECTIONS.CREDIT) {
    fields.availablePoints = admin.firestore.FieldValue.increment(points);
    fields.lifetimeEarnedPoints = admin.firestore.FieldValue.increment(points);
    return points;
  }

  if (direction === REWARD_TRANSACTION_DIRECTIONS.DEBIT) {
    fields.availablePoints = admin.firestore.FieldValue.increment(-points);
    fields.lifetimeRedeemedPoints = admin.firestore.FieldValue.increment(points);
    return -points;
  }

  if (direction === REWARD_TRANSACTION_DIRECTIONS.EXPIRY) {
    fields.availablePoints = admin.firestore.FieldValue.increment(-points);
    fields.lifetimeExpiredPoints = admin.firestore.FieldValue.increment(points);
    return -points;
  }

  if (direction === REWARD_TRANSACTION_DIRECTIONS.REVERSAL) {
    fields.availablePoints = admin.firestore.FieldValue.increment(-points);
    fields.lifetimeReversedPoints = admin.firestore.FieldValue.increment(points);
    return -points;
  }

  throw new Error('unsupported reward direction');
}

async function applyRewardTransactionInTransaction({
  db,
  admin,
  tx,
  userId,
  accountType = ACCOUNT_TYPES.CUSTOMER,
  direction,
  points,
  reasonCode,
  reasonLabel = '',
  sourceType = '',
  sourceId = '',
  idempotencyKey,
  requestId = null,
  ratingId = null,
  referralId = null,
  relatedUserId = null,
  categoryId = '',
  serviceIds = [],
  primaryServiceId = '',
  metadata = {},
  allowNegativeBalance = false,
  notifyUser = false,
}) {
  assertIntegerPoints(points);
  if (points <= 0) {
    throw new Error('points must be positive');
  }
  if (!userId || !direction || !reasonCode || !idempotencyKey) {
    throw new Error('missing reward transaction fields');
  }

  const transactionId = txIdFromKey(idempotencyKey);
  const transactionRef = db.collection('rewardAccounts').doc(userId).collection('transactions').doc(transactionId);
  const transactionSnapshot = await tx.get(transactionRef);
  if (transactionSnapshot.exists) {
    if (notifyUser) {
      const notification = buildRewardNotification({
        userId,
        transactionId,
        direction,
        points,
        reasonCode,
        requestId,
        metadata,
      });
      if (notification) {
        tx.set(db.collection('notifications').doc(notification.notificationId), {
          ...notification.payload,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }
    logger.info('reward_duplicate_skipped', {
      userId,
      idempotencyKey,
      reasonCode,
      result: 'duplicate',
    });
    return {
      applied: false,
      duplicate: true,
      transactionId,
      delta: 0,
    };
  }

  const { accountRef, account, existed } = await loadRewardAccount({
    db,
    admin,
    tx,
    userId,
    accountType,
  });

  const normalizedServiceIds = normalizeServiceIdList(serviceIds);
  const safeMetadata = sanitizeMetadata(metadata);
  const accountPatch = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    accountType,
    schemaVersion: SCHEMA_VERSION,
  };

  if (
    direction !== REWARD_TRANSACTION_DIRECTIONS.CREDIT
    && !allowNegativeBalance
    && Number(account.availablePoints || 0) < points
  ) {
    throw new Error('insufficient reward points');
  }

  const consumedAllocations = direction === REWARD_TRANSACTION_DIRECTIONS.CREDIT
    ? []
    : await allocatePointsFromCredits({
        db,
        admin,
        tx,
        userId,
        points,
        allowNegativeBalance,
      });

  const delta = applyAccountDelta({
    direction,
    points,
    fields: accountPatch,
    admin,
  });

  let expiresAt = null;
  if (accountType === ACCOUNT_TYPES.CUSTOMER && direction === REWARD_TRANSACTION_DIRECTIONS.CREDIT) {
    const globalConfig = await getRewardConfig(db, 'global');
    expiresAt = monthsFrom(new Date(), globalConfig.customerPointExpiryMonths);
    accountPatch.nextExpiryAt = account.nextExpiryAt || expiresAt;
  }

  tx.set(transactionRef, {
    transactionId,
    userId,
    accountType,
    direction,
    points,
    originalPoints: direction === REWARD_TRANSACTION_DIRECTIONS.CREDIT ? points : null,
    remainingPoints: direction === REWARD_TRANSACTION_DIRECTIONS.CREDIT ? points : 0,
    status: REWARD_TRANSACTION_STATUSES.APPLIED,
    reasonCode,
    reasonLabel,
    sourceType,
    sourceId,
    idempotencyKey,
    requestId,
    ratingId,
    referralId,
    relatedUserId,
    categoryId: String(categoryId || '').trim(),
    serviceIds: normalizedServiceIds,
    primaryServiceId: String(primaryServiceId || '').trim(),
    availableAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt,
    allocations: consumedAllocations,
    metadata: safeMetadata,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    schemaVersion: SCHEMA_VERSION,
  });

  tx.set(accountRef, {
    ...(!existed ? rewardAccountBase(userId, accountType, admin) : {}),
    ...accountPatch,
  }, { merge: true });

  if (notifyUser) {
    const notification = buildRewardNotification({
      userId,
      transactionId,
      direction,
      points,
      reasonCode,
      requestId,
      metadata: safeMetadata,
    });

    if (notification) {
      tx.set(db.collection('notifications').doc(notification.notificationId), {
        ...notification.payload,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }

  logger.info('reward_applied', {
    userId,
    idempotencyKey,
    reasonCode,
    direction,
    points,
    result: 'applied',
  });

  return {
    applied: true,
    duplicate: false,
    transactionId,
    delta,
  };
}

async function applyRewardTransaction(options) {
  const {
    db,
  } = options;

  const maxAttempts = 5;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await db.runTransaction(async (tx) => applyRewardTransactionInTransaction({
        ...options,
        tx,
      }));
    } catch (error) {
      lastError = error;
      const details = String(error?.details || '');
      const message = String(error?.message || '');
      const code = Number(error?.code || 0);
      const isRetryableAbort = code === 10
        || /ABORTED/i.test(message)
        || /lock timeout/i.test(details)
        || /lock timeout/i.test(message);

      if (!isRetryableAbort || attempt === maxAttempts) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, attempt * 50));
    }
  }

  throw lastError;
}

async function ensureRewardAccount(db, admin, txOrShim, userId, accountType) {
  const accountRef = db.collection('rewardAccounts').doc(userId);
  const tx = txOrShim;

  if (tx && typeof tx.get === 'function' && typeof tx.set === 'function') {
    await loadRewardAccount({
      db,
      admin,
      tx,
      userId,
      accountType,
    });
    return accountRef;
  }

  const snapshot = await accountRef.get();
  if (!snapshot.exists) {
    await accountRef.set(rewardAccountBase(userId, accountType, admin), { merge: true });
  }
  return accountRef;
}

async function reverseReward({
  db,
  admin,
  userId,
  accountType,
  originalTransactionId,
  points,
  reason = 'reward_reversal',
  idempotencyKey,
  notifyUser = false,
}) {
  return applyRewardTransaction({
    db,
    admin,
    userId,
    accountType,
    direction: REWARD_TRANSACTION_DIRECTIONS.REVERSAL,
    points,
    reasonCode: REWARD_REASON_CODES.REVERSAL,
    reasonLabel: reason,
    sourceType: 'reward_transaction',
    sourceId: originalTransactionId,
    idempotencyKey,
    metadata: {
      originalTransactionId,
    },
    allowNegativeBalance: true,
    notifyUser,
  });
}

async function expireCreditTransaction({
  db,
  admin,
  creditRef,
  creditData,
}) {
  return db.runTransaction(async (tx) => {
    const freshCreditSnapshot = await tx.get(creditRef);
    if (!freshCreditSnapshot.exists) {
      return { expired: false, reason: 'missing_credit' };
    }

    const freshCredit = freshCreditSnapshot.data() || {};
    const remainingPoints = Number(freshCredit.remainingPoints || 0);
    const expiresAt = freshCredit.expiresAt?.toMillis?.() || 0;
    const now = admin.firestore.Timestamp.now().toMillis();

    if (remainingPoints <= 0) {
      return { expired: false, reason: 'already_consumed' };
    }
    if (!expiresAt || expiresAt > now) {
      return { expired: false, reason: 'not_due' };
    }

    const result = await applyRewardTransactionInTransaction({
      db,
      admin,
      tx,
      userId: freshCredit.userId,
      accountType: ACCOUNT_TYPES.CUSTOMER,
      direction: REWARD_TRANSACTION_DIRECTIONS.EXPIRY,
      points: remainingPoints,
      reasonCode: REWARD_REASON_CODES.POINTS_EXPIRED,
      reasonLabel: 'Points expired',
      sourceType: 'reward_transaction',
      sourceId: freshCredit.transactionId || freshCreditSnapshot.id,
      idempotencyKey: `customer:${freshCredit.userId}:points-expired:${freshCredit.transactionId || freshCreditSnapshot.id}`,
      metadata: {
        expiredTransactionId: freshCredit.transactionId || freshCreditSnapshot.id,
      },
      notifyUser: true,
    });

    if (result.applied) {
      tx.set(creditRef, {
        remainingPoints: 0,
        status: REWARD_TRANSACTION_STATUSES.EXPIRED,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    return {
      expired: result.applied || result.duplicate,
      duplicate: result.duplicate,
    };
  });
}

async function processExpiredCustomerPoints({
  db,
  admin,
  limit = 100,
}) {
  const now = admin.firestore.Timestamp.now();
  const snapshot = await db
    .collectionGroup('transactions')
    .where('accountType', '==', ACCOUNT_TYPES.CUSTOMER)
    .where('direction', '==', REWARD_TRANSACTION_DIRECTIONS.CREDIT)
    .where('status', '==', REWARD_TRANSACTION_STATUSES.APPLIED)
    .where('expiresAt', '<=', now)
    .limit(limit)
    .get();

  let processed = 0;
  for (const document of snapshot.docs) {
    const result = await expireCreditTransaction({
      db,
      admin,
      creditRef: document.ref,
      creditData: document.data() || {},
    }).catch((error) => ({
      expired: false,
      reason: error.message,
    }));

    if (result.expired) {
      processed += 1;
    }
  }

  logger.info('expiry_processed', {
    processed,
    scanned: snapshot.size,
  });

  return {
    processed,
    scanned: snapshot.size,
  };
}

module.exports = {
  ensureRewardAccount,
  applyRewardTransaction,
  applyRewardTransactionInTransaction,
  reverseReward,
  processExpiredCustomerPoints,
  sanitizeMetadata,
  txIdFromKey,
  rewardAccountBase,
};
