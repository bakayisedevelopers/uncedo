'use strict';

function parseWhatsAppCommand(input) {
  const text = String(input || '').trim().replace(/\s+/g, ' ');
  // Natural-language history, status, payment-status and cancellation requests
  // are intentionally left for the assistant command loop. Keep only the
  // interactive payment-flow starter as a deterministic workflow command.
  if (/^(?:pay|pay now|payment|how do i pay|payment methods)$/i.test(text)) return { type: 'payment_initiation' };
  if (/^(?:confirm cancellation|confirm cancel|yes, cancel it)$/i.test(text)) return { type: 'cancellation_confirm' };
  if (/^(?:keep booking|do not cancel|don't cancel|cancel no)$/i.test(text)) return { type: 'cancellation_abort' };
  return null;
}

module.exports = { parseWhatsAppCommand };
