'use strict';

const DEFAULT_RETENTION_DAYS = Object.freeze({
  WHATSAPP_MESSAGE_RETENTION_DAYS: 180,
  WHATSAPP_EVENT_RETENTION_DAYS: 30,
  WHATSAPP_JOB_RETENTION_DAYS: 30,
  WHATSAPP_STATUS_RETENTION_DAYS: 30,
  WHATSAPP_MEDIA_RETENTION_DAYS: 30,
  WHATSAPP_SUPPORT_RETENTION_DAYS: 365,
  WHATSAPP_AUTH_RETENTION_DAYS: 1,
});

function retentionDays(env = {}, variableName) {
  const fallback = DEFAULT_RETENTION_DAYS[variableName] || 30;
  const value = Number.parseInt(String(env[variableName] || ''), 10);
  return Number.isInteger(value) ? Math.max(1, Math.min(3650, value)) : fallback;
}

function retentionExpiryMs(env = {}, variableName, now = Date.now()) {
  return now + retentionDays(env, variableName) * 24 * 60 * 60 * 1000;
}

function shouldDeleteConversationMessage(message = {}, ticketStatus = '') {
  if (Number(message.retentionExpiresAtMs || 0) > Date.now()) return false;
  return !(message.ticketId && ticketStatus !== null && !['closed', 'resolved'].includes(String(ticketStatus || '').toLowerCase()));
}

module.exports = { DEFAULT_RETENTION_DAYS, retentionDays, retentionExpiryMs, shouldDeleteConversationMessage };
