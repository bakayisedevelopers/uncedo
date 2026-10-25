'use strict';

const PAYMENT_STATES = Object.freeze({
  paid: 'confirmed',
  unpaid: 'unpaid',
  wallet_debt_recorded: 'unpaid',
  payment_reconciliation_required: 'checking',
  not_applicable: 'not_required',
});

function safeAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Number(amount.toFixed(2)) : null;
}

function buildWhatsAppPaymentSummary({ request = {}, operation = null } = {}) {
  const requestStatus = String(request.status || '').trim().toLowerCase();
  if (!['completed', 'canceled', 'cancelled'].includes(requestStatus)) {
    return { code: 'service-not-finalized' };
  }

  let paymentStatus = String(operation?.paymentStatus || request.paymentStatus || '').trim().toLowerCase();
  const operationStatus = String(operation?.status || '').trim().toLowerCase();
  if (!paymentStatus) {
    if (['processing', 'reconciliation_required', 'manual_reconciliation_required'].includes(operationStatus)) {
      paymentStatus = 'payment_reconciliation_required';
    } else if (operationStatus === 'settled_success') {
      paymentStatus = 'paid';
    } else if (operationStatus === 'settled_no_charge') {
      paymentStatus = 'not_applicable';
    } else if (operationStatus === 'settled_failed') {
      paymentStatus = 'wallet_debt_recorded';
    }
  }
  const state = PAYMENT_STATES[paymentStatus];
  if (!state) return { code: 'payment-status-unavailable' };

  const operationAmount = safeAmount(operation?.amount);
  const requestAmount = requestStatus === 'completed' ? safeAmount(
    request.totalAmount
      ?? request.pricingSnapshot?.finalAmount
      ?? request.pricingSnapshot?.totalAmount
      ?? request.pricingSnapshot?.total,
  ) : null;
  const amount = operationAmount ?? requestAmount;
  const settledAtMs = Number(operation?.settledAtMs || 0);

  return {
    code: 'available',
    state,
    paymentStatus,
    requestId: String(request.id || request.requestId || ''),
    amount,
    currency: String(operation?.currency || request.pricingSnapshot?.currency || 'ZAR').toUpperCase(),
    settledAtMs: Number.isFinite(settledAtMs) && settledAtMs > 0 ? settledAtMs : null,
  };
}

function formatWhatsAppPaymentSummary(summary = {}) {
  if (summary.code === 'service-not-finalized') {
    return 'Payment details will be available after the service request is completed or canceled.';
  }
  if (summary.code !== 'available') {
    return 'I could not verify payment details for this request. I have not changed its payment status.';
  }

  const amountText = summary.amount === null ? '' : ` ${summary.currency} ${summary.amount.toFixed(2)}`;
  if (summary.state === 'confirmed') {
    const dateText = summary.settledAtMs ? ` on ${new Date(summary.settledAtMs).toISOString().slice(0, 10)}` : '';
    return `Payment confirmed${amountText}${dateText}. Request reference: ${summary.requestId}.`;
  }
  if (summary.state === 'checking') {
    return `The payment result is still being verified${amountText}. Uncedo will not start another charge while this one is unresolved.`;
  }
  if (summary.state === 'unpaid') {
    return `Payment is not confirmed${amountText}. Use the payment flow in the Uncedo app or contact support for help.`;
  }
  return 'No payment was required for this request.';
}

module.exports = {
  buildWhatsAppPaymentSummary,
  formatWhatsAppPaymentSummary,
  safeAmount,
};
