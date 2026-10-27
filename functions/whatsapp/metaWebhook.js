'use strict';

const { createHash, createHmac, timingSafeEqual } = require('node:crypto');

function constantTimeStringEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyWebhookChallenge({ mode, token, challenge, expectedToken }) {
  if (String(mode || '') !== 'subscribe' || !expectedToken || !constantTimeStringEqual(token, expectedToken)) {
    return null;
  }
  return String(challenge || '');
}

function verifyWebhookSignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret || !signatureHeader || !(Buffer.isBuffer(rawBody) || rawBody instanceof Uint8Array)) return false;
  const match = String(signatureHeader).match(/^sha256=([a-f0-9]{64})$/i);
  if (!match) return false;
  const supplied = Buffer.from(match[1], 'hex');
  const expected = createHmac('sha256', appSecret).update(Buffer.from(rawBody)).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function stableEventId(seed) {
  return `wa_${createHash('sha256').update(String(seed || '')).digest('hex')}`;
}

function normalizeButtonId(buttonId, buttonTitle) {
  const id = String(buttonId || '').trim().slice(0, 512);
  if (id) return id;
  // Some Meta button callback payloads may omit the developer payload while
  // retaining the exact button title. Only map these two unambiguous policy
  // consent labels; all other actions still require their opaque server ID.
  const title = String(buttonTitle || '').trim().toLowerCase();
  if (title === 'agree') return 'wa_ai_consent_yes';
  if (title === 'no thanks') return 'wa_ai_consent_no';
  return '';
}

function normalizeMessage(message = {}, metadata = {}, contact = {}) {
  const messageId = String(message.id || '').trim();
  const from = String(message.from || contact.wa_id || '').trim();
  const phoneNumberId = String(metadata.phone_number_id || '').trim();
  const timestamp = Number(message.timestamp || 0);
  if (!messageId || !from || !phoneNumberId || !Number.isFinite(timestamp) || timestamp <= 0) return null;

  const type = String(message.type || 'unknown').trim().toLowerCase();
  const payload = {
    eventId: stableEventId(`message:${phoneNumberId}:${messageId}`),
    eventType: 'message',
    phoneNumberId,
    messageId,
    from,
    timestampMs: timestamp * 1000,
    type,
    profileName: String(contact?.profile?.name || '').trim().slice(0, 160),
  };

  if (type === 'text') payload.text = String(message.text?.body || '').slice(0, 10_000);
  if (type === 'interactive') {
    const interactive = message.interactive || {};
    const buttonTitle = String(interactive.button_reply?.title || '').trim().slice(0, 200);
    payload.interactive = {
      type: String(interactive.type || '').trim(),
      buttonId: normalizeButtonId(interactive.button_reply?.id, buttonTitle),
      buttonTitle,
      listId: String(interactive.list_reply?.id || '').trim(),
      listTitle: String(interactive.list_reply?.title || '').trim().slice(0, 200),
      listDescription: String(interactive.list_reply?.description || '').trim().slice(0, 500),
    };
  }
  // Quick replies sent from approved template buttons arrive as a top-level
  // `button` message in Meta's webhook payload, unlike interactive buttons.
  // Normalize both wire formats to the same internal `buttonId` contract so
  // the existing canonical action handlers remain authoritative.
  if (type === 'button') {
    const buttonTitle = String(message.button?.text || '').trim().slice(0, 200);
    payload.interactive = {
      type: 'button_reply',
      buttonId: normalizeButtonId(message.button?.payload, buttonTitle),
      buttonTitle,
      listId: '',
      listTitle: '',
      listDescription: '',
    };
  }
  if (type === 'location') {
    const rawLatitude = message.location?.latitude;
    const rawLongitude = message.location?.longitude;
    const latitude = Number(rawLatitude);
    const longitude = Number(rawLongitude);
    if (rawLatitude !== null && rawLatitude !== undefined
      && rawLongitude !== null && rawLongitude !== undefined
      && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
      && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180) {
      payload.location = {
        latitude,
        longitude,
        name: String(message.location?.name || '').trim().slice(0, 200),
        address: String(message.location?.address || '').trim().slice(0, 500),
      };
    }
  }

  const media = message[type];
  if (media && typeof media === 'object' && media.id) {
    payload.media = {
      mediaId: String(media.id).trim(),
      mimeType: String(media.mime_type || '').trim().slice(0, 120),
      sha256: String(media.sha256 || '').trim().slice(0, 128),
      filename: String(media.filename || '').trim().slice(0, 240),
      caption: String(media.caption || '').trim().slice(0, 1000),
    };
  }
  return payload;
}

function normalizeStatus(status = {}, metadata = {}) {
  const messageId = String(status.id || '').trim();
  const recipientId = String(status.recipient_id || '').trim();
  const statusValue = String(status.status || '').trim().toLowerCase();
  const phoneNumberId = String(metadata.phone_number_id || '').trim();
  const timestamp = Number(status.timestamp || 0);
  if (!messageId || !recipientId || !statusValue || !phoneNumberId || !Number.isFinite(timestamp)) return null;
  const eventKey = `status:${phoneNumberId}:${messageId}:${recipientId}:${statusValue}:${timestamp}`;
  return {
    eventId: stableEventId(eventKey),
    eventType: 'message_status',
    phoneNumberId,
    messageId,
    recipientId,
    status: statusValue,
    timestampMs: timestamp * 1000,
    errors: (Array.isArray(status.errors) ? status.errors : []).map((item) => ({
      code: String(item.code || '').slice(0, 80),
      title: String(item.title || '').slice(0, 240),
      message: String(item.message || '').slice(0, 500),
    })),
  };
}

function normalizeWebhookPayload(payload = {}) {
  const events = [];
  for (const entry of Array.isArray(payload.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
      const value = change.value || {};
      const metadata = value.metadata || {};
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const contactById = new Map(contacts.map((contact) => [String(contact.wa_id || ''), contact]));

      for (const message of Array.isArray(value.messages) ? value.messages : []) {
        const normalized = normalizeMessage(message, metadata, contactById.get(String(message.from || '')) || {});
        if (normalized) events.push(normalized);
      }
      for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
        const normalized = normalizeStatus(status, metadata);
        if (normalized) events.push(normalized);
      }
    }
  }
  return events;
}

function isWithinCustomerServiceWindow(lastInboundAtMs, now = Date.now()) {
  const lastInbound = Number(lastInboundAtMs || 0);
  return Number.isFinite(lastInbound) && lastInbound > 0 && now >= lastInbound && now - lastInbound < 24 * 60 * 60 * 1000;
}

function getWhatsAppOutboundMode(lastInboundAtMs, now = Date.now()) {
  return isWithinCustomerServiceWindow(lastInboundAtMs, now) ? 'free_form_allowed' : 'approved_template_required';
}

module.exports = {
  getWhatsAppOutboundMode,
  isWithinCustomerServiceWindow,
  normalizeButtonId,
  normalizeWebhookPayload,
  stableEventId,
  verifyWebhookChallenge,
  verifyWebhookSignature,
};
