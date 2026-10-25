'use strict';

function parseWhatsAppCommand(input) {
  const text = String(input || '').trim().replace(/\s+/g, ' ');
  const history = /^(?:my bookings|booking history|request history|my requests)$/i.test(text);
  if (history) return { type: 'booking_history' };

  const status = text.match(/^(?:status|booking status|request status|where is my helper|track my (?:request|booking))(?:\s+(?:request|booking)\s+([A-Za-z0-9_-]{6,128}))?\??$/i);
  if (status) return { type: 'booking_status', requestId: status[1] || null };

  const details = text.match(/^(?:details|booking details|request details)(?:\s+(?:request|booking)\s+([A-Za-z0-9_-]{6,128}))?$/i);
  if (details) return { type: 'booking_details', requestId: details[1] || null };

  const paymentStatus = text.match(/^(?:payment status|payment receipt|receipt|did i pay)(?:\s+(?:request|booking)\s+([A-Za-z0-9_-]{6,128}))?\??$/i);
  if (paymentStatus) return { type: 'payment_status', requestId: paymentStatus[1] || null };

  if (/^(?:pay|pay now|payment|how do i pay|payment methods)$/i.test(text)) return { type: 'payment_initiation' };
  const cancelWithId = text.match(/^(?:cancel|cancel booking|cancel request|cancel my booking|cancel my request)\s+([A-Za-z0-9_-]{6,128})$/i);
  if (cancelWithId) return { type: 'cancellation_request', requestId: cancelWithId[1] };
  if (/^(?:cancel|cancel booking|cancel request|cancel my booking|cancel my request)$/i.test(text)) {
    return { type: 'cancellation_request', requestId: null };
  }
  if (/^(?:confirm cancellation|confirm cancel|yes, cancel it)$/i.test(text)) return { type: 'cancellation_confirm' };
  if (/^(?:keep booking|do not cancel|don't cancel|cancel no)$/i.test(text)) return { type: 'cancellation_abort' };
  return null;
}

module.exports = { parseWhatsAppCommand };
