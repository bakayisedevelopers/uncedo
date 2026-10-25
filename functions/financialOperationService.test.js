'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyPaystackTransaction,
  classifyPaystackTransfer,
  executePayoutTransferAttempt,
  executeServiceChargeAttempt,
  paystackChargeReference,
  paystackTransferReference,
  serviceFinancialOperationId,
} = require('./financialOperationService');

test('service charge uses one stable reference and verifies after a timed out request', async () => {
  const operationId = serviceFinancialOperationId('request-123');
  const reference = paystackChargeReference(operationId, 1);
  const operation = { operationId, requestId: 'request-123', amount: 42.5, amountMinor: 4250, currency: 'ZAR', gatewayReference: reference };
  let chargeCalls = 0;
  let verificationCalls = 0;
  const paystack = {
    async chargeAuthorization(input) {
      chargeCalls += 1;
      assert.equal(input.reference, reference);
      throw Object.assign(new Error('timed out after acceptance'), { code: 'ETIMEDOUT' });
    },
    async verifyTransaction(input) {
      verificationCalls += 1;
      assert.equal(input.reference, reference);
      return verificationCalls === 1
        ? { outcome: 'success', transaction: { id: 'tx-1', reference, amount: 4250, currency: 'ZAR', status: 'success' } }
        : { outcome: 'success', transaction: { id: 'tx-1', reference, amount: 4250, currency: 'ZAR', status: 'success' } };
    },
  };

  const first = await executeServiceChargeAttempt({ operation, action: 'charge', email: 'buyer@example.test', authorizationCode: 'mock-auth', paystack });
  const replay = await executeServiceChargeAttempt({ operation, action: 'reconcile', email: 'buyer@example.test', authorizationCode: 'mock-auth', paystack });
  assert.equal(first.outcome, 'success');
  assert.equal(first.requestErrorCode, 'ETIMEDOUT');
  assert.equal(replay.outcome, 'success');
  assert.equal(chargeCalls, 1);
  assert.equal(verificationCalls, 2);
});

test('missing card authorization is a confirmed non-charge and does not contact Paystack', async () => {
  let calls = 0;
  const result = await executeServiceChargeAttempt({
    operation: { operationId: 'op', requestId: 'request', amount: 1, amountMinor: 100, gatewayReference: 'ref' },
    action: 'charge',
    authorizationCode: '',
    paystack: {
      async chargeAuthorization() { calls += 1; },
      async verifyTransaction() { calls += 1; },
    },
  });
  assert.equal(result.outcome, 'failed_confirmed');
  assert.equal(result.reason, 'missing_authorization');
  assert.equal(calls, 0);
});

test('a claimed charge in reconciliation mode only verifies and never charges again', async () => {
  let chargeCalls = 0;
  let verifyCalls = 0;
  const result = await executeServiceChargeAttempt({
    operation: { operationId: 'op', requestId: 'request', amount: 9, amountMinor: 900, currency: 'ZAR', gatewayReference: 'stable-ref' },
    action: 'reconcile',
    authorizationCode: 'mock-auth',
    paystack: {
      async chargeAuthorization() { chargeCalls += 1; },
      async verifyTransaction({ reference, amountMinor, currency }) {
        verifyCalls += 1;
        assert.deepEqual({ reference, amountMinor, currency }, { reference: 'stable-ref', amountMinor: 900, currency: 'ZAR' });
        return { outcome: 'unknown', reason: 'provider_unavailable' };
      },
    },
  });
  assert.equal(result.outcome, 'unknown');
  assert.equal(chargeCalls, 0);
  assert.equal(verifyCalls, 1);
});

test('payout transfer is submitted once and verified using its stable reference', async () => {
  const operationId = 'payout-test-operation';
  const reference = paystackTransferReference(operationId, 1);
  const claim = { action: 'transfer', operationId, attempt: { reference, currency: 'ZAR' } };
  let transferCalls = 0;
  let verifyCalls = 0;
  const paystack = {
    async initiateTransfer(input) {
      transferCalls += 1;
      assert.equal(input.reference, reference);
      return { status: 'pending', reference, amount: 2500, currency: 'ZAR' };
    },
    async verifyTransfer(input) {
      verifyCalls += 1;
      assert.equal(input.reference, reference);
      return { outcome: 'pending', transfer: { status: 'pending', reference, amount: 2500, currency: 'ZAR' } };
    },
  };
  const first = await executePayoutTransferAttempt({ claim, amount: 25, recipientCode: 'RCP_mock', reason: 'weekly payout', paystack });
  const replay = await executePayoutTransferAttempt({
    claim: { action: 'reconcile', reference, payout: { transferCurrency: 'ZAR' } },
    amount: 25,
    recipientCode: 'RCP_mock',
    reason: 'weekly payout',
    paystack,
  });
  assert.equal(first.verification.outcome, 'pending');
  assert.equal(replay.verification.outcome, 'pending');
  assert.equal(transferCalls, 1);
  assert.equal(verifyCalls, 2);
});

test('Paystack classifiers require matching reference, exact amount and currency', () => {
  const transaction = { reference: 'charge-ref', amount: 1234, currency: 'ZAR', status: 'success' };
  assert.equal(classifyPaystackTransaction({ status: true, data: transaction }, { reference: 'charge-ref', amountMinor: 1234, currency: 'ZAR' }).outcome, 'success');
  assert.equal(classifyPaystackTransaction({ status: true, data: transaction }, { reference: 'other-ref', amountMinor: 1234, currency: 'ZAR' }).outcome, 'unknown');
  assert.equal(classifyPaystackTransaction({ status: true, data: transaction }, { reference: 'charge-ref', amountMinor: 1235, currency: 'ZAR' }).outcome, 'unknown');
  assert.equal(classifyPaystackTransfer({ status: true, data: { ...transaction, status: 'received' } }, { reference: 'charge-ref', amountMinor: 1234, currency: 'ZAR' }).outcome, 'pending');
  assert.equal(classifyPaystackTransfer({ status: true, data: { ...transaction, status: 'reversed' } }, { reference: 'charge-ref', amountMinor: 1234, currency: 'ZAR' }).outcome, 'reversed');
});
