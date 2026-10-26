'use strict';

const { getWhatsAppOutboundMode } = require('./metaWebhook');
const { hasValidSignature } = require('./mediaProcessor');

const OUTBOUND_MEDIA_SIGNATURES = Object.freeze({
  'image/jpeg': ['jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'audio/ogg': ['ogg'],
  'audio/mpeg': ['mp3'],
  'audio/mp4': ['mp4'],
  'audio/amr': ['amr'],
  'application/pdf': ['pdf'],
  'text/plain': ['text'],
  'application/msword': ['ole'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['zip'],
});

const OUTBOUND_MEDIA_MAX_BYTES = Object.freeze({
  'image/jpeg': 5 * 1024 * 1024, 'image/png': 5 * 1024 * 1024, 'image/webp': 5 * 1024 * 1024,
  'audio/ogg': 16 * 1024 * 1024, 'audio/mpeg': 16 * 1024 * 1024, 'audio/mp4': 16 * 1024 * 1024, 'audio/amr': 16 * 1024 * 1024,
  'application/pdf': 10 * 1024 * 1024, 'text/plain': 2 * 1024 * 1024,
  'application/msword': 10 * 1024 * 1024,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 10 * 1024 * 1024,
});

const DEFAULT_SEND_TIMEOUT_MS = 12_000;
const MAX_SEND_TIMEOUT_MS = 30_000;

function normalizeSendTimeout(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed)
    ? Math.max(1_000, Math.min(MAX_SEND_TIMEOUT_MS, parsed))
    : DEFAULT_SEND_TIMEOUT_MS;
}

function normalizeRecipient(value) {
  const recipient = String(value || '').replace(/[^0-9]/g, '');
  return recipient.length >= 8 && recipient.length <= 15 ? recipient : '';
}

function validateGraphApiVersion(value) {
  const version = String(value || '').trim();
  if (!/^v\d{2}\.\d$/.test(version)) throw new Error('A valid Meta Graph API version is required.');
  return version;
}

function createMetaWhatsAppClient({ accessToken, phoneNumberId, graphApiVersion, approvedTemplateNames = [], requestTimeoutMs, isRecipientAllowed = () => false, fetchImpl = fetch }) {
  const version = validateGraphApiVersion(graphApiVersion);
  const senderId = String(phoneNumberId || '').trim();
  const token = String(accessToken || '').trim();
  const approvedTemplates = new Set((Array.isArray(approvedTemplateNames) ? approvedTemplateNames : [])
    .map((name) => String(name || '').trim())
    .filter(Boolean));
  const sendTimeoutMs = normalizeSendTimeout(requestTimeoutMs);
  if (!senderId || !token) throw new Error('WhatsApp Cloud API configuration is incomplete.');

  async function sendPayload(to, payload) {
    const recipient = normalizeRecipient(to);
    if (!recipient) throw new Error('A valid WhatsApp recipient is required.');
    if (!isRecipientAllowed(recipient)) {
      const error = new Error('This recipient is not enabled for WhatsApp delivery in the current testing cohort.');
      error.code = 'recipient-not-allowlisted';
      throw error;
    }
    let response;
    try {
      response = await fetchImpl(`https://graph.facebook.com/${version}/${encodeURIComponent(senderId)}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          ...payload,
        }),
        signal: AbortSignal.timeout(sendTimeoutMs),
      });
    } catch (cause) {
      // A timeout or transport failure can happen after Meta accepted a send.
      // Keep the error deliberately non-retryable and let callers persist the
      // outcome as unknown rather than creating a duplicate message.
      const error = new Error('WhatsApp send outcome is unknown because Meta returned no response.');
      error.code = cause?.name === 'TimeoutError' || cause?.name === 'AbortError'
        ? 'meta_send_timeout'
        : 'meta_send_network_error';
      throw error;
    }
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error('WhatsApp message delivery failed.');
      error.code = `meta_http_${response.status}`;
      error.metaCode = String(result?.error?.code || '');
      error.metaSubcode = String(result?.error?.error_subcode || '');
      throw error;
    }
    const messageId = String(result?.messages?.[0]?.id || '');
    if (!messageId) {
      const error = new Error('Meta returned no message reference; delivery outcome is unknown.');
      error.code = 'meta_response_missing_message_id';
      throw error;
    }
    return { messageId };
  }

  async function uploadMedia({ buffer, mimeType, filename }) {
    if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > 16 * 1024 * 1024) {
      throw new Error('WhatsApp media is empty or exceeds the supported upload size.');
    }
    const contentType = String(mimeType || '').split(';')[0].trim().toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/amr', 'application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'].includes(contentType)) {
      throw new Error('WhatsApp media type is not supported for outbound delivery.');
    }
    const safeFilename = String(filename || `attachment.${contentType === 'application/pdf' ? 'pdf' : 'bin'}`)
      .replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', contentType);
    form.append('file', new Blob([buffer], { type: contentType }), safeFilename);
    const response = await fetchImpl(`https://graph.facebook.com/${version}/${encodeURIComponent(senderId)}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
    const result = await response.json().catch(() => null);
    const mediaId = String(result?.id || '').trim();
    if (!response.ok || !mediaId) {
      const error = new Error('WhatsApp media upload failed.');
      error.code = `meta_media_upload_${response.status}`;
      throw error;
    }
    return mediaId;
  }

  return {
    async sendText({ to, text, lastInboundAtMs, now = Date.now(), replyToMessageId = '' }) {
      if (getWhatsAppOutboundMode(lastInboundAtMs, now) !== 'free_form_allowed') {
        const error = new Error('An approved WhatsApp template is required outside the customer-service window.');
        error.code = 'template-required';
        throw error;
      }
      const messageText = String(text || '').trim();
      if (!messageText || messageText.length > 4096) throw new Error('WhatsApp text must contain 1 to 4096 characters.');
      const payload = {
        type: 'text',
        text: { preview_url: false, body: messageText },
      };
      if (replyToMessageId) payload.context = { message_id: String(replyToMessageId) };
      return sendPayload(to, payload);
    },

    async sendTemplate({ to, name, languageCode, components = [] }) {
      const templateName = String(name || '').trim();
      const language = String(languageCode || '').trim();
      if (!/^[a-z0-9_]{1,512}$/.test(templateName) || !/^[a-z]{2,3}(_[A-Z]{2})?$/.test(language)) {
        throw new Error('A configured approved template name and language are required.');
      }
      if (!approvedTemplates.has(templateName)) {
        const error = new Error('This WhatsApp template is not in the configured approved-template allowlist.');
        error.code = 'template-not-allowlisted';
        throw error;
      }
      if (!Array.isArray(components)) throw new Error('Template components must be an array.');
      return sendPayload(to, {
        type: 'template',
        template: { name: templateName, language: { code: language }, components },
      });
    },

    async sendInteractive({ to, interactive, lastInboundAtMs, now = Date.now() }) {
      if (getWhatsAppOutboundMode(lastInboundAtMs, now) !== 'free_form_allowed') {
        const error = new Error('An approved WhatsApp template is required outside the customer-service window.');
        error.code = 'template-required';
        throw error;
      }
      if (!interactive || typeof interactive !== 'object') throw new Error('Interactive message content is required.');
      return sendPayload(to, { type: 'interactive', interactive });
    },

    async sendMedia({ to, buffer, mimeType, mediaType, filename, caption = '', lastInboundAtMs, now = Date.now() }) {
      if (getWhatsAppOutboundMode(lastInboundAtMs, now) !== 'free_form_allowed') {
        const error = new Error('Media relay is unavailable outside the recipient customer-service window.');
        error.code = 'template-required';
        throw error;
      }
      const type = String(mediaType || '').trim().toLowerCase();
      if (!['image', 'audio', 'document'].includes(type)) throw new Error('WhatsApp outbound media type is not supported.');
      const recipient = normalizeRecipient(to);
      if (!recipient) throw new Error('A valid WhatsApp recipient is required.');
      if (!isRecipientAllowed(recipient)) {
        const error = new Error('This recipient is not enabled for WhatsApp delivery in the current testing cohort.');
        error.code = 'recipient-not-allowlisted';
        throw error;
      }
      const contentType = String(mimeType || '').split(';')[0].trim().toLowerCase();
      if (!OUTBOUND_MEDIA_SIGNATURES[contentType]
        || !Buffer.isBuffer(buffer)
        || buffer.length > Number(OUTBOUND_MEDIA_MAX_BYTES[contentType] || 0)
        || !hasValidSignature(buffer, OUTBOUND_MEDIA_SIGNATURES[contentType])) {
        throw new Error('WhatsApp outbound media content does not match its declared type or size.');
      }
      const mediaId = await uploadMedia({ buffer, mimeType, filename });
      const body = type === 'image'
        ? { type, image: { id: mediaId, ...(caption ? { caption: String(caption).slice(0, 1024) } : {}) } }
        : type === 'audio'
          ? { type, audio: { id: mediaId } }
          : { type, document: { id: mediaId, filename: String(filename || 'attachment').slice(0, 120), ...(caption ? { caption: String(caption).slice(0, 1024) } : {}) } };
      return sendPayload(to, body);
    },
  };
}

module.exports = {
  DEFAULT_SEND_TIMEOUT_MS,
  MAX_SEND_TIMEOUT_MS,
  createMetaWhatsAppClient,
  normalizeRecipient,
  normalizeSendTimeout,
  validateGraphApiVersion,
};
