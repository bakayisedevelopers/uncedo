export const IGNORED_OFFER_ANSWER_KEYS = new Set([
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

export function formatRand(amount) {
  return `R${(Number(amount || 0) || 0).toFixed(2)}`;
}

export function formatDetailLabel(rawKey = '') {
  const spaced = String(rawKey || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!spaced) return '';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export function formatDetailValue(rawValue) {
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

export function resolveOfferPaymentType(offer) {
  const rawType = String(
    offer?.preSelectedPaymentType
    || offer?.requestPayload?.preSelectedPaymentType
    || offer?.paymentMethod
    || offer?.paymentOperation?.method
    || offer?.settlementData?.method
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
      offer?.preSelectedCardId
      || offer?.requestPayload?.preSelectedCardId
      || offer?.selectedCardId
      || offer?.requestPayload?.selectedCardId
      || offer?.preSelectedCardMode
      || offer?.requestPayload?.preSelectedCardMode,
    )
  ) {
    return 'card';
  }
  return '';
}

export function extractOfferDetails(offer, offerTitle = '') {
  const normalizedTitle = String(offerTitle || '').trim().toLowerCase();
  const candidates = [
    offer?.description,
    offer?.requestPayload?.summary,
    offer?.serviceSummary,
    offer?.selectedOptionTitle,
    offer?.requestPayload?.selectedOptionTitle,
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

  const rawAnswers = offer?.structuredAnswers || offer?.requestPayload?.structuredAnswers || {};
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
    offer?.notes
    || offer?.requestPayload?.notes
    || offer?.additionalDetails
    || offer?.requestPayload?.additionalDetails
    || '',
  )
    .replace(/\s+/g, ' ')
    .trim();
  const noteText = rawNote && !answerRows.some((item) => item.value.toLowerCase() === rawNote.toLowerCase())
    ? rawNote
    : '';

  return { summaryText, answerRows, noteText };
}

function resolveOfferArea(offer) {
  return String(
    offer?.area
    || offer?.requestPayload?.serviceAddress
    || offer?.requestPayload?.address
    || offer?.serviceAddress
    || 'Location pending',
  ).trim();
}

function resolveOfferTimingLabel(offer, isBusyFallback) {
  if (isBusyFallback) return 'After current job';
  const pref = String(offer?.timingPreference || offer?.requestPayload?.timingPreference || '').trim().toLowerCase();
  const scheduledForText = String(offer?.scheduledForText || offer?.requestPayload?.scheduledForText || '').trim();
  if (pref === 'later' && scheduledForText) return `Scheduled: ${scheduledForText}`;
  if (pref === 'later') return 'Scheduled';
  if (pref === 'now') return 'Now';
  return '';
}

export function buildOfferActionPath({
  requestId = '',
  action = 'view',
  offerToken = '',
  offerRevision = 0,
} = {}) {
  const cleanRequestId = String(requestId || '').trim();
  const cleanAction = ['accept', 'decline', 'view'].includes(String(action || '').trim().toLowerCase())
    ? String(action || '').trim().toLowerCase()
    : 'view';
  const cleanToken = String(offerToken || '').trim();
  const cleanRevision = Math.max(0, Number(offerRevision || 0) || 0);
  const params = new URLSearchParams();
  if (cleanRequestId) params.set('offerId', cleanRequestId);
  if (cleanAction) params.set('offerAction', cleanAction);
  if (cleanToken) params.set('offerToken', cleanToken);
  if (cleanRevision > 0) params.set('offerRevision', String(cleanRevision));
  const query = params.toString();
  return `/home${query ? `?${query}` : ''}`;
}

export function parseOfferNotificationSearchParams(search = '') {
  const params = new URLSearchParams(String(search || ''));
  const requestId = String(params.get('offerId') || '').trim();
  const action = String(params.get('offerAction') || '').trim().toLowerCase();
  const offerToken = String(params.get('offerToken') || '').trim();
  const offerRevision = Math.max(0, Number(params.get('offerRevision') || 0) || 0);
  if (!requestId) return null;
  return {
    requestId,
    action: ['accept', 'decline', 'view'].includes(action) ? action : 'view',
    offerToken,
    offerRevision,
  };
}

export function buildOfferNotificationPayload(
  offer = {},
  {
    canRespond = true,
    origin = '',
    nowMs = Date.now(),
    payoutAmountOverride = null,
  } = {},
) {
  const requestId = String(offer?.id || offer?.requestId || '').trim();
  const offerTitle = String(
    offer?.title || offer?.subject || offer?.serviceSummary || 'Service request',
  ).trim();
  const customerName = String(offer?.customerName || 'Customer').trim() || 'Customer';
  const areaText = resolveOfferArea(offer);
  const payoutAmount = payoutAmountOverride !== null && payoutAmountOverride !== undefined
    ? Number(payoutAmountOverride)
    : Number(offer?.payoutEstimate || 0);
  const payoutText = payoutAmount > 0 ? formatRand(payoutAmount) : 'New job';
  const isBusyFallback = String(offer?.offerType || '').trim().toLowerCase() === 'busy_helper_fallback';
  const paymentType = resolveOfferPaymentType(offer);
  const paymentLabel = paymentType === 'card' ? 'Card' : paymentType === 'cash' ? 'Cash' : '';
  const timingLabel = resolveOfferTimingLabel(offer, isBusyFallback);
  const expiresAt = Number(offer?.offerExpiresAt || 0);
  const secondsLeft = expiresAt > nowMs ? Math.max(1, Math.ceil((expiresAt - nowMs) / 1000)) : 0;
  const offerToken = String(offer?.offerToken || '').trim();
  const offerRevision = Math.max(0, Number(offer?.offerRevision || 0) || 0);

  const details = extractOfferDetails(offer, offerTitle);
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

  const actions = canRespond
    ? [
        { action: 'accept', title: 'Accept' },
        { action: 'decline', title: 'Decline' },
      ]
    : [{ action: 'decline', title: 'Decline' }];

  const tag = requestId ? `uncedo-offer-${requestId}` : 'uncedo-offer-live';

  const data = {
    type: 'uncedo-job-offer',
    requestId,
    offerToken,
    offerRevision,
    offerExpiresAt: expiresAt,
    isBusyFallback,
    canRespond: Boolean(canRespond),
    offerTitle,
    appOrigin: String(origin || ''),
    focusPath: buildOfferActionPath({ requestId, action: 'view', offerToken, offerRevision }),
    acceptPath: buildOfferActionPath({ requestId, action: 'accept', offerToken, offerRevision }),
    declinePath: buildOfferActionPath({ requestId, action: 'decline', offerToken, offerRevision }),
  };

  const baseOptions = {
    body,
    icon: '/helpers-logo-192.png',
    badge: '/helpers-logo-192.png',
    tag,
    renotify: true,
    requireInteraction: true,
    timestamp: Number(offer?.lastOfferAt || nowMs),
    data,
  };

  const swOptions = {
    ...baseOptions,
    vibrate: [200, 100, 200],
    actions,
  };

  return {
    title,
    body,
    tag,
    actions,
    baseOptions,
    swOptions,
    data,
  };
}

const activeFallbackNotifications = new Map();

export function getBrowserNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission || 'default';
}

export async function requestBrowserNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission || 'default';
  }
}

async function getActiveServiceWorkerRegistration(timeoutMs = 450) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing && (existing.active || existing.waiting || existing.installing)) {
      if (existing.active) return existing;
    }
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => window.setTimeout(() => resolve(existing || null), timeoutMs)),
    ]);
    return ready && typeof ready.showNotification === 'function' ? ready : null;
  } catch {
    return null;
  }
}

export async function closeOfferBrowserNotification(requestId) {
  const cleanId = String(requestId || '').trim();
  if (!cleanId || typeof window === 'undefined') return;
  const tag = `uncedo-offer-${cleanId}`;

  const fallback = activeFallbackNotifications.get(cleanId);
  if (fallback) {
    try {
      fallback.close();
    } catch {
      // Ignore close errors
    }
    activeFallbackNotifications.delete(cleanId);
  }

  try {
    const reg = await getActiveServiceWorkerRegistration(250);
    if (reg && typeof reg.getNotifications === 'function') {
      const list = await reg.getNotifications({ tag });
      list.forEach((notification) => {
        try {
          notification.close();
        } catch {
          // Ignore close errors
        }
      });
    }
  } catch {
    // Ignore SW lookup errors
  }
}

export async function showOfferBrowserNotification(
  offer,
  {
    canRespond = true,
    payoutAmountOverride = null,
    onFallbackFocus = null,
  } = {},
) {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }

  const payload = buildOfferNotificationPayload(offer, {
    canRespond,
    origin: window.location.origin,
    payoutAmountOverride,
  });

  const reg = await getActiveServiceWorkerRegistration();
  if (reg && typeof reg.showNotification === 'function') {
    if (typeof reg.getNotifications === 'function') {
      try {
        const existing = await reg.getNotifications({ tag: payload.tag });
        const alreadyDisplayed = existing.some(
          (item) =>
            String(item?.data?.offerToken || '') === String(payload.data.offerToken || '')
            && Number(item?.data?.offerRevision || 0) === Number(payload.data.offerRevision || 0),
        );
        if (alreadyDisplayed) {
          return true;
        }
      } catch {
        // Proceed to show notification
      }
    }
    const maxActions = Number(Notification.maxActions || 0);
    const useActions = Number.isFinite(maxActions) ? maxActions >= 1 : true;
    try {
      await reg.showNotification(
        payload.title,
        useActions ? payload.swOptions : payload.baseOptions,
      );
      return true;
    } catch {
      try {
        await reg.showNotification(payload.title, payload.baseOptions);
        return true;
      } catch {
        // Fall through to window Notification constructor
      }
    }
  }

  try {
    const notification = new Notification(payload.title, payload.baseOptions);
    const requestId = String(offer?.id || offer?.requestId || '').trim();
    if (requestId) {
      const previous = activeFallbackNotifications.get(requestId);
      if (previous) {
        try {
          previous.close();
        } catch {
          // Ignore close errors
        }
      }
      activeFallbackNotifications.set(requestId, notification);
    }
    notification.onclose = () => {
      if (requestId && activeFallbackNotifications.get(requestId) === notification) {
        activeFallbackNotifications.delete(requestId);
      }
    };
    notification.onclick = () => {
      try {
        window.focus();
        if (typeof onFallbackFocus === 'function') {
          onFallbackFocus(offer);
        }
        notification.close();
      } catch {
        // Ignore focus errors
      }
    };
    return true;
  } catch {
    return false;
  }
}
