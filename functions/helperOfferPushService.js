const { createHash } = require('node:crypto');

const WEB_PUSH_TOKENS_SUBCOLLECTION = 'webPushTokens';
const WEB_PUSH_DELIVERIES_COLLECTION = 'webPushOfferDeliveries';
const OFFER_STATUS_HELPER_FOUND = 'helper_found';

const IGNORED_OFFER_ANSWER_KEYS = new Set([
  'travel_distance_km',
  'service_address_target',
  'service_address',
  'timing_preference',
  'scheduled_for_text',
  'selectedoptionid',
  'selected_option_id',
  'preselectedpaymenttype',
  'pre_selected_payment_type',
  'paymentmethod',
  'payment_method',
]);

const INVALID_FCM_TOKEN_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/mismatched-credential',
]);

function normalizeTimestampMs(value) {
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?._seconds === 'number') return value._seconds * 1000;
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatRand(amount) {
  return `R${(Number(amount || 0) || 0).toFixed(2)}`;
}

function formatDetailLabel(rawKey = '') {
  const spaced = String(rawKey || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!spaced) return '';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function formatDetailValue(rawValue) {
  if (rawValue === null || rawValue === undefined) return '';
  if (typeof rawValue === 'boolean') return rawValue ? 'Yes' : 'No';
  if (Array.isArray(rawValue)) {
    return rawValue.map(formatDetailValue).filter(Boolean).join(', ');
  }
  const text = String(rawValue).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (/^[a-z0-9_]+$/.test(text) && text.includes('_')) {
    const cleaned = text.replace(/_+/g, ' ').trim();
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return text;
}

function resolveOfferPaymentType(request = {}) {
  const rawType = String(
    request?.preSelectedPaymentType
    || request?.requestPayload?.preSelectedPaymentType
    || request?.paymentMethod
    || request?.paymentOperation?.method
    || request?.settlementData?.method
    || '',
  )
    .trim()
    .toLowerCase();

  if (rawType === 'cash') return 'cash';
  if (
    rawType === 'card'
    || rawType === 'saved_card'
    || rawType === 'paystack_checkout'
    || rawType === 'paystack'
    || Boolean(
      request?.preSelectedCardId
      || request?.requestPayload?.preSelectedCardId
      || request?.selectedCardId
      || request?.requestPayload?.selectedCardId
      || request?.preSelectedCardMode
      || request?.requestPayload?.preSelectedCardMode,
    )
  ) {
    return 'card';
  }
  return '';
}

function extractOfferDetails(request = {}, offerTitle = '') {
  const normalizedTitle = String(offerTitle || '').trim().toLowerCase();
  const candidates = [
    request?.description,
    request?.requestPayload?.summary,
    request?.serviceSummary,
    request?.selectedOptionTitle,
    request?.requestPayload?.selectedOptionTitle,
  ];
  const summaryText =
    candidates
      .map((item) => String(item || '').replace(/\s+/g, ' ').trim())
      .find(
        (item) =>
          Boolean(item)
          && item.toLowerCase() !== 'a customer is requesting help.'
          && item.toLowerCase() !== normalizedTitle,
      ) || '';

  const rawAnswers = request?.structuredAnswers || request?.requestPayload?.structuredAnswers || {};
  const answerRows = [];
  if (rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers)) {
    for (const [key, rawValue] of Object.entries(rawAnswers)) {
      const normalizedKey = String(key || '').trim().toLowerCase();
      if (!normalizedKey || IGNORED_OFFER_ANSWER_KEYS.has(normalizedKey)) continue;
      const value = formatDetailValue(rawValue);
      const label = formatDetailLabel(key);
      if (!label || !value) continue;
      answerRows.push({ key, label, value });
      if (answerRows.length >= 8) break;
    }
  }

  const rawNote = String(
    request?.notes
    || request?.requestPayload?.notes
    || request?.additionalDetails
    || request?.requestPayload?.additionalDetails
    || '',
  )
    .replace(/\s+/g, ' ')
    .trim();
  const noteText = rawNote && !answerRows.some((item) => item.value.toLowerCase() === rawNote.toLowerCase())
    ? rawNote
    : '';

  return { summaryText, answerRows, noteText };
}

function resolveOfferArea(request = {}) {
  return String(
    request?.area
    || request?.requestPayload?.serviceAddress
    || request?.requestPayload?.address
    || request?.serviceAddress
    || 'Location pending',
  ).trim();
}

function resolveOfferTimingLabel(request = {}, isBusyFallback = false) {
  if (isBusyFallback) return 'After current job';
  const pref = String(request?.timingPreference || request?.requestPayload?.timingPreference || '').trim().toLowerCase();
  const scheduledForText = String(request?.scheduledForText || request?.requestPayload?.scheduledForText || '').trim();
  if (pref === 'later' && scheduledForText) return `Scheduled: ${scheduledForText}`;
  if (pref === 'later') return 'Scheduled';
  if (pref === 'now') return 'Now';
  return '';
}

function isInvalidFcmRegistrationError(error) {
  const code = String(error?.code || '').trim().toLowerCase();
  if (INVALID_FCM_TOKEN_ERROR_CODES.has(code)) return true;
  const message = String(error?.message || '').toLowerCase();
  return code === 'messaging/invalid-argument' && message.includes('registration token');
}

function stablePushDeliveryId(requestId, offerRevision, helperId) {
  return createHash('sha256')
    .update(`helper-web-push:${requestId}:${offerRevision}:${helperId}`)
    .digest('hex')
    .slice(0, 40);
}

function buildOfferNotificationUrl(basePath, { requestId, action, offerToken, offerRevision } = {}) {
  const params = new URLSearchParams();
  if (requestId) params.set('offerId', String(requestId));
  if (action) params.set('offerAction', String(action));
  if (offerToken) params.set('offerToken', String(offerToken));
  if (offerRevision) params.set('offerRevision', String(offerRevision));
  const query = params.toString();
  return `${basePath || '/home'}${query ? `?${query}` : ''}`;
}

function buildHelperOfferPushPayload({
  requestId = '',
  request = {},
  helperId = '',
  payoutAmount = null,
  nowMs = Date.now(),
} = {}) {
  const cleanRequestId = String(requestId || request?.id || '').trim();
  const cleanHelperId = String(helperId || request?.currentOfferHelperId || '').trim();
  const offerToken = String(request?.offerToken || '').trim();
  const offerRevision = Math.max(0, Number(request?.offerRevision || 0) || 0);
  const expiresAtMs = normalizeTimestampMs(request?.offerExpiresAt);
  const lastOfferAtMs = normalizeTimestampMs(request?.lastOfferAt) || nowMs;
  const isBusyFallback = String(request?.offerType || '').trim().toLowerCase() === 'busy_helper_fallback';

  const offerTitle = String(
    request?.topic || request?.subject || request?.serviceSummary || 'Service request',
  ).trim();
  const customerName = String(request?.customerName || 'Customer').trim() || 'Customer';
  const areaText = resolveOfferArea(request);

  const numericPayout = payoutAmount !== null && payoutAmount !== undefined && Number.isFinite(Number(payoutAmount))
    ? Number(payoutAmount)
    : Number(
        request?.helperPayoutBreakdown?.helperAmount
        ?? request?.pricingSnapshot?.total
        ?? request?.pricingSnapshot?.finalAmount
        ?? 0,
      );
  const payoutText = numericPayout > 0 ? formatRand(numericPayout) : 'New job';

  const paymentType = resolveOfferPaymentType(request);
  const paymentLabel = paymentType === 'card' ? 'Card' : paymentType === 'cash' ? 'Cash' : '';
  const timingLabel = resolveOfferTimingLabel(request, isBusyFallback);
  const secondsLeft = expiresAtMs > nowMs ? Math.max(1, Math.ceil((expiresAtMs - nowMs) / 1000)) : 0;

  const details = extractOfferDetails(request, offerTitle);
  const titlePrefix = isBusyFallback ? 'Next Job Offer' : 'New Job Offer';
  const title = `${titlePrefix} · ${offerTitle} (${payoutText})`;

  const lines = [`${customerName} | ${areaText}`];
  const metaParts = [];
  if (paymentLabel) metaParts.push(`Payment: ${paymentLabel}`);
  if (timingLabel) metaParts.push(`Timing: ${timingLabel}`);
  if (secondsLeft > 0) metaParts.push(`${secondsLeft}s window`);
  if (metaParts.length > 0) {
    lines.push(metaParts.join(' · '));
  }
  if (details.summaryText) {
    lines.push(details.summaryText);
  }
  if (details.answerRows.length > 0) {
    lines.push(details.answerRows.map((row) => `${row.label}: ${row.value}`).join(' · '));
  }
  if (details.noteText) {
    lines.push(`Notes: ${details.noteText}`);
  }

  let body = lines.join('\n').trim();
  if (body.length > 600) {
    body = `${body.slice(0, 597)}...`;
  }

  const tag = cleanRequestId ? `uncedo-offer-${cleanRequestId}` : 'uncedo-offer-live';
  const ttlSeconds = expiresAtMs > nowMs
    ? Math.max(15, Math.min(300, Math.ceil((expiresAtMs - nowMs) / 1000) + 15))
    : 60;

  const focusPath = buildOfferNotificationUrl('/home', {
    requestId: cleanRequestId,
    action: 'view',
    offerToken,
    offerRevision,
  });
  const acceptPath = buildOfferNotificationUrl('/home', {
    requestId: cleanRequestId,
    action: 'accept',
    offerToken,
    offerRevision,
  });
  const declinePath = buildOfferNotificationUrl('/home', {
    requestId: cleanRequestId,
    action: 'decline',
    offerToken,
    offerRevision,
  });

  // All FCM data values must be strings. Keeping message data-only ensures the
  // unified PWA service worker renders full offer details and Accept/Decline buttons.
  return {
    data: {
      type: 'uncedo-job-offer',
      requestId: cleanRequestId,
      helperId: cleanHelperId,
      offerToken,
      offerRevision: String(offerRevision),
      offerExpiresAt: String(expiresAtMs),
      lastOfferAt: String(lastOfferAtMs),
      isBusyFallback: isBusyFallback ? 'true' : 'false',
      canRespond: 'true',
      title,
      body,
      tag,
      offerTitle,
      focusPath,
      acceptPath,
      declinePath,
    },
    webpush: {
      headers: {
        Urgency: 'high',
        TTL: String(ttlSeconds),
      },
    },
  };
}

async function sendHelperOfferWebPush({
  db,
  messaging,
  serverTimestamp,
  requestId,
  after,
  helperId,
  payoutAmount = null,
  nowMs = Date.now(),
  logger = console,
} = {}) {
  const cleanRequestId = String(requestId || '').trim();
  const cleanHelperId = String(helperId || after?.currentOfferHelperId || '').trim();
  const offerToken = String(after?.offerToken || '').trim();
  const offerRevision = Math.max(0, Number(after?.offerRevision || 0) || 0);
  if (!cleanRequestId || !cleanHelperId || !offerToken || !offerRevision) {
    return { sent: 0, skipped: true, reason: 'missing-offer-fields' };
  }

  const tokensRef = db.collection('users').doc(cleanHelperId).collection(WEB_PUSH_TOKENS_SUBCOLLECTION);
  const tokensSnap = await tokensRef.get();
  const tokenRecords = [];
  const seenTokens = new Set();
  for (const docSnap of tokensSnap.docs || []) {
    const tokenData = docSnap.data() || {};
    const token = String(tokenData.token || '').trim();
    if (!token || tokenData.enabled === false || seenTokens.has(token)) continue;
    seenTokens.add(token);
    tokenRecords.push({ docId: docSnap.id, ref: docSnap.ref, token });
  }

  if (tokenRecords.length === 0) {
    return { sent: 0, skipped: true, reason: 'no-registered-web-tokens' };
  }

  const deliveryId = stablePushDeliveryId(cleanRequestId, offerRevision, cleanHelperId);
  const deliveryRef = db.collection(WEB_PUSH_DELIVERIES_COLLECTION).doc(deliveryId);
  const requestRef = db.collection('serviceRequests').doc(cleanRequestId);

  const claimed = await db.runTransaction(async (transaction) => {
    const [deliverySnap, currentReqSnap] = await Promise.all([
      transaction.get(deliveryRef),
      transaction.get(requestRef),
    ]);
    if (deliverySnap.exists || !currentReqSnap.exists) {
      return false;
    }
    const current = currentReqSnap.data() || {};
    if (
      String(current.status || '').toLowerCase() !== OFFER_STATUS_HELPER_FOUND
      || String(current.currentOfferHelperId || '').trim() !== cleanHelperId
      || String(current.offerToken || '').trim() !== offerToken
      || (Number(current.offerRevision || 0) || 0) !== offerRevision
      || normalizeTimestampMs(current.offerExpiresAt) <= nowMs
    ) {
      return false;
    }
    transaction.create(deliveryRef, {
      requestId: cleanRequestId,
      helperId: cleanHelperId,
      offerRevision,
      tokenCount: tokenRecords.length,
      createdAtMs: nowMs,
      createdAt: serverTimestamp,
    });
    return true;
  });

  if (!claimed) {
    return { sent: 0, skipped: true, reason: 'already-dispatched-or-stale' };
  }

  const payload = buildHelperOfferPushPayload({
    requestId: cleanRequestId,
    request: after,
    helperId: cleanHelperId,
    payoutAmount,
    nowMs,
  });

  const messages = tokenRecords.map((record) => ({
    token: record.token,
    data: payload.data,
    webpush: payload.webpush,
  }));

  const batchResult = await messaging.sendEach(messages);
  const responses = Array.isArray(batchResult?.responses) ? batchResult.responses : [];
  let sentCount = 0;
  let prunedCount = 0;
  const pruneDeletes = [];

  responses.forEach((resp, index) => {
    const record = tokenRecords[index];
    if (resp?.success) {
      sentCount += 1;
      return;
    }
    if (record?.ref && isInvalidFcmRegistrationError(resp?.error)) {
      prunedCount += 1;
      pruneDeletes.push(record.ref.delete().catch(() => null));
    } else if (resp?.error) {
      logger?.warn?.('helper_web_push_token_send_failed', {
        requestId: cleanRequestId,
        helperId: cleanHelperId,
        offerRevision,
        errorCode: String(resp.error?.code || 'unknown').slice(0, 80),
      });
    }
  });

  if (pruneDeletes.length > 0) {
    await Promise.all(pruneDeletes);
  }

  await deliveryRef.set(
    {
      sentCount,
      prunedCount,
      updatedAtMs: Date.now(),
      updatedAt: serverTimestamp,
    },
    { merge: true },
  ).catch(() => null);

  return {
    sent: sentCount,
    pruned: prunedCount,
    totalTokens: tokenRecords.length,
  };
}

module.exports = {
  WEB_PUSH_TOKENS_SUBCOLLECTION,
  WEB_PUSH_DELIVERIES_COLLECTION,
  buildHelperOfferPushPayload,
  buildOfferNotificationUrl,
  isInvalidFcmRegistrationError,
  sendHelperOfferWebPush,
  stablePushDeliveryId,
};
