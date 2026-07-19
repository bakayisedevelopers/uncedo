const { createHash, randomBytes } = require('crypto');
const { logger } = require('firebase-functions');

const {
  ACCOUNT_TYPES,
  REFERRAL_STATUSES,
  REWARD_REASON_CODES,
  REWARD_TRANSACTION_DIRECTIONS,
  normalizeReferralCode,
  SCHEMA_VERSION,
} = require('../shared/rewards');
const { applyRewardTransaction, applyRewardTransactionInTransaction, txIdFromKey } = require('./rewardService');
const { getRewardConfig } = require('./config');

const NEW_REFERRAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function baseCode(userId, displayName = '') {
  const seed = String(displayName || userId)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6) || 'UNCEDO';
  const hash = createHash('sha1').update(`${userId}:${displayName}`).digest('hex').slice(0, 4).toUpperCase();
  return `${seed}${hash}`;
}

function timestampToMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = Date.parse(String(value || '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasVerifiedPaymentMethod(user = {}) {
  return Array.isArray(user.paymentMethods) && user.paymentMethods.length > 0;
}

function isCustomerProfileComplete(user = {}) {
  const fullName = String(user.fullName || user.displayName || '').trim();
  const phoneNumber = String(user.phoneNumber || '').trim();
  const profile = user.customerProfile || {};
  const accountType = String(profile.accountType || '').trim().toLowerCase();
  const serviceAddress = String(profile.serviceAddress || '').trim();
  const discoverySource = String(profile.discoverySource || '').trim();

  if (!fullName || !phoneNumber || !accountType || !serviceAddress || !discoverySource) {
    return false;
  }

  if (accountType === 'business') {
    return Boolean(
      String(profile.businessName || '').trim()
      && String(profile.businessEmail || '').trim()
      && String(profile.businessCategory || '').trim(),
    );
  }

  return Boolean(String(profile.customerType || '').trim());
}

function isCustomerAccount(user = {}) {
  const activeRole = String(user.activeRole || user.role || '').trim().toLowerCase();
  return activeRole === 'customer' || activeRole === 'student';
}

async function ensureReferralCode({
  db,
  admin,
  userId,
  accountType = ACCOUNT_TYPES.CUSTOMER,
  displayName = '',
}) {
  const userRef = db.collection('users').doc(userId);
  const userSnapshot = await userRef.get();
  const existingCode = normalizeReferralCode(
    userSnapshot.data()?.referralCode
    || userSnapshot.data()?.referralSlug
    || '',
  );

  if (existingCode) {
    const codeRef = db.collection('referralCodes').doc(existingCode);
    const codeSnapshot = await codeRef.get();
    if (!codeSnapshot.exists || codeSnapshot.data()?.ownerUserId === userId) {
      await codeRef.set({
        code: existingCode,
        normalizedCode: existingCode,
        ownerUserId: userId,
        ownerAccountType: accountType,
        status: REFERRAL_STATUSES.ACTIVE,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        schemaVersion: SCHEMA_VERSION,
      }, { merge: true });
      await userRef.set({
        referralCode: existingCode,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return { code: existingCode };
    }
  }

  for (let index = 0; index < 8; index += 1) {
    const code = normalizeReferralCode(
      `${baseCode(userId, displayName)}${index ? randomBytes(2).toString('hex').toUpperCase() : ''}`,
    );
    const codeRef = db.collection('referralCodes').doc(code);

    try {
      await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(codeRef);
        if (snapshot.exists && snapshot.data()?.ownerUserId !== userId) {
          throw new Error('collision');
        }

        tx.set(codeRef, {
          code,
          normalizedCode: code,
          ownerUserId: userId,
          ownerAccountType: accountType,
          status: REFERRAL_STATUSES.ACTIVE,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          schemaVersion: SCHEMA_VERSION,
        }, { merge: true });
        tx.set(userRef, {
          referralCode: code,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      });

      return { code };
    } catch (error) {
      if (error.message !== 'collision') {
        throw error;
      }
    }
  }

  throw new Error('Unable to allocate unique referral code');
}

async function assertNewReferralAccount({
  db,
  tx,
  referredUserId,
  userRef,
}) {
  const [userSnapshot, rewardAccountSnapshot, existingRequestSnapshot] = await Promise.all([
    tx.get(userRef),
    tx.get(db.collection('rewardAccounts').doc(referredUserId)),
    tx.get(
      db.collection('serviceRequests')
        .where('customerId', '==', referredUserId)
        .limit(1),
    ),
  ]);

  const user = userSnapshot.exists ? (userSnapshot.data() || {}) : {};
  const rewardAccount = rewardAccountSnapshot.exists ? (rewardAccountSnapshot.data() || {}) : {};
  const createdAtMs = timestampToMillis(user.createdAt);
  const isRecentEnough = createdAtMs > 0 && (Date.now() - createdAtMs) <= NEW_REFERRAL_WINDOW_MS;
  const hasActivity = !existingRequestSnapshot.empty
    || hasVerifiedPaymentMethod(user)
    || Number(rewardAccount.eligibleCompletedPaidBookings || 0) > 0
    || Number(rewardAccount.eligibleCompletedPaidJobs || 0) > 0;

  if (!isRecentEnough || hasActivity) {
    throw new Error('Referral codes can only be attached to a new account before activity begins.');
  }

  return user;
}

async function attachReferral({
  db,
  admin,
  referralCode,
  referredUserId,
  referredAccountType = ACCOUNT_TYPES.CUSTOMER,
}) {
  const normalizedCode = normalizeReferralCode(referralCode);
  if (!normalizedCode) {
    throw new Error('Referral code is required');
  }

  const codeSnapshot = await db.collection('referralCodes').doc(normalizedCode).get();
  if (!codeSnapshot.exists || codeSnapshot.data()?.status !== REFERRAL_STATUSES.ACTIVE) {
    throw new Error('Referral code is not active');
  }

  const codeData = codeSnapshot.data() || {};
  if (codeData.ownerUserId === referredUserId) {
    throw new Error('Self-referral is not allowed');
  }

  const referralRef = db.collection('referrals').doc(referredUserId);
  const userRef = db.collection('users').doc(referredUserId);

  await db.runTransaction(async (tx) => {
    const existingReferral = await tx.get(referralRef);
    if (existingReferral.exists) {
      throw new Error('Referral relationship already exists');
    }

    await assertNewReferralAccount({
      db,
      tx,
      referredUserId,
      userRef,
    });

    tx.set(referralRef, {
      referralId: referredUserId,
      referralCode: normalizedCode,
      referrerUserId: codeData.ownerUserId,
      referrerAccountType: codeData.ownerAccountType,
      referredUserId,
      referredAccountType,
      status: REFERRAL_STATUSES.ATTRIBUTED,
      attributedAt: admin.firestore.FieldValue.serverTimestamp(),
      fraudReviewStatus: 'clear',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      schemaVersion: SCHEMA_VERSION,
    });
  });

  logger.info('referral_created', {
    referralCode: normalizedCode,
    referredUserId,
    referrerUserId: codeData.ownerUserId,
  });

  return {
    attached: true,
    referrerAccountType: codeData.ownerAccountType,
  };
}

async function awardReferralStageInTransaction({
  db,
  admin,
  tx,
  referralRef,
  referral,
  referredUserId,
  stage,
  requestId = null,
}) {
  const fieldName = stage === 1 ? 'stageOneAwardedAt' : 'stageTwoAwardedAt';
  if (referral[fieldName]) {
    return { applied: false, duplicate: true };
  }

  const rewardConfig = await getRewardConfig(
    db,
    referral.referrerAccountType === ACCOUNT_TYPES.HELPER ? 'helper' : 'customer',
  );
  const points = stage === 1
    ? Number(rewardConfig.rewards?.referralStageOne || rewardConfig.rewards?.referralReward || 0)
    : Number(rewardConfig.rewards?.referralStageTwo || rewardConfig.rewards?.referralReward || 0);

  if (!points) {
    return { applied: false, skipped: true, reason: 'no_points_configured' };
  }

  const reasonCode = stage === 1
    ? REWARD_REASON_CODES.REFERRAL_STAGE_ONE
    : REWARD_REASON_CODES.REFERRAL_STAGE_TWO;

  const result = await applyRewardTransactionInTransaction({
    db,
    admin,
    tx,
    userId: referral.referrerUserId,
    accountType: referral.referrerAccountType,
    direction: REWARD_TRANSACTION_DIRECTIONS.CREDIT,
    points,
    reasonCode,
    reasonLabel: `Referral stage ${stage}`,
    sourceType: 'referral',
    sourceId: referredUserId,
    idempotencyKey: `referral:${referredUserId}:stage-${stage}`,
    referralId: referredUserId,
    relatedUserId: referredUserId,
    requestId,
    notifyUser: true,
  });

  tx.set(referralRef, {
    [fieldName]: admin.firestore.FieldValue.serverTimestamp(),
    status: stage === 2 ? REFERRAL_STATUSES.REWARDED : REFERRAL_STATUSES.QUALIFIED,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return result;
}

async function evaluateCustomerReferralStageOne({
  db,
  admin,
  referredUserId,
}) {
  const referralRef = db.collection('referrals').doc(referredUserId);
  const referralSnapshot = await referralRef.get();
  if (!referralSnapshot.exists) {
    return { skipped: true, reason: 'no_referral' };
  }

  const referral = referralSnapshot.data() || {};
  if (referral.fraudReviewStatus === 'invalid' || referral.status === REFERRAL_STATUSES.INVALID) {
    return { skipped: true, reason: 'invalid' };
  }

  const userSnapshot = await db.collection('users').doc(referredUserId).get();
  const user = userSnapshot.data() || {};
  if (!isCustomerAccount(user)) {
    return { skipped: true, reason: 'not_customer_account' };
  }

  const profileCompleted = isCustomerProfileComplete(user);
  const paymentVerified = hasVerifiedPaymentMethod(user);
  if (!profileCompleted || !paymentVerified) {
    return {
      skipped: true,
      reason: 'requirements_not_met',
      profileCompleted,
      paymentVerified,
    };
  }

  return db.runTransaction(async (tx) => {
    const freshReferralSnapshot = await tx.get(referralRef);
    if (!freshReferralSnapshot.exists) {
      return { skipped: true, reason: 'no_referral' };
    }

    const freshReferral = freshReferralSnapshot.data() || {};
    const result = await awardReferralStageInTransaction({
      db,
      admin,
      tx,
      referralRef,
      referral: freshReferral,
      referredUserId,
      stage: 1,
    });

    if (result.applied || result.duplicate) {
      tx.set(referralRef, {
        stageOneQualifiedAt: freshReferral.stageOneQualifiedAt || admin.firestore.FieldValue.serverTimestamp(),
        profileCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
        paymentVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    return {
      ...result,
      profileCompleted,
      paymentVerified,
    };
  });
}

async function evaluateCustomerProfileCompletionReward({
  db,
  admin,
  userId,
}) {
  const userSnapshot = await db.collection('users').doc(userId).get();
  const user = userSnapshot.data() || {};
  if (!isCustomerAccount(user)) {
    return { skipped: true, reason: 'not_customer_account' };
  }

  const profileCompleted = isCustomerProfileComplete(user);
  if (!profileCompleted) {
    return { skipped: true, reason: 'profile_incomplete', profileCompleted: false };
  }

  const rewardConfig = await getRewardConfig(db, 'customer');
  const points = Number(rewardConfig.rewards?.profileCompleted || 0);
  if (!points) {
    return { skipped: true, reason: 'no_points_configured', profileCompleted: true };
  }

  const result = await applyRewardTransaction({
    db,
    admin,
    userId,
    accountType: ACCOUNT_TYPES.CUSTOMER,
    direction: REWARD_TRANSACTION_DIRECTIONS.CREDIT,
    points,
    reasonCode: REWARD_REASON_CODES.PROFILE_COMPLETED,
    reasonLabel: 'Profile completed',
    sourceType: 'profile',
    sourceId: userId,
    idempotencyKey: `customer:${userId}:profile-completed`,
    notifyUser: true,
  });

  return {
    ...result,
    profileCompleted: true,
    points,
  };
}

async function getFirstPaidBookingBonusTransaction({
  db,
  referredUserId,
}) {
  const transactionId = txIdFromKey(`customer:${referredUserId}:request:first-booking-bonus`);
  const transactionSnapshot = await db
    .collection('rewardAccounts')
    .doc(referredUserId)
    .collection('transactions')
    .doc(transactionId)
    .get();

  return transactionSnapshot.exists ? (transactionSnapshot.data() || {}) : null;
}

async function evaluateReferralStageTwoFromFirstPaidBooking({
  db,
  admin,
  referredUserId,
  requestId,
}) {
  const firstBookingBonus = await getFirstPaidBookingBonusTransaction({
    db,
    referredUserId,
  });

  if (!firstBookingBonus) {
    return { skipped: true, reason: 'first_paid_booking_not_recorded' };
  }

  const bonusRequestId = String(
    firstBookingBonus.requestId
    || firstBookingBonus.sourceId
    || '',
  ).trim();

  if (bonusRequestId !== String(requestId || '').trim()) {
    return { skipped: true, reason: 'not_first_paid_booking' };
  }

  const referralRef = db.collection('referrals').doc(referredUserId);
  return db.runTransaction(async (tx) => {
    const referralSnapshot = await tx.get(referralRef);
    if (!referralSnapshot.exists) {
      return { skipped: true, reason: 'no_referral' };
    }

    const referral = referralSnapshot.data() || {};
    if (referral.fraudReviewStatus === 'invalid' || referral.status === REFERRAL_STATUSES.INVALID) {
      return { skipped: true, reason: 'invalid' };
    }

    if (!referral.stageOneAwardedAt) {
      return { skipped: true, reason: 'stage_one_not_qualified' };
    }

    const result = await awardReferralStageInTransaction({
      db,
      admin,
      tx,
      referralRef,
      referral,
      referredUserId,
      stage: 2,
      requestId,
    });

    if (result.applied || result.duplicate) {
      tx.set(referralRef, {
        stageTwoQualifiedAt: referral.stageTwoQualifiedAt || admin.firestore.FieldValue.serverTimestamp(),
        firstQualifiedPaidRequestId: bonusRequestId,
      }, { merge: true });
    }

    return result;
  });
}

async function awardReferralStage({
  db,
  admin,
  referredUserId,
  stage,
  requestId = null,
}) {
  if (stage === 1) {
    return evaluateCustomerReferralStageOne({
      db,
      admin,
      referredUserId,
    });
  }

  if (stage === 2) {
    return evaluateReferralStageTwoFromFirstPaidBooking({
      db,
      admin,
      referredUserId,
      requestId,
    });
  }

  return { skipped: true, reason: 'unsupported_stage' };
}

module.exports = {
  ensureReferralCode,
  attachReferral,
  awardReferralStage,
  evaluateCustomerProfileCompletionReward,
  evaluateCustomerReferralStageOne,
  evaluateReferralStageTwoFromFirstPaidBooking,
  hasVerifiedPaymentMethod,
  isCustomerProfileComplete,
};
