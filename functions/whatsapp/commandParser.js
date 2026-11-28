'use strict';

function parseWhatsAppCommand(input) {
  const text = String(input || '').trim().replace(/\s+/g, ' ');
  // Natural-language history, status, payment-status and cancellation requests
  // are intentionally left for the assistant command loop. Keep only the
  // interactive payment-flow starter as a deterministic workflow command.
  if (/^(?:pay|pay now|payment|how do i pay|payment methods)$/i.test(text)) return { type: 'payment_initiation' };
  if (/^(?:confirm cancellation|confirm cancel|yes, cancel it)$/i.test(text)) return { type: 'cancellation_confirm' };
  if (/^(?:keep booking|do not cancel|don't cancel|cancel no)$/i.test(text)) return { type: 'cancellation_abort' };
  if (/^(?:please\s+)?(?:i want to\s+|i'd like to\s+|how do i\s+|can i\s+)?(?:delete|close|remove|deactivate)(?:\s+(?:my|this))?\s+account(?:\s+please)?\??$/i.test(text)) {
    return { type: 'account_deletion' };
  }
  if (/^(?:please\s+)?(?:i want to\s+|can i\s+)?(?:(?:reactivate|restore|recover)(?:\s+(?:my|this))?\s+account|cancel\s+(?:my\s+)?(?:account\s+)?deletion|keep\s+my\s+account)(?:\s+please)?\??$/i.test(text)) {
    return { type: 'account_reactivation' };
  }
  return null;
}

module.exports = { parseWhatsAppCommand };
