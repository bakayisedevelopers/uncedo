'use strict';

const REQUEST_STATUS_LABELS = Object.freeze({
  collecting_details: 'collecting service details',
  scheduled_pending: 'scheduled and waiting for matching',
  matching: 'being matched with a helper',
  helper_found: 'waiting for a helper to respond',
  no_helper_available: 'waiting for another matching attempt',
  accepted: 'assigned to a helper',
  driving: 'with your helper travelling to the service location',
  en_route: 'with your helper on the way',
  buying_resources: 'with your helper obtaining materials',
  arrived: 'with your helper at the service location',
  work_started: 'in progress',
  completed: 'completed',
  canceled: 'canceled',
  cancelled: 'canceled',
});

function buildWhatsAppRequestSummary(request = {}) {
  const requestId = String(request.id || request.requestId || '').trim();
  const status = String(request.status || '').trim().toLowerCase();
  const summary = String(request.serviceSummary || request.subject || request.topic || 'service request').trim().slice(0, 160);
  const helperName = ['accepted', 'driving', 'en_route', 'buying_resources', 'arrived', 'work_started', 'completed']
    .includes(status)
    ? String(request.helperAssignment?.helperName || '').trim().slice(0, 100)
    : '';
  return {
    requestId,
    summary,
    status,
    statusLabel: REQUEST_STATUS_LABELS[status] || 'not available in WhatsApp',
    helperName,
  };
}

function formatWhatsAppRequestSummary(summary = {}) {
  const helperText = summary.helperName ? ` ${summary.helperName}` : '';
  return `Request ${summary.requestId}: ${summary.summary} is ${summary.statusLabel}.${helperText ? ` Assigned helper:${helperText}.` : ''}`;
}

function formatWhatsAppRequestHistory(requests = []) {
  const safeRequests = (Array.isArray(requests) ? requests : []).slice(0, 5).map((request) => {
    const summary = buildWhatsAppRequestSummary(request);
    return `• ${summary.requestId} — ${summary.summary} — ${summary.statusLabel}`;
  });
  if (!safeRequests.length) return 'I could not find service requests linked to this WhatsApp identity.';
  return `Your recent requests:\n${safeRequests.join('\n')}\n\nAsk “status request <reference>” or “payment status request <reference>” for a specific request.`.slice(0, 3000);
}

module.exports = {
  buildWhatsAppRequestSummary,
  formatWhatsAppRequestHistory,
  formatWhatsAppRequestSummary,
};
