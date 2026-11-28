'use strict';

const { createHash, randomBytes } = require('node:crypto');
const { findUnpaidCompletedRequest } = require('./marketplaceRequestOperations');
const { resolveSignedBalanceMinor } = require('./helperWalletService');

const ACCOUNT_DELETION_GRACE_DAYS = 30;
const ACCOUNT_DELETION_GRACE_MS = ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;
const ACCOUNT_DELETION_LINK_TTL_MS = 30 * 60 * 1000;

const ACTIVE_CUSTOMER_REQUEST_STATUSES = [
  'collecting_details',
  'scheduled_pending',
  'matching',
  'helper_found',
  'busy_helper_confirmation',
  'helper_queued',
  'accepted',
  'driving',
  'en_route',
  'buying_resources',
  'arrived',
  'work_started',
  'no_helper_available',
];

const ACTIVE_HELPER_JOB_STATUSES = [
  'helper_found',
  'busy_helper_confirmation',
  'helper_queued',
  'accepted',
  'driving',
  'en_route',
  'buying_resources',
  'arrived',
  'work_started',
];

function hashSha256(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function isAccountPendingDeletion(profile = {}) {
  if (!profile || typeof profile !== 'object') return false;
  const status = String(profile.accountStatus || '').trim().toLowerCase();
  if (status === 'pending_deletion') return true;
  const scheduledAtMs = Number(profile.deletionScheduledAtMs || 0);
  return Number.isFinite(scheduledAtMs) && scheduledAtMs > 0 && status !== 'active';
}

function resolveAccountRole(profile = {}, preferredRole = '') {
  const preferred = String(preferredRole || '').trim().toLowerCase();
  const roles = [
    profile.activeRole,
    profile.role,
    ...(Array.isArray(profile.roles) ? profile.roles : []),
  ].map((item) => String(item || '').trim().toLowerCase()).filter(Boolean);
  if (preferred === 'helper' || roles.some((item) => ['helper', 'provider', 'tutor'].includes(item))) {
    return 'helper';
  }
  return 'customer';
}

function formatDeletionDateLabel(timestampMs) {
  const numeric = Number(timestampMs || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 'in 30 days';
  try {
    return new Intl.DateTimeFormat('en-ZA', {
      timeZone: 'Africa/Johannesburg',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(numeric));
  } catch (_) {
    return new Date(numeric).toISOString().slice(0, 10);
  }
}

function maskEmailAddress(email = '') {
  const clean = String(email || '').trim();
  const atIndex = clean.indexOf('@');
  if (atIndex <= 1) return clean ? '***' : '';
  const local = clean.slice(0, atIndex);
  const domain = clean.slice(atIndex + 1);
  return `${local.slice(0, 2)}***@${domain}`;
}

function createWhatsAppAccountDeletionChallenge({
  uid,
  role,
  identityId,
  phoneNumber,
  mode = 'manage',
  sourceEventId = '',
  nowMs = Date.now(),
} = {}) {
  const cleanUid = String(uid || '').trim();
  const cleanRole = String(role || '').trim().toLowerCase();
  const cleanIdentityId = String(identityId || '').trim();
  const cleanPhone = String(phoneNumber || '').trim();
  const cleanMode = mode === 'reactivate' ? 'reactivate' : 'manage';
  if (!cleanUid) throw new Error('Account UID is required.');
  if (!['customer', 'helper'].includes(cleanRole)) throw new Error('A supported account role is required.');
  if (!cleanIdentityId) throw new Error('WhatsApp identity ID is required.');
  if (!/^\+[1-9]\d{7,14}$/.test(cleanPhone)) throw new Error('A valid WhatsApp E.164 phone number is required.');

  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashSha256(token);
  const expiresAtMs = nowMs + ACCOUNT_DELETION_LINK_TTL_MS;
  return {
    token,
    tokenHash,
    challenge: {
      uid: cleanUid,
      role: cleanRole,
      identityId: cleanIdentityId,
      phoneHash: hashSha256(cleanPhone),
      mode: cleanMode,
      sourceEventId: String(sourceEventId || '').trim(),
      status: 'pending',
      createdAtMs: nowMs,
      expiresAtMs,
    },
  };
}

function buildWhatsAppAccountDeletionUrl(baseUrl, token) {
  const cleanToken = String(token || '').trim();
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(cleanToken)) {
    throw new Error('A valid account deletion token is required.');
  }
  const url = new URL(String(baseUrl || '').trim());
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('The WhatsApp account deletion URL must use HTTPS without embedded credentials.');
  }
  url.search = '';
  url.hash = `wa_delete_token=${encodeURIComponent(cleanToken)}`;
  return url.toString();
}

function isWhatsAppAccountDeletionChallengeLive(challenge = {}, nowMs = Date.now()) {
  if (!challenge || typeof challenge !== 'object') return false;
  const status = String(challenge.status || '').trim().toLowerCase();
  if (!['pending', 'claimed'].includes(status)) return false;
  return Number(challenge.expiresAtMs || 0) > nowMs;
}

function isGenericPlaceholderName(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || ['customer', 'whatsapp customer', 'helper', 'uncedo helper', 'user', 'unknown'].includes(normalized);
}

function buildDeletedUserRecordSnapshot(uid, userData = {}, authUser = {}, nowMs = Date.now()) {
  const firstName = String(userData.firstName || '').trim();
  const lastName = String(userData.lastName || '').trim();
  const joinedName = [firstName, lastName].filter(Boolean).join(' ').trim();
  const fullName = [
    userData.fullName,
    userData.displayName,
    joinedName,
    authUser?.displayName,
    userData.email,
    authUser?.email,
  ]
    .map((item) => String(item || '').trim())
    .find((item) => item && !isGenericPlaceholderName(item)) || '';
  const displayName = [
    userData.displayName,
    userData.fullName,
    joinedName,
    authUser?.displayName,
  ]
    .map((item) => String(item || '').trim())
    .find((item) => item && !isGenericPlaceholderName(item)) || fullName;
  const email = String(userData.email || authUser?.email || '').trim().slice(0, 254);
  const phoneNumber = String(
    userData.whatsappPhoneNumber
    || userData.phoneNumber
    || userData.phone
    || authUser?.phoneNumber
    || '',
  ).trim().slice(0, 40);
  const role = resolveAccountRole(userData);
  const customerProfile = userData.customerProfile && typeof userData.customerProfile === 'object'
    ? userData.customerProfile
    : {};
  return {
    uid: String(uid || '').trim(),
    role,
    fullName: fullName.slice(0, 120),
    displayName: displayName.slice(0, 120),
    email,
    phoneNumber,
    accountType: String(customerProfile.accountType || userData.helperType || '').trim().slice(0, 40),
    businessName: String(customerProfile.businessName || userData.businessName || '').trim().slice(0, 120),
    serviceAddress: String(customerProfile.serviceAddress || userData.homeAddress || '').trim().slice(0, 300),
    city: String(userData.city || userData.address?.city || '').trim().slice(0, 100),
    accountDeleted: true,
    deletedAtMs: nowMs,
  };
}

async function validateAccountDeletionEligibility({ db, uid, profile = {}, role = '' } = {}) {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) {
    return { eligible: false, code: 'missing-uid', message: 'User account ID is required.' };
  }
  const effectiveRole = resolveAccountRole(profile, role);

  if (effectiveRole === 'helper') {
    const activeReqId = String(profile.activeServiceRequestId || '').trim();
    if (activeReqId) {
      return {
        eligible: false,
        code: 'active-job',
        message: 'Finish or cancel your active job before deleting your helper account.',
      };
    }
    const [activeHelperJobsSnap, walletSnap] = await Promise.all([
      db.collection('serviceRequests')
        .where('helperAssignment.helperId', '==', cleanUid)
        .where('status', 'in', ACTIVE_HELPER_JOB_STATUSES)
        .limit(1)
        .get(),
      db.collection('helperWallets').doc(cleanUid).get(),
    ]);
    if (activeHelperJobsSnap && !activeHelperJobsSnap.empty) {
      return {
        eligible: false,
        code: 'active-job',
        message: 'Finish or cancel your active job before deleting your helper account.',
      };
    }
    const walletData = walletSnap?.exists ? walletSnap.data() || {} : null;
    if (walletData && resolveSignedBalanceMinor(walletData) < 0) {
      return {
        eligible: false,
        code: 'negative-wallet-balance',
        message: 'Please settle your negative helper wallet balance before deleting your account.',
      };
    }
    return { eligible: true, role: effectiveRole };
  }

  const ownershipIds = [...new Set([
    cleanUid,
    ...(Array.isArray(profile.whatsappGuestPrincipalIds) ? profile.whatsappGuestPrincipalIds : []),
  ].map((item) => String(item || '').trim()).filter(Boolean))];

  const [activeSnaps, unpaidCompleted] = await Promise.all([
    Promise.all(ownershipIds.map((id) => db.collection('serviceRequests')
      .where('customerId', '==', id)
      .where('status', 'in', ACTIVE_CUSTOMER_REQUEST_STATUSES)
      .limit(1)
      .get())),
    findUnpaidCompletedRequest({
      db,
      principalId: cleanUid,
      extraCustomerIds: ownershipIds,
    }),
  ]);
  const hasActiveCustomerReq = activeSnaps.some((snap) => snap && !snap.empty);
  if (hasActiveCustomerReq) {
    return {
      eligible: false,
      code: 'active-request',
      message: 'Finish or cancel your active service request before deleting your account.',
    };
  }
  if (unpaidCompleted) {
    const refLabel = unpaidCompleted.requestReference || unpaidCompleted.unpaidRequestId;
    return {
      eligible: false,
      code: 'unpaid-completed-request',
      message: `Please pay your unpaid completed service request (${refLabel}) before deleting your account.`,
    };
  }
  if (Number(profile?.wallet?.balance || 0) < 0 || profile?.walletDebtOutstanding === true) {
    return {
      eligible: false,
      code: 'wallet-debt-outstanding',
      message: 'Please settle your outstanding balance before deleting your account.',
    };
  }
  return { eligible: true, role: effectiveRole };
}

async function scheduleAccountDeletion({
  db,
  admin,
  uid,
  role = '',
  channel = 'web',
  reason = '',
  nowMs = Date.now(),
} = {}) {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) throw new Error('Account UID is required.');
  const userRef = db.collection('users').doc(cleanUid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    return { code: 'not-found', message: 'Account profile could not be found.' };
  }
  const profile = userSnap.data() || {};
  const effectiveRole = resolveAccountRole(profile, role);

  if (isAccountPendingDeletion(profile)) {
    const scheduledAtMs = Number(profile.deletionScheduledAtMs || (nowMs + ACCOUNT_DELETION_GRACE_MS));
    return {
      code: 'already-pending-deletion',
      accountStatus: 'pending_deletion',
      role: effectiveRole,
      deletionRequestedAtMs: Number(profile.deletionRequestedAtMs || nowMs),
      deletionScheduledAtMs: scheduledAtMs,
      deletionDateLabel: formatDeletionDateLabel(scheduledAtMs),
      gracePeriodDays: ACCOUNT_DELETION_GRACE_DAYS,
    };
  }

  const eligibility = await validateAccountDeletionEligibility({
    db,
    uid: cleanUid,
    profile,
    role: effectiveRole,
  });
  if (!eligibility.eligible) {
    return { code: eligibility.code, message: eligibility.message, role: effectiveRole };
  }

  const scheduledAtMs = nowMs + ACCOUNT_DELETION_GRACE_MS;
  const cleanReason = String(reason || '').trim().slice(0, 500);
  const cleanChannel = String(channel || 'web').trim().slice(0, 40) || 'web';
  const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();
  const scheduledTimestamp = admin.firestore?.Timestamp?.fromMillis
    ? admin.firestore.Timestamp.fromMillis(scheduledAtMs)
    : new Date(scheduledAtMs);

  const patch = {
    accountStatus: 'pending_deletion',
    deletionRequestedAtMs: nowMs,
    deletionRequestedAt: serverTimestamp,
    deletionScheduledAtMs: scheduledAtMs,
    deletionScheduledAt: scheduledTimestamp,
    deletionGraceDays: ACCOUNT_DELETION_GRACE_DAYS,
    deletionRequestedRole: effectiveRole,
    deletionRequestChannel: cleanChannel,
    deletionReason: cleanReason || null,
    updatedAt: serverTimestamp,
  };
  if (effectiveRole === 'helper') {
    patch.onlineStatus = 'offline';
    patch.locationSharingEnabled = false;
    patch.appVisibilityState = 'offline';
    patch.dispatchPaused = true;
  }

  await db.runTransaction(async (transaction) => {
    const latestSnap = await transaction.get(userRef);
    if (!latestSnap.exists) return;
    transaction.set(userRef, patch, { merge: true });
    if (effectiveRole === 'helper') {
      transaction.set(db.collection('helperDispatchIndex').doc(cleanUid), {
        online: false,
        available: false,
        onlineStatus: 'offline',
        dispatchPaused: true,
        accountStatus: 'pending_deletion',
        updatedAt: serverTimestamp,
      }, { merge: true });
    }
    transaction.create(db.collection('auditEvents').doc(), {
      eventType: 'account_deletion_scheduled',
      actorUidHash: hashSha256(cleanUid),
      role: effectiveRole,
      channel: cleanChannel,
      deletionScheduledAtMs: scheduledAtMs,
      createdAtMs: nowMs,
      createdAt: serverTimestamp,
    });
  });

  return {
    code: 'scheduled',
    accountStatus: 'pending_deletion',
    role: effectiveRole,
    deletionRequestedAtMs: nowMs,
    deletionScheduledAtMs: scheduledAtMs,
    deletionDateLabel: formatDeletionDateLabel(scheduledAtMs),
    gracePeriodDays: ACCOUNT_DELETION_GRACE_DAYS,
  };
}

async function reactivateAccount({
  db,
  admin,
  uid,
  channel = 'web',
  nowMs = Date.now(),
} = {}) {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) throw new Error('Account UID is required.');
  const userRef = db.collection('users').doc(cleanUid);
  const FieldValue = admin.firestore.FieldValue;
  const serverTimestamp = FieldValue.serverTimestamp();

  const outcome = await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) return { code: 'not-found', message: 'This account is no longer available.' };
    const profile = userSnap.data() || {};
    const effectiveRole = resolveAccountRole(profile);
    if (!isAccountPendingDeletion(profile)) {
      return { code: 'already-active', accountStatus: 'active', role: effectiveRole };
    }
    const scheduledAtMs = Number(profile.deletionScheduledAtMs || 0);
    if (scheduledAtMs > 0 && nowMs > scheduledAtMs) {
      return {
        code: 'grace-period-expired',
        role: effectiveRole,
        message: 'The 30-day reactivation window for this account has ended.',
      };
    }

    const restorePatch = {
      accountStatus: 'active',
      deletionRequestedAtMs: FieldValue.delete(),
      deletionRequestedAt: FieldValue.delete(),
      deletionScheduledAtMs: FieldValue.delete(),
      deletionScheduledAt: FieldValue.delete(),
      deletionGraceDays: FieldValue.delete(),
      deletionRequestedRole: FieldValue.delete(),
      deletionRequestChannel: FieldValue.delete(),
      deletionReason: FieldValue.delete(),
      reactivatedAtMs: nowMs,
      reactivatedAt: serverTimestamp,
      reactivatedChannel: String(channel || 'web').trim().slice(0, 40) || 'web',
      updatedAt: serverTimestamp,
    };
    if (effectiveRole === 'helper') {
      restorePatch.dispatchPaused = false;
    }
    transaction.set(userRef, restorePatch, { merge: true });
    transaction.create(db.collection('auditEvents').doc(), {
      eventType: 'account_deletion_reactivated',
      actorUidHash: hashSha256(cleanUid),
      role: effectiveRole,
      channel: String(channel || 'web').trim().slice(0, 40) || 'web',
      createdAtMs: nowMs,
      createdAt: serverTimestamp,
    });
    return {
      code: 'reactivated',
      accountStatus: 'active',
      role: effectiveRole,
      reactivatedAtMs: nowMs,
    };
  });

  return outcome;
}

async function commitUpdatesInBatches({ db, updates = [] }) {
  for (let i = 0; i < updates.length; i += 400) {
    const chunk = updates.slice(i, i + 400);
    const batch = db.batch();
    chunk.forEach(({ ref, data }) => batch.set(ref, data, { merge: true }));
    await batch.commit();
  }
}

async function deleteDocsInBatches({ db, refs = [] }) {
  for (let i = 0; i < refs.length; i += 400) {
    const chunk = refs.slice(i, i + 400);
    const batch = db.batch();
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

async function imprintDeletedUserDetailsOnExistingRecords({
  db,
  uid,
  userData = {},
  snapshot,
  nowMs = Date.now(),
} = {}) {
  const cleanUid = String(uid || '').trim();
  const ownershipIds = [...new Set([
    cleanUid,
    ...(Array.isArray(userData.whatsappGuestPrincipalIds) ? userData.whatsappGuestPrincipalIds : []),
  ].map((item) => String(item || '').trim()).filter(Boolean))];

  const counts = {
    customerServiceRequests: 0,
    helperServiceRequests: 0,
    helperWeeklyPayouts: 0,
    financialOperations: 0,
    servicePaymentOperations: 0,
    supportTickets: 0,
  };

  const requestUpdates = [];
  const seenCustomerReqIds = new Set();
  const customerRequestSnaps = await Promise.all(
    ownershipIds.map((id) => db.collection('serviceRequests').where('customerId', '==', id).get()),
  );
  customerRequestSnaps.forEach((snap) => {
    (snap?.docs || []).forEach((docSnap) => {
      if (seenCustomerReqIds.has(docSnap.id)) return;
      seenCustomerReqIds.add(docSnap.id);
      const req = docSnap.data() || {};
      const resolvedName = !isGenericPlaceholderName(req.customerName)
        ? String(req.customerName).trim()
        : (snapshot.fullName || snapshot.displayName || snapshot.email || 'Customer');
      const resolvedEmail = String(req.customerEmail || snapshot.email || '').trim();
      const resolvedPhone = String(req.customerPhone || snapshot.phoneNumber || '').trim();
      const customerSnapshot = {
        uid: cleanUid,
        fullName: snapshot.fullName || resolvedName,
        displayName: snapshot.displayName || resolvedName,
        email: resolvedEmail,
        phoneNumber: resolvedPhone,
        ...(snapshot.accountType ? { accountType: snapshot.accountType } : {}),
        ...(snapshot.businessName ? { businessName: snapshot.businessName } : {}),
        ...(snapshot.serviceAddress ? { serviceAddress: snapshot.serviceAddress } : {}),
        accountDeleted: true,
        deletedAtMs: nowMs,
      };
      requestUpdates.push({
        ref: docSnap.ref,
        data: {
          customerName: resolvedName,
          ...(resolvedEmail ? { customerEmail: resolvedEmail } : {}),
          ...(resolvedPhone ? { customerPhone: resolvedPhone } : {}),
          customerDeleted: true,
          customerDeletedAtMs: nowMs,
          customerSnapshot,
        },
      });
      counts.customerServiceRequests += 1;
    });
  });

  const helperRequestSnap = await db.collection('serviceRequests')
    .where('helperAssignment.helperId', '==', cleanUid)
    .get();
  (helperRequestSnap?.docs || []).forEach((docSnap) => {
    const req = docSnap.data() || {};
    const existingAssignment = req.helperAssignment && typeof req.helperAssignment === 'object'
      ? req.helperAssignment
      : {};
    const resolvedHelperName = !isGenericPlaceholderName(existingAssignment.helperName || req.helperName)
      ? String(existingAssignment.helperName || req.helperName).trim()
      : (snapshot.fullName || snapshot.displayName || snapshot.email || 'Helper');
    const resolvedHelperEmail = String(existingAssignment.helperEmail || req.helperEmail || snapshot.email || '').trim();
    const resolvedHelperPhone = String(existingAssignment.helperPhone || req.helperPhone || snapshot.phoneNumber || '').trim();
    const helperSnapshot = {
      uid: cleanUid,
      fullName: snapshot.fullName || resolvedHelperName,
      displayName: snapshot.displayName || resolvedHelperName,
      email: resolvedHelperEmail,
      phoneNumber: resolvedHelperPhone,
      ...(snapshot.city ? { city: snapshot.city } : {}),
      accountDeleted: true,
      deletedAtMs: nowMs,
    };
    requestUpdates.push({
      ref: docSnap.ref,
      data: {
        helperName: resolvedHelperName,
        ...(resolvedHelperEmail ? { helperEmail: resolvedHelperEmail } : {}),
        ...(resolvedHelperPhone ? { helperPhone: resolvedHelperPhone } : {}),
        helperDeleted: true,
        helperDeletedAtMs: nowMs,
        helperSnapshot,
        helperAssignment: {
          ...existingAssignment,
          helperId: cleanUid,
          helperName: resolvedHelperName,
          ...(resolvedHelperEmail ? { helperEmail: resolvedHelperEmail } : {}),
          ...(resolvedHelperPhone ? { helperPhone: resolvedHelperPhone } : {}),
          helperDeleted: true,
          helperDeletedAtMs: nowMs,
        },
      },
    });
    counts.helperServiceRequests += 1;
  });
  await commitUpdatesInBatches({ db, updates: requestUpdates });

  const auxUpdates = [];
  const [
    weeklyPayoutSnap,
    finCustomerSnap,
    finHelperSnap,
    payOpCustomerSnap,
    payOpHelperSnap,
    supportUidSnap,
    supportCustomerSnap,
    supportHelperSnap,
  ] = await Promise.all([
    db.collection('helperWeeklyPayouts').where('helperId', '==', cleanUid).get(),
    db.collection('financialOperations').where('customerId', '==', cleanUid).get(),
    db.collection('financialOperations').where('helperId', '==', cleanUid).get(),
    db.collection('servicePaymentOperations').where('customerId', '==', cleanUid).get(),
    db.collection('servicePaymentOperations').where('helperId', '==', cleanUid).get(),
    db.collection('supportTickets').where('uid', '==', cleanUid).get(),
    db.collection('supportTickets').where('customerId', '==', cleanUid).get(),
    db.collection('supportTickets').where('helperId', '==', cleanUid).get(),
  ]);

  (weeklyPayoutSnap?.docs || []).forEach((docSnap) => {
    const data = docSnap.data() || {};
    const helperName = !isGenericPlaceholderName(data.helperName)
      ? String(data.helperName).trim()
      : (snapshot.fullName || snapshot.displayName || snapshot.email || 'Helper');
    auxUpdates.push({
      ref: docSnap.ref,
      data: {
        helperName,
        ...(snapshot.email ? { helperEmail: String(data.helperEmail || snapshot.email).trim() } : {}),
        ...(snapshot.phoneNumber ? { helperPhone: String(data.helperPhone || snapshot.phoneNumber).trim() } : {}),
        helperDeleted: true,
        helperDeletedAtMs: nowMs,
      },
    });
    counts.helperWeeklyPayouts += 1;
  });

  const seenFinOps = new Set();
  (finCustomerSnap?.docs || []).forEach((docSnap) => {
    seenFinOps.add(docSnap.id);
    auxUpdates.push({
      ref: docSnap.ref,
      data: {
        customerName: snapshot.fullName || snapshot.displayName || snapshot.email || 'Customer',
        ...(snapshot.email ? { customerEmail: snapshot.email } : {}),
        ...(snapshot.phoneNumber ? { customerPhone: snapshot.phoneNumber } : {}),
        customerDeleted: true,
        customerDeletedAtMs: nowMs,
      },
    });
    counts.financialOperations += 1;
  });
  (finHelperSnap?.docs || []).forEach((docSnap) => {
    if (!seenFinOps.has(docSnap.id)) counts.financialOperations += 1;
    auxUpdates.push({
      ref: docSnap.ref,
      data: {
        helperName: snapshot.fullName || snapshot.displayName || snapshot.email || 'Helper',
        ...(snapshot.email ? { helperEmail: snapshot.email } : {}),
        ...(snapshot.phoneNumber ? { helperPhone: snapshot.phoneNumber } : {}),
        helperDeleted: true,
        helperDeletedAtMs: nowMs,
      },
    });
  });

  const seenPayOps = new Set();
  (payOpCustomerSnap?.docs || []).forEach((docSnap) => {
    seenPayOps.add(docSnap.id);
    auxUpdates.push({
      ref: docSnap.ref,
      data: {
        customerName: snapshot.fullName || snapshot.displayName || snapshot.email || 'Customer',
        ...(snapshot.email ? { customerEmail: snapshot.email } : {}),
        ...(snapshot.phoneNumber ? { customerPhone: snapshot.phoneNumber } : {}),
        customerDeleted: true,
        customerDeletedAtMs: nowMs,
      },
    });
    counts.servicePaymentOperations += 1;
  });
  (payOpHelperSnap?.docs || []).forEach((docSnap) => {
    if (!seenPayOps.has(docSnap.id)) counts.servicePaymentOperations += 1;
    auxUpdates.push({
      ref: docSnap.ref,
      data: {
        helperName: snapshot.fullName || snapshot.displayName || snapshot.email || 'Helper',
        ...(snapshot.email ? { helperEmail: snapshot.email } : {}),
        ...(snapshot.phoneNumber ? { helperPhone: snapshot.phoneNumber } : {}),
        helperDeleted: true,
        helperDeletedAtMs: nowMs,
      },
    });
  });

  const seenSupportIds = new Set();
  [
    ...(supportUidSnap?.docs || []),
    ...(supportCustomerSnap?.docs || []),
    ...(supportHelperSnap?.docs || []),
  ].forEach((docSnap) => {
    if (seenSupportIds.has(docSnap.id)) return;
    seenSupportIds.add(docSnap.id);
    const data = docSnap.data() || {};
    auxUpdates.push({
      ref: docSnap.ref,
      data: {
        userName: String(data.userName || snapshot.fullName || snapshot.displayName || snapshot.email || '').trim(),
        ...(snapshot.email ? { userEmail: String(data.userEmail || snapshot.email).trim() } : {}),
        ...(snapshot.phoneNumber ? { userPhone: String(data.userPhone || snapshot.phoneNumber).trim() } : {}),
        userDeleted: true,
        userDeletedAtMs: nowMs,
      },
    });
    counts.supportTickets += 1;
  });

  await commitUpdatesInBatches({ db, updates: auxUpdates });
  return counts;
}

async function executePermanentAccountDeletion({
  db,
  admin,
  uid,
  nowMs = Date.now(),
} = {}) {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) throw new Error('Account UID is required.');
  const userRef = db.collection('users').doc(cleanUid);
  const [userSnap, authUser] = await Promise.all([
    userRef.get(),
    admin.auth().getUser(cleanUid).catch(() => null),
  ]);

  if (!userSnap.exists && !authUser) {
    return { code: 'already-deleted', uid: cleanUid };
  }

  const userData = userSnap.exists ? userSnap.data() || {} : {};
  const snapshot = buildDeletedUserRecordSnapshot(cleanUid, userData, authUser || {}, nowMs);

  // Step 1: Imprint details onto existing historical records ONLY where records exist.
  const imprintedCounts = await imprintDeletedUserDetailsOnExistingRecords({
    db,
    uid: cleanUid,
    userData,
    snapshot,
    nowMs,
  });

  // Step 2: Clean up active helper/customer profile, dispatch, service offerings, and WhatsApp links.
  const [
    helperServicesSnap,
    clearanceSubmissionsSnap,
    whatsappLinkSnap,
    phoneOwnerSnap,
    contactClaimsSnap,
    walletSnap,
  ] = await Promise.all([
    db.collection('helperServices').where('helperId', '==', cleanUid).get(),
    db.collection('helperPoliceClearanceSubmissions').where('helperId', '==', cleanUid).get(),
    db.collection('whatsappUserLinks').doc(cleanUid).get(),
    db.collection('whatsappPhoneOwnership').where('uid', '==', cleanUid).get(),
    db.collection('whatsappContactPhoneClaims').where('uid', '==', cleanUid).get(),
    db.collection('helperWallets').doc(cleanUid).get(),
  ]);

  const deleteRefs = [
    db.collection('helperDispatchIndex').doc(cleanUid),
    db.collection('helperPoliceClearanceRecords').doc(cleanUid),
    db.collection('whatsappUserLinks').doc(cleanUid),
    ...(helperServicesSnap?.docs || []).map((d) => d.ref),
    ...(clearanceSubmissionsSnap?.docs || []).map((d) => d.ref),
    ...(phoneOwnerSnap?.docs || []).map((d) => d.ref),
    ...(contactClaimsSnap?.docs || []).map((d) => d.ref),
  ];

  if (walletSnap?.exists) {
    const walletMinor = resolveSignedBalanceMinor(walletSnap.data() || {});
    if (walletMinor <= 0) {
      deleteRefs.push(walletSnap.ref);
    } else {
      const userPayout = userData.payout && typeof userData.payout === 'object' ? userData.payout : {};
      const payoutRecipientCode = String(userPayout.recipientCode || userPayout.paystackRecipientCode || '').trim();
      const payoutSubaccountCode = String(userPayout.subaccountCode || userPayout.paystackSubaccountCode || '').trim();
      const payoutVerified = String(userPayout.verificationStatus || '').trim().toLowerCase() === 'verified';
      const payoutSnapshot = payoutVerified && payoutRecipientCode
        ? {
          recipientCode: payoutRecipientCode,
          paystackRecipientCode: payoutRecipientCode,
          ...(payoutSubaccountCode ? { subaccountCode: payoutSubaccountCode } : {}),
          verificationStatus: 'verified',
          bankCode: String(userPayout.bankCode || '').trim(),
          bankName: String(userPayout.bankName || '').trim(),
          accountType: String(userPayout.accountType || '').trim(),
        }
        : null;
      await walletSnap.ref.set({
        helperName: snapshot.fullName || snapshot.displayName || 'Helper',
        ...(snapshot.email ? { helperEmail: snapshot.email } : {}),
        ...(payoutSnapshot ? { payoutSnapshot } : {}),
        helperDeleted: true,
        helperDeletedAtMs: nowMs,
      }, { merge: true });
    }
  }

  const linkedIdentityId = whatsappLinkSnap?.exists
    ? String(whatsappLinkSnap.data()?.identityId || '').trim()
    : '';
  const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();
  const FieldValue = admin.firestore.FieldValue;
  if (linkedIdentityId) {
    await Promise.all([
      db.collection('whatsappIdentities').doc(linkedIdentityId).set({
        linkedFirebaseUid: FieldValue.delete(),
        verifiedAt: FieldValue.delete(),
        updatedAt: serverTimestamp,
      }, { merge: true }).catch(() => null),
      db.collection('whatsappConversations').doc(linkedIdentityId).set({
        linkedFirebaseUid: FieldValue.delete(),
        currentMode: 'assistant',
        updatedAt: serverTimestamp,
      }, { merge: true }).catch(() => null),
    ]);
  }

  await deleteDocsInBatches({ db, refs: deleteRefs });

  if (typeof db.recursiveDelete === 'function') {
    await db.recursiveDelete(userRef).catch(() => userRef.delete().catch(() => null));
  } else {
    await userRef.delete().catch(() => null);
  }

  await admin.auth().deleteUser(cleanUid).catch((error) => {
    if (error?.code !== 'auth/user-not-found') throw error;
  });

  if (admin.database) {
    await admin.database().ref(`liveTracking/helpers/${cleanUid}`).remove().catch(() => null);
  }

  await db.collection('auditEvents').doc().set({
    eventType: 'account_permanently_deleted',
    actorUidHash: hashSha256(cleanUid),
    role: snapshot.role,
    imprintedCounts,
    deletedAtMs: nowMs,
    createdAt: serverTimestamp,
  }).catch(() => null);

  return {
    code: 'permanently-deleted',
    uid: cleanUid,
    role: snapshot.role,
    imprintedCounts,
  };
}

module.exports = {
  ACCOUNT_DELETION_GRACE_DAYS,
  ACCOUNT_DELETION_GRACE_MS,
  ACCOUNT_DELETION_LINK_TTL_MS,
  ACTIVE_CUSTOMER_REQUEST_STATUSES,
  ACTIVE_HELPER_JOB_STATUSES,
  buildDeletedUserRecordSnapshot,
  buildWhatsAppAccountDeletionUrl,
  createWhatsAppAccountDeletionChallenge,
  executePermanentAccountDeletion,
  formatDeletionDateLabel,
  imprintDeletedUserDetailsOnExistingRecords,
  isAccountPendingDeletion,
  isWhatsAppAccountDeletionChallengeLive,
  maskEmailAddress,
  reactivateAccount,
  resolveAccountRole,
  scheduleAccountDeletion,
  validateAccountDeletionEligibility,
};
