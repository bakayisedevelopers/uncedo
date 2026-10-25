'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWhatsAppPaymentSummary, formatWhatsAppPaymentSummary } = require('./paymentSummary');

test('payment summary only reports completion states from backend request and operation records', () => {
  const summary = buildWhatsAppPaymentSummary({
    request: { id: 'request-12345678', status: 'completed', totalAmount: 250, paymentStatus: 'paid' },
    operation: { paymentStatus: 'paid', amount: 200, currency: 'ZAR', settledAtMs: 1_800_000_000_000 },
  });
  assert.deepEqual(summary, {
    code: 'available', state: 'confirmed', paymentStatus: 'paid', requestId: 'request-12345678',
    amount: 200, currency: 'ZAR', settledAtMs: 1_800_000_000_000,
  });
  assert.match(formatWhatsAppPaymentSummary(summary), /Payment confirmed ZAR 200\.00/);
  assert.doesNotMatch(formatWhatsAppPaymentSummary(summary), /gateway|authorization|card/i);
});

test('payment summary never treats an incomplete request as paid', () => {
  assert.deepEqual(buildWhatsAppPaymentSummary({
    request: { id: 'request-12345678', status: 'work_started', paymentStatus: 'paid' },
  }), { code: 'service-not-finalized' });
});

test('uncertain and unpaid payment outcomes are described without changing their status', () => {
  const checking = buildWhatsAppPaymentSummary({
    request: { id: 'request-12345678', status: 'completed', totalAmount: 100 },
    operation: { paymentStatus: 'payment_reconciliation_required', amount: 100 },
  });
  const unpaid = buildWhatsAppPaymentSummary({
    request: { id: 'request-12345678', status: 'canceled', cancellationFeeAmount: 50, paymentStatus: 'wallet_debt_recorded' },
  });
  assert.equal(checking.state, 'checking');
  assert.match(formatWhatsAppPaymentSummary(checking), /still being verified/);
  assert.equal(unpaid.state, 'unpaid');
  assert.match(formatWhatsAppPaymentSummary(unpaid), /not confirmed/);
});

test('in-flight and reconciliation operations are reported as checking without claiming settlement', () => {
  const summary = buildWhatsAppPaymentSummary({
    request: { id: 'request-12345678', status: 'completed', totalAmount: 100 },
    operation: { status: 'processing', amount: 100, currency: 'ZAR' },
  });
  assert.equal(summary.state, 'checking');
  assert.match(formatWhatsAppPaymentSummary(summary), /still being verified/);
  assert.doesNotMatch(formatWhatsAppPaymentSummary(summary), /Payment confirmed/);
});

test('unknown legacy payment state does not expose an amount as a verified bill', () => {
  const summary = buildWhatsAppPaymentSummary({
    request: { id: 'request-12345678', status: 'completed', totalAmount: 500, paymentStatus: null },
  });
  assert.equal(summary.code, 'payment-status-unavailable');
  assert.match(formatWhatsAppPaymentSummary(summary), /could not verify/);
});
