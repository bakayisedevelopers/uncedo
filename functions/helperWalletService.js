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

const SPLIT_SETTLED_REQUEST_MODES = new Set([
  'paystack_split',
  'paystack_split_with_debt_recovery',
  'debt_recovery_platform_only',
  'recovery_platform_only',
]);

function isWalletEarningEligible(request = {}) {
  if (Number(request.helperWalletAccountingVersion) !== 1) return false;
  if (SPLIT_SETTLED_REQUEST_MODES.has(String(request.paymentSettlementMode || '').trim().toLowerCase())) {
    return false;
  }
  if (!['paid', 'wallet_debt_recorded'].includes(String(request.paymentStatus || '').toLowerCase())) return false;
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
  if (userRef) {
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
 * - Direct cash confirmed job: credits +helperAmountMinor (unless already credited on an earlier
 *   failed attempt) and deducts -platformAmountMinor commission from wallet balanceMinor;
 *   net delta is (payoutCreditDeltaMinor - commissionMinorToDeduct).
 *   Balance may go below zero when prior balance + payoutCreditDeltaMinor < commissionMinorToDeduct.
 */
async function applyHelperPayoutInTransaction({
  transaction,
  db,
  helperId,
  requestId,
  helperAmountMinor = 0,
  platformAmountMinor = 0,
  customerChargeAmountMinor = 0,
  cashCollectedMinor = null,
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
  const explicitCashCollected = (cashCollectedMinor !== null && cashCollectedMinor !== undefined && cashCollectedMinor !== '')
    ? minorAmount(cashCollectedMinor)
    : null;
  const effectiveCashCollectedMinor = explicitCashCollected !== null
    ? explicitCashCollected
    : (safeCustomerMinor > 0 ? safeCustomerMinor : null);

  if (!isCash && (!Number.isSafeInteger(safeHelperMinor) || safeHelperMinor <= 0)) {
    return { applied: false, reason: 'zero-delta' };
  }

  const walletRef = helperWalletReference(db, safeHelperId);
  const userRef = helperProfileReference(db, safeHelperId);
  const earningLedgerRef = walletLedgerReference(walletRef, walletEarningLedgerId(safeRequestId));
  const ledgerId = isCash
    ? walletLedgerId(`cash:${safeRequestId}`, 'cash_commission')
    : walletEarningLedgerId(safeRequestId);
  const ledgerRef = walletLedgerReference(walletRef, ledgerId);

  const [walletSnapshot, ledgerSnapshot, userSnapshot, earningLedgerSnap] = await Promise.all([
    transaction.get(walletRef),
    transaction.get(ledgerRef),
    transaction.get(userRef),
    isCash ? transaction.get(earningLedgerRef) : Promise.resolve(null),
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

  const earningAlreadyApplied = isCash && Boolean(earningLedgerSnap?.exists);
  let priorCreditedMinor = 0;
  if (earningAlreadyApplied) {
    const earningData = earningLedgerSnap.data() || {};
    const parsedDelta = Number(earningData.deltaMinor);
    if (Number.isSafeInteger(parsedDelta) && parsedDelta > 0) {
      priorCreditedMinor = parsedDelta;
    } else {
      const parsedAmount = Number(earningData.amountMinor);
      priorCreditedMinor = Number.isSafeInteger(parsedAmount) && parsedAmount > 0 ? parsedAmount : safeHelperMinor;
    }
  }

  const payoutCreditDeltaMinor = isCash
    ? (earningAlreadyApplied ? 0 : safeHelperMinor)
    : safeHelperMinor;
  const commissionMinorToDeduct = isCash
    ? (safePlatformMinor > 0
      ? safePlatformMinor
      : (effectiveCashCollectedMinor !== null && effectiveCashCollectedMinor > safeHelperMinor
        ? (effectiveCashCollectedMinor - safeHelperMinor)
        : 0))
    : 0;
  const deltaMinor = isCash
    ? (payoutCreditDeltaMinor - commissionMinorToDeduct)
    : safeHelperMinor;

  if (isCash && commissionMinorToDeduct === 0 && earningAlreadyApplied) {
    return { applied: false, duplicate: true, wallet: current };
  }
  if (!Number.isSafeInteger(deltaMinor) || (deltaMinor === 0 && payoutCreditDeltaMinor === 0 && commissionMinorToDeduct === 0)) {
    return { applied: false, reason: 'zero-delta' };
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
  if (isCash) {
    let runningBalanceMinor = balanceBeforeMinor;
    if (payoutCreditDeltaMinor > 0 && !earningAlreadyApplied) {
      const afterCreditMinor = runningBalanceMinor + payoutCreditDeltaMinor;
      const earningEntryType = entryType || (normalizedClosure === 'canceled' ? 'cancellation_earning_credit' : 'job_earning_credit');
      writeWalletLedger(transaction, earningLedgerRef, {
        operationId: `earning:${safeRequestId}`,
        requestId: safeRequestId,
        helperId: safeHelperId,
        ...(sourcePayoutId ? { sourcePayoutId: String(sourcePayoutId) } : {}),
        ...(sourceWeekKey ? { sourceWeekKey: String(sourceWeekKey) } : {}),
        entryType: earningEntryType,
        amountMinor: payoutCreditDeltaMinor,
        deltaMinor: payoutCreditDeltaMinor,
        balanceBeforeMinor: runningBalanceMinor,
        balanceAfterMinor: afterCreditMinor,
        helperAmountMinor: safeHelperMinor,
        platformAmountMinor: commissionMinorToDeduct,
        customerChargeAmountMinor: safeCustomerMinor,
        closureType: normalizedClosure,
        description: normalizedClosure === 'canceled'
          ? 'Customer cancellation helper share credited to wallet balance.'
          : 'Completed cash service helper payout credited to wallet balance.',
        createdAtMs: now,
      });
      runningBalanceMinor = afterCreditMinor;
    }

    if (commissionMinorToDeduct > 0) {
      const afterCommissionMinor = runningBalanceMinor - commissionMinorToDeduct;
      writeWalletLedger(transaction, ledgerRef, {
        operationId: `cash_commission:${safeRequestId}`,
        requestId: safeRequestId,
        helperId: safeHelperId,
        ...(sourcePayoutId ? { sourcePayoutId: String(sourcePayoutId) } : {}),
        ...(sourceWeekKey ? { sourceWeekKey: String(sourceWeekKey) } : {}),
        entryType: 'cash_commission_assessed',
        amountMinor: commissionMinorToDeduct,
        deltaMinor: -commissionMinorToDeduct,
        balanceBeforeMinor: runningBalanceMinor,
        balanceAfterMinor: afterCommissionMinor,
        helperAmountMinor: safeHelperMinor,
        platformAmountMinor: commissionMinorToDeduct,
        customerChargeAmountMinor: safeCustomerMinor,
        ...(priorCreditedMinor > 0 ? { priorCreditedMinor } : {}),
        closureType: normalizedClosure,
        description: description || (priorCreditedMinor > 0
          ? 'Cash payment confirmed; platform commission deducted from wallet balance.'
          : 'Cash payment confirmed; platform commission deducted from wallet balance.'),
        createdAtMs: (payoutCreditDeltaMinor > 0 && !earningAlreadyApplied) ? now + 1 : now,
      });
    }
  } else {
    const resolvedEntryType = entryType
      || (normalizedClosure === 'canceled' ? 'cancellation_earning_credit' : 'job_earning_credit');
    const resolvedDescription = description || (normalizedClosure === 'canceled'
      ? 'Customer cancellation helper share credited to wallet balance.'
      : 'Completed service helper payout credited to wallet balance.');

    writeWalletLedger(transaction, ledgerRef, {
      operationId: `earning:${safeRequestId}`,
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
  }

  return {
    applied: true,
    deltaMinor,
    payoutCreditDeltaMinor,
    commissionMinor: commissionMinorToDeduct,
    balanceBeforeMinor,
    balanceAfterMinor,
    wallet: nextWallet,
  };
}

/**
 * Record helper wallet impact for a confirmed Paystack card settlement when split metadata is present.
 * MUST be invoked after all other transaction reads complete and BEFORE any writes in the transaction.
 */
async function applySplitSettlementInTransaction({
  transaction,
  db,
  helperId,
  requestId,
  splitAllocation = null,
  helperAmountMinor = 0,
  platformAmountMinor = 0,
  customerChargeAmountMinor = 0,
  closureType = 'completed',
  gatewayReference = '',
  now = Date.now(),
}) {
  const safeHelperId = String(helperId || '').trim();
  const safeRequestId = String(requestId || '').trim();
  if (!safeHelperId || !safeRequestId) return { applied: false, reason: 'invalid-input' };

  const mode = String(splitAllocation?.mode || 'platform_hold_fallback').trim().toLowerCase();
  const safeHelperMinor = minorAmount(splitAllocation?.helperAmountMinor ?? helperAmountMinor) ?? 0;
  const safePlatformMinor = minorAmount(splitAllocation?.platformAmountMinor ?? platformAmountMinor) ?? 0;
  const safeCustomerMinor = minorAmount(splitAllocation?.customerChargeAmountMinor ?? customerChargeAmountMinor) ?? 0;

  if (mode === 'platform_only' || safeHelperMinor <= 0) {
    return {
      applied: false,
      reason: 'zero-helper-share',
      mode: mode || 'platform_only',
      deltaMinor: 0,
      debtRecoveredMinor: 0,
      splitHelperMinor: 0,
    };
  }

  if (mode === 'platform_hold_fallback') {
    const fallbackResult = await applyHelperPayoutInTransaction({
      transaction,
      db,
      helperId: safeHelperId,
      requestId: safeRequestId,
      helperAmountMinor: safeHelperMinor,
      platformAmountMinor: safePlatformMinor,
      customerChargeAmountMinor: safeCustomerMinor,
      isCash: false,
      closureType,
      now,
    });
    return {
      ...fallbackResult,
      mode: 'platform_hold_fallback',
      debtRecoveredMinor: 0,
      splitHelperMinor: 0,
    };
  }

  const walletRef = helperWalletReference(db, safeHelperId);
  const userRef = helperProfileReference(db, safeHelperId);
  const earningLedgerRef = walletLedgerReference(walletRef, walletEarningLedgerId(safeRequestId));
  const [walletSnapshot, earningLedgerSnap, userSnapshot] = await Promise.all([
    transaction.get(walletRef),
    transaction.get(earningLedgerRef),
    transaction.get(userRef),
  ]);
  const current = walletFromSnapshot(walletSnapshot, safeHelperId, now);

  if (earningLedgerSnap.exists || mode === 'recovery_platform_only') {
    return {
      applied: false,
      duplicate: true,
      mode,
      deltaMinor: 0,
      debtRecoveredMinor: 0,
      splitHelperMinor: 0,
      balanceBeforeMinor: resolveSignedBalanceMinor(current),
      balanceAfterMinor: resolveSignedBalanceMinor(current),
      wallet: current,
    };
  }

  if (current.reconciliationBlocked || !walletBalanceIsValid(current)) {
    return {
      applied: false,
      mode,
      reason: current.reconciliationBlocked ? 'reconciliation-blocked' : 'invalid-wallet-balance',
      wallet: current,
    };
  }

  const balanceBeforeMinor = resolveSignedBalanceMinor(current);
  const splitHelperMinor = minorAmount(splitAllocation?.helperSplitMinor) ?? 0;
  const debtRecoveredMinor = minorAmount(splitAllocation?.debtRecoveredMinor) ?? 0;
  const normalizedClosure = String(closureType || 'completed').trim().toLowerCase();

  let deltaMinor = 0;
  let entryType = 'split_direct_settlement';
  let description = `Paid directly to bank via Paystack Split (R${toRandFromMinor(splitHelperMinor || safeHelperMinor).toFixed(2)}).`;

  if (mode === 'paystack_split_with_debt_recovery' || mode === 'debt_recovery_platform_only') {
    deltaMinor = debtRecoveredMinor;
    entryType = 'split_debt_recovery';
    description = splitHelperMinor > 0
      ? `Offset R${toRandFromMinor(debtRecoveredMinor).toFixed(2)} negative wallet balance via Paystack Split; R${toRandFromMinor(splitHelperMinor).toFixed(2)} settled to bank.`
      : `Offset R${toRandFromMinor(debtRecoveredMinor).toFixed(2)} negative wallet balance from card settlement.`;
  }

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

  writeWalletLedger(transaction, earningLedgerRef, {
    operationId: `split:${safeRequestId}`,
    requestId: safeRequestId,
    helperId: safeHelperId,
    entryType,
    settlementMode: mode,
    amountMinor: safeHelperMinor,
    deltaMinor,
    splitHelperAmountMinor: splitHelperMinor,
    debtRecoveredMinor,
    platformAmountMinor: safePlatformMinor,
    customerChargeAmountMinor: safeCustomerMinor,
    balanceBeforeMinor,
    balanceAfterMinor,
    closureType: normalizedClosure,
    ...(gatewayReference ? { gatewayReference: String(gatewayReference) } : {}),
    description,
    createdAtMs: now,
  });

  return {
    applied: true,
    mode,
    deltaMinor,
    debtRecoveredMinor,
    splitHelperMinor,
    balanceBeforeMinor,
    balanceAfterMinor,
    wallet: nextWallet,
  };
}

/**
 * Reverse debt recovery credit if a previously settled Paystack split charge is reversed.
 */
async function reverseSplitSettlementInTransaction({
  transaction,
  db,
  helperId,
  requestId,
  splitAllocation = null,
  gatewayReference = '',
  now = Date.now(),
}) {
  const safeHelperId = String(helperId || '').trim();
  const safeRequestId = String(requestId || '').trim();
  const debtRecoveredMinor = minorAmount(splitAllocation?.debtRecoveredMinor) ?? 0;
  if (!safeHelperId || !safeRequestId || debtRecoveredMinor <= 0) {
    return { applied: false, reason: 'no-debt-recovery-to-reverse', deltaMinor: 0 };
  }

  const walletRef = helperWalletReference(db, safeHelperId);
  const userRef = helperProfileReference(db, safeHelperId);
  const earningLedgerRef = walletLedgerReference(walletRef, walletEarningLedgerId(safeRequestId));
  const reversalRef = walletLedgerReference(walletRef, walletLedgerId(`split_rev:${safeRequestId}`, 'split_reversal'));
  const [walletSnap, earningSnap, reversalSnap, userSnap] = await Promise.all([
    transaction.get(walletRef),
    transaction.get(earningLedgerRef),
    transaction.get(reversalRef),
    transaction.get(userRef),
  ]);

  if (reversalSnap.exists) {
    return { applied: false, duplicate: true, deltaMinor: 0, wallet: walletFromSnapshot(walletSnap, safeHelperId, now) };
  }
  if (!earningSnap.exists || String(earningSnap.data()?.entryType || '') !== 'split_debt_recovery') {
    return { applied: false, reason: 'no-split-debt-recovery-entry', deltaMinor: 0 };
  }

  const current = walletFromSnapshot(walletSnap, safeHelperId, now);
  if (current.reconciliationBlocked || !walletBalanceIsValid(current)) {
    return { applied: false, reason: current.reconciliationBlocked ? 'reconciliation-blocked' : 'invalid-wallet-balance' };
  }

  const balanceBeforeMinor = resolveSignedBalanceMinor(current);
  const balanceAfterMinor = balanceBeforeMinor - debtRecoveredMinor;
  const nextWallet = syncHelperWalletDocumentsInTransaction({
    transaction,
    walletRef,
    userRef,
    userSnap,
    helperId: safeHelperId,
    current,
    nextBalanceMinor: balanceAfterMinor,
    now,
  });

  writeWalletLedger(transaction, reversalRef, {
    operationId: `split_reversal:${safeRequestId}`,
    requestId: safeRequestId,
    helperId: safeHelperId,
    entryType: 'split_settlement_reversal',
    amountMinor: debtRecoveredMinor,
    deltaMinor: -debtRecoveredMinor,
    balanceBeforeMinor,
    balanceAfterMinor,
    ...(gatewayReference ? { gatewayReference: String(gatewayReference) } : {}),
    description: 'Reversed Paystack split debt offset following payment reversal.',
    createdAtMs: now,
  });

  return {
    applied: true,
    deltaMinor: -debtRecoveredMinor,
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

const ACCOUNTED_WALLET_ENTRY_TYPES = new Set([
  'job_earning_credit',
  'weekly_earning_credit',
  'cancellation_earning_credit',
  'cash_commission_assessed',
  'legacy_job_resolved',
  'split_direct_settlement',
  'split_debt_recovery',
  'split_settlement_reversal',
]);

const PENDING_EXPLICIT_PAYMENT_STATUSES = new Set([
  'unpaid',
  'cash_selected',
  'awaiting_cash_confirmation',
  'awaiting_customer_confirmation',
  'payment_processing',
  'payment_reconciliation_required',
]);

function resolveLegacyHelperPayoutMinor(request = {}) {
  const stored = request?.helperPayoutBreakdown?.helperAmount;
  if (stored !== null && stored !== undefined && stored !== '') {
    const parsedStored = Number(stored);
    if (Number.isFinite(parsedStored) && parsedStored >= 0) {
      return Math.round(parsedStored * 100);
    }
  }
  const status = String(request?.status || '').trim().toLowerCase();
  const snapshot = request?.pricingSnapshot || request?.requestPayload?.pricingSnapshot || {};
  if (status === 'canceled' || status === 'cancelled') {
    const billingRule = String(snapshot?.cancellationBillingRule || '').trim().toLowerCase();
    if (!billingRule || billingRule === 'booking_fee_only' || billingRule === 'pre_assignment') {
      return 0;
    }
    const travelCharge = Number(snapshot?.cancellationTravelCharge || 0);
    return Number.isFinite(travelCharge) && travelCharge > 0 ? Math.round(travelCharge * 100) : 0;
  }
  if (status !== 'completed') return 0;

  const customerTotal = Number(
    request?.totalAmount
      ?? snapshot?.finalAmount
      ?? snapshot?.total
      ?? snapshot?.totalAmount
      ?? snapshot?.finalPrice
      ?? snapshot?.basePrice
      ?? 0,
  ) || 0;
  const breakdownItems = Array.isArray(snapshot?.serviceBreakdown) ? snapshot.serviceBreakdown : [];
  const summedSubtotal = breakdownItems.reduce((sum, item) => sum + Math.max(0, Number(item?.subtotal || 0)), 0);
  const subtotal = Number(snapshot?.subtotal || summedSubtotal || 0);
  const rawTravel = snapshot?.travelFee;
  const travelFee = rawTravel !== null && rawTravel !== undefined && rawTravel !== ''
    && Number.isFinite(Number(rawTravel)) && Number(rawTravel) >= 0
    ? Number(rawTravel)
    : 35;
  if (subtotal > 0) {
    const calculated = Number(((subtotal * 0.75) + travelFee).toFixed(2));
    const major = customerTotal > 0 ? Math.min(customerTotal, calculated) : calculated;
    return Math.max(0, Math.round(major * 100));
  }
  return Math.max(0, Math.round(customerTotal * 100));
}

function computeLegacyCompletedJobResolution({
  requests = [],
  walletTransactions = [],
  paidWeeklyPayoutRequestIds = new Set(),
} = {}) {
  const paidIds = paidWeeklyPayoutRequestIds instanceof Set
    ? paidWeeklyPayoutRequestIds
    : new Set(Array.isArray(paidWeeklyPayoutRequestIds) ? paidWeeklyPayoutRequestIds : []);
  const accountedIds = new Set();
  const ledgerDocIds = new Set();

  for (const tx of Array.isArray(walletTransactions) ? walletTransactions : []) {
    const txId = String(tx?.id || tx?.entryId || '').trim();
    if (txId) ledgerDocIds.add(txId);
    const entryType = String(tx?.entryType || '').trim().toLowerCase();
    const requestId = String(tx?.requestId || '').trim();
    if (requestId && ACCOUNTED_WALLET_ENTRY_TYPES.has(entryType)) {
      accountedIds.add(requestId);
    }
    if (Array.isArray(tx?.resolvedRequestIds)) {
      for (const resolvedId of tx.resolvedRequestIds) {
        const clean = String(resolvedId || '').trim();
        if (clean) accountedIds.add(clean);
      }
    }
  }

  const resolvableJobs = [];
  let unresolvedAmountMinor = 0;

  for (const request of Array.isArray(requests) ? requests : []) {
    const requestId = String(request?.id || '').trim();
    if (!requestId) continue;
    const status = String(request?.status || '').trim().toLowerCase();
    if (status !== 'completed' && status !== 'canceled' && status !== 'cancelled') continue;
    if (Number(request?.legacyWalletResolvedAtMs || 0) > 0) continue;
    if (paidIds.has(requestId) || accountedIds.has(requestId)) continue;
    if (
      ledgerDocIds.has(walletEarningLedgerId(requestId))
      || ledgerDocIds.has(walletLedgerId(`cash:${requestId}`, 'cash_commission'))
    ) {
      continue;
    }
    const paymentMethod = String(request?.paymentMethod || '').trim().toLowerCase();
    const paymentStatus = String(request?.paymentStatus || '').trim().toLowerCase();
    if (
      String(request?.cashPayment?.status || '').trim().toLowerCase() === 'helper_confirmed'
      || (paymentMethod === 'cash' && paymentStatus === 'paid')
    ) {
      continue;
    }
    if (
      String(request?.paymentFlowVersion || '').trim() === 'explicit_v1'
      && PENDING_EXPLICIT_PAYMENT_STATUSES.has(paymentStatus)
    ) {
      continue;
    }

    const helperAmountMinor = resolveLegacyHelperPayoutMinor(request);
    if (!Number.isSafeInteger(helperAmountMinor) || helperAmountMinor <= 0) continue;

    const breakdown = request?.helperPayoutBreakdown || {};
    const platformAmountMinor = Math.max(0, Math.round(Number(breakdown.platformAmount || 0) * 100));
    const customerChargeAmountMinor = Math.max(
      0,
      Math.round(Number(breakdown.customerChargeAmount ?? request?.totalAmount ?? request?.cancellationFeeAmount ?? 0) * 100),
    );
    resolvableJobs.push({
      requestId,
      status: status === 'cancelled' ? 'canceled' : status,
      helperAmountMinor,
      platformAmountMinor,
      customerChargeAmountMinor,
    });
    unresolvedAmountMinor += helperAmountMinor;
  }

  return {
    unresolvedAmountMinor,
    unresolvedAmount: toRandFromMinor(unresolvedAmountMinor),
    unresolvedJobsCount: resolvableJobs.length,
    resolvableJobs,
  };
}

module.exports = {
  HELPER_WALLETS,
  applyCashCommissionInTransaction,
  applyHelperPayoutInTransaction,
  applySplitSettlementInTransaction,
  computeLegacyCompletedJobResolution,
  creditHelperWalletEarning,
  emptyHelperWallet,
  helperProfileReference,
  helperWalletReference,
  isWalletEarningEligible,
  minorAmount,
  normalizeWalletForClient,
  profileWalletPayload,
  resolveLegacyHelperPayoutMinor,
  resolveSignedBalanceMinor,
  reverseSplitSettlementInTransaction,
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


