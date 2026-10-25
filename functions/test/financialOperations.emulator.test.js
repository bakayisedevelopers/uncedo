'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const admin = require('firebase-admin');
const {
  claimPayoutTransfer,
  claimPaystackRefund,
  claimServiceFinancialOperation,
  executePayoutTransferAttempt,
  executeServiceChargeAttempt,
  recordPayoutObservation,
  settleServiceFinancialOperation,
} = require('../financialOperationService');

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
let db;
if (emulatorAvailable) {
  const app = admin.initializeApp({ projectId: 'demo-uncedo-financial-tests' }, `financial-test-${randomUUID()}`);
  db = app.firestore();
}
const skip = emulatorAvailable ? false : 'Set FIRESTORE_EMULATOR_HOST or run through firebase emulators:exec.';

function requestRefFor(id) {
  return db.collection('serviceRequests').doc(id);
}

async function seedRequest(id, status = 'work_started') {
  const ref = requestRefFor(id);
  await ref.set({ requestId: id, customerId: `customer-${id}`, status, helperAssignment: { helperId: `helper-${id}` } });
  await db.collection('users').doc(`customer-${id}`).set({ wallet: { balance: 100, currency: 'ZAR' } });
  return ref;
}

function settlementData(id, operationType = 'completion') {
  return {
    customerId: `customer-${id}`,
    helperId: `helper-${id}`,
    endedAt: Date.now(),
    noChargePaymentStatus: 'paid',
    requestPatch: { status: operationType === 'completion' ? 'completed' : 'canceled' },
  };
}

async function claimService(id, operationType = 'completion', allowRetry = false) {
  return claimServiceFinancialOperation({
    db,
    requestRef: requestRefFor(id),
    requestId: id,
    operationType,
    amount: 25,
    settlementData: settlementData(id, operationType),
    allowRetry,
  });
}

async function settleService(claim, id, outcome) {
  return settleServiceFinancialOperation({
    db,
    admin,
    operationRef: claim.operationRef,
    requestRef: requestRefFor(id),
    outcome,
    transactionId: outcome === 'success' ? `tx-${id}` : null,
  });
}

test('2 and 5 simultaneous completion requests produce one charge claim', { skip }, async () => {
  for (const count of [2, 5]) {
    const id = `completion-${count}-${randomUUID()}`;
    await seedRequest(id);
    const claims = await Promise.all(Array.from({ length: count }, () => claimService(id)));
    assert.equal(claims.filter((claim) => claim.action === 'charge').length, 1);
    assert.equal(claims.filter((claim) => claim.action === 'reconcile').length, count - 1);
    let chargeCalls = 0;
    const paystack = {
      async chargeAuthorization() { chargeCalls += 1; },
      async verifyTransaction({ reference, amountMinor, currency }) {
        return { outcome: 'success', transaction: { id: `tx-${id}`, reference, amount: amountMinor, currency, status: 'success' } };
      },
    };
    await Promise.all(claims.map((claim) => executeServiceChargeAttempt({
      operation: claim.operation,
      action: claim.action,
      authorizationCode: 'mock-auth',
      paystack,
    })));
    assert.equal(chargeCalls, 1);
  }
});

test('2 and 5 simultaneous cancellation requests produce one charge claim', { skip }, async () => {
  for (const count of [2, 5]) {
    const id = `cancellation-${count}-${randomUUID()}`;
    await seedRequest(id);
    const claims = await Promise.all(Array.from({ length: count }, () => claimService(id, 'customer_cancellation')));
    assert.equal(claims.filter((claim) => claim.action === 'charge').length, 1);
    assert.equal(claims.filter((claim) => claim.action === 'reconcile').length, count - 1);
    let chargeCalls = 0;
    const paystack = {
      async chargeAuthorization() { chargeCalls += 1; },
      async verifyTransaction({ reference, amountMinor, currency }) {
        return { outcome: 'success', transaction: { id: `tx-${id}`, reference, amount: amountMinor, currency, status: 'success' } };
      },
    };
    await Promise.all(claims.map((claim) => executeServiceChargeAttempt({
      operation: claim.operation,
      action: claim.action,
      authorizationCode: 'mock-auth',
      paystack,
    })));
    assert.equal(chargeCalls, 1);
  }
});

test('completion and cancellation racing for one request have only one canonical claim', { skip }, async () => {
  const id = `close-race-${randomUUID()}`;
  await seedRequest(id);
  const [completion, cancellation] = await Promise.all([
    claimService(id, 'completion'),
    claimService(id, 'customer_cancellation'),
  ]);
  assert.equal([completion, cancellation].filter((claim) => claim.action === 'charge').length, 1);
  assert.equal([completion, cancellation].filter((claim) => claim.action === 'conflict').length, 1);
});

test('cancellation claim rejects a request state or assignment changed after fee preview', { skip }, async () => {
  for (const [suffix, expectedRequestStatus, expectedHelperId] of [
    ['state', 'accepted', 'helper-state'],
    ['assignment', 'driving', 'different-helper'],
  ]) {
    const id = `cancellation-stale-preview-${suffix}-${randomUUID()}`;
    const requestRef = await seedRequest(id, 'driving');
    if (suffix === 'state') await requestRef.update({ status: 'work_started' });
    const result = await claimServiceFinancialOperation({
      db,
      requestRef,
      requestId: id,
      operationType: 'customer_cancellation',
      amount: 25,
      settlementData: settlementData(id, 'customer_cancellation'),
      expectedRequestStatus,
      expectedHelperId,
    });
    assert.equal(result.action, 'request_changed');
    assert.equal((await result.operationRef.get()).exists, false);
  }
});

test('concurrent card verification retries can claim only one refund submission', { skip }, async () => {
  const reference = `card-verification-${randomUUID()}`;
  const claims = await Promise.all(Array.from({ length: 5 }, () => claimPaystackRefund({
    db,
    reference,
    userId: 'customer-refund-test',
    amountMinor: 100,
    currency: 'ZAR',
  })));
  assert.equal(claims.filter((claim) => claim.action === 'submit').length, 1);
  assert.equal(claims.filter((claim) => claim.action === 'existing').length, 4);
});

test('replayed completion after success does not claim another charge', { skip }, async () => {
  const id = `completion-replay-${randomUUID()}`;
  await seedRequest(id);
  const claim = await claimService(id);
  await settleService(claim, id, 'success');
  const replay = await claimService(id);
  assert.equal(replay.action, 'settled');
  assert.equal(replay.operation.finalOutcome, 'success');
});

test('legacy completion billing cannot claim a new charge while request payment is active or settled', { skip }, async () => {
  const activeId = `new-payment-active-${randomUUID()}`;
  const activeRequestRef = await seedRequest(activeId);
  await db.collection('servicePaymentOperations').doc(activeId).set({ status: 'awaiting_cash_confirmation', activeAttemptId: 'attempt-1' });
  const activeClaim = await claimServiceFinancialOperation({
    db, requestRef: activeRequestRef, requestId: activeId, operationType: 'completion', amount: 25, settlementData: settlementData(activeId), allowRetry: true,
  });
  assert.equal(activeClaim.action, 'payment_in_progress');
  assert.equal((await activeClaim.operationRef.get()).exists, false);

  const paidId = `new-payment-settled-${randomUUID()}`;
  const paidRequestRef = await seedRequest(paidId, 'completed');
  await db.collection('servicePaymentOperations').doc(paidId).set({ status: 'paid', activeAttemptId: 'attempt-2' });
  const paidClaim = await claimServiceFinancialOperation({
    db, requestRef: paidRequestRef, requestId: paidId, operationType: 'completion', amount: 25, settlementData: settlementData(paidId), allowRetry: true,
  });
  assert.equal(paidClaim.action, 'settled');
  assert.equal(paidClaim.paymentOperation.status, 'paid');
  assert.equal((await paidClaim.operationRef.get()).exists, false);
});

test('repeated successful cancellation reuses the settled operation', { skip }, async () => {
  const id = `cancellation-replay-${randomUUID()}`;
  await seedRequest(id);
  const first = await claimService(id, 'customer_cancellation');
  await settleService(first, id, 'success');
  const replay = await claimService(id, 'customer_cancellation');
  assert.equal(replay.action, 'settled');
  assert.equal(replay.operation.finalOutcome, 'success');
});

test('confirmed failed payment debt and successful retry write exactly one debit and one reversal', { skip }, async () => {
  const id = `service-retry-${randomUUID()}`;
  await seedRequest(id);
  const first = await claimService(id);
  await settleService(first, id, 'failed_confirmed');
  await settleService(first, id, 'failed_confirmed');
  let wallet = (await db.collection('users').doc(`customer-${id}`).get()).data().wallet;
  assert.equal(wallet.balance, 75);
  const retry = await claimService(id, 'completion', true);
  assert.equal(retry.action, 'charge');
  assert.notEqual(retry.operation.gatewayReference, first.operation.gatewayReference);
  await settleService(retry, id, 'success');
  wallet = (await db.collection('users').doc(`customer-${id}`).get()).data().wallet;
  assert.equal(wallet.balance, 100);
  const ledger = await db.collection('financialLedger').where('operationId', '==', first.operationId).get();
  assert.equal(ledger.size, 2);
});

test('Paystack accepted then local work failed is recovered by verification without a second charge', { skip }, async () => {
  const id = `service-post-timeout-${randomUUID()}`;
  await seedRequest(id);
  const initialClaim = await claimService(id);
  let chargeCalls = 0;
  let verifyCalls = 0;
  const paystack = {
    async chargeAuthorization() { chargeCalls += 1; return { accepted: true }; },
    async verifyTransaction() {
      verifyCalls += 1;
      return { outcome: 'success', transaction: { id: `tx-${id}`, status: 'success' } };
    },
  };
  const first = await executeServiceChargeAttempt({ operation: initialClaim.operation, action: 'charge', authorizationCode: 'mock', paystack });
  assert.equal(first.outcome, 'success');
  // Simulate a process failure after Paystack accepted but before local settlement.
  const replayClaim = await claimService(id);
  assert.equal(replayClaim.action, 'reconcile');
  const replay = await executeServiceChargeAttempt({ operation: replayClaim.operation, action: 'reconcile', authorizationCode: 'mock', paystack });
  await settleService(replayClaim, id, replay.outcome);
  assert.equal(replay.outcome, 'success');
  assert.equal(chargeCalls, 1);
  assert.equal(verifyCalls, 2);
});

test('unknown Paystack charge outcomes remain reconciling and are never treated as failed charges', { skip }, async () => {
  const id = `service-unknown-${randomUUID()}`;
  await seedRequest(id);
  const claim = await claimService(id);
  let chargeCalls = 0;
  const paystack = {
    async chargeAuthorization() { chargeCalls += 1; throw new Error('timeout'); },
    async verifyTransaction() { return { outcome: 'unknown', reason: 'verify_timeout' }; },
  };
  const outcome = await executeServiceChargeAttempt({ operation: claim.operation, action: 'charge', authorizationCode: 'mock', paystack });
  await settleService(claim, id, outcome.outcome);
  const request = (await requestRefFor(id).get()).data();
  const wallet = (await db.collection('users').doc(`customer-${id}`).get()).data().wallet;
  assert.equal(request.paymentStatus, 'payment_reconciliation_required');
  assert.equal(wallet.balance, 100);
  assert.equal(chargeCalls, 1);
  const replay = await claimService(id);
  assert.equal(replay.action, 'reconcile');
  assert.equal(chargeCalls, 1);
});

test('2 and 5 overlapping payout runs produce one transfer claim with a stable reference', { skip }, async () => {
  for (const count of [2, 5]) {
    const payoutId = `payout-${count}-${randomUUID()}`;
    const payoutRef = db.collection('helperWeeklyPayouts').doc(payoutId);
    const helperId = `helper-${payoutId}`;
    const weekKey = '2026-W42';
    await payoutRef.set({ helperId, weekKey, helperAmount: 150, status: 'unpaid', transferAttempts: 0 });
    const claims = await Promise.all(Array.from({ length: count }, () => claimPayoutTransfer({
      db,
      admin,
      payoutRef,
      payoutId,
      helperId,
      weekKey,
      runKey: 'weekly-2026-W43',
      amount: 150,
      recipientCode: 'RCP_mock',
    })));
    const transfers = claims.filter((claim) => claim.action === 'transfer');
    assert.equal(transfers.length, 1);
    assert.equal(claims.filter((claim) => claim.action === 'reconcile').length, count - 1);
    let transferCalls = 0;
    const paystack = {
      async initiateTransfer() { transferCalls += 1; return { status: 'pending' }; },
      async verifyTransfer({ reference, amountMinor, currency }) {
        return { outcome: 'pending', transfer: { status: 'pending', reference, amount: amountMinor, currency } };
      },
    };
    await Promise.all(claims.map((claim) => executePayoutTransferAttempt({
      claim,
      amount: 150,
      recipientCode: 'RCP_mock',
      reason: 'weekly payout',
      paystack,
    })));
    assert.equal(transferCalls, 1);
    const replay = await claimPayoutTransfer({
      db, admin, payoutRef, payoutId, helperId, weekKey, runKey: 'weekly-2026-W43', amount: 150, recipientCode: 'RCP_mock',
    });
    assert.equal(replay.action, 'reconcile');
    assert.equal(replay.reference, transfers[0].attempt.reference);
  }
});

test('pending payout remains processing and confirmed success cannot be downgraded', { skip }, async () => {
  const payoutId = `payout-status-${randomUUID()}`;
  const payoutRef = db.collection('helperWeeklyPayouts').doc(payoutId);
  const helperId = `helper-${payoutId}`;
  const weekKey = '2026-W42';
  await payoutRef.set({ helperId, weekKey, helperAmount: 25, status: 'unpaid', transferAttempts: 0 });
  const claim = await claimPayoutTransfer({ db, admin, payoutRef, payoutId, helperId, weekKey, runKey: 'run-1', amount: 25, recipientCode: 'RCP_mock' });
  const record = (outcome, transferStatus) => recordPayoutObservation({
    db, admin, payoutRef, transferAttemptRef: claim.transferAttemptRef, referenceRef: claim.referenceRef,
    reference: claim.attempt.reference, outcome, transfer: { reference: claim.attempt.reference, status: transferStatus, amount: 2500, currency: 'ZAR' },
  });
  await record('pending', 'pending');
  assert.equal((await payoutRef.get()).data().status, 'processing');
  await record('success', 'success');
  assert.equal((await payoutRef.get()).data().status, 'paid');
  const stale = await record('pending', 'pending');
  assert.equal(stale.duplicate, true);
  assert.equal((await payoutRef.get()).data().status, 'paid');
});

test('payout failure is retried only on a new payout run with a new deterministic attempt reference', { skip }, async () => {
  const payoutId = `payout-retry-${randomUUID()}`;
  const payoutRef = db.collection('helperWeeklyPayouts').doc(payoutId);
  const helperId = `helper-${payoutId}`;
  const weekKey = '2026-W42';
  await payoutRef.set({ helperId, weekKey, helperAmount: 50, status: 'unpaid', transferAttempts: 0 });
  const first = await claimPayoutTransfer({ db, admin, payoutRef, payoutId, helperId, weekKey, runKey: 'run-1', amount: 50, recipientCode: 'RCP_mock' });
  await recordPayoutObservation({
    db, admin, payoutRef, transferAttemptRef: first.transferAttemptRef, referenceRef: first.referenceRef,
    reference: first.attempt.reference, outcome: 'failed_confirmed', transfer: { reference: first.attempt.reference, status: 'failed', amount: 5000, currency: 'ZAR' },
  });
  const duplicateRun = await claimPayoutTransfer({ db, admin, payoutRef, payoutId, helperId, weekKey, runKey: 'run-1', amount: 50, recipientCode: 'RCP_mock' });
  assert.equal(duplicateRun.action, 'already_attempted_this_run');
  const retry = await claimPayoutTransfer({ db, admin, payoutRef, payoutId, helperId, weekKey, runKey: 'run-2', amount: 50, recipientCode: 'RCP_mock' });
  assert.equal(retry.action, 'transfer');
  assert.equal(retry.attempt.attemptNo, 2);
  assert.notEqual(retry.attempt.reference, first.attempt.reference);
});

test('stale payout leases reconcile the same reference rather than creating another transfer', { skip }, async () => {
  const payoutId = `payout-stale-${randomUUID()}`;
  const payoutRef = db.collection('helperWeeklyPayouts').doc(payoutId);
  const helperId = `helper-${payoutId}`;
  const weekKey = '2026-W42';
  await payoutRef.set({ helperId, weekKey, helperAmount: 80, status: 'unpaid', transferAttempts: 0 });
  const first = await claimPayoutTransfer({ db, admin, payoutRef, payoutId, helperId, weekKey, runKey: 'run-1', amount: 80, recipientCode: 'RCP_mock' });
  await payoutRef.set({ leaseExpiresAtMs: Date.now() - 120_000 }, { merge: true });
  const recovery = await claimPayoutTransfer({ db, admin, payoutRef, payoutId, helperId, weekKey, runKey: 'run-2', amount: 80, recipientCode: 'RCP_mock' });
  assert.equal(recovery.action, 'reconcile');
  assert.equal(recovery.reference, first.attempt.reference);
});

test('reversed payout is not treated as paid and can be retried in a later payout run', { skip }, async () => {
  const payoutId = `payout-reversed-${randomUUID()}`;
  const payoutRef = db.collection('helperWeeklyPayouts').doc(payoutId);
  const helperId = `helper-${payoutId}`;
  const weekKey = '2026-W42';
  await payoutRef.set({ helperId, weekKey, helperAmount: 35, status: 'unpaid', transferAttempts: 0 });
  const first = await claimPayoutTransfer({ db, admin, payoutRef, payoutId, helperId, weekKey, runKey: 'run-1', amount: 35, recipientCode: 'RCP_mock' });
  await recordPayoutObservation({
    db, admin, payoutRef, transferAttemptRef: first.transferAttemptRef, referenceRef: first.referenceRef,
    reference: first.attempt.reference, outcome: 'reversed', transfer: { reference: first.attempt.reference, status: 'reversed', amount: 3500, currency: 'ZAR' },
  });
  assert.equal((await payoutRef.get()).data().status, 'unsuccessful');
  const retry = await claimPayoutTransfer({ db, admin, payoutRef, payoutId, helperId, weekKey, runKey: 'run-2', amount: 35, recipientCode: 'RCP_mock' });
  assert.equal(retry.action, 'transfer');
  assert.notEqual(retry.attempt.reference, first.attempt.reference);
});

test('transfer timeout followed by a verified success does not resubmit the transfer', { skip }, async () => {
  const payoutId = `payout-uncertain-${randomUUID()}`;
  const payoutRef = db.collection('helperWeeklyPayouts').doc(payoutId);
  const helperId = `helper-${payoutId}`;
  const weekKey = '2026-W42';
  await payoutRef.set({ helperId, weekKey, helperAmount: 40, status: 'unpaid', transferAttempts: 0 });
  const firstClaim = await claimPayoutTransfer({ db, admin, payoutRef, payoutId, helperId, weekKey, runKey: 'run-1', amount: 40, recipientCode: 'RCP_mock' });
  let transferCalls = 0;
  let verifyCalls = 0;
  const paystack = {
    async initiateTransfer() {
      transferCalls += 1;
      throw Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
    },
    async verifyTransfer() {
      verifyCalls += 1;
      return { outcome: 'success', transfer: { id: 'transfer-1', reference: firstClaim.attempt.reference, status: 'success', amount: 4000, currency: 'ZAR' } };
    },
  };
  const first = await executePayoutTransferAttempt({ claim: firstClaim, amount: 40, recipientCode: 'RCP_mock', reason: 'weekly', paystack });
  assert.equal(first.transferRequestErrorCode, 'ECONNRESET');
  const replayClaim = await claimPayoutTransfer({ db, admin, payoutRef, payoutId, helperId, weekKey, runKey: 'run-2', amount: 40, recipientCode: 'RCP_mock' });
  assert.equal(replayClaim.action, 'reconcile');
  const replay = await executePayoutTransferAttempt({ claim: replayClaim, amount: 40, recipientCode: 'RCP_mock', reason: 'weekly', paystack });
  assert.equal(replay.verification.outcome, 'success');
  assert.equal(transferCalls, 1);
  assert.equal(verifyCalls, 2);
});
