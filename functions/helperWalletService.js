'use strict';

const { createHash } = require('node:crypto');

const HELPER_WALLETS = 'helperWallets';

function hash(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function helperWalletReference(db, helperId) {
  const id = String(helperId || '').trim();
  if (!id || id.includes('/')) throw new Error('A valid helper ID is required.');
  return db.collection(HELPER_WALLETS).doc(id);
}

function emptyHelperWallet(helperId, now = Date.now()) {
  return {
    helperId: String(helperId || ''),
    currency: 'ZAR',
    availableMinor: 0,
    reservedMinor: 0,
    outstandingCommissionMinor: 0,
    reconciliationBlocked: false,
    schemaVersion: 1,
    createdAtMs: now,
    updatedAtMs: now,
  };
}

function minorAmount(value) {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function commissionObligationId(requestId) {
  return `cash_${hash(requestId).slice(0, 40)}`;
}

function walletLedgerId(operationId, entryType) {
  return `${String(entryType || 'entry').slice(0, 24)}_${hash(operationId).slice(0, 40)}`;
}

function walletLedgerReference(walletRef, ledgerId) {
  return walletRef.collection('transactions').doc(String(ledgerId));
}

function walletObligationReference(walletRef, requestId) {
  return walletRef.collection('commissionObligations').doc(commissionObligationId(requestId));
}

function walletFromSnapshot(snapshot, helperId, now = Date.now()) {
  return snapshot?.exists ? { ...emptyHelperWallet(helperId, now), ...(snapshot.data() || {}) } : emptyHelperWallet(helperId, now);
}

function walletBalanceIsValid(wallet = {}) {
  return ['availableMinor', 'reservedMinor', 'outstandingCommissionMinor'].every((field) => (
    Number.isSafeInteger(Number(wallet[field] || 0)) && Number(wallet[field] || 0) >= 0
  ));
}

function isWalletEarningEligible(request = {}) {
  if (Number(request.helperWalletAccountingVersion) !== 1) return false;
  if (String(request.paymentStatus || '').toLowerCase() !== 'paid') return false;
  return String(request.cashPayment?.status || '').toLowerCase() !== 'helper_confirmed';
}

function writeWalletLedger(transaction, reference, entry) {
  transaction.create(reference, {
    ...entry,
    entryId: reference.id,
    currency: 'ZAR',
    createdAtMs: Number(entry.createdAtMs || Date.now()),
  });
}

/**
 * Record the platform commission when an assigned helper confirms a direct cash payment.
 * Call this before the parent Firestore transaction performs its first write.
 */
async function applyCashCommissionInTransaction({ transaction, db, helperId, requestId, commissionMinor, now = Date.now() }) {
  const normalizedCommission = minorAmount(commissionMinor);
  if (!normalizedCommission || !helperId || !requestId) return { applied: false, reason: 'invalid-commission' };

  const walletRef = helperWalletReference(db, helperId);
  const obligationRef = walletObligationReference(walletRef, requestId);
  const ledgerRef = walletLedgerReference(walletRef, walletLedgerId(`cash:${requestId}`, 'cash_commission'));
  const [walletSnapshot, obligationSnapshot, ledgerSnapshot] = await Promise.all([
    transaction.get(walletRef), transaction.get(obligationRef), transaction.get(ledgerRef),
  ]);
  if (ledgerSnapshot.exists) return { applied: false, duplicate: true };

  const current = walletFromSnapshot(walletSnapshot, helperId, now);
  if (!walletBalanceIsValid(current)) return { applied: false, reason: 'invalid-wallet-balance' };
  const availableMinor = Math.max(0, Number(current.availableMinor || 0));
  const recoveredMinor = Math.min(availableMinor, normalizedCommission);
  const outstandingMinor = normalizedCommission - recoveredMinor;
  const priorObligation = obligationSnapshot.exists ? obligationSnapshot.data() || {} : {};
  if (obligationSnapshot.exists) return { applied: false, reason: 'commission-obligation-exists-without-ledger' };

  const next = {
    ...current,
    availableMinor: availableMinor - recoveredMinor,
    outstandingCommissionMinor: Math.max(0, Number(current.outstandingCommissionMinor || 0)) + outstandingMinor,
    updatedAtMs: now,
  };
  transaction.set(walletRef, next, { merge: true });
  transaction.set(obligationRef, {
    obligationId: obligationRef.id,
    helperId,
    requestId,
    currency: 'ZAR',
    originalMinor: normalizedCommission,
    recoveredMinor,
    outstandingMinor,
    status: outstandingMinor > 0 ? 'outstanding' : 'recovered',
    createdAtMs: Number(priorObligation.createdAtMs || now),
    updatedAtMs: now,
  }, { merge: true });
  writeWalletLedger(transaction, ledgerRef, {
    operationId: `cash_commission:${requestId}`,
    requestId,
    helperId,
    entryType: 'cash_commission_assessed',
    amountMinor: normalizedCommission,
    availableDeltaMinor: -recoveredMinor,
    outstandingCommissionDeltaMinor: outstandingMinor,
    availableBeforeMinor: availableMinor,
    availableAfterMinor: next.availableMinor,
    description: outstandingMinor > 0 ? 'Cash payment commission assessed; remaining amount is outstanding.' : 'Cash payment commission deducted from wallet.',
    createdAtMs: now,
  });
  return { applied: true, recoveredMinor, outstandingMinor, wallet: next };
}

/** Read-only credit of a new, versioned weekly earning. Legacy payout records are never imported. */
async function creditHelperWalletEarning({ db, helperId, requestId, amountMinor, sourceWeekKey = '', sourcePayoutId = '', now = Date.now() }) {
  const normalizedAmount = minorAmount(amountMinor);
  if (!normalizedAmount || !helperId || !requestId) return { action: 'invalid' };
  const walletRef = helperWalletReference(db, helperId);
  const earningId = `earning_${hash(requestId).slice(0, 40)}`;
  const earningRef = walletLedgerReference(walletRef, earningId);
  const recoveryId = walletLedgerId(`earning-recovery:${requestId}`, 'commission_recovery');
  const recoveryRef = walletLedgerReference(walletRef, recoveryId);
  const obligationsQuery = walletRef.collection('commissionObligations')
    .where('status', '==', 'outstanding')
    .orderBy('createdAtMs', 'asc')
    .limit(100);

  return db.runTransaction(async (transaction) => {
    const [walletSnapshot, earningSnapshot, recoverySnapshot, obligationsSnapshot] = await Promise.all([
      transaction.get(walletRef), transaction.get(earningRef), transaction.get(recoveryRef), transaction.get(obligationsQuery),
    ]);
    if (earningSnapshot.exists) return { action: 'duplicate', wallet: walletFromSnapshot(walletSnapshot, helperId, now) };
    const current = walletFromSnapshot(walletSnapshot, helperId, now);
    if (current.reconciliationBlocked || !walletBalanceIsValid(current)) return { action: 'reconciliation-blocked', wallet: current };
    let availableMinor = Number(current.availableMinor || 0) + normalizedAmount;
    let outstandingCommissionMinor = Number(current.outstandingCommissionMinor || 0);
    let recoveredMinor = 0;
    const obligationUpdates = [];
    if (!recoverySnapshot.exists) {
      for (const obligationDoc of obligationsSnapshot.docs || []) {
        if (availableMinor <= 0) break;
        const obligation = obligationDoc.data() || {};
        const due = Math.max(0, Number(obligation.outstandingMinor || 0));
        const recovered = Math.min(availableMinor, due);
        if (!recovered) continue;
        availableMinor -= recovered;
        outstandingCommissionMinor = Math.max(0, outstandingCommissionMinor - recovered);
        recoveredMinor += recovered;
        obligationUpdates.push({
          ref: obligationDoc.ref,
          value: {
            recoveredMinor: Number(obligation.recoveredMinor || 0) + recovered,
            outstandingMinor: due - recovered,
            status: due - recovered === 0 ? 'recovered' : 'outstanding',
            updatedAtMs: now,
            lastRecoveryOperationId: `earning:${requestId}`,
          },
        });
      }
    }
    const next = {
      ...current,
      availableMinor,
      outstandingCommissionMinor: Math.max(0, outstandingCommissionMinor),
      updatedAtMs: now,
    };
    transaction.set(walletRef, next, { merge: true });
    writeWalletLedger(transaction, earningRef, {
      operationId: `earning:${requestId}`,
      requestId,
      helperId,
      ...(sourcePayoutId ? { sourcePayoutId: String(sourcePayoutId) } : {}),
      ...(sourceWeekKey ? { sourceWeekKey: String(sourceWeekKey) } : {}),
      entryType: 'weekly_earning_credit',
      amountMinor: normalizedAmount,
      availableDeltaMinor: normalizedAmount,
      availableBeforeMinor: Number(current.availableMinor || 0),
      availableAfterMinor: Number(current.availableMinor || 0) + normalizedAmount,
      description: 'New eligible weekly service earnings credited to helper wallet.',
      createdAtMs: now,
    });
    obligationUpdates.forEach(({ ref, value }) => transaction.set(ref, value, { merge: true }));
    if (recoveredMinor > 0 && !recoverySnapshot.exists) {
      writeWalletLedger(transaction, recoveryRef, {
        operationId: `earning:${requestId}`,
        requestId,
        helperId,
        entryType: 'commission_recovery',
        amountMinor: recoveredMinor,
        availableDeltaMinor: -recoveredMinor,
        outstandingCommissionDeltaMinor: -recoveredMinor,
        availableBeforeMinor: Number(current.availableMinor || 0) + normalizedAmount,
        availableAfterMinor: availableMinor,
        description: 'Outstanding cash commission recovered from new weekly earnings.',
        createdAtMs: now,
      });
    }
    return { action: 'credited', amountMinor: normalizedAmount, recoveredMinor, wallet: next };
  });
}

function normalizeWalletForClient(wallet = {}) {
  const balance = (value) => Number.isSafeInteger(Number(value)) ? Math.max(0, Number(value)) : 0;
  return {
    currency: 'ZAR',
    availableMinor: balance(wallet.availableMinor || 0),
    reservedMinor: balance(wallet.reservedMinor || 0),
    outstandingCommissionMinor: balance(wallet.outstandingCommissionMinor || 0),
    reconciliationBlocked: wallet.reconciliationBlocked === true,
    updatedAtMs: Number(wallet.updatedAtMs || 0),
  };
}

module.exports = {
  HELPER_WALLETS,
  applyCashCommissionInTransaction,
  creditHelperWalletEarning,
  emptyHelperWallet,
  helperWalletReference,
  isWalletEarningEligible,
  minorAmount,
  normalizeWalletForClient,
  walletFromSnapshot,
  walletBalanceIsValid,
  walletLedgerId,
  walletLedgerReference,
  walletObligationReference,
  writeWalletLedger,
};
