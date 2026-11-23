'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const admin = require('firebase-admin');
const {
  applyHelperPayoutInTransaction,
  creditHelperWalletEarning,
  emptyHelperWallet,
  helperWalletReference,
} = require('../helperWalletService');
const { claimPayoutTransfer, recordPayoutObservation } = require('../financialOperationService');

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const app = emulatorAvailable
  ? admin.initializeApp({ projectId: 'demo-uncedo-helper-wallet-tests' }, `helper-wallet-${randomUUID()}`)
  : null;
const db = app?.firestore();
const skip = emulatorAvailable ? false : 'Set FIRESTORE_EMULATOR_HOST or run through firebase emulators:exec.';

test('a new wallet has zero balanceMinor and schemaVersion 2', { skip }, async () => {
  const wallet = emptyHelperWallet(`helper-${randomUUID()}`);
  assert.equal(wallet.balanceMinor, 0);
  assert.equal(wallet.balance, 0);
  assert.equal(wallet.schemaVersion, 2);
});

test('non-cash earning credit is idempotent under concurrent retries and offsets negative cash commission balance', { skip }, async () => {
  const helperId = `helper-${randomUUID()}`;
  const requestId = `request-${randomUUID()}`;
  const walletRef = helperWalletReference(db, helperId);
  const userRef = db.collection('users').doc(helperId);
  await userRef.set({ uid: helperId, wallet: { balance: 0, balanceMinor: 0, currency: 'ZAR' } });
  await walletRef.set({ ...emptyHelperWallet(helperId), balanceMinor: 0 });

  // Simulate R50 cash job (R43 helper payout + R7 commission -> +4300 - 700 = +3600)
  await db.runTransaction((transaction) => applyHelperPayoutInTransaction({
    transaction,
    db,
    helperId,
    requestId: `cash-${randomUUID()}`,
    helperAmountMinor: 4300,
    platformAmountMinor: 700,
    customerChargeAmountMinor: 5000,
    isCash: true,
  }));

  const results = await Promise.all(Array.from({ length: 5 }, () => creditHelperWalletEarning({
    db, helperId, requestId, amountMinor: 1000, sourceWeekKey: '2026-W42',
  })));
  assert.equal(results.filter((result) => result.action === 'credited').length, 1);
  const wallet = (await walletRef.get()).data();
  const user = (await userRef.get()).data();
  assert.equal(wallet.balanceMinor, 4600);
  assert.equal(wallet.balance, 46);
  assert.equal(user.wallet.balanceMinor, 4600);
  const ledger = await walletRef.collection('transactions').get();
  assert.equal(ledger.docs.filter((doc) => doc.data().entryType === 'weekly_earning_credit').length, 1);
  assert.equal(ledger.docs.filter((doc) => doc.data().entryType === 'job_earning_credit').length, 1);
  assert.equal(ledger.docs.filter((doc) => doc.data().entryType === 'cash_commission_assessed').length, 1);
});

test('wallet payout claim is exclusive, leaves balance untouched if failed, and resets to zero on success', { skip }, async () => {
  const helperId = `helper-${randomUUID()}`;
  const weekKey = `2026-W${String(Math.floor(Math.random() * 52) + 1).padStart(2, '0')}`;
  const payoutId = `wallet_${weekKey}_${helperId}`;
  const payoutRef = db.collection('helperWeeklyPayouts').doc(payoutId);
  const walletRef = helperWalletReference(db, helperId);
  const userRef = db.collection('users').doc(helperId);
  await userRef.set({ uid: helperId, wallet: { balance: 123.45, balanceMinor: 12345, currency: 'ZAR' } });
  await walletRef.set({ ...emptyHelperWallet(helperId), balanceMinor: 12345, balance: 123.45 });
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
  assert.equal(transferClaim.attempt.walletFundsReserved, false);
  const currentWallet = (await walletRef.get()).data();
  assert.equal(currentWallet.balanceMinor, 12345);

  const attemptRef = transferClaim.transferAttemptRef;
  const reference = transferClaim.attempt.reference;
  const first = await recordPayoutObservation({ db, admin, payoutRef, transferAttemptRef: attemptRef, reference, outcome: 'failed_confirmed', transfer: { status: 'failed' } });
  const replay = await recordPayoutObservation({ db, admin, payoutRef, transferAttemptRef: attemptRef, reference, outcome: 'failed_confirmed', transfer: { status: 'failed' } });
  assert.equal(first.updated, true);
  assert.equal(replay.updated, true);
  const untouched = (await walletRef.get()).data();
  assert.equal(untouched.balanceMinor, 12345);
  assert.equal((await userRef.get()).data().wallet.balanceMinor, 12345);
  assert.equal((await payoutRef.get()).data().status, 'unsuccessful');

  const retryClaim = await claimPayoutTransfer({
    db, admin, payoutRef, payoutId, helperId, weekKey, runKey: 'retry-success-run', amount: 123.45, recipientCode: 'RCP_test',
  });
  assert.equal(retryClaim.action, 'transfer');
  await recordPayoutObservation({
    db, admin, payoutRef, transferAttemptRef: retryClaim.transferAttemptRef, reference: retryClaim.attempt.reference, outcome: 'success', transfer: { id: 'transfer-ok', status: 'success' },
  });
  const settledWallet = (await walletRef.get()).data();
  assert.equal(settledWallet.balanceMinor, 0);
  assert.equal((await userRef.get()).data().wallet.balanceMinor, 0);
  assert.equal((await payoutRef.get()).data().status, 'paid');
  const ledger = await walletRef.collection('transactions').get();
  assert.equal(ledger.docs.filter((doc) => doc.data().entryType === 'payout_debit').length, 1);
});

test('Monday payout skips helpers with zero or negative wallet balance', { skip }, async () => {
  for (const balanceMinor of [0, -2500]) {
    const helperId = `helper-${randomUUID()}`;
    const weekKey = '2027-W04';
    const payoutId = `wallet_${weekKey}_${helperId}`;
    const payoutRef = db.collection('helperWeeklyPayouts').doc(payoutId);
    const walletRef = helperWalletReference(db, helperId);
    await walletRef.set({ ...emptyHelperWallet(helperId), balanceMinor, balance: balanceMinor / 100 });
    await payoutRef.set({ id: payoutId, helperId, weekKey, walletAccountingVersion: 1, helperAmount: 0, amountMinor: 0, status: 'unpaid', transferAttempts: 0 });
    const claim = await claimPayoutTransfer({
      db, admin, payoutRef, payoutId, helperId, weekKey, runKey: 'skip-run', amount: 0, recipientCode: 'RCP_test',
    });
    assert.equal(claim.action, 'no_wallet_balance');
    assert.equal((await walletRef.get()).data().balanceMinor, balanceMinor);
  }
});

test.after(async () => {
  if (app) await app.delete().catch(() => null);
});
