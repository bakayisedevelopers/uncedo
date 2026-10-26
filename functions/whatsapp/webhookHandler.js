'use strict';

function createWhatsAppWebhookHandler({
  getSecrets,
  isMessagingEnabled,
  isRecipientAllowed = () => false,
  verifyWebhookChallenge,
  verifyWebhookSignature,
  normalizeWebhookPayload,
  db,
  admin,
  logger,
}) {
  return async function whatsappWebhookHandler(req, res) {
    let secrets;
    try {
      secrets = getSecrets();
    } catch (error) {
      logger.error('whatsapp_webhook_secret_configuration_error', { error: error.message });
      res.status(503).send('WhatsApp webhook configuration is unavailable.');
      return;
    }

    if (req.method === 'GET') {
      const challenge = verifyWebhookChallenge({
        mode: req.query?.['hub.mode'],
        token: req.query?.['hub.verify_token'],
        challenge: req.query?.['hub.challenge'],
        expectedToken: secrets.verifyToken,
      });
      if (challenge === null) {
        res.status(403).send('Forbidden');
        return;
      }
      res.status(200).type('text/plain').send(challenge);
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed.');
      return;
    }
    if (!isMessagingEnabled()) {
      res.status(503).send('WhatsApp messaging is disabled.');
      return;
    }
    if (!Buffer.isBuffer(req.rawBody) || req.rawBody.length > 2 * 1024 * 1024) {
      res.status(req.rawBody?.length > 2 * 1024 * 1024 ? 413 : 400).send('Invalid webhook payload.');
      return;
    }
    const signature = req.get?.('x-hub-signature-256') || req.headers?.['x-hub-signature-256'];
    if (!verifyWebhookSignature(req.rawBody, signature, secrets.appSecret)) {
      logger.warn('whatsapp_webhook_signature_rejected');
      res.status(403).send('Invalid signature.');
      return;
    }

    if (req.body?.object !== 'whatsapp_business_account') {
      res.status(200).send('EVENT_RECEIVED');
      return;
    }

    try {
      const normalizedEvents = normalizeWebhookPayload(req.body);
      if (normalizedEvents.length > 100) {
        logger.warn('whatsapp_webhook_event_batch_too_large', { eventCount: normalizedEvents.length });
        res.status(413).send('Webhook event batch is too large.');
        return;
      }
      if (normalizedEvents.some((normalized) => normalized.phoneNumberId !== secrets.phoneNumberId)) {
        logger.warn('whatsapp_webhook_sender_mismatch');
        res.status(403).send('Unexpected WhatsApp sender.');
        return;
      }
      const acceptedEvents = [];
      let rejectedRecipientCount = 0;
      for (const normalized of normalizedEvents) {
        const recipient = normalized.eventType === 'message_status' ? normalized.recipientId : normalized.from;
        if (isRecipientAllowed(recipient, normalized)) acceptedEvents.push(normalized);
        else rejectedRecipientCount += 1;
      }
      if (rejectedRecipientCount) {
        logger.info('whatsapp_webhook_test_cohort_filtered', { rejectedEventCount: rejectedRecipientCount });
      }
      if (acceptedEvents.length === 0) {
        // The signed event is intentionally excluded by the controlled tester
        // cohort. Acknowledge it so Meta does not retry an event we will never
        // process, without persisting any unapproved sender data.
        res.status(200).send('EVENT_RECEIVED');
        return;
      }
      const receivedAtMs = Date.now();
      await Promise.all(acceptedEvents.map(async (normalized, index) => {
        const eventRef = db.collection('whatsappWebhookEvents').doc(normalized.eventId);
        await db.runTransaction(async (transaction) => {
          const eventSnap = await transaction.get(eventRef);
          if (eventSnap.exists) return;
          transaction.create(eventRef, {
            ...normalized,
            receivedAtMs: receivedAtMs + index,
            status: 'received',
            attemptCount: 0,
            retentionExpiresAtMs: Date.now() + Math.max(1, Math.min(3650, Number.parseInt(String(process.env.WHATSAPP_EVENT_RETENTION_DAYS || '30'), 10) || 30)) * 24 * 60 * 60 * 1000,
            receivedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });
      }));
      logger.info('whatsapp_webhook_events_persisted', { eventCount: acceptedEvents.length });
      res.status(200).send('EVENT_RECEIVED');
    } catch (error) {
      logger.error('whatsapp_webhook_event_persistence_failed', { error: error?.message || 'unknown_error' });
      res.status(500).send('Unable to persist webhook event.');
    }
  };
}

module.exports = { createWhatsAppWebhookHandler };
