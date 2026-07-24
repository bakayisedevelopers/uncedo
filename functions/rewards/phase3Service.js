const { createHash } = require('crypto');
const { ACCOUNT_TYPES, REWARD_REASON_CODES, REWARD_TRANSACTION_DIRECTIONS } = require('../shared/rewards');
const { getRewardConfig } = require('./config');
const { applyRewardTransactionInTransaction } = require('./rewardService');

const hashId = (prefix, value) => `${prefix}_${createHash('sha256').update(String(value)).digest('hex').slice(0, 32)}`;
const roundRand = (value) => Math.round(Number(value || 0) * 100) / 100;

function assertAdmin(user = {}) {
  if (!(user?.isAdmin === true || user?.role === 'admin' || user?.email === 'jabuobed1@gmail.com')) throw new Error('Admin access required.');
}

function bookingEligibleSubtotal(request = {}) {
  return roundRand(request?.pricingSnapshot?.subtotal ?? request?.pricingSnapshot?.serviceSubtotal ?? request?.pricingSnapshot?.baseAmount ?? 0);
}

async function reserveServiceCredit({ db, admin, userId, requestId, requestedPoints }) {
  const points = Number(requestedPoints);
  if (!Number.isInteger(points) || points <= 0) throw new Error('Redemption points must be a positive integer.');
  const [globalConfig, requestSnap] = await Promise.all([getRewardConfig(db, 'global'), db.collection('serviceRequests').doc(requestId).get()]);
  if (globalConfig?.featureFlags?.redemptionEnabled !== true) throw new Error('Service-credit redemption is not enabled.');
  if (!requestSnap.exists) throw new Error('Service request not found.');
  const request = requestSnap.data() || {};
  if (request.customerId !== userId) throw new Error('This booking does not belong to you.');
  if (!['collecting_details', 'scheduled_pending', 'matching'].includes(String(request.status || ''))) throw new Error('This booking can no longer reserve service credit.');

  const minimum = Number(globalConfig.minimumCustomerRedemptionPoints || 100);
  const increment = Number(globalConfig.redemptionIncrementPoints || 10);
  if (points < minimum || points % increment !== 0) throw new Error(`Use at least ${minimum} points in increments of ${increment}.`);
  const eligibleSubtotal = bookingEligibleSubtotal(request);
  const percentageCap = eligibleSubtotal * (Number(globalConfig.maximumServiceCreditPercentagePerBooking || 20) / 100);
  const randCap = Number(globalConfig.maximumServiceCreditRandPerBooking || 0);
  const maxRand = randCap > 0 ? Math.min(percentageCap, randCap) : percentageCap;
  const requestedRand = roundRand(points / Number(globalConfig.pointsPerRand || 10));
  if (requestedRand > maxRand) throw new Error('Requested credit exceeds this booking limit.');
  const redemptionId = hashId('service_credit', `${userId}:${requestId}`);
  const redemptionRef = db.collection('serviceCreditRedemptions').doc(redemptionId);

  return db.runTransaction(async (tx) => {
    const existing = await tx.get(redemptionRef);
    if (existing.exists) {
      const data = existing.data() || {};
      if (data.points === points && ['reserved', 'applied'].includes(data.status)) return { redemptionId, ...data, duplicate: true };
      throw new Error('A different service-credit reservation already exists for this booking.');
    }
    const debit = await applyRewardTransactionInTransaction({
      db, admin, tx, userId, accountType: ACCOUNT_TYPES.CUSTOMER, direction: REWARD_TRANSACTION_DIRECTIONS.DEBIT, points,
      reasonCode: REWARD_REASON_CODES.SERVICE_CREDIT_REDEMPTION, reasonLabel: 'Service credit reserved', sourceType: 'service_credit_redemption', sourceId: redemptionId,
      idempotencyKey: `customer:${userId}:service-credit:${requestId}:reserve`, requestId, metadata: { redemptionId, requestedRand }, notifyUser: true,
    });
    tx.set(redemptionRef, { redemptionId, userId, requestId, status: 'reserved', points, creditRand: requestedRand, eligibleSubtotal, maxCreditRand: roundRand(maxRand), debitTransactionId: debit.transactionId, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    tx.set(db.collection('serviceRequests').doc(requestId), { serviceCreditRedemptionId: redemptionId, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { redemptionId, status: 'reserved', points, creditRand: requestedRand, duplicate: false };
  });
}

async function finalizeServiceCredit({ db, admin, requestId, paymentSucceeded, appliedPoints = null, reason = '' }) {
  const requestSnap = await db.collection('serviceRequests').doc(requestId).get();
  const redemptionId = String(requestSnap.data()?.serviceCreditRedemptionId || '').trim();
  if (!redemptionId) return null;
  const ref = db.collection('serviceCreditRedemptions').doc(redemptionId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref); if (!snap.exists) return null;
    const redemption = snap.data() || {};
    if (redemption.status === 'applied' || redemption.status === 'released') return { redemptionId, ...redemption, duplicate: true };
    if (redemption.status !== 'reserved') throw new Error('Service-credit reservation is not usable.');
    const reservedPoints = Number(redemption.points || 0);
    const usedPoints = paymentSucceeded ? Math.max(0, Math.min(reservedPoints, Number(appliedPoints ?? reservedPoints))) : 0;
    const returnedPoints = reservedPoints - usedPoints;
    if (returnedPoints > 0) await applyRewardTransactionInTransaction({ db, admin, tx, userId: redemption.userId, accountType: ACCOUNT_TYPES.CUSTOMER, direction: REWARD_TRANSACTION_DIRECTIONS.CREDIT, points: returnedPoints, reasonCode: REWARD_REASON_CODES.SERVICE_CREDIT_RELEASE, reasonLabel: paymentSucceeded ? 'Unused service credit released' : 'Service credit released', sourceType: 'service_credit_redemption', sourceId: redemptionId, idempotencyKey: `customer:${redemption.userId}:service-credit:${redemptionId}:release:${usedPoints}`, requestId, metadata: { redemptionId, releaseReason: String(reason || (paymentSucceeded ? 'final_cap' : 'payment_failed')) }, notifyUser: true });
    if (paymentSucceeded) {
      tx.set(ref, { status: 'applied', appliedPoints: usedPoints, releasedPoints: returnedPoints, appliedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return { redemptionId, ...redemption, status: 'applied', appliedPoints: usedPoints, releasedPoints: returnedPoints };
    }
    tx.set(ref, { status: 'released', appliedPoints: 0, releasedPoints: returnedPoints, releaseReason: String(reason || 'payment_failed'), releasedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { redemptionId, ...redemption, status: 'released' };
  });
}

async function adminRewardAdjustment({ db, admin, adminUser, userId, accountType, direction, points, reason, supportReference = '' }) {
  assertAdmin(adminUser); const normalizedPoints = Number(points); if (!Number.isInteger(normalizedPoints) || normalizedPoints <= 0) throw new Error('Adjustment points must be a positive integer.');
  const adjustmentId = hashId('adjustment', `${adminUser.uid}:${userId}:${accountType}:${direction}:${normalizedPoints}:${reason}:${supportReference}`);
  const result = await db.runTransaction((tx) => applyRewardTransactionInTransaction({ db, admin, tx, userId, accountType, direction, points: normalizedPoints, reasonCode: REWARD_REASON_CODES.ADMIN_ADJUSTMENT, reasonLabel: String(reason || 'Admin adjustment'), sourceType: 'admin_adjustment', sourceId: adjustmentId, idempotencyKey: adjustmentId, metadata: { adjustmentId, supportReference: String(supportReference || ''), adminUid: adminUser.uid }, allowNegativeBalance: direction !== REWARD_TRANSACTION_DIRECTIONS.CREDIT, notifyUser: true }));
  await db.collection('adminAuditLogs').doc(adjustmentId).set({ action: 'reward_adjustment', targetType: 'reward_account', targetId: userId, actorUid: adminUser.uid, reason: String(reason || ''), createdAt: admin.firestore.FieldValue.serverTimestamp(), correlationId: adjustmentId }, { merge: true });
  return { adjustmentId, result };
}

async function requestHelperBenefit({ db, admin, helperId, benefitId }) {
  const [globalConfig, benefitSnap] = await Promise.all([getRewardConfig(db, 'global'), db.collection('helperRewardBenefits').doc(benefitId).get()]);
  if (globalConfig?.featureFlags?.helperBenefitsEnabled !== true) throw new Error('Helper benefits are not enabled.');
  if (!benefitSnap.exists) throw new Error('Benefit not found.');
  const benefit = benefitSnap.data() || {};
  if (benefit.active !== true || Number(benefit.pointCost || 0) < 1) throw new Error('This benefit is not currently available.');
  const redemptionId = hashId('helper_benefit', `${helperId}:${benefitId}`); const ref = db.collection('helperRewardRedemptions').doc(redemptionId);
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return { redemptionId, ...(existing.data() || {}), duplicate: true };
    if (benefit.stock !== undefined && benefit.stock !== null && Number(benefit.stock) < 1) throw new Error('Benefit stock is exhausted.');
    const debit = await applyRewardTransactionInTransaction({ db, admin, tx, userId: helperId, accountType: ACCOUNT_TYPES.HELPER, direction: REWARD_TRANSACTION_DIRECTIONS.DEBIT, points: Number(benefit.pointCost), reasonCode: REWARD_REASON_CODES.HELPER_BENEFIT_REDEMPTION, reasonLabel: `Benefit requested: ${String(benefit.title || 'Helper benefit')}`, sourceType: 'helper_benefit_redemption', sourceId: redemptionId, idempotencyKey: `helper:${helperId}:benefit:${benefitId}`, metadata: { benefitId, redemptionId }, notifyUser: true });
    tx.set(ref, { redemptionId, helperId, benefitId, pointCost: Number(benefit.pointCost), debitTransactionId: debit.transactionId, status: 'requested', createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    if (benefit.stock !== undefined && benefit.stock !== null) tx.set(benefitSnap.ref, { stock: admin.firestore.FieldValue.increment(-1), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { redemptionId, status: 'requested', duplicate: false };
  });
}

module.exports = { reserveServiceCredit, finalizeServiceCredit, adminRewardAdjustment, requestHelperBenefit, bookingEligibleSubtotal, hashId };
