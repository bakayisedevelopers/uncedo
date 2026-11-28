'use strict';

const {
  helperProfileReference,
  helperWalletReference,
  minorAmount,
  resolveSignedBalanceMinor,
  walletEarningLedgerId,
  walletFromSnapshot,
  walletLedgerReference,
} = require('./helperWalletService');

const SPLIT_MODES = Object.freeze({
  PLATFORM_ONLY: 'platform_only',
  RECOVERY_PLATFORM_ONLY: 'recovery_platform_only',
  PLATFORM_HOLD_FALLBACK: 'platform_hold_fallback',
  PAYSTACK_SPLIT: 'paystack_split',
  PAYSTACK_SPLIT_WITH_DEBT_RECOVERY: 'paystack_split_with_debt_recovery',
  DEBT_RECOVERY_PLATFORM_ONLY: 'debt_recovery_platform_only',
});

const SPLIT_SETTLEMENT_MODES = new Set([
  SPLIT_MODES.PAYSTACK_SPLIT,
  SPLIT_MODES.PAYSTACK_SPLIT_WITH_DEBT_RECOVERY,
  SPLIT_MODES.DEBT_RECOVERY_PLATFORM_ONLY,
  SPLIT_MODES.RECOVERY_PLATFORM_ONLY,
]);

function normalizeSplitPayoutProfile(payout = {}) {
  const raw = payout && typeof payout === 'object' ? payout : {};
  const subaccountCode = String(raw.subaccountCode || raw.paystackSubaccountCode || '').trim();
  const recipientCode = String(raw.recipientCode || raw.paystackRecipientCode || '').trim();
  const verificationStatus = String(raw.verificationStatus || '').trim().toLowerCase();
  return {
    ...raw,
    subaccountCode,
    recipientCode,
    verificationStatus,
    verified: verificationStatus === 'verified' || raw.verified === true,
  };
}

/**
 * Resolve exact Paystack split and helper wallet accounting behavior for a single charge attempt.
 */
function resolvePaystackSplitAllocation({
  helperId = '',
  payoutProfile = {},
  helperWalletBalanceMinor = 0,
  helperWalletBlocked = false,
  earningAlreadyApplied = false,
  helperAmountMinor = 0,
  platformAmountMinor = 0,
  customerChargeAmountMinor = 0,
  bearer = 'account',
} = {}) {
  const safeHelperId = String(helperId || '').trim();
  const safeChargeMinor = minorAmount(customerChargeAmountMinor) ?? 0;
  const rawHelperMinor = minorAmount(helperAmountMinor) ?? 0;
  const rawPlatformMinor = minorAmount(platformAmountMinor) ?? 0;
  const normalizedBearer = String(bearer || 'account').trim().toLowerCase() === 'subaccount'
    ? 'subaccount'
    : 'account';
  const normalizedPayout = normalizeSplitPayoutProfile(payoutProfile);
  const subaccountCode = normalizedPayout.subaccountCode;
  const signedWalletBalanceMinor = Number.isSafeInteger(Number(helperWalletBalanceMinor))
    ? Number(helperWalletBalanceMinor)
    : 0;

  if (!safeHelperId || rawHelperMinor <= 0 || safeChargeMinor <= 0) {
    return {
      mode: SPLIT_MODES.PLATFORM_ONLY,
      useSubaccount: false,
      subaccountCode: '',
      bearer: normalizedBearer,
      customerChargeAmountMinor: safeChargeMinor,
      helperAmountMinor: rawHelperMinor,
      platformAmountMinor: rawPlatformMinor,
      effectivePlatformMinor: safeChargeMinor,
      helperSplitMinor: 0,
      transactionChargeMinor: safeChargeMinor,
      debtRecoveredMinor: 0,
      walletDeltaOnSuccessMinor: 0,
      helperWalletBalanceBeforeMinor: signedWalletBalanceMinor,
      earningAlreadyApplied: Boolean(earningAlreadyApplied),
      fallbackReason: !safeHelperId ? 'missing_helper' : 'zero_helper_share',
    };
  }

  if (earningAlreadyApplied) {
    return {
      mode: SPLIT_MODES.RECOVERY_PLATFORM_ONLY,
      useSubaccount: false,
      subaccountCode: '',
      bearer: normalizedBearer,
      customerChargeAmountMinor: safeChargeMinor,
      helperAmountMinor: rawHelperMinor,
      platformAmountMinor: rawPlatformMinor,
      effectivePlatformMinor: safeChargeMinor,
      helperSplitMinor: 0,
      transactionChargeMinor: safeChargeMinor,
      debtRecoveredMinor: 0,
      walletDeltaOnSuccessMinor: 0,
      helperWalletBalanceBeforeMinor: signedWalletBalanceMinor,
      earningAlreadyApplied: true,
      fallbackReason: 'helper_wallet_already_credited',
    };
  }

  const effectivePlatformMinor = safeChargeMinor - rawHelperMinor;
  const payoutReady = Boolean(
    normalizedPayout.verificationStatus === 'verified'
    && subaccountCode,
  );
  if (!payoutReady || helperWalletBlocked === true || effectivePlatformMinor <= 0) {
    let fallbackReason = 'missing_verified_subaccount';
    if (helperWalletBlocked === true) fallbackReason = 'wallet_reconciliation_blocked';
    else if (effectivePlatformMinor <= 0) fallbackReason = 'charge_does_not_exceed_helper_share';
    return {
      mode: SPLIT_MODES.PLATFORM_HOLD_FALLBACK,
      useSubaccount: false,
      subaccountCode: '',
      bearer: normalizedBearer,
      customerChargeAmountMinor: safeChargeMinor,
      helperAmountMinor: rawHelperMinor,
      platformAmountMinor: rawPlatformMinor,
      effectivePlatformMinor: Math.max(0, effectivePlatformMinor),
      helperSplitMinor: 0,
      transactionChargeMinor: safeChargeMinor,
      debtRecoveredMinor: 0,
      walletDeltaOnSuccessMinor: rawHelperMinor,
      helperWalletBalanceBeforeMinor: signedWalletBalanceMinor,
      earningAlreadyApplied: false,
      fallbackReason,
    };
  }

  const owedMinor = signedWalletBalanceMinor < 0 ? Math.abs(signedWalletBalanceMinor) : 0;
  const debtRecoveredMinor = Math.min(owedMinor, rawHelperMinor);
  const helperSplitMinor = rawHelperMinor - debtRecoveredMinor;
  const transactionChargeMinor = effectivePlatformMinor + debtRecoveredMinor;

  if (helperSplitMinor <= 0) {
    return {
      mode: SPLIT_MODES.DEBT_RECOVERY_PLATFORM_ONLY,
      useSubaccount: false,
      subaccountCode: '',
      bearer: normalizedBearer,
      customerChargeAmountMinor: safeChargeMinor,
      helperAmountMinor: rawHelperMinor,
      platformAmountMinor: rawPlatformMinor,
      effectivePlatformMinor,
      helperSplitMinor: 0,
      transactionChargeMinor: safeChargeMinor,
      debtRecoveredMinor,
      walletDeltaOnSuccessMinor: debtRecoveredMinor,
      helperWalletBalanceBeforeMinor: signedWalletBalanceMinor,
      earningAlreadyApplied: false,
      fallbackReason: 'full_helper_share_recovered_debt',
    };
  }

  return {
    mode: debtRecoveredMinor > 0
      ? SPLIT_MODES.PAYSTACK_SPLIT_WITH_DEBT_RECOVERY
      : SPLIT_MODES.PAYSTACK_SPLIT,
    useSubaccount: true,
    subaccountCode,
    bearer: normalizedBearer,
    customerChargeAmountMinor: safeChargeMinor,
    helperAmountMinor: rawHelperMinor,
    platformAmountMinor: rawPlatformMinor,
    effectivePlatformMinor,
    helperSplitMinor,
    transactionChargeMinor,
    debtRecoveredMinor,
    walletDeltaOnSuccessMinor: debtRecoveredMinor,
    helperWalletBalanceBeforeMinor: signedWalletBalanceMinor,
    earningAlreadyApplied: false,
    fallbackReason: null,
  };
}

function buildPaystackSplitParams(splitAllocation = null) {
  if (!splitAllocation || splitAllocation.useSubaccount !== true) return {};
  const subaccount = String(splitAllocation.subaccountCode || '').trim();
  const transactionCharge = Number(splitAllocation.transactionChargeMinor);
  if (!subaccount || !Number.isSafeInteger(transactionCharge) || transactionCharge <= 0) {
    return {};
  }
  return {
    subaccount,
    transaction_charge: transactionCharge,
    bearer: splitAllocation.bearer === 'subaccount' ? 'subaccount' : 'account',
  };
}

function isSplitManagedSettlementMode(mode = '') {
  return SPLIT_SETTLEMENT_MODES.has(String(mode || '').trim().toLowerCase());
}

async function createPaystackSubaccount({
  callPaystackApi,
  paystackSecretKey,
  payout = {},
  email = '',
  uid = '',
  businessName = '',
  defaultPercentageCharge = 25,
}) {
  const bankCode = String(payout.bankCode || '').trim();
  const accountNumber = String(payout.accountNumber || '').replace(/\s+/g, '').trim();
  const resolvedName = String(businessName || payout.accountHolder || 'Uncedo Helper').trim().slice(0, 100);
  if (!paystackSecretKey || !bankCode || !accountNumber) {
    throw new Error('Bank code and account number are required to create a Paystack subaccount.');
  }
  const response = await callPaystackApi({
    paystackSecretKey,
    path: '/subaccount',
    method: 'POST',
    body: {
      business_name: resolvedName || 'Uncedo Helper',
      settlement_bank: bankCode,
      account_number: accountNumber,
      percentage_charge: Number.isFinite(Number(defaultPercentageCharge)) ? Number(defaultPercentageCharge) : 25,
      description: `Uncedo helper split settlement account ${String(uid || '').trim()}`.trim(),
      ...(String(email || '').trim() ? { primary_contact_email: String(email).trim() } : {}),
      metadata: {
        uid: String(uid || '').trim(),
        bankName: String(payout.bankName || '').trim(),
        recipientCode: String(payout.recipientCode || payout.paystackRecipientCode || '').trim(),
      },
    },
  });
  const data = response?.data || {};
  const subaccountCode = String(data.subaccount_code || '').trim();
  if (!subaccountCode) {
    throw new Error('Paystack did not return a valid subaccount_code.');
  }
  return {
    subaccountCode,
    paystackSubaccountCode: subaccountCode,
    paystackSubaccountId: data.id ? String(data.id) : '',
    subaccountProvisionedAt: new Date().toISOString(),
  };
}

async function ensureHelperPaystackSubaccount({
  db,
  admin,
  callPaystackApi,
  paystackSecretKey,
  helperId,
  helperData = null,
  logger = null,
}) {
  const safeHelperId = String(helperId || '').trim();
  if (!safeHelperId) return null;
  const userRef = helperProfileReference(db, safeHelperId);
  const loadedUser = helperData || ((await userRef.get().catch(() => null))?.data() || {});
  const normalized = normalizeSplitPayoutProfile(loadedUser.payout || {});
  if (normalized.subaccountCode) {
    return normalized;
  }
  if (normalized.verificationStatus !== 'verified' || !normalized.bankCode || !normalized.accountNumber) {
    return normalized;
  }
  if (!paystackSecretKey || typeof callPaystackApi !== 'function') {
    return normalized;
  }

  try {
    const businessName = String(
      loadedUser.businessName
      || normalized.accountHolder
      || loadedUser.fullName
      || [loadedUser.firstName, loadedUser.lastName].filter(Boolean).join(' ')
      || 'Uncedo Helper',
    ).trim();
    const created = await createPaystackSubaccount({
      callPaystackApi,
      paystackSecretKey,
      payout: normalized,
      email: loadedUser.email || '',
      uid: safeHelperId,
      businessName,
    });
    const updatedPayout = {
      ...normalized,
      ...created,
    };
    await userRef.set({
      payout: created,
      ...(admin?.firestore?.FieldValue?.serverTimestamp
        ? { updatedAt: admin.firestore.FieldValue.serverTimestamp() }
        : {}),
    }, { merge: true });
    return updatedPayout;
  } catch (error) {
    logger?.warn?.('helper_subaccount_lazy_backfill_failed', {
      helperId: safeHelperId,
      error: String(error?.message || 'subaccount_failed').slice(0, 140),
    });
    return normalized;
  }
}

async function resolveAttemptSplitAllocation({
  db,
  admin = null,
  callPaystackApi = null,
  paystackSecretKey = '',
  requestId,
  helperId,
  helperAmountMinor = 0,
  platformAmountMinor = 0,
  customerChargeAmountMinor = 0,
  bearer = 'account',
  ensureSubaccount = true,
  logger = null,
} = {}) {
  const safeRequestId = String(requestId || '').trim();
  const safeHelperId = String(helperId || '').trim();
  const safeChargeMinor = minorAmount(customerChargeAmountMinor) ?? 0;
  const safeHelperMinor = minorAmount(helperAmountMinor) ?? 0;
  const safePlatformMinor = minorAmount(platformAmountMinor) ?? 0;

  if (!safeRequestId || !safeHelperId || safeHelperMinor <= 0 || safeChargeMinor <= 0) {
    return resolvePaystackSplitAllocation({
      helperId: safeHelperId,
      helperAmountMinor: safeHelperMinor,
      platformAmountMinor: safePlatformMinor,
      customerChargeAmountMinor: safeChargeMinor,
      bearer,
    });
  }

  const walletRef = helperWalletReference(db, safeHelperId);
  const userRef = helperProfileReference(db, safeHelperId);
  const earningRef = walletLedgerReference(walletRef, walletEarningLedgerId(safeRequestId));
  const [userSnap, walletSnap, earningSnap] = await Promise.all([
    userRef.get().catch(() => null),
    walletRef.get().catch(() => null),
    earningRef.get().catch(() => null),
  ]);

  const userData = userSnap?.exists ? (userSnap.data() || {}) : {};
  const wallet = walletFromSnapshot(walletSnap, safeHelperId);
  const signedBalanceMinor = walletSnap?.exists
    ? resolveSignedBalanceMinor(wallet)
    : resolveSignedBalanceMinor(userData.wallet || {});
  const earningAlreadyApplied = Boolean(earningSnap?.exists);

  let payoutProfile = normalizeSplitPayoutProfile(userData.payout || {});
  if (
    ensureSubaccount
    && !earningAlreadyApplied
    && safeChargeMinor > safeHelperMinor
    && wallet.reconciliationBlocked !== true
    && !payoutProfile.subaccountCode
    && payoutProfile.verificationStatus === 'verified'
  ) {
    payoutProfile = await ensureHelperPaystackSubaccount({
      db,
      admin,
      callPaystackApi,
      paystackSecretKey,
      helperId: safeHelperId,
      helperData: userData,
      logger,
    }) || payoutProfile;
  }

  return resolvePaystackSplitAllocation({
    helperId: safeHelperId,
    payoutProfile,
    helperWalletBalanceMinor: signedBalanceMinor,
    helperWalletBlocked: wallet.reconciliationBlocked === true,
    earningAlreadyApplied,
    helperAmountMinor: safeHelperMinor,
    platformAmountMinor: safePlatformMinor,
    customerChargeAmountMinor: safeChargeMinor,
    bearer,
  });
}

module.exports = {
  SPLIT_MODES,
  buildPaystackSplitParams,
  createPaystackSubaccount,
  ensureHelperPaystackSubaccount,
  isSplitManagedSettlementMode,
  normalizeSplitPayoutProfile,
  resolveAttemptSplitAllocation,
  resolvePaystackSplitAllocation,
};
