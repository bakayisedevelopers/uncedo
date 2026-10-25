'use strict';

const { createHash, randomBytes } = require('node:crypto');

const PAYMENT_OPERATIONS = 'servicePaymentOperations';
const PAYMENT_SESSIONS = 'servicePaymentSessions';
const PAYMENT_LEDGER = 'financialLedger';
const FINANCIAL_OPERATIONS = 'financialOperations';

function digest(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function createPaymentToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: digest(token) };
}

function normalizeMinorAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function getFinalPayableAmount(request = {}, legacyOperation = null) {
  const requestStatus = String(request.status || '').trim().toLowerCase();
  if (requestStatus !== 'completed') return null;
  const legacyType = String(legacyOperation?.operationType || '');
  const legacyAmount = Number(legacyOperation?.amountMinor);
  const amount = legacyType === 'completion' && Number.isFinite(legacyAmount)
    ? legacyAmount / 100
    : Number(request.pricingSnapshot?.cashChargeAmount
      ?? request.totalAmount
      ?? request.pricingSnapshot?.finalAmount
      ?? request.pricingSnapshot?.totalAmount
      ?? NaN);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

function paymentStateForRequest(request = {}, paymentOperation = null, legacyOperation = null) {
  if (String(request.paymentStatus || '').toLowerCase() === 'paid'
    || String(paymentOperation?.status || '').toLowerCase() === 'paid'
    || String(legacyOperation?.status || '').toLowerCase() === 'settled_success') return 'paid';
  if (['processing', 'gateway_succeeded', 'gateway_failed_confirmed', 'gateway_reversed', 'reconciliation_required', 'manual_reconciliation_required'].includes(String(legacyOperation?.status || '').toLowerCase())) return 'payment_processing';
  if (['initializing', 'processing', 'payment_processing', 'payment_reconciliation_required', 'reconciliation_required', 'cash_selected', 'awaiting_cash_confirmation', 'awaiting_customer_confirmation'].includes(String(paymentOperation?.status || '').toLowerCase())) {
    return String(paymentOperation.status).toLowerCase();
  }
  const status = String(request.paymentStatus || '').toLowerCase();
  if (['wallet_debt_recorded', 'payment_failed', 'payment_cancelled', 'payment_expired'].includes(status)) return status;
  return 'unpaid';
}

function safePaymentReceipt({ requestId, operation, request }) {
  if (paymentStateForRequest(request, operation) !== 'paid') return null;
  const settlement = operation?.settlement || {};
  return {
    receiptId: String(settlement.receiptId || operation?.receiptId || ''),
    requestReference: String(request?.publicRequestReference || request?.requestReference || requestId || ''),
    requestId: String(requestId || ''),
    service: String(request?.subject || request?.serviceName || 'Uncedo service'),
    amount: Number(settlement.amount ?? operation?.amount ?? request?.totalAmount ?? 0),
    currency: 'ZAR',
    method: String(settlement.method || operation?.method || request?.paymentMethod || ''),
    paidAtMs: Number(settlement.paidAtMs || operation?.settledAtMs || 0),
    gatewayReference: String(settlement.gatewayReference || ''),
    status: 'paid',
  };
}

async function createServicePaymentSession({ db, requestId, customerId, principalId, principalType = 'customer', now = Date.now(), expiresInMs = 20 * 60 * 1000 }) {
  const normalizedRequestId = String(requestId || '').trim();
  const normalizedCustomerId = String(customerId || '').trim();
  const normalizedPrincipalId = String(principalId || '').trim();
  if (!normalizedRequestId || !normalizedCustomerId || !normalizedPrincipalId) return { code: 'invalid-principal' };
  const { token, tokenHash } = createPaymentToken();
  const sessionRef = db.collection(PAYMENT_SESSIONS).doc(tokenHash);
  const requestRef = db.collection('serviceRequests').doc(normalizedRequestId);
  const legacyOperationRef = db.collection(FINANCIAL_OPERATIONS).doc(`service_${digest(normalizedRequestId).slice(0, 40)}`);
  const outcome = await db.runTransaction(async (transaction) => {
    const [requestSnap, legacySnap] = await Promise.all([transaction.get(requestRef), transaction.get(legacyOperationRef)]);
    if (!requestSnap.exists) return { code: 'not-found' };
    const request = requestSnap.data() || {};
    if (String(request.customerId || '') !== normalizedCustomerId) return { code: 'not-owner' };
    if (String(request.status || '').toLowerCase() !== 'completed') return { code: 'not-payable' };
    const legacy = legacySnap.exists ? legacySnap.data() || {} : null;
    const amount = getFinalPayableAmount(request, legacy);
    if (amount === null) return { code: 'amount-unavailable' };
    if (amount <= 0) return { code: 'not-payable' };
    if (paymentStateForRequest(request, null, legacy) === 'paid') return { code: 'already-paid' };
    if (paymentStateForRequest(request, null, legacy) === 'payment_processing') return { code: 'payment-processing' };
    transaction.create(sessionRef, {
      sessionId: tokenHash,
      requestId: normalizedRequestId,
      customerId: normalizedCustomerId,
      principalId: normalizedPrincipalId,
      principalType: String(principalType || 'customer'),
      amountMinor: normalizeMinorAmount(amount),
      currency: 'ZAR',
      status: 'active',
      expiresAtMs: now + Math.max(60_000, Math.min(Number(expiresInMs) || 20 * 60 * 1000, 60 * 60 * 1000)),
      createdAtMs: now,
      updatedAtMs: now,
    });
    return { code: 'created', amount, expiresAtMs: now + Math.max(60_000, Math.min(Number(expiresInMs) || 20 * 60 * 1000, 60 * 60 * 1000)) };
  });
  return { ...outcome, ...(outcome.code === 'created' ? { token, sessionId: tokenHash } : {}) };
}

async function resolveServicePaymentSession({ db, token, now = Date.now() }) {
  const safeToken = String(token || '').trim();
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(safeToken)) return { code: 'invalid-session' };
  const tokenHash = digest(safeToken);
  const sessionSnap = await db.collection(PAYMENT_SESSIONS).doc(tokenHash).get();
  if (!sessionSnap.exists) return { code: 'invalid-session' };
  const session = sessionSnap.data() || {};
  if (session.status !== 'active') return { code: 'revoked' };
  if (Number(session.expiresAtMs || 0) <= now) return { code: 'expired' };
  const requestRef = db.collection('serviceRequests').doc(String(session.requestId || ''));
  const [requestSnap, legacySnap, paymentSnap] = await Promise.all([
    requestRef.get(),
    db.collection(FINANCIAL_OPERATIONS).doc(`service_${digest(session.requestId).slice(0, 40)}`).get(),
    db.collection(PAYMENT_OPERATIONS).doc(String(session.requestId || '')).get(),
  ]);
  if (!requestSnap.exists) return { code: 'not-found' };
  const request = { id: requestSnap.id, ...(requestSnap.data() || {}) };
  const legacy = legacySnap.exists ? legacySnap.data() || {} : null;
  const paymentOperation = paymentSnap.exists ? paymentSnap.data() || {} : null;
  const amount = getFinalPayableAmount(request, legacy);
  if (String(request.status || '').toLowerCase() !== 'completed') return { code: 'not-payable' };
  if (amount === null) return { code: 'amount-unavailable' };
  return {
    code: 'available',
    sessionRef: sessionSnap.ref,
    session,
    requestRef,
    request,
    legacyOperationRef: legacySnap.ref,
    legacyOperation: legacy,
    paymentOperationRef: paymentSnap.ref,
    paymentOperation,
    amount,
    paymentStatus: paymentStateForRequest(request, paymentOperation, legacy),
  };
}

async function beginServicePaymentAttempt({ db, admin, sessionRef, session, method, idempotencyKey, selectedCardId = '', saveCardConsent = false, now = Date.now() }) {
  const normalizedMethod = String(method || '').trim().toLowerCase();
  const validMethods = ['cash', 'paystack_checkout', 'saved_card'];
  const safeKey = String(idempotencyKey || '').trim();
  if (!validMethods.includes(normalizedMethod) || !safeKey || safeKey.length > 180) return { action: 'invalid-input' };
  const requestId = String(session?.requestId || '').trim();
  if (!requestId) return { action: 'invalid-session' };
  const requestRef = db.collection('serviceRequests').doc(requestId);
  const paymentRef = db.collection(PAYMENT_OPERATIONS).doc(requestId);
  const legacyRef = db.collection(FINANCIAL_OPERATIONS).doc(`service_${digest(requestId).slice(0, 40)}`);
  const attemptId = digest(`${normalizedMethod}:${safeKey}`).slice(0, 40);
  const attemptRef = paymentRef.collection('attempts').doc(attemptId);
  return db.runTransaction(async (transaction) => {
    const [sessionSnap, requestSnap, paymentSnap, legacySnap, attemptSnap] = await Promise.all([
      transaction.get(sessionRef), transaction.get(requestRef), transaction.get(paymentRef), transaction.get(legacyRef), transaction.get(attemptRef),
    ]);
    if (!sessionSnap.exists || sessionSnap.data()?.status !== 'active' || Number(sessionSnap.data()?.expiresAtMs || 0) <= now) return { action: 'session-expired' };
    if (!requestSnap.exists) return { action: 'not-found' };
    const request = requestSnap.data() || {};
    if (String(request.customerId || '') !== String(session.customerId || '')) return { action: 'not-owner' };
    if (String(request.status || '').toLowerCase() !== 'completed') return { action: 'not-payable' };
    const legacy = legacySnap.exists ? legacySnap.data() || {} : null;
    const existing = paymentSnap.exists ? paymentSnap.data() || {} : null;
    const state = paymentStateForRequest(request, existing, legacy);
    if (state === 'paid') return { action: 'already-paid' };
    if (['initializing', 'processing', 'payment_processing', 'payment_reconciliation_required', 'reconciliation_required', 'cash_selected', 'awaiting_cash_confirmation', 'awaiting_customer_confirmation'].includes(state)) {
      if (attemptSnap.exists && String(existing?.activeAttemptId || '') === attemptId) return { action: 'existing', attempt: attemptSnap.data(), attemptRef, payment: existing };
      return { action: 'conflict', payment: existing };
    }
    if (legacy && ['processing', 'reconciliation_required', 'gateway_succeeded'].includes(String(legacy.status || '').toLowerCase())) return { action: 'legacy-payment-pending' };
    if (attemptSnap.exists) return { action: 'existing', attempt: attemptSnap.data(), attemptRef, payment: existing };
    const amount = getFinalPayableAmount(request, legacy);
    const amountMinor = normalizeMinorAmount(amount);
    if (amountMinor === null || amountMinor <= 0) return { action: 'amount-unavailable' };
    const attemptCount = Number(existing?.attemptCount || 0) + 1;
    const status = normalizedMethod === 'cash' ? 'cash_selected'
      : normalizedMethod === 'saved_card' ? 'awaiting_customer_confirmation' : 'initializing';
    const attempt = {
      attemptId,
      requestId,
      customerId: String(session.customerId),
      sessionId: String(session.sessionId || ''),
      method: normalizedMethod,
      status,
      amount: amountMinor / 100,
      amountMinor,
      currency: 'ZAR',
      attemptNo: attemptCount,
      idempotencyKeyHash: digest(safeKey),
      ...(normalizedMethod === 'saved_card' && selectedCardId ? { selectedCardId: String(selectedCardId) } : {}),
      saveCardConsent: Boolean(saveCardConsent),
      createdAtMs: now,
      updatedAtMs: now,
      expiresAtMs: now + 20 * 60 * 1000,
    };
    transaction.create(attemptRef, attempt);
    transaction.set(paymentRef, {
      requestId,
      customerId: String(session.customerId),
      amount: amountMinor / 100,
      amountMinor,
      currency: 'ZAR',
      status: normalizedMethod === 'cash' ? 'cash_selected' : status,
      method: normalizedMethod,
      activeAttemptId: attemptId,
      ...(normalizedMethod === 'saved_card' && selectedCardId ? { selectedCardId: String(selectedCardId) } : {}),
      attemptCount,
      updatedAtMs: now,
      createdAtMs: Number(existing?.createdAtMs || now),
    }, { merge: true });
    if (normalizedMethod === 'paystack_checkout') {
      transaction.update(requestRef, { paymentStatus: 'payment_processing', paymentMethod: normalizedMethod, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    } else if (normalizedMethod === 'saved_card') {
      transaction.update(requestRef, { paymentStatus: 'awaiting_customer_confirmation', paymentMethod: normalizedMethod, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
    return { action: 'created', attempt, attemptRef, paymentRef };
  });
}

async function claimSavedCardPayment({ db, admin, requestId, attemptId, gatewayReference, now = Date.now() }) {
  const requestRef = db.collection('serviceRequests').doc(String(requestId || ''));
  const paymentRef = db.collection(PAYMENT_OPERATIONS).doc(String(requestId || ''));
  const attemptRef = paymentRef.collection('attempts').doc(String(attemptId || ''));
  const referenceRef = db.collection('paystackRequestPaymentReferences').doc(String(gatewayReference || ''));
  return db.runTransaction(async (transaction) => {
    const [requestSnap, paymentSnap, attemptSnap, referenceSnap] = await Promise.all([transaction.get(requestRef), transaction.get(paymentRef), transaction.get(attemptRef), transaction.get(referenceRef)]);
    if (!requestSnap.exists || !paymentSnap.exists || !attemptSnap.exists) return { action: 'not-found' };
    const request = requestSnap.data() || {};
    const payment = paymentSnap.data() || {};
    const attempt = attemptSnap.data() || {};
    if (String(request.status || '').toLowerCase() !== 'completed') return { action: 'not-payable' };
    if (payment.status === 'paid' || request.paymentStatus === 'paid') return { action: 'already-paid', receiptId: payment.receiptId || request.paymentReceiptId || null, amount: payment.amount || request.totalAmount || 0, method: payment.method || request.paymentMethod || '' };
    if (payment.activeAttemptId !== attemptId || attempt.method !== 'saved_card') return { action: 'stale-attempt' };
    if (referenceSnap.exists && String(referenceSnap.data()?.attemptId || '') !== attemptId) return { action: 'reference-conflict' };
    if (attempt.status === 'processing' || attempt.status === 'payment_reconciliation_required') return { action: 'reconcile', attempt, request, attemptRef };
    if (attempt.status !== 'awaiting_customer_confirmation' || Number(attempt.expiresAtMs || 0) <= now) return { action: 'confirmation-expired' };
    transaction.set(attemptRef, { status: 'processing', confirmedAtMs: now, gatewayReference: String(gatewayReference || ''), updatedAtMs: now }, { merge: true });
    transaction.set(paymentRef, { status: 'payment_processing', updatedAtMs: now }, { merge: true });
    transaction.set(referenceRef, { requestId, attemptId, gatewayReference: String(gatewayReference || ''), createdAtMs: now }, { merge: true });
    transaction.update(requestRef, { paymentStatus: 'payment_processing', paymentMethod: 'saved_card', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { action: 'charge', attempt: { ...attempt, status: 'processing', confirmedAtMs: now, gatewayReference: String(gatewayReference || '') }, request, attemptRef };
  });
}

async function recordCheckoutInitialization({ db, admin, requestId, attemptId, gatewayReference, authorizationUrl, now = Date.now() }) {
  const requestRef = db.collection('serviceRequests').doc(String(requestId || ''));
  const paymentRef = db.collection(PAYMENT_OPERATIONS).doc(String(requestId || ''));
  const attemptRef = paymentRef.collection('attempts').doc(String(attemptId || ''));
  const referenceRef = db.collection('paystackRequestPaymentReferences').doc(String(gatewayReference || ''));
  return db.runTransaction(async (transaction) => {
    const [requestSnap, paymentSnap, attemptSnap, referenceSnap] = await Promise.all([transaction.get(requestRef), transaction.get(paymentRef), transaction.get(attemptRef), transaction.get(referenceRef)]);
    if (!requestSnap.exists || !paymentSnap.exists || !attemptSnap.exists) return { action: 'not-found' };
    const request = requestSnap.data() || {};
    const payment = paymentSnap.data() || {};
    const attempt = attemptSnap.data() || {};
    if (payment.activeAttemptId !== attemptId || attempt.method !== 'paystack_checkout') return { action: 'stale-attempt' };
    if (request.paymentStatus === 'paid' || payment.status === 'paid') return { action: 'already-paid' };
    if (attempt.gatewayReference && attempt.gatewayReference !== gatewayReference) return { action: 'reference-conflict' };
    if (referenceSnap.exists && String(referenceSnap.data()?.attemptId || '') !== attemptId) return { action: 'reference-conflict' };
    transaction.set(attemptRef, { status: 'processing', gatewayReference: String(gatewayReference || ''), authorizationUrl: String(authorizationUrl || ''), updatedAtMs: now }, { merge: true });
    transaction.set(paymentRef, { status: 'payment_processing', gatewayReference: String(gatewayReference || ''), updatedAtMs: now }, { merge: true });
    transaction.set(referenceRef, { requestId, attemptId, gatewayReference: String(gatewayReference || ''), createdAtMs: now }, { merge: true });
    transaction.update(requestRef, { paymentStatus: 'payment_processing', paymentMethod: 'paystack_checkout', paymentReference: String(gatewayReference || ''), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { action: 'updated' };
  });
}

async function reportCashPayment({ db, admin, requestId, customerId, attemptId, now = Date.now() }) {
  const requestRef = db.collection('serviceRequests').doc(String(requestId || ''));
  const paymentRef = db.collection(PAYMENT_OPERATIONS).doc(String(requestId || ''));
  const attemptRef = paymentRef.collection('attempts').doc(String(attemptId || ''));
  return db.runTransaction(async (transaction) => {
    const [requestSnap, paymentSnap, attemptSnap] = await Promise.all([transaction.get(requestRef), transaction.get(paymentRef), transaction.get(attemptRef)]);
    if (!requestSnap.exists || !paymentSnap.exists || !attemptSnap.exists) return { action: 'not-found' };
    const request = requestSnap.data() || {};
    const payment = paymentSnap.data() || {};
    const attempt = attemptSnap.data() || {};
    if (String(request.customerId || '') !== String(customerId || '')) return { action: 'not-owner' };
    if (String(request.status || '').toLowerCase() !== 'completed') return { action: 'not-payable' };
    if (payment.status === 'paid') return { action: 'already-paid' };
    if (payment.activeAttemptId !== attemptId || attempt.method !== 'cash') return { action: 'stale-attempt' };
    if (attempt.status === 'awaiting_cash_confirmation') return { action: 'already-reported', attempt };
    if (attempt.status !== 'cash_selected') return { action: 'invalid-state' };
    transaction.set(attemptRef, { status: 'awaiting_cash_confirmation', customerReportedAtMs: now, updatedAtMs: now }, { merge: true });
    transaction.set(paymentRef, { status: 'awaiting_cash_confirmation', updatedAtMs: now }, { merge: true });
    transaction.update(requestRef, { paymentStatus: 'awaiting_cash_confirmation', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { action: 'reported', attempt, request };
  });
}

async function cancelCashPaymentSelection({ db, admin, requestId, customerId, attemptId, now = Date.now() }) {
  const requestRef = db.collection('serviceRequests').doc(String(requestId || ''));
  const paymentRef = db.collection(PAYMENT_OPERATIONS).doc(String(requestId || ''));
  const attemptRef = paymentRef.collection('attempts').doc(String(attemptId || ''));
  const legacyRef = db.collection(FINANCIAL_OPERATIONS).doc(`service_${digest(requestId).slice(0, 40)}`);
  return db.runTransaction(async (transaction) => {
    const [requestSnap, paymentSnap, attemptSnap, legacySnap] = await Promise.all([
      transaction.get(requestRef), transaction.get(paymentRef), transaction.get(attemptRef), transaction.get(legacyRef),
    ]);
    if (!requestSnap.exists || !paymentSnap.exists || !attemptSnap.exists) return { action: 'not-found' };
    const request = requestSnap.data() || {};
    const payment = paymentSnap.data() || {};
    const attempt = attemptSnap.data() || {};
    if (String(request.customerId || '') !== String(customerId || '')) return { action: 'not-owner' };
    if (String(request.status || '').toLowerCase() !== 'completed') return { action: 'not-payable' };
    if (payment.status === 'paid') return { action: 'already-paid' };
    if (payment.activeAttemptId !== attemptId || attempt.method !== 'cash' || attempt.status !== 'cash_selected') return { action: 'cash-already-reported-or-stale' };
    const legacy = legacySnap.exists ? legacySnap.data() || {} : null;
    const priorState = String(legacy?.status || '') === 'settled_failed' ? 'wallet_debt_recorded' : 'unpaid';
    transaction.set(attemptRef, { status: 'cancelled_by_customer', cancelledAtMs: now, updatedAtMs: now }, { merge: true });
    transaction.set(paymentRef, { status: priorState, method: null, activeAttemptId: null, updatedAtMs: now }, { merge: true });
    transaction.update(requestRef, { paymentStatus: priorState, paymentMethod: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { action: 'cancelled' };
  });
}

async function cancelSavedCardPaymentConfirmation({ db, admin, requestId, customerId, attemptId, now = Date.now() }) {
  const requestRef = db.collection('serviceRequests').doc(String(requestId || ''));
  const paymentRef = db.collection(PAYMENT_OPERATIONS).doc(String(requestId || ''));
  const attemptRef = paymentRef.collection('attempts').doc(String(attemptId || ''));
  const legacyRef = db.collection(FINANCIAL_OPERATIONS).doc(`service_${digest(requestId).slice(0, 40)}`);
  return db.runTransaction(async (transaction) => {
    const [requestSnap, paymentSnap, attemptSnap, legacySnap] = await Promise.all([
      transaction.get(requestRef), transaction.get(paymentRef), transaction.get(attemptRef), transaction.get(legacyRef),
    ]);
    if (!requestSnap.exists || !paymentSnap.exists || !attemptSnap.exists) return { action: 'not-found' };
    const request = requestSnap.data() || {};
    const payment = paymentSnap.data() || {};
    const attempt = attemptSnap.data() || {};
    if (String(request.customerId || '') !== String(customerId || '')) return { action: 'not-owner' };
    if (String(request.status || '').toLowerCase() !== 'completed') return { action: 'not-payable' };
    if (payment.status === 'paid') return { action: 'already-paid' };
    if (payment.activeAttemptId !== attemptId || attempt.method !== 'saved_card' || attempt.status !== 'awaiting_customer_confirmation') return { action: 'confirmation-already-submitted-or-stale' };
    const legacy = legacySnap.exists ? legacySnap.data() || {} : null;
    const priorState = String(legacy?.status || '') === 'settled_failed' ? 'wallet_debt_recorded' : 'unpaid';
    transaction.set(attemptRef, { status: 'cancelled_by_customer', cancelledAtMs: now, updatedAtMs: now }, { merge: true });
    transaction.set(paymentRef, { status: priorState, method: null, selectedCardId: null, activeAttemptId: null, updatedAtMs: now }, { merge: true });
    transaction.update(requestRef, { paymentStatus: priorState, paymentMethod: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { action: 'cancelled' };
  });
}

async function rejectCashPayment({ db, admin, requestId, helperId, attemptId, now = Date.now() }) {
  const requestRef = db.collection('serviceRequests').doc(String(requestId || ''));
  const paymentRef = db.collection(PAYMENT_OPERATIONS).doc(String(requestId || ''));
  const attemptRef = paymentRef.collection('attempts').doc(String(attemptId || ''));
  const legacyRef = db.collection(FINANCIAL_OPERATIONS).doc(`service_${digest(requestId).slice(0, 40)}`);
  return db.runTransaction(async (transaction) => {
    const [requestSnap, paymentSnap, attemptSnap, legacySnap] = await Promise.all([transaction.get(requestRef), transaction.get(paymentRef), transaction.get(attemptRef), transaction.get(legacyRef)]);
    if (!requestSnap.exists || !paymentSnap.exists || !attemptSnap.exists) return { action: 'not-found' };
    const request = requestSnap.data() || {};
    const payment = paymentSnap.data() || {};
    const attempt = attemptSnap.data() || {};
    if (String(request.helperAssignment?.helperId || '') !== String(helperId || '')) return { action: 'not-assigned-helper' };
    if (String(request.status || '').toLowerCase() !== 'completed') return { action: 'not-payable' };
    if (payment.activeAttemptId !== attemptId || attempt.status !== 'awaiting_cash_confirmation') return { action: 'stale-attempt' };
    const legacy = legacySnap.exists ? legacySnap.data() || {} : null;
    const priorState = String(legacy?.status || '') === 'settled_failed' ? 'wallet_debt_recorded' : 'unpaid';
    transaction.set(attemptRef, { status: 'cash_rejected', helperRejectedAtMs: now, updatedAtMs: now }, { merge: true });
    transaction.set(paymentRef, { status: priorState, activeAttemptId: null, updatedAtMs: now }, { merge: true });
    transaction.update(requestRef, { paymentStatus: priorState, paymentMethod: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { action: 'rejected', request, attempt };
  });
}

async function revokeServicePaymentSession({ db, requestId, customerId, tokenHash, now = Date.now() }) {
  const requestRef = db.collection('serviceRequests').doc(String(requestId || ''));
  const sessionRef = db.collection(PAYMENT_SESSIONS).doc(String(tokenHash || ''));
  return db.runTransaction(async (transaction) => {
    const [requestSnap, sessionSnap] = await Promise.all([transaction.get(requestRef), transaction.get(sessionRef)]);
    if (!requestSnap.exists || !sessionSnap.exists) return { action: 'not-found' };
    if (String(requestSnap.data()?.customerId || '') !== String(customerId || '')
      || String(sessionSnap.data()?.requestId || '') !== String(requestId || '')) return { action: 'not-owner' };
    transaction.set(sessionRef, { status: 'revoked', revokedAtMs: now, updatedAtMs: now }, { merge: true });
    return { action: 'revoked' };
  });
}

async function settleRequestPayment({ db, admin, requestId, attemptId, outcome, gatewayTransactionId = '', gatewayReference = '', providerStatus = '', helperId = '', now = Date.now() }) {
  const requestRef = db.collection('serviceRequests').doc(String(requestId || ''));
  const paymentRef = db.collection(PAYMENT_OPERATIONS).doc(String(requestId || ''));
  const attemptRef = paymentRef.collection('attempts').doc(String(attemptId || ''));
  const legacyRef = db.collection(FINANCIAL_OPERATIONS).doc(`service_${digest(requestId).slice(0, 40)}`);
  const customerLedgerRef = db.collection(PAYMENT_LEDGER).doc(`payment_${digest(`${requestId}:${attemptId}`).slice(0, 48)}`);
  return db.runTransaction(async (transaction) => {
    const [requestSnap, paymentSnap, attemptSnap, legacySnap, ledgerSnap] = await Promise.all([
      transaction.get(requestRef), transaction.get(paymentRef), transaction.get(attemptRef), transaction.get(legacyRef), transaction.get(customerLedgerRef),
    ]);
    if (!requestSnap.exists || !paymentSnap.exists || !attemptSnap.exists) return { action: 'not-found' };
    const request = requestSnap.data() || {};
    const payment = paymentSnap.data() || {};
    const attempt = attemptSnap.data() || {};
    const legacy = legacySnap.exists ? legacySnap.data() || {} : null;
    if (String(request.status || '').toLowerCase() !== 'completed') return { action: 'not-payable' };
    if (payment.status === 'paid' || request.paymentStatus === 'paid') return { action: 'already-paid' };
    if (payment.activeAttemptId !== attemptId) return { action: 'stale-attempt' };
    if (attempt.method === 'cash' && attempt.status !== 'awaiting_cash_confirmation') return { action: 'invalid-state' };
    if (attempt.method !== 'cash' && !['processing', 'payment_reconciliation_required'].includes(String(attempt.status || ''))) return { action: 'invalid-state' };
    if (outcome === 'pending' || outcome === 'unknown') {
      transaction.set(attemptRef, { status: 'payment_reconciliation_required', providerStatus: String(providerStatus || outcome), gatewayReference: String(gatewayReference || ''), updatedAtMs: now }, { merge: true });
      transaction.set(paymentRef, { status: 'payment_reconciliation_required', reconciliationRequiredAtMs: now, updatedAtMs: now }, { merge: true });
      transaction.update(requestRef, { paymentStatus: 'payment_reconciliation_required', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return { action: 'pending' };
    }
    if (outcome !== 'success' && outcome !== 'failed_confirmed') return { action: 'invalid-outcome' };
    if (outcome === 'failed_confirmed') {
      const failureState = legacy?.status === 'settled_failed' ? 'wallet_debt_recorded' : 'payment_failed';
      transaction.set(attemptRef, { status: 'payment_failed', providerStatus: String(providerStatus || 'failed'), gatewayReference: String(gatewayReference || ''), updatedAtMs: now }, { merge: true });
      transaction.set(paymentRef, { status: failureState, activeAttemptId: null, updatedAtMs: now }, { merge: true });
      transaction.update(requestRef, { paymentStatus: failureState, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return { action: 'failed', failureState };
    }
    if (attempt.method === 'cash' && (!helperId || String(request.helperAssignment?.helperId || '') !== String(helperId))) return { action: 'not-assigned-helper' };
    const customerId = String(request.customerId || '');
    const customerRef = customerId ? db.collection('users').doc(customerId) : null;
    let customerSnap = null;
    let wallet = null;
    const debtOutstanding = Boolean(legacy?.walletDebtOutstanding || (legacy?.debtApplied && !legacy?.debtReversed));
    const reversalRef = db.collection(PAYMENT_LEDGER).doc(`payment_debt_reversal_${digest(`${requestId}:${attemptId}`).slice(0, 40)}`);
    const reversalSnap = debtOutstanding ? await transaction.get(reversalRef) : null;
    if (debtOutstanding && customerRef) {
      customerSnap = await transaction.get(customerRef);
      wallet = customerSnap.data()?.wallet || { balance: 0, currency: 'ZAR' };
    }
    const amount = Number(attempt.amount || 0);
    const paymentMethod = String(attempt.method || '');
    const receiptId = `UNC-${digest(`${requestId}:${attemptId}`).slice(0, 16).toUpperCase()}`;
    const isCash = paymentMethod === 'cash';
    if (!ledgerSnap.exists) {
      transaction.create(customerLedgerRef, {
        entryId: customerLedgerRef.id,
        operationId: `payment_${requestId}`,
        requestId,
        userId: customerId,
        entryType: isCash ? 'direct_cash_payment' : 'customer_service_payment',
        amount,
        currency: 'ZAR',
        paymentMethod,
        gatewayReference: String(gatewayReference || '') || null,
        gatewayTransactionId: String(gatewayTransactionId || '') || null,
        receiptId,
        status: 'settled',
        createdAtMs: now,
      });
    }
    if (debtOutstanding && customerRef && customerSnap?.exists) {
      const oldBalance = Number(wallet?.balance || 0);
      const newBalance = Number((oldBalance + amount).toFixed(2));
      if (!reversalSnap.exists) {
        transaction.create(reversalRef, {
          entryId: reversalRef.id, operationId: legacy.operationId, requestId, userId: customerId,
          entryType: 'service_charge_debt_reversal', amount, currency: 'ZAR',
          balanceBefore: oldBalance, balanceAfter: newBalance, sourcePaymentAttemptId: attemptId, createdAtMs: now,
        });
        transaction.set(customerRef, { wallet: { ...wallet, balance: newBalance, currency: wallet.currency || 'ZAR', updatedAt: new Date(now).toISOString() }, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }
    }
    const canonicalOperationId = String(legacy?.operationId || `service_${digest(requestId).slice(0, 40)}`);
    const canonicalOperationPatch = {
      operationId: canonicalOperationId,
      requestId,
      operationType: 'completion',
      status: 'settled_success',
      finalOutcome: 'success',
      finalOutcomeSource: 'request_payment',
      paymentStatus: 'paid',
      paymentSettled: true,
      outcomeDetermined: true,
      settlementApplied: true,
      walletDebtOutstanding: false,
      debtApplied: Boolean(legacy?.debtApplied),
      debtReversed: Boolean(legacy?.debtReversed || (debtOutstanding && customerSnap?.exists)),
      ...(Number.isFinite(Number(legacy?.amountMinor)) ? {} : { amount, amountMinor: Math.round(amount * 100), currency: 'ZAR' }),
      alternatePaymentMethod: paymentMethod,
      alternatePaymentReference: String(gatewayReference || '') || null,
      alternatePaymentTransactionId: String(gatewayTransactionId || '') || null,
      paymentReconciledAtMs: now,
      updatedAtMs: now,
    };
    if (legacySnap.exists) transaction.set(legacyRef, canonicalOperationPatch, { merge: true });
    else transaction.create(legacyRef, { ...canonicalOperationPatch, createdAtMs: now });
    const breakdown = request.helperPayoutBreakdown || legacy?.settlementData?.helperPayoutBreakdown || {};
    if (isCash && Number(breakdown.platformAmount || 0) > 0) {
      const policyReviewRef = db.collection('financialPolicyReviews').doc(`direct_cash_${digest(requestId).slice(0, 40)}`);
      transaction.set(policyReviewRef, {
        reviewId: policyReviewRef.id,
        requestId,
        helperId: String(request.helperAssignment?.helperId || ''),
        type: 'direct_cash_platform_commission',
        status: 'open',
        grossCustomerPayment: amount,
        recordedPlatformAmount: Number(breakdown.platformAmount || 0),
        recordedHelperAmount: Number(breakdown.helperAmount || 0),
        paymentAttemptId: attemptId,
        policyDecisionRequired: true,
        automatedCommissionRecovery: false,
        createdAtMs: now,
        updatedAtMs: now,
      }, { merge: true });
    }
    transaction.set(requestRef, {
      paymentStatus: 'paid',
      paymentMethod,
      paymentTransactionId: String(gatewayTransactionId || '') || null,
      paymentReference: String(gatewayReference || '') || null,
      paymentReceiptId: receiptId,
      paymentSettledAtMs: now,
      ...(isCash ? {
        cashPayment: {
          status: 'helper_confirmed', helperId, amount, currency: 'ZAR',
          helperConfirmedAtMs: now, commissionReviewRequired: Number(breakdown.platformAmount || 0) > 0,
          platformAmountForPolicyReview: Number(breakdown.platformAmount || 0),
        },
      } : {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(attemptRef, {
      status: 'settled_success', providerStatus: String(providerStatus || (isCash ? 'helper_confirmed' : 'success')),
      gatewayReference: String(gatewayReference || '') || null, gatewayTransactionId: String(gatewayTransactionId || '') || null,
      receiptId, settledAtMs: now, updatedAtMs: now,
    }, { merge: true });
    transaction.set(paymentRef, {
      status: 'paid', method: paymentMethod, activeAttemptId: attemptId, receiptId,
      settlement: { receiptId, amount, method: paymentMethod, paidAtMs: now, gatewayReference: String(gatewayReference || '') },
      gatewayReference: String(gatewayReference || '') || null, gatewayTransactionId: String(gatewayTransactionId || '') || null,
      settledAtMs: now, updatedAtMs: now,
      ...(isCash ? { platformCommissionReviewRequired: Number(breakdown.platformAmount || 0) > 0 } : {}),
    }, { merge: true });
    return { action: 'settled', receiptId, amount, method: paymentMethod, customerId, helperId: String(request.helperAssignment?.helperId || '') };
  });
}

module.exports = {
  PAYMENT_OPERATIONS,
  PAYMENT_SESSIONS,
  beginServicePaymentAttempt,
  cancelCashPaymentSelection,
  cancelSavedCardPaymentConfirmation,
  claimSavedCardPayment,
  createPaymentToken,
  createServicePaymentSession,
  getFinalPayableAmount,
  normalizeMinorAmount,
  paymentStateForRequest,
  rejectCashPayment,
  recordCheckoutInitialization,
  reportCashPayment,
  revokeServicePaymentSession,
  resolveServicePaymentSession,
  safePaymentReceipt,
  settleRequestPayment,
};
