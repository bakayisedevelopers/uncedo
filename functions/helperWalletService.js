'use strict';

const { createHash } = require('node:crypto');

const HELPER_WALLETS = 'helperWallets';
const USERS_COLLECTION = 'users';

function hash(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function helperWalletReference(db, helperId) {
  const id = String(helperId || '').trim();
  if (!id || id.includes('/')) throw new Error('A valid helper ID is required.');
  return db.collection(HELPER_WALLETS).doc(id);
}

function helperProfileReference(db, helperId) {
  const id = String(helperId || '').trim();
  if (!id || id.includes('/')) throw new Error('A valid helper ID is required.');
  return db.collection(USERS_COLLECTION).doc(id);
}

function toRandFromMinor(minor = 0) {
  const numeric = Number(minor || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Number((numeric / 100).toFixed(2));
}

function profileWalletPayload(balanceMinor = 0, now = Date.now()) {
  const safeMinor = Number.isSafeInteger(Number(balanceMinor)) ? Number(balanceMinor) : 0;
  return {
    balance: toRandFromMinor(safeMinor),
    balanceMinor: safeMinor,
    currency: 'ZAR',
    updatedAt: new Date(now).toISOString(),
    updatedAtMs: now,
  };
}

function resolveSignedBalanceMinor(data = {}) {
  if (data.balanceMinor !== undefined && data.balanceMinor !== null) {
    const parsed = Number(data.balanceMinor);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  const available = Number(data.availableMinor);
  const outstanding = Number(data.outstandingCommissionMinor);
  if (Number.isFinite(available) || Number.isFinite(outstanding)) {
    const safeAvailable = Number.isFinite(available) ? Math.round(available) : 0;
    const safeOutstanding = Number.isFinite(outstanding) ? Math.max(0, Math.round(outstanding)) : 0;
    return safeAvailable - safeOutstanding;
  }
  return 0;
}

function emptyHelperWallet(helperId, now = Date.now()) {
  return {
    helperId: String(helperId || ''),
    currency: 'ZAR',
    balanceMinor: 0,
    balance: 0,
    reconciliationBlocked: false,
    schemaVersion: 2,
    createdAtMs: now,
    updatedAtMs: now,
  };
}

function minorAmount(value) {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function signedMinorAmount(value) {
  const amount = Number(value);
  return Number.isSafeInteger(amount) ? amount : null;
}

function walletLedgerId(operationId, entryType) {
  return `${String(entryType || 'entry').slice(0, 24)}_${hash(operationId).slice(0, 40)}`;
}

function walletEarningLedgerId(requestId) {
  return `earning_${hash(requestId).slice(0, 40)}`;
}

function walletLedgerReference(walletRef, ledgerId) {
  return walletRef.collection('transactions').doc(String(ledgerId));
}

function walletFromSnapshot(snapshot, helperId, now = Date.now()) {
  if (!snapshot?.exists) return emptyHelperWallet(helperId, now);
  const raw = snapshot.data() || {};
  const balanceMinor = resolveSignedBalanceMinor(raw);
  return {
    ...emptyHelperWallet(helperId, now),
    ...raw,
    helperId: String(raw.helperId || helperId || ''),
    balanceMinor,
    balance: toRandFromMinor(balanceMinor),
  };
}

function walletBalanceIsValid(wallet = {}) {
  if (wallet.balanceMinor !== undefined && wallet.balanceMinor !== null) {
    return Number.isSafeInteger(Number(wallet.balanceMinor));
  }
  if (wallet.availableMinor !== undefined || wallet.reservedMinor !== undefined || wallet.outstandingCommissionMinor !== undefined) {
    return ['availableMinor', 'reservedMinor', 'outstandingCommissionMinor'].every((field) => (
      Number.isSafeInteger(Number(wallet[field] || 0)) && Number(wallet[field] || 0) >= 0
    ));
  }
  return true;
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

function syncHelperWalletDocumentsInTransaction({
  transaction,
  walletRef,
  userRef,
  userSnap,
  helperId,
  current,
  nextBalanceMinor,
  now,
  extraWalletFields = {},
}) {
  const nextWallet = {
    helperId: String(helperId || ''),
    currency: 'ZAR',
    balanceMinor: nextBalanceMinor,
    balance: toRandFromMinor(nextBalanceMinor),
    reconciliationBlocked: current.reconciliationBlocked === true,
    schemaVersion: 2,
    createdAtMs: Number(current.createdAtMs || now),
    updatedAtMs: now,
    ...extraWalletFields,
  };
  transaction.set(walletRef, nextWallet, { merge: true });
  if (userRef && userSnap?.exists) {
    transaction.set(userRef, {
      wallet: profileWalletPayload(nextBalanceMinor, now),
    }, { merge: true });
  } else if (userRef) {
    transaction.set(userRef, {
      wallet: profileWalletPayload(nextBalanceMinor, now),
    }, { merge: true });
  }
  return nextWallet;
}

/**
 * Apply helper payout/commission movement inside an active Firestore transaction.
 * MUST be invoked after all other transaction reads complete and BEFORE any writes in the transaction.
 *
 * - Non-cash settled job/cancellation: credits +helperAmountMinor to wallet balanceMinor.
 * - Direct cash confirmed job: helper collected customerChargeAmountMinor directly in cash;
 *   net delta is (helperAmountMinor - customerChargeAmountMinor) = -platformAmountMinor.
 *   Balance may go below zero when prior balance < platformAmountMinor and is balanced by future non-cash jobs.
 */
async function applyHelperPayoutInTransaction({
  transaction,
  db,
  helperId,
  requestId,
  helperAmountMinor = 0,
  platformAmountMinor = 0,
  customerChargeAmountMinor = 0,
  isCash = false,
  closureType = 'completed',
  entryType = '',
  sourceWeekKey = '',
  sourcePayoutId = '',
  description = '',
  now = Date.now(),
}) {
  const safeHelperId = String(helperId || '').trim();
  const safeRequestId = String(requestId || '').trim();
  if (!safeHelperId || !safeRequestId) return { applied: false, reason: 'invalid-input' };

  const safeHelperMinor = minorAmount(helperAmountMinor) ?? 0;
  const safePlatformMinor = minorAmount(platformAmountMinor) ?? 0;
  const safeCustomerMinor = minorAmount(customerChargeAmountMinor) ?? 0;

  const deltaMinor = isCash
    ? (safeCustomerMinor > 0 ? (safeHelperMinor - safeCustomerMinor) : -safePlatformMinor)
    : safeHelperMinor;

  if (!Number.isSafeInteger(deltaMinor) || deltaMinor === 0) {
    return { applied: false, reason: 'zero-delta' };
  }

  const walletRef = helperWalletReference(db, safeHelperId);
  const userRef = helperProfileReference(db, safeHelperId);
  const ledgerId = isCash
    ? walletLedgerId(`cash:${safeRequestId}`, 'cash_commission')
    : walletEarningLedgerId(safeRequestId);
  const ledgerRef = walletLedgerReference(walletRef, ledgerId);

  const [walletSnapshot, ledgerSnapshot, userSnapshot] = await Promise.all([
    transaction.get(walletRef),
    transaction.get(ledgerRef),
    transaction.get(userRef),
  ]);

  const current = walletFromSnapshot(walletSnapshot, safeHelperId, now);
  if (ledgerSnapshot.exists) {
    return { applied: false, duplicate: true, wallet: current };
  }
  if (current.reconciliationBlocked || !walletBalanceIsValid(current)) {
    return {
      applied: false,
      reason: current.reconciliationBlocked ? 'reconciliation-blocked' : 'invalid-wallet-balance',
      wallet: current,
    };
  }

  const balanceBeforeMinor = resolveSignedBalanceMinor(current);
  const balanceAfterMinor = balanceBeforeMinor + deltaMinor;

  const nextWallet = syncHelperWalletDocumentsInTransaction({
    transaction,
    walletRef,
    userRef,
    userSnap: userSnapshot,
    helperId: safeHelperId,
    current,
    nextBalanceMinor: balanceAfterMinor,
    now,
  });

  const normalizedClosure = String(closureType || 'completed').trim().toLowerCase();
  const resolvedEntryType = entryType || (isCash
    ? 'cash_commission_assessed'
    : (normalizedClosure === 'canceled' ? 'cancellation_earning_credit' : 'job_earning_credit'));
  const resolvedDescription = description || (isCash
    ? (balanceAfterMinor < 0
      ? 'Cash payment confirmed; platform commission deducted from wallet balance.'
      : 'Cash payment confirmed; platform commission deducted from wallet balance.')
    : (normalizedClosure === 'canceled'
      ? 'Customer cancellation helper share credited to wallet balance.'
      : 'Completed service helper payout credited to wallet balance.'));

  writeWalletLedger(transaction, ledgerRef, {
    operationId: isCash ? `cash_commission:${safeRequestId}` : `earning:${safeRequestId}`,
    requestId: safeRequestId,
    helperId: safeHelperId,
    ...(sourcePayoutId ? { sourcePayoutId: String(sourcePayoutId) } : {}),
    ...(sourceWeekKey ? { sourceWeekKey: String(sourceWeekKey) } : {}),
    entryType: resolvedEntryType,
    amountMinor: Math.abs(deltaMinor),
    deltaMinor,
    balanceBeforeMinor,
    balanceAfterMinor,
    helperAmountMinor: safeHelperMinor,
    platformAmountMinor: safePlatformMinor,
    customerChargeAmountMinor: safeCustomerMinor,
    closureType: normalizedClosure,
    description: resolvedDescription,
    createdAtMs: now,
  });

  return {
    applied: true,
    deltaMinor,
    balanceBeforeMinor,
    balanceAfterMinor,
    wallet: nextWallet,
  };
}

/**
 * Compatible wrapper for cash commission settlement on a helper's single wallet balance.
 */
async function applyCashCommissionInTransaction({
  transaction,
  db,
  helperId,
  requestId,
  commissionMinor,
  helperAmountMinor = 0,
  customerChargeAmountMinor = 0,
  now = Date.now(),
}) {
  const normalizedCommission = minorAmount(commissionMinor);
  if (!normalizedCommission || !helperId || !requestId) return { applied: false, reason: 'invalid-commission' };
  const result = await applyHelperPayoutInTransaction({
    transaction,
    db,
    helperId,
    requestId,
    helperAmountMinor,
    platformAmountMinor: normalizedCommission,
    customerChargeAmountMinor: customerChargeAmountMinor || (Number(helperAmountMinor || 0) + normalizedCommission),
    isCash: true,
    closureType: 'completed',
    now,
  });
  return {
    ...result,
    recoveredMinor: normalizedCommission,
    outstandingMinor: Math.max(0, -(result.balanceAfterMinor ?? 0)),
  };
}

/**
 * Idempotent credit of an eligible paid job/cancellation share into the helper's single wallet balance.
 */
async function creditHelperWalletEarning({
  db,
  helperId,
  requestId,
  amountMinor,
  platformAmountMinor = 0,
  customerChargeAmountMinor = 0,
  closureType = 'completed',
  sourceWeekKey = '',
  sourcePayoutId = '',
  now = Date.now(),
}) {
  const normalizedAmount = minorAmount(amountMinor);
  if (!normalizedAmount || !helperId || !requestId) return { action: 'invalid' };
  return db.runTransaction(async (transaction) => {
    const result = await applyHelperPayoutInTransaction({
      transaction,
      db,
      helperId,
      requestId,
      helperAmountMinor: normalizedAmount,
      platformAmountMinor,
      customerChargeAmountMinor,
      isCash: false,
      closureType,
      entryType: String(closureType || '').toLowerCase() === 'canceled'
        ? 'cancellation_earning_credit'
        : 'weekly_earning_credit',
      sourceWeekKey,
      sourcePayoutId,
      now,
    });
    if (result.duplicate) return { action: 'duplicate', wallet: result.wallet };
    if (!result.applied) return { action: result.reason || 'reconciliation-blocked', wallet: result.wallet };
    return { action: 'credited', amountMinor: normalizedAmount, wallet: result.wallet };
  });
}

function normalizeWalletForClient(wallet = {}) {
  const balanceMinor = resolveSignedBalanceMinor(wallet);
  const safeMinor = Number.isSafeInteger(balanceMinor) ? balanceMinor : 0;
  return {
    currency: 'ZAR',
    balanceMinor: safeMinor,
    balance: toRandFromMinor(safeMinor),
    availableMinor: Math.max(0, safeMinor),
    reservedMinor: 0,
    outstandingCommissionMinor: Math.max(0, -safeMinor),
    reconciliationBlocked: wallet.reconciliationBlocked === true,
    updatedAtMs: Number(wallet.updatedAtMs || 0),
  };
}

module.exports = {
  HELPER_WALLETS,
  applyCashCommissionInTransaction,
  applyHelperPayoutInTransaction,
  creditHelperWalletEarning,
  emptyHelperWallet,
  helperProfileReference,
  helperWalletReference,
  isWalletEarningEligible,
  minorAmount,
  normalizeWalletForClient,
  profileWalletPayload,
  resolveSignedBalanceMinor,
  signedMinorAmount,
  syncHelperWalletDocumentsInTransaction,
  toRandFromMinor,
  walletBalanceIsValid,
  walletEarningLedgerId,
  walletFromSnapshot,
  walletLedgerId,
  walletLedgerReference,
  writeWalletLedger,
};

