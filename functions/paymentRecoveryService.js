'use strict';

const { createHash } = require('node:crypto');
const { applyHelperPayoutInTransaction } = require('./helperWalletService');
const { getServiceHelperPayoutBreakdown } = require('./serviceRequestBilling');
const {
  getFinalPayableAmount,
  paymentStateForRequest,
} = require('./requestPaymentService');

const PAYMENT_OPERATIONS = 'servicePaymentOperations';
const PAYMENT_LEDGER = 'financialLedger';
const FINANCIAL_OPERATIONS = 'financialOperations';

const UNPAID_RECOVERY_STAGES = Object.freeze([
  { index: 0, delayMs: 20 * 60 * 1000, label: '20m', deductWallet: false },
  { index: 1, delayMs: 60 * 60 * 1000, label: '60m', deductWallet: false },
  { index: 2, delayMs: 6 * 60 * 60 * 1000, label: '6h', deductWallet: false },
  { index: 3, delayMs: 12 * 60 * 60 * 1000, label: '12h', deductWallet: false },
  { index: 4, delayMs: 20 * 60 * 60 * 1000, label: '20h', deductWallet: false },
  { index: 5, delayMs: 23 * 60 * 60 * 1000, label: '23h', deductWallet: true },
]);

function digest(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function normalizeTimestampMs(value) {
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value.toMillis === 'function') return Number(value.toMillis()) || 0;
  if (typeof value === 'object' && Number.isFinite(Number(value._seconds))) {
    return Number(value._seconds) * 1000 + Math.round(Number(value._nanoseconds || 0) / 1e6);
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveCompletionTimestampMs(request = {}) {
  return normalizeTimestampMs(request.endedAt)
    || normalizeTimestampMs(request.completedAt)
    || normalizeTimestampMs(request.pricingSnapshot?.finalizedAt)
    || 0;
}

function isRequestEligibleForUnpaidRecovery(request = {}, paymentOperation = null, legacyOperation = null) {
  if (!request || String(request.status || '').trim().toLowerCase() !== 'completed') {
    return { eligible: false, reason: 'not-completed' };
  }
  const completedAtMs = resolveCompletionTimestampMs(request);
  if (!completedAtMs) {
    return { eligible: false, reason: 'missing-completion-timestamp' };
  }
  const state = paymentStateForRequest(request, paymentOperation, legacyOperation);
  if (state === 'paid') {
    return { eligible: false, reason: 'already-paid' };
  }
  const amount = getFinalPayableAmount(request, legacyOperation);
  if (amount === null || amount <= 0) {
    return { eligible: false, reason: 'no-payable-amount' };
  }
  return {
    eligible: true,
    completedAtMs,
    amount,
    paymentStatus: state,
  };
}

function getRecoveryStageByIndex(stageIndex) {
  const numeric = Number(stageIndex);
  if (!Number.isInteger(numeric)) return null;
  return UNPAID_RECOVERY_STAGES.find((stage) => stage.index === numeric) || null;
}

function getCompletedStageMap(request = {}) {
  const raw = request?.unpaidRecovery?.completedStages;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

function getNextUnpaidRecoveryStage(request = {}, now = Date.now()) {
  const completedAtMs = resolveCompletionTimestampMs(request);
  if (!completedAtMs) return null;
  const completedStages = getCompletedStageMap(request);
  for (const stage of UNPAID_RECOVERY_STAGES) {
    if (completedStages[String(stage.index)] || completedStages[stage.label]) {
      continue;
    }
    const targetRunAtMs = completedAtMs + stage.delayMs;
    const delaySeconds = Math.max(0, Math.ceil((targetRunAtMs - now) / 1000));
    return {
      ...stage,
      completedAtMs,
      targetRunAtMs,
      delaySeconds,
      isDueNow: targetRunAtMs <= now,
    };
  }
  return null;
}

function getLatestDueUnpaidRecoveryStage(request = {}, now = Date.now()) {
  const completedAtMs = resolveCompletionTimestampMs(request);
  if (!completedAtMs) return null;
  const completedStages = getCompletedStageMap(request);
  let dueStage = null;
  for (const stage of UNPAID_RECOVERY_STAGES) {
    if (completedStages[String(stage.index)] || completedStages[stage.label]) {
      continue;
    }
    const targetRunAtMs = completedAtMs + stage.delayMs;
    if (targetRunAtMs <= now) {
      dueStage = {
        ...stage,
        completedAtMs,
        targetRunAtMs,
        delaySeconds: 0,
        isDueNow: true,
      };
    }
  }
  return dueStage;
}

function getRecoveryTaskId(requestId, stageIndex) {
  return `unpaid-recovery_${digest(`${requestId}:${stageIndex}`).slice(0, 32)}`;
}

function hasOutstandingDebtFlag(legacy = null, payment = null) {
  const legacyDebt = Boolean(legacy?.walletDebtOutstanding || (legacy?.debtApplied && !legacy?.debtReversed));
  const paymentDebt = Boolean(payment?.walletDebtOutstanding || (payment?.debtApplied && !payment?.debtReversed));
  return legacyDebt || paymentDebt;
}

function buildRecoveryMessageText({
  request = {},
  stage = UNPAID_RECOVERY_STAGES[0],
  amount = 0,
  paymentUrl = '',
  walletDeducted = false,
} = {}) {
  const serviceName = String(request.serviceSummary || request.subject || 'your Uncedo service').trim();
  const refCode = String(request.publicRequestReference || request.requestReference || '').trim();
  const refPrefix = refCode ? `[${refCode}] ` : '';
  const roundedAmount = Math.round(Number(amount || 0));

  if (stage?.deductWallet || walletDeducted) {
    return `${refPrefix}Payment of R${roundedAmount} for ${serviceName} is overdue (23h). R${roundedAmount} has been deducted from your Uncedo wallet and new bookings are blocked until paid.${paymentUrl ? ` Pay now with a fresh link: ${paymentUrl}` : ''}`;
  }

  return `${refPrefix}Payment reminder (${stage?.label || 'overdue'}): R${roundedAmount} is still unpaid for ${serviceName}.${paymentUrl ? ` Pay now using this fresh link: ${paymentUrl}` : ' Open the app or reply pay to settle.'}`;
}

async function applyUnpaidRecoveryWalletDeduction({
  db,
  admin,
  requestId,
  now = Date.now(),
} = {}) {
  const normalizedRequestId = String(requestId || '').trim();
  if (!normalizedRequestId) return { action: 'invalid-input' };

  const requestRef = db.collection('serviceRequests').doc(normalizedRequestId);
  const paymentRef = db.collection(PAYMENT_OPERATIONS).doc(normalizedRequestId);
  const legacyRef = db.collection(FINANCIAL_OPERATIONS).doc(`service_${digest(normalizedRequestId).slice(0, 40)}`);
  const debtLedgerRef = db.collection(PAYMENT_LEDGER).doc(`recovery_debt_${digest(normalizedRequestId).slice(0, 40)}`);

  return db.runTransaction(async (transaction) => {
    const [requestSnap, paymentSnap, legacySnap, debtLedgerSnap] = await Promise.all([
      transaction.get(requestRef),
      transaction.get(paymentRef),
      transaction.get(legacyRef),
      transaction.get(debtLedgerRef),
    ]);

    if (!requestSnap.exists) return { action: 'not-found' };
    const request = requestSnap.data() || {};
    if (String(request.status || '').trim().toLowerCase() !== 'completed') {
      return { action: 'not-completed' };
    }

    const payment = paymentSnap.exists ? paymentSnap.data() || {} : null;
    const legacy = legacySnap.exists ? legacySnap.data() || {} : null;
    if (paymentStateForRequest(request, payment, legacy) === 'paid') {
      return { action: 'already-paid' };
    }

    const amount = getFinalPayableAmount(request, legacy);
    if (amount === null || amount <= 0) {
      return { action: 'no-payable-amount' };
    }

    const rawCustomerId = String(request.customerId || '').trim();
    let ownerUid = rawCustomerId;
    if (rawCustomerId.startsWith('guest_')) {
      const ownershipSnap = await transaction.get(db.collection('whatsappGuestOwnership').doc(rawCustomerId));
      const linkedUid = ownershipSnap.exists ? String(ownershipSnap.data()?.uid || '').trim() : '';
      if (linkedUid) {
        ownerUid = linkedUid;
      }
    }

    const ownerRef = ownerUid ? db.collection('users').doc(ownerUid) : null;
    const ownerSnap = ownerRef ? await transaction.get(ownerRef) : null;

    const alreadyHasDebt = debtLedgerSnap.exists
      || legacy?.status === 'settled_failed'
      || hasOutstandingDebtFlag(legacy, payment);
    const resolvedHelperId = String(request.helperAssignment?.helperId || '').trim();

    const breakdown = request.helperPayoutBreakdown && typeof request.helperPayoutBreakdown === 'object'
      ? request.helperPayoutBreakdown
      : getServiceHelperPayoutBreakdown(request, {
          closureType: 'completed',
          waitingCost: Number(request.waitingCost || request.pricingSnapshot?.waitingCost || 0),
        });
    const customerChargeAmountMinor = Math.round(Number(breakdown?.customerChargeAmount ?? amount) * 100);
    const helperAmountMinor = Math.round(Number(breakdown?.helperAmount || 0) * 100);
    const platformAmountMinor = Math.round(Number(
      breakdown?.platformAmount ?? Math.max(0, (customerChargeAmountMinor - helperAmountMinor) / 100),
    ) * 100);

    // Execute helper wallet reads+writes BEFORE our remaining transaction writes
    let helperWalletCredited = false;
    if (resolvedHelperId && helperAmountMinor > 0) {
      const helperCredit = await applyHelperPayoutInTransaction({
        transaction,
        db,
        helperId: resolvedHelperId,
        requestId: normalizedRequestId,
        helperAmountMinor,
        platformAmountMinor,
        customerChargeAmountMinor,
        isCash: false,
        closureType: 'completed',
        now,
      });
      helperWalletCredited = Boolean(helperCredit.applied || helperCredit.duplicate);
    }

    let walletDebtAppliedNow = false;
    let balanceAfter = null;
    if (!alreadyHasDebt && ownerRef) {
      const ownerData = ownerSnap?.exists ? (ownerSnap.data() || {}) : {};
      const wallet = ownerData.wallet || { balance: 0, currency: 'ZAR' };
      const oldBalance = Number(wallet.balance || 0);
      const newBalance = Number((oldBalance - amount).toFixed(2));
      balanceAfter = newBalance;

      transaction.create(debtLedgerRef, {
        entryId: debtLedgerRef.id,
        operationId: String(legacy?.operationId || `payment_${normalizedRequestId}`),
        requestId: normalizedRequestId,
        userId: ownerUid,
        entryType: 'unpaid_recovery_wallet_debt',
        amount,
        currency: 'ZAR',
        balanceBefore: oldBalance,
        balanceAfter: newBalance,
        triggerStage: '23h',
        createdAtMs: now,
      });

      transaction.set(ownerRef, {
        ...(ownerUid.startsWith('guest_') && !ownerSnap?.exists ? {
          uid: ownerUid,
          isGuest: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        } : {}),
        wallet: {
          ...wallet,
          balance: newBalance,
          currency: wallet.currency || 'ZAR',
          updatedAt: new Date(now).toISOString(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      walletDebtAppliedNow = true;
    }

    const recordedDebtAmount = Number(payment?.walletDebtAmount || legacy?.amount || 0) || amount;

    transaction.set(paymentRef, {
      requestId: normalizedRequestId,
      customerId: rawCustomerId,
      amount,
      amountMinor: Math.round(amount * 100),
      currency: 'ZAR',
      status: 'wallet_debt_recorded',
      activeAttemptId: null,
      walletDebtOutstanding: true,
      debtApplied: Boolean(payment?.debtApplied || walletDebtAppliedNow || alreadyHasDebt),
      walletDebtAmount: recordedDebtAmount,
      debtOwnerUid: ownerUid,
      recoveryWalletDeductedAtMs: Number(payment?.recoveryWalletDeductedAtMs || now),
      updatedAtMs: now,
      createdAtMs: Number(payment?.createdAtMs || now),
    }, { merge: true });

    if (legacySnap.exists) {
      transaction.set(legacyRef, {
        paymentStatus: 'wallet_debt_recorded',
        paymentSettled: false,
        walletDebtOutstanding: true,
        debtApplied: Boolean(legacy?.debtApplied || walletDebtAppliedNow || alreadyHasDebt),
        debtOwnerUid: ownerUid,
        recoveryWalletDeductedAtMs: Number(legacy?.recoveryWalletDeductedAtMs || now),
        updatedAtMs: now,
      }, { merge: true });
    }

    const existingRecovery = request.unpaidRecovery && typeof request.unpaidRecovery === 'object'
      ? request.unpaidRecovery
      : {};
    transaction.update(requestRef, {
      paymentStatus: 'wallet_debt_recorded',
      ...(helperWalletCredited && Number(request.helperWalletAccountingVersion || 0) !== 1
        ? { helperWalletAccountingVersion: 1 }
        : {}),
      unpaidRecovery: {
        ...existingRecovery,
        status: 'wallet_deducted',
        walletDeductedAtMs: Number(existingRecovery.walletDeductedAtMs || now),
        walletDebtAmount: recordedDebtAmount,
        debtOwnerUid: ownerUid,
        updatedAtMs: now,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      action: 'wallet_deducted',
      walletDebtAppliedNow,
      alreadyHadDebt: alreadyHasDebt,
      helperWalletCredited,
      amount,
      ownerUid,
      balanceAfter,
    };
  });
}

module.exports = {
  UNPAID_RECOVERY_STAGES,
  applyUnpaidRecoveryWalletDeduction,
  buildRecoveryMessageText,
  getLatestDueUnpaidRecoveryStage,
  getNextUnpaidRecoveryStage,
  getRecoveryStageByIndex,
  getRecoveryTaskId,
  isRequestEligibleForUnpaidRecovery,
  resolveCompletionTimestampMs,
};
