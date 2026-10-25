'use strict';

function normalizeWhatsAppIdentityPhone(value) {
  const phoneNumber = String(value || '').replace(/[\s().-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
    const error = new Error('A verified international WhatsApp number is required.');
    error.code = 'invalid-phone';
    throw error;
  }
  return { phoneNumber, waId: phoneNumber.slice(1) };
}

function buildWhatsAppIdentityId({ phoneNumberId, phoneNumber, stableEventId }) {
  const senderId = String(phoneNumberId || '').trim();
  if (!senderId || typeof stableEventId !== 'function') throw new Error('WhatsApp identity configuration is incomplete.');
  const { waId } = normalizeWhatsAppIdentityPhone(phoneNumber);
  return stableEventId(`identity:${senderId}:${waId}`);
}

function buildWhatsAppGuestPrincipalId(identityId) {
  const value = String(identityId || '').trim();
  if (!value) throw new Error('WhatsApp identity is required.');
  return `guest_${value}`;
}

module.exports = {
  buildWhatsAppGuestPrincipalId,
  buildWhatsAppIdentityId,
  normalizeWhatsAppIdentityPhone,
};
