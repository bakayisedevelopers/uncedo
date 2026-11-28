'use strict';

const DEFAULT_WAITING_FREE_GRACE_MINUTES = 2;
const DEFAULT_WAITING_RATE_PER_MINUTE = 1;

function buildWaitingGraceStartedWhatsAppText({
  request = {},
  requestId = '',
  freeGraceMinutes = DEFAULT_WAITING_FREE_GRACE_MINUTES,
  ratePerMinute = DEFAULT_WAITING_RATE_PER_MINUTE,
} = {}) {
  const serviceName = String(request.serviceSummary || request.subject || 'your Uncedo service').trim();
  const helperName = String(request.helperAssignment?.helperName || 'Your helper').trim();
  const refCode = String(request.publicRequestReference || request.requestReference || '').trim();
  const refPrefix = refCode ? `[*${refCode}*] ` : '';
  const safeMinutes = Math.max(1, Number(freeGraceMinutes || DEFAULT_WAITING_FREE_GRACE_MINUTES));
  const safeRate = Math.max(1, Number(ratePerMinute || DEFAULT_WAITING_RATE_PER_MINUTE));
  return `${refPrefix}⏱️ Your *${safeMinutes} free waiting minutes* with *${helperName}* have ended.\n\nWaiting charges have now started at *R${safeRate}/min* for *${serviceName}* until work starts. Please meet *${helperName}* and share your 6-digit arrival PIN.`;
}

async function executeWaitingGraceNotice({
  db,
  admin,
  requestId,
  expectedArrivedAtMs = 0,
  now = Date.now(),
  freeGraceMinutes = DEFAULT_WAITING_FREE_GRACE_MINUTES,
  ratePerMinute = DEFAULT_WAITING_RATE_PER_MINUTE,
  timestampToMillis,
  resolveCustomerWhatsAppIdentityId,
  whatsappNotificationsEnabled,
  whatsappMessagingEnabled,
  getWhatsAppSecrets,
  createMetaWhatsAppClient,
  isWhatsAppRecipientAllowed,
  isWithinCustomerServiceWindow,
  buildServiceUpdateTemplateComponents,
  formatWhatsAppText,
  stableEventId,
  createUserNotificationOnce,
  onRequeueEarly,
  logger = console,
} = {}) {
  const safeRequestId = String(requestId || '').trim();
  if (!safeRequestId) return { skipped: true, reason: 'missing-request-id' };

  const requestRef = db.collection('serviceRequests').doc(safeRequestId);
  const requestSnap = await requestRef.get();
  if (!requestSnap.exists) return { skipped: true, reason: 'not-found' };

  const request = requestSnap.data() || {};
  const status = String(request.status || '').trim().toLowerCase();
  if (status !== 'arrived') {
    return { skipped: true, reason: 'no-longer-arrived', status };
  }

  const arrivedAtMs = Number(
    timestampToMillis(
      request.arrivedAt
      || request.helperAssignment?.arrivedAt
      || request.arrivalVerification?.generatedAtMs,
    ) || expectedArrivedAtMs || 0,
  );
  if (!arrivedAtMs) {
    return { skipped: true, reason: 'missing-arrived-at' };
  }
  if (expectedArrivedAtMs > 0 && Math.abs(expectedArrivedAtMs - arrivedAtMs) > 60_000) {
    return { skipped: true, reason: 'stale-arrival-instance', arrivedAtMs };
  }

  const graceMs = Math.max(1, Number(freeGraceMinutes || DEFAULT_WAITING_FREE_GRACE_MINUTES)) * 60_000;
  const graceEndMs = arrivedAtMs + graceMs;
  if (now < graceEndMs - 5_000) {
    if (typeof onRequeueEarly === 'function') {
      await onRequeueEarly({
        requestId: safeRequestId,
        arrivedAtMs,
        delaySeconds: Math.max(1, Math.ceil((graceEndMs - now) / 1000)),
      });
    }
    return { skipped: true, reason: 'requeued-until-grace-ends', graceEndMs };
  }

  const alreadySentAtMs = Number(request.waitingChargeNoticeSentAtMs || 0);
  if (alreadySentAtMs >= arrivedAtMs) {
    return { skipped: true, reason: 'already-sent' };
  }

  const customerId = String(request.customerId || '').trim();
  const serviceName = String(request.serviceSummary || request.subject || 'your Uncedo service').trim();
  const messageBody = buildWaitingGraceStartedWhatsAppText({
    request,
    requestId: safeRequestId,
    freeGraceMinutes,
    ratePerMinute,
  });

  if (customerId && typeof createUserNotificationOnce === 'function') {
    await createUserNotificationOnce({
      notificationId: `waiting_grace_${safeRequestId}_${arrivedAtMs}`,
      userId: customerId,
      title: 'Waiting charge started (R1/min)',
      message: messageBody,
      type: 'waiting_charge_started',
      requestId: safeRequestId,
      targetPath: `/customer/requests/${safeRequestId}`,
      metadata: { arrivedAtMs, ratePerMinute, freeGraceMinutes },
    }).catch(() => null);
  }

  let whatsappSent = false;
  let whatsappSkippedReason = '';
  const notifyEnabled = typeof whatsappNotificationsEnabled === 'function' ? whatsappNotificationsEnabled() : true;
  const messagingEnabled = typeof whatsappMessagingEnabled === 'function' ? whatsappMessagingEnabled() : true;
  if (!notifyEnabled || !messagingEnabled) {
    whatsappSkippedReason = 'whatsapp-disabled';
  } else {
    const identityId = await resolveCustomerWhatsAppIdentityId({ customerId, request });
    if (!identityId) {
      whatsappSkippedReason = 'no-whatsapp-identity';
    } else {
      const secrets = typeof getWhatsAppSecrets === 'function' ? getWhatsAppSecrets() : {};
      if (!secrets?.accessToken || !secrets?.phoneNumberId || !secrets?.graphApiVersion) {
        whatsappSkippedReason = 'missing-whatsapp-secrets';
      } else {
        const identityRef = db.collection('whatsappIdentities').doc(identityId);
        const conversationRef = db.collection('whatsappConversations').doc(identityId);
        const [identitySnap, conversationSnap] = await Promise.all([
          identityRef.get(),
          conversationRef.get(),
        ]);
        const identity = identitySnap?.exists ? (identitySnap.data() || {}) : null;
        const conversation = conversationSnap?.exists ? (conversationSnap.data() || {}) : {};
        const lastInboundAtMs = Number(conversation.lastInboundMessageAtMs || 0);
        const inServiceWindow = typeof isWithinCustomerServiceWindow === 'function'
          ? isWithinCustomerServiceWindow(lastInboundAtMs, now)
          : true;
        const optedIn = Number(identity?.whatsappNotificationsConsentAtMs || 0) > 0
          || identity?.whatsappNotificationsEnabled === true;

        if (!identity || !identity.waId || (identity.phoneNumberId && identity.phoneNumberId !== secrets.phoneNumberId)) {
          whatsappSkippedReason = 'invalid-identity';
        } else if (identity.whatsappNotificationsEnabled === false) {
          whatsappSkippedReason = 'notifications-disabled-for-user';
        } else if (!inServiceWindow && !optedIn) {
          whatsappSkippedReason = 'outside-window-without-opt-in';
        } else if (typeof isWhatsAppRecipientAllowed === 'function' && !isWhatsAppRecipientAllowed(identity.waId)) {
          whatsappSkippedReason = 'recipient-not-allowlisted';
        } else {
          const approvedNames = Array.isArray(secrets.approvedTemplateNames) ? secrets.approvedTemplateNames : [];
          const templateName = String(
            process.env.WHATSAPP_TEMPLATE_WAITING_CHARGE_STARTED_NAME
            || process.env.WHATSAPP_TEMPLATE_HELPER_ARRIVED_NAME
            || process.env.WHATSAPP_TEMPLATE_SERVICE_STARTED_NAME
            || (approvedNames.includes('uncedo_service_update') ? 'uncedo_service_update' : '')
            || '',
          ).trim();
          const languageCode = String(
            process.env.WHATSAPP_TEMPLATE_WAITING_CHARGE_STARTED_LANGUAGE
            || process.env.WHATSAPP_TEMPLATE_HELPER_ARRIVED_LANGUAGE
            || process.env.WHATSAPP_TEMPLATE_SERVICE_STARTED_LANGUAGE
            || 'en',
          ).trim();
          const templateAvailable = Boolean(templateName && languageCode && approvedNames.includes(templateName));

          if (!inServiceWindow && !templateAvailable) {
            whatsappSkippedReason = 'no-approved-template-outside-window';
          } else {
            const eventId = stableEventId(`waiting_grace:${safeRequestId}:${arrivedAtMs}:${identityId}`);
            const outboundRef = db.collection('whatsappMessages').doc(eventId);
            const sendMode = inServiceWindow ? 'text' : 'template';
            const claimed = await db.runTransaction(async (transaction) => {
              const [outboundSnap, latestRequestSnap] = await Promise.all([
                transaction.get(outboundRef),
                transaction.get(requestRef),
              ]);
              const existingOutboundStatus = String(outboundSnap.exists ? outboundSnap.data()?.status || '' : '').trim().toLowerCase();
              if ((outboundSnap.exists && existingOutboundStatus !== 'failed') || !latestRequestSnap.exists) return false;
              const latest = latestRequestSnap.data() || {};
              if (String(latest.status || '').trim().toLowerCase() !== 'arrived') return false;
              if (Number(latest.waitingChargeNoticeSentAtMs || 0) >= arrivedAtMs) return false;
              transaction.set(outboundRef, {
                eventId,
                identityId,
                requestId: safeRequestId,
                phoneNumberId: secrets.phoneNumberId,
                to: identity.waId,
                direction: 'outbound',
                type: sendMode,
                status: 'sending',
                ...(sendMode === 'template' ? { templateName } : { text: messageBody }),
                updatedAtMs: now,
                createdAtMs: outboundSnap.exists ? (outboundSnap.data()?.createdAtMs || now) : now,
                createdAt: outboundSnap.exists ? (outboundSnap.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp()) : admin.firestore.FieldValue.serverTimestamp(),
              }, { merge: true });
              return true;
            });

            if (claimed) {
              const client = createMetaWhatsAppClient(secrets);
              const formattedText = typeof formatWhatsAppText === 'function'
                ? formatWhatsAppText(messageBody)
                : messageBody;
              try {
                const delivery = sendMode === 'text'
                  ? await client.sendText({ to: identity.waId, text: formattedText, lastInboundAtMs, now })
                  : await client.sendTemplate({
                      to: identity.waId,
                      name: templateName,
                      languageCode,
                      components: buildServiceUpdateTemplateComponents({
                        service: serviceName.slice(0, 180),
                        update: formattedText.slice(0, 240),
                      }),
                    });
                await Promise.all([
                  outboundRef.set({
                    status: 'sent',
                    metaMessageId: delivery?.messageId || null,
                    sentAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                  }, { merge: true }),
                  requestRef.set({
                    waitingChargeNoticeSentAtMs: now,
                    waitingChargeNoticeArrivedAtMs: arrivedAtMs,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                  }, { merge: true }),
                ]);
                whatsappSent = true;
              } catch (error) {
                whatsappSkippedReason = String(error?.code || 'meta_send_failed').slice(0, 80);
                logger?.warn?.('waiting_grace_whatsapp_send_failed', {
                  requestId: safeRequestId,
                  error: String(error?.message || 'send_failed').slice(0, 160),
                });
                await outboundRef.set({
                  status: 'failed',
                  errorCode: whatsappSkippedReason,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true }).catch(() => null);
              }
            } else {
              whatsappSkippedReason = 'duplicate-or-status-changed';
            }
          }
        }
      }
    }
  }

  if (!whatsappSent && whatsappSkippedReason) {
    logger?.info?.('waiting_grace_whatsapp_skipped', {
      requestId: safeRequestId,
      reason: whatsappSkippedReason,
    });
  }

  return {
    skipped: false,
    requestId: safeRequestId,
    arrivedAtMs,
    whatsappSent,
    whatsappSkippedReason: whatsappSkippedReason || null,
  };
}

module.exports = {
  DEFAULT_WAITING_FREE_GRACE_MINUTES,
  DEFAULT_WAITING_RATE_PER_MINUTE,
  buildWaitingGraceStartedWhatsAppText,
  executeWaitingGraceNotice,
};
