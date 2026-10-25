'use strict';

const { createHash, randomUUID } = require('node:crypto');
const {
  helperWalletReference,
  walletBalanceIsValid,
  walletFromSnapshot,
  walletLedgerId,
  walletLedgerReference,
  writeWalletLedger,
} = require('./helperWalletService');

const FINANCIAL_OPERATIONS_COLLECTION = 'financialOperations';
const PAYSTACK_TRANSFER_REFERENCES_COLLECTION = 'paystackTransferReferences';
const FINANCIAL_LEDGER_COLLECTION = 'financialLedger';

function hash(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function serviceFinancialOperationId(requestId) {
  return `service_${hash(requestId).slice(0, 40)}`;
}

function helperPayoutOperationId(weekKey, helperId) {
  return `payout_${hash(`${String(weekKey || '').trim()}|${String(helperId || '').trim()}`).slice(0, 40)}`;
}

function paystackChargeReference(operationId, attemptNo) {
  return `uncedo-service-${hash(`${operationId}:${attemptNo}`).slice(0, 32)}`;
}

function paystackTransferReference(operationId, attemptNo) {
  return `uncedo-payout-${hash(`${operationId}:${attemptNo}`).slice(0, 32)}`;
}

function paystackRefundOperationId(reference) {
  return `refund_${hash(reference).slice(0, 40)}`;
}

async function claimPaystackRefund({ db, reference, userId, amountMinor = null, currency = 'ZAR', now = Date.now() }) {
  const normalizedReference = String(reference || '').trim();
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedReference || !normalizedUserId) throw new Error('Invalid Paystack refund claim input.');
  const operationId = paystackRefundOperationId(normalizedReference);
  const operationRef = db.collection('paymentMethodRefunds').doc(operationId);
  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(operationRef);
    if (snapshot.exists) {
      const operation = snapshot.data() || {};
      if (String(operation.userId || '') !== normalizedUserId) return { action: 'conflict', operationId, operation };
      return { action: 'existing', operationId, operation };
    }
    transaction.create(operationRef, {
      operationId,
      gateway: 'paystack',
      transactionReference: normalizedReference,
      userId: normalizedUserId,
      amountMinor: Number.isFinite(Number(amountMinor)) ? Number(amountMinor) : null,
      currency: String(currency || 'ZAR').toUpperCase(),
      status: 'submitting',
      attemptCount: 1,
      submittedAtMs: now,
      createdAtMs: now,
      updatedAtMs: now,
    });
    return { action: 'submit', operationId, operationRef };
  });
  return { ...result, operationRef };
}

async function recordPaystackRefundObservation({ db, operationRef, outcome, refund = null, reason = null, now = Date.now() }) {
  const status = outcome === 'success'
    ? 'refunded'
    : outcome === 'failed_confirmed'
      ? 'failed_confirmed'
      : 'reconciliation_required';
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(operationRef);
    if (!snapshot.exists) return { updated: false, reason: 'refund-operation-not-found' };
    const current = snapshot.data() || {};
    if (current.status === 'refunded') return { updated: false, duplicate: true, operation: current };
    transaction.set(operationRef, {
      status,
      gatewayRefundId: refund?.id ? String(refund.id) : current.gatewayRefundId || null,
      gatewayStatus: String(refund?.status || outcome || 'unknown').toLowerCase(),
      reconciliationReason: reason || null,
      lastObservedAtMs: now,
      updatedAtMs: now,
    }, { merge: true });
    return { updated: true, status };
  });
}

function isTerminalServiceOperation(status) {
  return ['settled_success', 'settled_failed', 'settled_no_charge'].includes(String(status || '').toLowerCase());
}

function shouldDeferCompletionPayment(request = {}, existingOperation = null) {
  return String(request.paymentFlowVersion || '') === 'explicit_v1'
    && (!existingOperation || existingOperation.deferredPaymentSelection === true
      || existingOperation.settlementData?.deferredPaymentSelection === true);
}

function normalizeMinorAmount(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function createOperationReferences(db, operationId) {
  return {
    operationRef: db.collection(FINANCIAL_OPERATIONS_COLLECTION).doc(operationId),
  };
}

async function claimServiceFinancialOperation({
  db,
  requestRef,
  requestId,
  operationType,
  amount,
  currency = 'ZAR',
  settlementData,
  allowRetry = false,
  expectedRequestStatus = null,
  expectedHelperId = null,
  now = Date.now(),
}) {
  const operationId = serviceFinancialOperationId(requestId);
  const { operationRef } = createOperationReferences(db, operationId);
  const amountMinor = normalizeMinorAmount(amount);
  if (!requestId || !['completion', 'customer_cancellation'].includes(operationType) || amountMinor === null) {
    throw new Error('Invalid service financial operation input.');
  }

  const result = await db.runTransaction(async (transaction) => {
    const requestPaymentRef = db.collection('servicePaymentOperations').doc(String(requestId));
    const [requestSnap, operationSnap, requestPaymentSnap] = await Promise.all([
      transaction.get(requestRef),
      transaction.get(operationRef),
      transaction.get(requestPaymentRef),
    ]);
    if (!requestSnap.exists) return { action: 'missing_request', operationId };
    const request = requestSnap.data() || {};
    const existing = operationSnap.exists ? operationSnap.data() || {} : null;
    const requestPayment = requestPaymentSnap.exists ? requestPaymentSnap.data() || {} : null;
    const requestPaymentState = String(requestPayment?.status || '').toLowerCase();
    if (requestPaymentState === 'paid') {
      return { action: 'settled', operationId, operation: existing, paymentOperation: requestPayment };
    }
    if (['initializing', 'processing', 'payment_processing', 'payment_reconciliation_required', 'reconciliation_required', 'cash_selected', 'awaiting_cash_confirmation', 'awaiting_customer_confirmation'].includes(requestPaymentState)) {
      return { action: 'payment_in_progress', operationId, operation: existing, paymentOperation: requestPayment };
    }

    if (existing && String(existing.operationType || '') !== operationType) {
      return { action: 'conflict', code: 'service_already_closed', operationId, operation: existing };
    }
    if (existing && ['settled_success', 'settled_no_charge'].includes(String(existing.status || ''))) {
      return { action: 'settled', operationId, operation: existing };
    }
    if (existing?.status === 'settled_failed' && !allowRetry) {
      return { action: 'confirmed_failure', operationId, operation: existing };
    }
    if (existing && !['settled_failed'].includes(String(existing.status || ''))) {
      return { action: 'reconcile', operationId, operation: existing };
    }

    if (expectedRequestStatus !== null
      && String(request.status || '').toLowerCase() !== String(expectedRequestStatus || '').toLowerCase()) {
      return { action: 'request_changed', operationId, request };
    }
    if (expectedHelperId !== null
      && String(request.helperAssignment?.helperId || '') !== String(expectedHelperId || '')) {
      return { action: 'request_changed', operationId, request };
    }

    if (!existing && ['completed', 'canceled', 'cancelled'].includes(String(request.status || '').toLowerCase())) {
      return { action: 'legacy_terminal', operationId, request };
    }

    const attemptNo = Number(existing?.attemptCount || 0) + 1;
    const reference = paystackChargeReference(operationId, attemptNo);
    const attemptId = String(attemptNo).padStart(4, '0');
    const attemptRef = operationRef.collection('attempts').doc(attemptId);
    const claimToken = randomUUID();
    const nextOperation = {
      ...(existing || {}),
      operationId,
      requestId,
      operationType,
      status: 'processing',
      amount: Number(amount),
      amountMinor,
      currency: String(currency || 'ZAR').toUpperCase(),
      gateway: 'paystack',
      gatewayReference: reference,
      attemptCount: attemptNo,
      activeAttemptNo: attemptNo,
      claimToken,
      claimStartedAtMs: now,
      leaseExpiresAtMs: now + 60_000,
      settlementData: existing?.settlementData || settlementData || {},
      debtApplied: Boolean(existing?.debtApplied),
      debtReversed: Boolean(existing?.debtReversed),
      createdAtMs: Number(existing?.createdAtMs || now),
      updatedAtMs: now,
    };

    transaction.set(operationRef, nextOperation, { merge: true });
    transaction.create(attemptRef, {
      attemptNo,
      reference,
      amount: Number(amount),
      amountMinor,
      currency: nextOperation.currency,
      status: 'claimed',
      createdAtMs: now,
      updatedAtMs: now,
      claimToken,
    });
    return { action: 'charge', operationId, operation: nextOperation, attemptRefPath: attemptRef.path };
  });

  return { ...result, operationRef };
}

function classifyPaystackTransaction(payload, expected = {}) {
  const transaction = payload?.data || null;
  if (!payload?.status || !transaction) return { outcome: 'unknown', reason: 'verification_unavailable' };
  if (String(transaction.reference || '') !== String(expected.reference || '')) {
    return { outcome: 'unknown', reason: 'reference_mismatch' };
  }
  const expectedAmountMinor = Number(expected.amountMinor);
  if (Number.isFinite(expectedAmountMinor) && Number(transaction.amount) !== expectedAmountMinor) {
    return { outcome: 'unknown', reason: 'amount_mismatch' };
  }
  if (String(transaction.currency || '').toUpperCase() !== String(expected.currency || 'ZAR').toUpperCase()) {
    return { outcome: 'unknown', reason: 'currency_mismatch' };
  }
  const status = String(transaction.status || '').toLowerCase();
  if (status === 'success') return { outcome: 'success', transaction };
  if (['failed', 'abandoned'].includes(status)) return { outcome: 'failed_confirmed', transaction };
  if (status === 'reversed') return { outcome: 'reversed', transaction };
  if (['pending', 'ongoing', 'processing', 'queued'].includes(status)) return { outcome: 'pending', transaction };
  return { outcome: 'unknown', reason: `unrecognized_status:${status || 'missing'}`, transaction };
}

function classifyPaystackTransfer(payload, expected = {}) {
  const transfer = payload?.data || null;
  if (!payload?.status || !transfer) return { outcome: 'unknown', reason: 'verification_unavailable' };
  if (String(transfer.reference || '') !== String(expected.reference || '')) {
    return { outcome: 'unknown', reason: 'reference_mismatch' };
  }
  const expectedAmountMinor = Number(expected.amountMinor);
  if (Number.isFinite(expectedAmountMinor) && Number(transfer.amount) !== expectedAmountMinor) {
    return { outcome: 'unknown', reason: 'amount_mismatch' };
  }
  if (String(transfer.currency || '').toUpperCase() !== String(expected.currency || 'ZAR').toUpperCase()) {
    return { outcome: 'unknown', reason: 'currency_mismatch' };
  }
  const status = String(transfer.status || '').toLowerCase();
  if (status === 'success') return { outcome: 'success', transfer };
  if (status === 'failed') return { outcome: 'failed_confirmed', transfer };
  if (status === 'reversed') return { outcome: 'reversed', transfer };
  if (['pending', 'otp', 'received'].includes(status)) return { outcome: 'pending', transfer };
  if (['abandoned', 'blocked', 'rejected'].includes(status)) return { outcome: 'failed_confirmed', transfer };
  return { outcome: 'unknown', reason: `unrecognized_status:${status || 'missing'}`, transfer };
}

async function executeServiceChargeAttempt({ operation, action, email, authorizationCode, paystack }) {
  const amountMinor = Number(operation?.amountMinor || 0);
  if (amountMinor === 0) return { outcome: 'no_charge' };
  let requestErrorCode = null;
  if (action === 'charge') {
    if (!authorizationCode) return { outcome: 'failed_confirmed', reason: 'missing_authorization' };
    try {
      await paystack.chargeAuthorization({
        email,
        amount: Number(operation.amount || 0),
        authorizationCode,
        reference: String(operation.gatewayReference || ''),
        requestId: String(operation.requestId || ''),
        operationId: String(operation.operationId || ''),
      });
    } catch (error) {
      // The request may have reached Paystack even if the caller timed out.
      // Verification below is the only source used to decide the outcome.
      requestErrorCode = String(error?.code || 'charge_request_failed').slice(0, 120);
    }
  }
  if (action !== 'charge' && action !== 'reconcile') throw new Error('Invalid service financial operation action.');
  const verification = await paystack.verifyTransaction({
    reference: String(operation.gatewayReference || ''),
    amountMinor,
    currency: String(operation.currency || 'ZAR'),
  });
  return { ...verification, requestErrorCode };
}

async function executePayoutTransferAttempt({ claim, amount, recipientCode, reason, paystack }) {
  if (!claim || !['transfer', 'reconcile'].includes(claim.action)) throw new Error('Invalid payout transfer claim.');
  let transfer = null;
  let transferRequestErrorCode = null;
  if (claim.action === 'transfer') {
    try {
      transfer = await paystack.initiateTransfer({
        amount,
        recipientCode,
        reason,
        reference: String(claim.attempt?.reference || ''),
      });
    } catch (error) {
      // Confirm the same reference before any future attempt is considered.
      transferRequestErrorCode = String(error?.code || 'transfer_request_failed').slice(0, 120);
    }
  }
  const reference = String(claim.reference || claim.attempt?.reference || '');
  return {
    transfer,
    transferRequestErrorCode,
    verification: await paystack.verifyTransfer({
      reference,
      amountMinor: Math.round(Number(amount || 0) * 100),
      currency: String(claim.attempt?.currency || claim.payout?.transferCurrency || 'ZAR'),
    }),
  };
}

async function recordServiceGatewayObservation({ db, operationRef, outcome, now = Date.now() }) {
  return db.runTransaction(async (transaction) => {
    const operationSnap = await transaction.get(operationRef);
    if (!operationSnap.exists) return { updated: false, reason: 'operation-not-found' };
    const operation = operationSnap.data() || {};
    if (isTerminalServiceOperation(operation.status) && outcome.outcome !== 'reversed') {
      return { updated: false, reason: 'already-settled', operation };
    }

    const attemptNo = Number(operation.activeAttemptNo || operation.attemptCount || 0);
    const attemptRef = operationRef.collection('attempts').doc(String(attemptNo).padStart(4, '0'));
    const attemptSnap = await transaction.get(attemptRef);
    const status = outcome.outcome === 'success'
      ? 'gateway_succeeded'
      : outcome.outcome === 'failed_confirmed'
        ? 'gateway_failed_confirmed'
        : outcome.outcome === 'reversed'
          ? 'gateway_reversed'
          : 'reconciliation_required';
    const providerRecord = outcome.transaction || null;
    transaction.set(operationRef, {
      status,
      gatewayTransactionId: providerRecord?.id ? String(providerRecord.id) : operation.gatewayTransactionId || null,
      gatewayStatus: String(providerRecord?.status || outcome.outcome || 'unknown'),
      reconciliationReason: outcome.reason || null,
      lastVerifiedAtMs: now,
      updatedAtMs: now,
    }, { merge: true });
    if (attemptSnap.exists) {
      transaction.set(attemptRef, {
        status,
        gatewayTransactionId: providerRecord?.id ? String(providerRecord.id) : null,
        gatewayStatus: String(providerRecord?.status || outcome.outcome || 'unknown'),
        reconciliationReason: outcome.reason || null,
        updatedAtMs: now,
      }, { merge: true });
    }
    return { updated: true, status, operation };
  });
}

async function settleServiceFinancialOperation({
  db,
  admin,
  operationRef,
  requestRef,
  helperRef = null,
  helperDispatchRef = null,
  outcome,
  transactionId = null,
  now = Date.now(),
}) {
  return db.runTransaction(async (transaction) => {
    const [operationSnap, requestSnap] = await Promise.all([
      transaction.get(operationRef),
      transaction.get(requestRef),
    ]);
    if (!operationSnap.exists || !requestSnap.exists) return { applied: false, reason: 'record-not-found' };
    const operation = operationSnap.data() || {};
    const request = requestSnap.data() || {};
    if (!['success', 'failed_confirmed', 'reversed', 'pending', 'unknown', 'no_charge'].includes(outcome)) {
      throw new Error('Invalid service operation settlement outcome.');
    }
    if (operation.settlementApplied && operation.finalOutcome === outcome) {
      return { applied: false, duplicate: true, operation, request };
    }
    if (['success', 'failed_confirmed', 'reversed', 'no_charge'].includes(String(operation.finalOutcome || ''))
      && ['pending', 'unknown'].includes(outcome)) {
      return { applied: false, duplicate: true, reason: 'terminal-outcome-not-downgraded', operation, request };
    }
    if (operation.finalOutcome === 'success' && outcome === 'failed_confirmed') {
      return { applied: false, duplicate: true, reason: 'success-not-downgraded-to-failure', operation, request };
    }
    if (operation.finalOutcome === 'reversed' && outcome !== 'reversed') {
      return { applied: false, duplicate: true, reason: 'reversal-is-terminal', operation, request };
    }
    if (operation.finalOutcome === 'no_charge' && outcome !== 'no_charge') {
      return { applied: false, duplicate: true, reason: 'no-charge-outcome-is-terminal', operation, request };
    }

    const settlementData = operation.settlementData || {};
    const operationType = String(operation.operationType || '');
    const intendedTerminalStatus = operationType === 'completion' ? 'completed' : 'canceled';
    const requestStatus = String(request.status || '').toLowerCase();
    if (['completed', 'canceled', 'cancelled'].includes(requestStatus) && requestStatus !== intendedTerminalStatus) {
      transaction.set(operationRef, {
        status: 'manual_reconciliation_required',
        reconciliationReason: 'request_closed_by_conflicting_operation',
        updatedAtMs: now,
      }, { merge: true });
      return { applied: false, reason: 'request-closed-by-conflicting-operation', operation, request };
    }

    const operationAmount = Number(operation.amount || 0);
    let paymentStatus = 'payment_reconciliation_required';
    if (outcome === 'success') paymentStatus = 'paid';
    else if (outcome === 'failed_confirmed' || outcome === 'reversed') paymentStatus = 'wallet_debt_recorded';
    else if (outcome === 'no_charge') {
      paymentStatus = Object.prototype.hasOwnProperty.call(settlementData, 'noChargePaymentStatus')
        ? settlementData.noChargePaymentStatus
        : 'not_applicable';
    }

    const customerId = String(settlementData.customerId || request.customerId || '').trim();
    const customerRef = customerId ? db.collection('users').doc(customerId) : null;
    let walletDebtOutstanding = Boolean(operation.walletDebtOutstanding ?? (operation.debtApplied && !operation.debtReversed));
    const shouldApplyWalletDebt = paymentStatus === 'wallet_debt_recorded' && !walletDebtOutstanding;
    const shouldReverseWalletDebt = paymentStatus === 'paid' && walletDebtOutstanding;
    const needWalletRead = customerRef && operationAmount > 0 && (shouldApplyWalletDebt || shouldReverseWalletDebt);
    const customerSnap = needWalletRead ? await transaction.get(customerRef) : null;

    if (customerRef && operationAmount > 0 && (shouldApplyWalletDebt || shouldReverseWalletDebt)) {
      const customer = customerSnap?.data() || {};
      const wallet = customer.wallet || { balance: 0, currency: operation.currency || 'ZAR' };
      const currentBalance = Number(wallet.balance || 0);
      const delta = shouldApplyWalletDebt ? -operationAmount : operationAmount;
      const nextBalance = Number((currentBalance + delta).toFixed(2));
      const ledgerType = delta < 0 ? 'service_charge_debt' : 'service_charge_debt_reversal';
      const transitionNo = Number(operation.settlementTransitionCount || 0) + 1;
      const ledgerRef = db.collection(FINANCIAL_LEDGER_COLLECTION).doc(`${operation.operationId}_${transitionNo}_${ledgerType}`);
      transaction.create(ledgerRef, {
        entryId: ledgerRef.id,
        operationId: operation.operationId,
        requestId: operation.requestId,
        userId: customerId,
        entryType: ledgerType,
        amount: Math.abs(delta),
        currency: operation.currency || 'ZAR',
        balanceBefore: currentBalance,
        balanceAfter: nextBalance,
        gatewayReference: operation.gatewayReference || null,
        createdAtMs: now,
      });
      transaction.set(customerRef, {
        wallet: {
          ...wallet,
          balance: nextBalance,
          currency: wallet.currency || operation.currency || 'ZAR',
          updatedAt: new Date(now).toISOString(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      walletDebtOutstanding = delta < 0;
    }

    const requestPatch = settlementData.requestPatch || {};
    transaction.set(requestRef, {
      ...requestPatch,
      paymentStatus,
      paymentTransactionId: transactionId || operation.gatewayTransactionId || request.paymentTransactionId || null,
      financialOperationId: operation.operationId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    if (helperRef && operationType === 'completion') {
      transaction.set(helperRef, {
        activeServiceRequestId: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    if (helperDispatchRef && operationType === 'completion') {
      transaction.set(helperDispatchRef, {
        activeServiceRequestId: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    const finalStatus = outcome === 'success'
      ? 'settled_success'
      : outcome === 'failed_confirmed' || outcome === 'reversed'
        ? 'settled_failed'
        : outcome === 'no_charge'
          ? 'settled_no_charge'
          : 'reconciliation_required';
    transaction.set(operationRef, {
      status: finalStatus,
      previousFinalOutcome: operation.finalOutcome || null,
      finalOutcome: outcome,
      paymentStatus,
      paymentSettled: ['success', 'no_charge'].includes(outcome) && (outcome !== 'no_charge' || paymentStatus === 'paid'),
      outcomeDetermined: ['success', 'failed_confirmed', 'reversed', 'no_charge'].includes(outcome),
      settlementApplied: true,
      walletDebtOutstanding,
      debtApplied: Boolean(operation.debtApplied) || paymentStatus === 'wallet_debt_recorded',
      debtReversed: Boolean(operation.debtReversed) || (paymentStatus === 'paid' && Boolean(operation.walletDebtOutstanding)),
      settlementTransitionCount: Number(operation.settlementTransitionCount || 0) + 1,
      gatewayTransactionId: transactionId || operation.gatewayTransactionId || null,
      settledAtMs: ['success', 'failed_confirmed', 'reversed', 'no_charge'].includes(outcome) ? now : null,
      updatedAtMs: now,
    }, { merge: true });
    return {
      applied: true,
      operationId: operation.operationId,
      operationType,
      outcome,
      paymentStatus,
      paymentSettled: ['success', 'no_charge'].includes(outcome) && (outcome !== 'no_charge' || paymentStatus === 'paid'),
      settlementData,
      request: { ...request, ...requestPatch, paymentStatus, paymentTransactionId: transactionId || operation.gatewayTransactionId || request.paymentTransactionId || null },
    };
  });
}

async function claimPayoutTransfer({
  db,
  admin,
  payoutRef,
  payoutId,
  helperId,
  weekKey,
  runKey,
  amount,
  currency = 'ZAR',
  recipientCode,
  now = Date.now(),
}) {
  const requestedAmountMinor = normalizeMinorAmount(amount);
  if (!payoutId || !helperId || !weekKey || requestedAmountMinor === null) throw new Error('Invalid helper payout operation input.');
  return db.runTransaction(async (transaction) => {
    const payoutSnap = await transaction.get(payoutRef);
    if (!payoutSnap.exists) return { action: 'missing_payout' };
    const payout = payoutSnap.data() || {};
    const existingStatus = String(payout.status || 'unpaid').toLowerCase();
    const operationStatus = String(payout.operationStatus || '').toLowerCase();
    const reference = String(payout.transferReference || '').trim();
    const transferStatus = String(payout.transferStatus || '').toLowerCase();
    const isWalletPayout = payout.walletAccountingVersion === 1;
    const operationId = helperPayoutOperationId(isWalletPayout ? `wallet:${weekKey}` : weekKey, helperId);

    if (existingStatus === 'paid' && (!reference || ['success', 'completed'].includes(transferStatus))) {
      return { action: 'paid', operationId, payout };
    }
    if (isWalletPayout && existingStatus === 'wallet_recovery') return { action: 'wallet_recovered', operationId, payout };
    if (reference && (['processing', 'pending_reconciliation', 'reconciliation_required', 'paid'].includes(existingStatus)
      || ['processing', 'pending_reconciliation', 'reconciliation_required', 'gateway_succeeded'].includes(operationStatus)
      || String(payout.transferStatus || '').toLowerCase() === 'pending')) {
      return { action: 'reconcile', operationId, payout, reference };
    }
    if (reference && !['failed_confirmed', 'reversed'].includes(operationStatus)) {
      // Legacy attempts with a reference are verified before any new transfer.
      return { action: 'reconcile', operationId, payout, reference };
    }
    if (String(payout.lastProcessRunKey || '') === String(runKey || '')) {
      return { action: 'already_attempted_this_run', operationId, payout };
    }
    if (!recipientCode) return { action: 'missing_recipient', operationId, payout };

    let amountMinor = requestedAmountMinor;
    let walletReservedMinor = 0;
    if (isWalletPayout) {
      const walletRef = helperWalletReference(db, helperId);
      const walletSnapshot = await transaction.get(walletRef);
      const wallet = walletFromSnapshot(walletSnapshot, helperId, now);
      if (wallet.reconciliationBlocked || !walletBalanceIsValid(wallet)) return { action: 'reconciliation_blocked', operationId, payout, wallet };
      const reserveLedgerRef = walletLedgerReference(walletRef, walletLedgerId(`payout-reserve:${payoutId}`, 'payout_reserve'));
      const obligationsSnapshot = await transaction.get(walletRef.collection('commissionObligations')
        .where('status', '==', 'outstanding').orderBy('createdAtMs', 'asc').limit(100));
      const obligations = obligationsSnapshot.docs || [];
      const recoveryPageKey = obligations.length
        ? `${obligations[0].id}:${obligations[obligations.length - 1].id}:${obligations.length}`
        : 'empty';
      const recoveryLedgerRef = walletLedgerReference(walletRef, walletLedgerId(`payout-commission-recovery:${payoutId}:${recoveryPageKey}`, 'commission_recovery'));
      const [reserveLedgerSnapshot, recoveryLedgerSnapshot] = await Promise.all([
        transaction.get(reserveLedgerRef), transaction.get(recoveryLedgerRef),
      ]);
      if (reserveLedgerSnapshot.exists) return { action: 'reconciliation_required', operationId, payout, wallet };

      let availableMinor = Math.max(0, Number(wallet.availableMinor || 0));
      let outstandingCommissionMinor = Math.max(0, Number(wallet.outstandingCommissionMinor || 0));
      let recoveredMinor = 0;
      const obligationUpdates = [];
      if (!recoveryLedgerSnapshot.exists) {
        for (const obligationDoc of obligationsSnapshot.docs || []) {
          if (availableMinor <= 0) break;
          const obligation = obligationDoc.data() || {};
          const due = Math.max(0, Number(obligation.outstandingMinor || 0));
          const recovered = Math.min(availableMinor, due);
          if (!recovered) continue;
          availableMinor -= recovered;
          outstandingCommissionMinor = Math.max(0, outstandingCommissionMinor - recovered);
          recoveredMinor += recovered;
          obligationUpdates.push({ ref: obligationDoc.ref, value: {
            recoveredMinor: Number(obligation.recoveredMinor || 0) + recovered,
            outstandingMinor: due - recovered,
            status: due === recovered ? 'recovered' : 'outstanding',
            updatedAtMs: now,
            lastRecoveryOperationId: `payout:${payoutId}`,
          } });
        }
      }
      if (availableMinor <= 0) {
        if (recoveredMinor > 0) {
          transaction.set(walletRef, { ...wallet, availableMinor, outstandingCommissionMinor, updatedAtMs: now }, { merge: true });
          obligationUpdates.forEach(({ ref: obligationRef, value }) => transaction.set(obligationRef, value, { merge: true }));
          writeWalletLedger(transaction, recoveryLedgerRef, {
            operationId: `payout:${payoutId}`, helperId, entryType: 'commission_recovery', amountMinor: recoveredMinor,
            availableDeltaMinor: -recoveredMinor, outstandingCommissionDeltaMinor: -recoveredMinor,
            availableBeforeMinor: Number(wallet.availableMinor || 0), availableAfterMinor: availableMinor,
            description: 'Outstanding cash commission recovered before weekly payout.', createdAtMs: now,
          });
        }
        return { action: 'no_wallet_balance', operationId, payout, wallet };
      }

      // Process bounded obligation pages across successive payout runs. Never pay out
      // the remainder while an unprocessed commission page may still be outstanding.
      if (obligations.length >= 100) {
        if (recoveredMinor > 0) {
          transaction.set(walletRef, { ...wallet, availableMinor, outstandingCommissionMinor, updatedAtMs: now }, { merge: true });
          obligationUpdates.forEach(({ ref: obligationRef, value }) => transaction.set(obligationRef, value, { merge: true }));
          if (!recoveryLedgerSnapshot.exists) {
            writeWalletLedger(transaction, recoveryLedgerRef, {
              operationId: `payout:${payoutId}`, helperId, entryType: 'commission_recovery', amountMinor: recoveredMinor,
              availableDeltaMinor: -recoveredMinor, outstandingCommissionDeltaMinor: -recoveredMinor,
              availableBeforeMinor: Number(wallet.availableMinor || 0), availableAfterMinor: availableMinor,
              description: 'Outstanding cash commission recovered before weekly payout.', createdAtMs: now,
            });
          }
        }
        return { action: 'commission_recovery_pending', operationId, payout, wallet };
      }

      amountMinor = availableMinor;
      walletReservedMinor = amountMinor;
      transaction.set(walletRef, {
        ...wallet,
        availableMinor: 0,
        reservedMinor: Math.max(0, Number(wallet.reservedMinor || 0)) + amountMinor,
        outstandingCommissionMinor,
        updatedAtMs: now,
      }, { merge: true });
      obligationUpdates.forEach(({ ref: obligationRef, value }) => transaction.set(obligationRef, value, { merge: true }));
      if (recoveredMinor > 0 && !recoveryLedgerSnapshot.exists) {
        writeWalletLedger(transaction, recoveryLedgerRef, {
          operationId: `payout:${payoutId}`, helperId, entryType: 'commission_recovery', amountMinor: recoveredMinor,
          availableDeltaMinor: -recoveredMinor, outstandingCommissionDeltaMinor: -recoveredMinor,
          availableBeforeMinor: Number(wallet.availableMinor || 0), availableAfterMinor: availableMinor,
          description: 'Outstanding cash commission recovered before weekly payout.', createdAtMs: now,
        });
      }
      writeWalletLedger(transaction, reserveLedgerRef, {
        operationId: `payout:${payoutId}`, payoutId, helperId, entryType: 'payout_reservation', amountMinor,
        availableDeltaMinor: -amountMinor, reservedDeltaMinor: amountMinor,
        availableBeforeMinor: availableMinor, availableAfterMinor: 0,
        description: 'Wallet funds reserved for weekly Paystack payout.', createdAtMs: now,
      });
    }

    const attemptNo = Number(payout.transferAttempts || 0) + 1;
    const transferReference = paystackTransferReference(operationId, attemptNo);
    const transferAttemptRef = payoutRef.collection('transferAttempts').doc(String(attemptNo).padStart(4, '0'));
    const referenceRef = db.collection(PAYSTACK_TRANSFER_REFERENCES_COLLECTION).doc(transferReference);
    const claimToken = randomUUID();
    const attempt = {
      attemptNo,
      operationId,
      payoutId,
      helperId,
      weekKey,
      reference: transferReference,
      amount: amountMinor / 100,
      amountMinor,
      currency: String(currency || 'ZAR').toUpperCase(),
      recipientCode,
      status: 'claimed',
      ...(isWalletPayout ? { walletAccountingVersion: 1, walletFundsReserved: true, walletReservedMinor } : {}),
      claimToken,
      createdAtMs: now,
      updatedAtMs: now,
    };
    transaction.set(transferAttemptRef, attempt, { merge: true });
    transaction.set(referenceRef, {
      reference: transferReference,
      payoutId,
      helperId,
      weekKey,
      attemptNo,
      operationId,
      createdAtMs: now,
    }, { merge: true });
    transaction.set(payoutRef, {
      operationId,
      operationStatus: 'processing',
      status: 'processing',
      ...(isWalletPayout ? { walletAccountingVersion: 1, walletReservedMinor, walletReservedAtMs: now, helperAmount: amountMinor / 100 } : {}),
      transferReference,
      transferAttempts: attemptNo,
      lastProcessRunKey: String(runKey || ''),
      lastTransferAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
      transferCurrency: attempt.currency,
      transferAmountMinor: amountMinor,
      claimToken,
      leaseExpiresAtMs: now + 60_000,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { action: 'transfer', operationId, payoutId, attempt, transferAttemptRef, referenceRef };
  });
}

async function recordPayoutObservation({
  db,
  admin,
  payoutRef,
  transferAttemptRef,
  referenceRef = null,
  reference,
  outcome,
  transfer = null,
  now = Date.now(),
}) {
  return db.runTransaction(async (transaction) => {
    const [payoutSnap, attemptSnap] = await Promise.all([
      transaction.get(payoutRef),
      transaction.get(transferAttemptRef),
    ]);
    if (!payoutSnap.exists || !attemptSnap.exists) return { updated: false, reason: 'payout-attempt-not-found' };
    const payout = payoutSnap.data() || {};
    const attempt = attemptSnap.data() || {};
    if (String(attempt.reference || '') !== String(reference || '')) return { updated: false, reason: 'reference-mismatch' };
    if (attempt.status === 'settled_success' && outcome !== 'reversed') {
      return { updated: false, duplicate: true, reason: 'successful-transfer-not-downgraded', payout, attempt };
    }
    if (attempt.status === 'reversed' && outcome !== 'reversed') {
      return { updated: false, duplicate: true, reason: 'reversed-transfer-is-terminal', payout, attempt };
    }
    if (attempt.status === 'failed_confirmed' && ['pending', 'unknown'].includes(outcome)) {
      return { updated: false, duplicate: true, reason: 'failed-transfer-not-downgraded', payout, attempt };
    }
    const transferStatus = String(transfer?.status || outcome || 'unknown').toLowerCase();
    const operationStatus = outcome === 'success'
      ? 'settled_success'
      : outcome === 'failed_confirmed'
        ? 'failed_confirmed'
        : outcome === 'reversed'
          ? 'reversed'
          : 'reconciliation_required';
    const payoutStatus = outcome === 'success'
      ? 'paid'
      : outcome === 'pending' || outcome === 'unknown'
        ? 'processing'
        : 'unsuccessful';
    const isCurrentAttempt = String(payout.transferReference || '') === String(reference || '');
    const walletAccounting = payout.walletAccountingVersion === 1 || attempt.walletAccountingVersion === 1;
    let walletRef = null;
    let walletPatch = null;
    let walletLedger = null;
    let walletBlocked = false;
    if (walletAccounting && isCurrentAttempt && !['pending', 'unknown'].includes(outcome)) {
      const helperId = String(payout.helperId || attempt.helperId || '');
      walletRef = helperWalletReference(db, helperId);
      const amountMinor = Math.max(0, Number(attempt.amountMinor || payout.transferAmountMinor || 0));
      const wasReserved = attempt.walletFundsReserved === true;
      const wasReleased = Number(attempt.walletFundsReleasedAtMs || 0) > 0;
      const wasDebited = Number(attempt.walletFundsDebitedAtMs || 0) > 0;
      const action = outcome === 'success'
        ? (wasReleased ? 'late_success' : 'debit')
        : outcome === 'reversed' && wasDebited ? 'reversal_credit'
          : wasReserved ? 'reservation_release' : 'none';
      if (action !== 'none') {
        const ledgerRef = walletLedgerReference(walletRef, walletLedgerId(`${payout.id}:${attempt.attemptNo}:${action}`, `payout_${action}`));
        const [walletSnapshot, ledgerSnapshot] = await Promise.all([transaction.get(walletRef), transaction.get(ledgerRef)]);
        const wallet = walletFromSnapshot(walletSnapshot, helperId, now);
        if (!ledgerSnapshot.exists) {
          if (!walletBalanceIsValid(wallet)) {
            walletBlocked = true;
            walletPatch = { ...wallet, reconciliationBlocked: true, reconciliationReason: 'invalid_wallet_balance', reconciliationPayoutId: payout.id, updatedAtMs: now };
          } else {
          const availableBeforeMinor = Math.max(0, Number(wallet.availableMinor || 0));
          const reservedBeforeMinor = Math.max(0, Number(wallet.reservedMinor || 0));
          let availableMinor = availableBeforeMinor;
          let reservedMinor = reservedBeforeMinor;
          let availableDeltaMinor = 0;
          let reservedDeltaMinor = 0;
          let description = '';
          if (action === 'debit' && wasReserved) {
            if (reservedMinor < amountMinor) walletBlocked = true;
            else { reservedMinor -= amountMinor; reservedDeltaMinor = -amountMinor; }
            description = 'Reserved wallet funds paid out successfully.';
          } else if (action === 'debit') {
            walletBlocked = true;
            description = 'Paystack reports success without a matching wallet reservation.';
          } else if (action === 'late_success') {
            if (availableMinor < amountMinor) walletBlocked = true;
            else { availableMinor -= amountMinor; availableDeltaMinor = -amountMinor; }
            description = 'Late Paystack success reconciled against recovered wallet funds.';
          } else if (action === 'reservation_release') {
            if (reservedMinor < amountMinor) walletBlocked = true;
            else { reservedMinor -= amountMinor; availableMinor += amountMinor; reservedDeltaMinor = -amountMinor; availableDeltaMinor = amountMinor; }
            description = 'Confirmed failed payout released back to available wallet balance.';
          } else if (action === 'reversal_credit') {
            availableMinor += amountMinor;
            availableDeltaMinor = amountMinor;
            description = 'Reversed Paystack payout returned to available wallet balance.';
          }
          walletPatch = {
            ...wallet,
            availableMinor,
            reservedMinor,
            ...(walletBlocked ? { reconciliationBlocked: true, reconciliationReason: 'payout_balance_conflict', reconciliationPayoutId: payout.id } : {}),
            updatedAtMs: now,
          };
          if (!walletBlocked || action === 'late_success') {
            walletLedger = { reference: ledgerRef, entry: {
              operationId: payout.operationId || attempt.operationId,
              payoutId: payout.id,
              helperId,
              entryType: action === 'debit' ? 'payout_debit' : action === 'late_success' ? 'late_payout_debit' : action === 'reservation_release' ? 'payout_reservation_release' : 'payout_reversal_credit',
              amountMinor,
              availableDeltaMinor,
              reservedDeltaMinor,
              availableBeforeMinor,
              availableAfterMinor: availableMinor,
              description: walletBlocked ? 'Payout outcome conflicts with wallet funds; manual reconciliation is required.' : description,
              createdAtMs: now,
            } };
          }
          }
        }
      }
    }
    const attemptPatch = {
      status: operationStatus,
      transferStatus,
      transferId: transfer?.id ? String(transfer.id) : null,
      transferCode: transfer?.transfer_code || null,
      failures: transfer?.failures || null,
      lastVerifiedAtMs: now,
      updatedAtMs: now,
      ...(walletAccounting && outcome === 'success' ? {
        walletFundsReserved: false,
        ...(walletBlocked ? { walletConflictAtMs: now } : { walletFundsDebitedAtMs: now }),
      } : {}),
      ...(walletAccounting && ['failed_confirmed', 'reversed'].includes(outcome) && attempt.walletFundsReserved === true && !walletBlocked ? { walletFundsReserved: false, walletFundsReleasedAtMs: now } : {}),
    };
    if (!isCurrentAttempt) {
      transaction.set(transferAttemptRef, attemptPatch, { merge: true });
      if (referenceRef) transaction.set(referenceRef, { latestStatus: transferStatus, latestOutcome: outcome, lastVerifiedAtMs: now }, { merge: true });
      return { updated: true, staleAttempt: true, outcome, payout, attempt };
    }
    const patch = {
      operationStatus,
      transferStatus,
      reconciliationReason: outcome === 'unknown' ? 'verification_uncertain' : null,
      transferId: transfer?.id ? String(transfer.id) : payout.transferId || null,
      transferCode: transfer?.transfer_code || payout.transferCode || null,
      transferFailure: transfer?.failures || null,
      lastVerifiedAtMs: now,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(isCurrentAttempt ? { status: payoutStatus } : {}),
      ...(walletAccounting && ['failed_confirmed', 'reversed'].includes(outcome) ? { status: 'wallet_recovery', walletRecoveredAtMs: now } : {}),
      ...(walletAccounting && walletBlocked ? {
        status: outcome === 'success' ? 'paid' : 'reconciliation_required',
        operationStatus: 'manual_reconciliation_required',
        reconciliationReason: outcome === 'success' ? 'late_transfer_success_wallet_funds_unavailable' : 'wallet_reservation_balance_conflict',
        externalPaymentConfirmed: outcome === 'success',
      } : {}),
      ...(walletAccounting && outcome === 'success' && !walletBlocked ? { walletPaidAtMs: now } : {}),
    };
    if (outcome === 'success' && isCurrentAttempt) {
      patch.paidAt = admin.firestore.FieldValue.serverTimestamp();
      patch.paidBy = { system: 'automatic', provider: 'paystack' };
      patch.failureReason = null;
    } else if ((outcome === 'failed_confirmed' || outcome === 'reversed') && isCurrentAttempt) {
      patch.failureReason = outcome === 'reversed' ? 'Paystack transfer was reversed.' : 'Paystack confirmed the transfer failed.';
    }
    if (walletPatch && walletRef) transaction.set(walletRef, walletPatch, { merge: true });
    if (walletLedger) writeWalletLedger(transaction, walletLedger.reference, walletLedger.entry);
    transaction.set(payoutRef, patch, { merge: true });
    transaction.set(transferAttemptRef, attemptPatch, { merge: true });
    if (referenceRef) {
      transaction.set(referenceRef, {
        latestStatus: transferStatus,
        latestOutcome: outcome,
        lastVerifiedAtMs: now,
      }, { merge: true });
    }
    return { updated: true, outcome, payout: { ...payout, ...patch }, attempt };
  });
}

async function claimServiceWebhookEvent({ db, eventId, eventName, reference, now = Date.now() }) {
  const eventRef = db.collection('paystackWebhookEvents').doc(eventId);
  return db.runTransaction(async (transaction) => {
    const eventSnap = await transaction.get(eventRef);
    if (eventSnap.exists) return { created: false, eventRef };
    transaction.create(eventRef, {
      eventId,
      eventName,
      reference,
      status: 'received',
      receivedAtMs: now,
    });
    return { created: true, eventRef };
  });
}

module.exports = {
  FINANCIAL_LEDGER_COLLECTION,
  FINANCIAL_OPERATIONS_COLLECTION,
  PAYSTACK_TRANSFER_REFERENCES_COLLECTION,
  claimPayoutTransfer,
  claimServiceFinancialOperation,
  claimServiceWebhookEvent,
  classifyPaystackTransaction,
  classifyPaystackTransfer,
  executePayoutTransferAttempt,
  executeServiceChargeAttempt,
  helperPayoutOperationId,
  isTerminalServiceOperation,
  normalizeMinorAmount,
  claimPaystackRefund,
  paystackRefundOperationId,
  paystackChargeReference,
  paystackTransferReference,
  recordPayoutObservation,
  recordPaystackRefundObservation,
  recordServiceGatewayObservation,
  serviceFinancialOperationId,
  shouldDeferCompletionPayment,
  settleServiceFinancialOperation,
};
