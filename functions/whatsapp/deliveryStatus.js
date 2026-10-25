'use strict';

const DELIVERY_RANK = { accepted: 1, sent: 1, delivered: 2, read: 3 };
const KNOWN_STATES = new Set(['accepted', 'sent', 'delivered', 'read', 'failed', 'outcome_unknown', 'blocked_template_required']);

function classifyMetaDeliveryError(error = {}) {
  const code = String(error.code || '').trim().toLowerCase();
  if (['template-required', 'template-not-allowlisted'].includes(code)) return 'blocked_template_required';
  const httpStatus = Number(code.match(/^meta_http_(\d{3})$/)?.[1] || 0);
  if (httpStatus >= 400 && httpStatus < 500) return 'failed';
  return 'outcome_unknown';
}

function shouldApplyDeliveryStatus(current = {}, incoming = {}) {
  const currentStatus = String(current.status || current.deliveryStatus || '').toLowerCase();
  const incomingStatus = String(incoming.status || '').toLowerCase();
  if (!KNOWN_STATES.has(incomingStatus)) return false;
  const currentAt = Number(current.statusTimestampMs || current.deliveryStatusTimestampMs || 0);
  const incomingAt = Number(incoming.timestampMs || 0);
  if (incomingAt && currentAt && incomingAt < currentAt) return false;
  if (['delivered', 'read'].includes(currentStatus) && ['sent', 'accepted', 'failed'].includes(incomingStatus)) return false;
  if (currentAt === incomingAt && (DELIVERY_RANK[incomingStatus] || 0) < (DELIVERY_RANK[currentStatus] || 0)) return false;
  return true;
}

module.exports = { classifyMetaDeliveryError, shouldApplyDeliveryStatus };
