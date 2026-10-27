'use strict';

const { createHash, randomBytes } = require('node:crypto');
const { normalizeAccountPhone } = require('./accountResolution');

const WHATSAPP_ACCOUNT_LINK_TTL_MS = 24 * 60 * 60 * 1000;

function createWhatsAppAccountLinkChallenge({ uid, role, identityId, phoneNumber, sourceEventId = '', nowMs = Date.now() } = {}) {
  const safeUid = String(uid || '').trim();
  const safeIdentityId = String(identityId || '').trim();
  const safeRole = String(role || '').trim().toLowerCase();
  const normalizedPhoneInput = String(phoneNumber || '').trim().replace(/[\s().-]/g, '');
  const phone = /^\+[1-9]\d{7,14}$/.test(normalizedPhoneInput)
    ? normalizeAccountPhone(normalizedPhoneInput)
    : '';
  if (!safeUid || !safeIdentityId || !['customer', 'helper'].includes(safeRole) || !phone) {
    throw new Error('A unique account, role, WhatsApp identity, and E.164 phone number are required.');
  }
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    challenge: {
      uid: safeUid,
      role: safeRole,
      identityId: safeIdentityId,
      phoneHash: createHash('sha256').update(phone).digest('hex'),
      sourceEventId: String(sourceEventId || '').slice(0, 256),
      status: 'pending',
      expiresAtMs: Number(nowMs) + WHATSAPP_ACCOUNT_LINK_TTL_MS,
      createdAtMs: Number(nowMs),
    },
  };
}

function buildWhatsAppAccountLinkUrl(baseUrl, token) {
  const safeToken = String(token || '').trim();
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(safeToken)) throw new Error('Invalid WhatsApp account-link token.');
  let url;
  try {
    url = new URL(String(baseUrl || '').trim());
  } catch (_) {
    throw new Error('The WhatsApp account-link page URL is invalid.');
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('The WhatsApp account-link page must use HTTPS.');
  url.hash = new URLSearchParams({ wa_link_token: safeToken }).toString();
  return url.toString();
}

function isWhatsAppAccountLinkChallengeLive(challenge = {}, nowMs = Date.now()) {
  return challenge.status === 'pending'
    && Number(challenge.expiresAtMs || 0) > Number(nowMs)
    && ['customer', 'helper'].includes(String(challenge.role || '').toLowerCase())
    && Boolean(String(challenge.uid || '').trim())
    && Boolean(String(challenge.identityId || '').trim());
}

module.exports = {
  WHATSAPP_ACCOUNT_LINK_TTL_MS,
  buildWhatsAppAccountLinkUrl,
  createWhatsAppAccountLinkChallenge,
  isWhatsAppAccountLinkChallengeLive,
};
