'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const admin = require('firebase-admin');
const { creditHelperWalletEarning, emptyHelperWallet, helperWalletReference } = require('../helperWalletService');
const { claimPayoutTransfer, recordPayoutObservation } = require('../financialOperationService');

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const app = emulatorAvailable
  ? admin.initializeApp({ projectId: 'demo-uncedo-helper-wallet-tests' }, `helper-wallet-${randomUUID()}`)
  : null;
const db = app?.firestore();
const skip = emulatorAvailable ? false : 'Set FIRESTORE_EMULATOR_HOST or run through firebase emulators:exec.';

test('a new wallet has zero-cent balances and no imported payout opening amount', { skip }, async () => {
  const wallet = emptyHelperWallet(`helper-${randomUUID()}`);
  assert.equal(wallet.availableMinor, 0);
  assert.equal(wallet.reservedMinor, 0);
  assert.equal(wallet.outstandingCommissionMinor, 0);
  assert.equal(wallet.schemaVersion, 1);
});

test('weekly earning credit is idempotent under concurrent retries and recovers commission', { skip }, async () => {
  const helperId = `helper-${randomUUID()}`;
  const requestId = `request-${randomUUID()}`;
  const walletRef = helperWalletReference(db, helperId);
  await walletRef.set({ ...emptyHelperWallet(helperId), availableMinor: 0, outstandingCommissionMinor: 700 });
  const obligationRef = walletRef.collection('commissionObligations').doc(`cash_${require('node:crypto').createHash('sha256').update('cash-request').digest('hex').slice(0, 40)}`);
  await obligationRef.set({ helperId, requestId: 'cash-request', originalMinor: 1000, recoveredMinor: 300, outstandingMinor: 700, status: 'outstanding', createdAtMs: 1 });

  const results = await Promise.all(Array.from({ length: 5 }, () => creditHelperWalletEarning({
    db, helperId, requestId, amountMinor: 1000, sourceWeekKey: '2026-W42',
  })));
  assert.equal(results.filter((result) => result.action === 'credited').length, 1);
  const wallet = (await walletRef.get()).data();
  const obligation = (await obligationRef.get()).data();
  assert.equal(wallet.availableMinor, 300);
  assert.equal(wallet.outstandingCommissionMinor, 0);
  assert.equal(obligation.outstandingMinor, 0);
  assert.equal(obligation.recoveredMinor, 1000);
  const ledger = await walletRef.collection('transactions').get();
  assert.equal(ledger.docs.filter((doc) => doc.data().entryType === 'weekly_earning_credit').length, 1);
  assert.equal(ledger.docs.filter((doc) => doc.data().entryType === 'commission_recovery').length, 1);
});

test('wallet payout reservation is exclusive and a confirmed failure restores funds exactly once', { skip }, async () => {
  const helperId = `helper-${randomUUID()}`;
  const weekKey = `2026-W${String(Math.floor(Math.random() * 52) + 1).padStart(2, '0')}`;
  const payoutId = `wallet_${weekKey}_${helperId}`;
  const payoutRef = db.collection('helperWeeklyPayouts').doc(payoutId);
  const walletRef = helperWalletReference(db, helperId);
  await walletRef.set({ ...emptyHelperWallet(helperId), availableMinor: 12345 });
  await payoutRef.set({ id: payoutId, helperId, weekKey, walletAccountingVersion: 1, helperAmount: 123.45, amountMinor: 12345, status: 'unpaid', transferAttempts: 0 });

  const claims = await Promise.all(Array.from({ length: 5 }, () => claimPayoutTransfer({
    db,
    admin,
    payoutRef,
    payoutId,
    helperId,
    weekKey,
    runKey: `run-${randomUUID()}`,
    amount: 123.45,
    recipientCode: 'RCP_test',
  })));
  const transferClaim = claims.find((claim) => claim.action === 'transfer');
  assert.ok(transferClaim);
  assert.equal(transferClaim.attempt.amountMinor, 12345);
  const currentWallet = (await walletRef.get()).data();
  assert.equal(currentWallet.availableMinor, 0);
  assert.equal(currentWallet.reservedMinor, 12345);

  const attemptRef = transferClaim.transferAttemptRef;
  const reference = transferClaim.attempt.reference;
  const first = await recordPayoutObservation({ db, admin, payoutRef, transferAttemptRef: attemptRef, reference, outcome: 'failed_confirmed', transfer: { status: 'failed' } });
  const replay = await recordPayoutObservation({ db, admin, payoutRef, transferAttemptRef: attemptRef, reference, outcome: 'failed_confirmed', transfer: { status: 'failed' } });
  assert.equal(first.updated, true);
  assert.equal(replay.updated, true);
  const restored = (await walletRef.get()).data();
  assert.equal(restored.availableMinor, 12345);
  assert.equal(restored.reservedMinor, 0);
  assert.equal((await payoutRef.get()).data().status, 'wallet_recovery');
  const ledger = await walletRef.collection('transactions').get();
  assert.equal(ledger.docs.filter((doc) => doc.data().entryType === 'payout_reservation').length, 1);
  assert.equal(ledger.docs.filter((doc) => doc.data().entryType === 'payout_reservation_release').length, 1);
  assert.equal((await claimPayoutTransfer({ db, admin, payoutRef, payoutId, helperId, weekKey, runKey: 'retry', amount: 123.45, recipientCode: 'RCP_test' })).action, 'wallet_recovered');
});

test('late confirmed payout success debits recovered funds or blocks conflicting wallet activity without going negative', { skip }, async () => {
  const helperId = `helper-${randomUUID()}`;
  const weekKey = `2027-W01`;
  const payoutId = `wallet_${weekKey}_${helperId}`;
  const payoutRef = db.collection('helperWeeklyPayouts').doc(payoutId);
  const walletRef = helperWalletReference(db, helperId);
  await walletRef.set({ ...emptyHelperWallet(helperId), availableMinor: 5000 });
  await payoutRef.set({ id: payoutId, helperId, weekKey, walletAccountingVersion: 1, helperAmount: 50, amountMinor: 5000, status: 'unpaid', transferAttempts: 0 });
  const claim = await claimPayoutTransfer({ db, admin, payoutRef, payoutId, helperId, weekKey, runKey: 'late-run', amount: 50, recipientCode: 'RCP_test' });
  const reference = claim.attempt.reference;
  await recordPayoutObservation({ db, admin, payoutRef, transferAttemptRef: claim.transferAttemptRef, reference, outcome: 'failed_confirmed', transfer: { status: 'failed' } });
  await walletRef.update({ availableMinor: 0 });
  const lateSuccess = await recordPayoutObservation({ db, admin, payoutRef, transferAttemptRef: claim.transferAttemptRef, reference, outcome: 'success', transfer: { status: 'success', id: 'transfer-test' } });
  assert.equal(lateSuccess.updated, true);
  const wallet = (await walletRef.get()).data();
  const payout = (await payoutRef.get()).data();
  assert.equal(wallet.availableMinor, 0);
  assert.equal(wallet.reconciliationBlocked, true);
  assert.equal(payout.status, 'paid');
  assert.equal(payout.operationStatus, 'manual_reconciliation_required');
});

test('late success after failed transfer debits funds still available in the wallet', { skip }, async () => {
  const helperId = `helper-${randomUUID()}`;
  const weekKey = '2027-W03';
  const payoutId = `wallet_${weekKey}_${helperId}`;
  const payoutRef = db.collection('helperWeeklyPayouts').doc(payoutId);
  const walletRef = helperWalletReference(db, helperId);
  await walletRef.set({ ...emptyHelperWallet(helperId), availableMinor: 5000 });
  await payoutRef.set({ id: payoutId, helperId, weekKey, walletAccountingVersion: 1, helperAmount: 50, amountMinor: 5000, status: 'unpaid', transferAttempts: 0 });
  const claim = await claimPayoutTransfer({ db, admin, payoutRef, payoutId, helperId, weekKey, runKey: 'late-success-run', amount: 50, recipientCode: 'RCP_test' });
  const reference = claim.attempt.reference;
  await recordPayoutObservation({ db, admin, payoutRef, transferAttemptRef: claim.transferAttemptRef, reference, outcome: 'failed_confirmed', transfer: { status: 'failed' } });
  const lateSuccess = await recordPayoutObservation({ db, admin, payoutRef, transferAttemptRef: claim.transferAttemptRef, reference, outcome: 'success', transfer: { status: 'success', id: 'transfer-late-success' } });
  assert.equal(lateSuccess.updated, true);
  const wallet = (await walletRef.get()).data();
  assert.equal(wallet.availableMinor, 0);
  assert.equal(wallet.reservedMinor, 0);
  assert.equal(wallet.reconciliationBlocked, false);
  assert.equal((await payoutRef.get()).data().status, 'paid');
  const ledger = await walletRef.collection('transactions').get();
  assert.equal(ledger.docs.filter((doc) => doc.data().entryType === 'late_payout_debit').length, 1);
});

test('successful wallet payout consumes reserved funds and pending outcomes keep them reserved', { skip }, async () => {
  const helperId = `helper-${randomUUID()}`;
  const weekKey = '2027-W02';
  const payoutId = `wallet_${weekKey}_${helperId}`;
  const payoutRef = db.collection('helperWeeklyPayouts').doc(payoutId);
  const walletRef = helperWalletReference(db, helperId);
  await walletRef.set({ ...emptyHelperWallet(helperId), availableMinor: 7800 });
  await payoutRef.set({ id: payoutId, helperId, weekKey, walletAccountingVersion: 1, helperAmount: 78, amountMinor: 7800, status: 'unpaid', transferAttempts: 0 });
  const claim = await claimPayoutTransfer({ db, admin, payoutRef, payoutId, helperId, weekKey, runKey: 'success-run', amount: 78, recipientCode: 'RCP_test' });
  const reference = claim.attempt.reference;
  await recordPayoutObservation({ db, admin, payoutRef, transferAttemptRef: claim.transferAttemptRef, reference, outcome: 'pending', transfer: { status: 'pending' } });
  assert.equal((await walletRef.get()).data().reservedMinor, 7800);
  await recordPayoutObservation({ db, admin, payoutRef, transferAttemptRef: claim.transferAttemptRef, reference, outcome: 'success', transfer: { status: 'success', id: 'transfer-success' } });
  const wallet = (await walletRef.get()).data();
  assert.equal(wallet.availableMinor, 0);
  assert.equal(wallet.reservedMinor, 0);
  const ledger = await walletRef.collection('transactions').get();
  assert.equal(ledger.docs.filter((doc) => doc.data().entryType === 'payout_debit').length, 1);
});

test('commission recovery processes bounded pages before reserving payout funds', { skip }, async () => {
  const helperId = `helper-wallet-commission-pages-${randomUUID()}`;
  const weekKey = '2026-W45';
  const payoutId = `wallet_${weekKey}_${helperId}`;
  const walletRef = helperWalletReference(db, helperId);
  await walletRef.set({ ...emptyHelperWallet(helperId), availableMinor: 500000, outstandingCommissionMinor: 1010 });
  const obligations = walletRef.collection('commissionObligations');
  const batch = db.batch();
  for (let index = 0; index < 101; index += 1) {
    batch.set(obligations.doc(`obligation_${String(index).padStart(3, '0')}`), {
      helperId, requestId: `request_${index}`, status: 'outstanding', originalMinor: 10,
      recoveredMinor: 0, outstandingMinor: 10, createdAtMs: index,
    });
  }
  await batch.commit();
  const payoutRef = db.collection('helperWeeklyPayouts').doc(payoutId);
  await payoutRef.set({ id: payoutId, helperId, weekKey, walletAccountingVersion: 1, helperAmount: 5000, amountMinor: 500000, status: 'unpaid', transferAttempts: 0 });

  const first = await claimPayoutTransfer({ db, admin, payoutRef, payoutId, helperId, weekKey, runKey: 'commission-page-1', amount: 5000, recipientCode: 'RCP_test' });
  assert.equal(first.action, 'commission_recovery_pending');
  let wallet = (await walletRef.get()).data();
  assert.equal(wallet.availableMinor, 499000);
  assert.equal(wallet.reservedMinor, 0);
  assert.equal(wallet.outstandingCommissionMinor, 10);

  const second = await claimPayoutTransfer({ db, admin, payoutRef, payoutId, helperId, weekKey, runKey: 'commission-page-2', amount: 4990, recipientCode: 'RCP_test' });
  assert.equal(second.action, 'transfer');
  wallet = (await walletRef.get()).data();
  assert.equal(wallet.availableMinor, 0);
  assert.equal(wallet.reservedMinor, 500000 - 1010);
  assert.equal(wallet.outstandingCommissionMinor, 0);
});

test.after(async () => {
  if (app) await app.delete().catch(() => null);
});
