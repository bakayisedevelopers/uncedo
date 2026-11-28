import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOfferNotificationPayload,
  extractOfferDetails,
  resolveOfferPaymentType,
} from './offerNotificationModel.js';

test('extracts overlay request details cleanly for both overlay and browser notifications', () => {
  const offer = {
    id: 'req_123',
    title: 'Deep Home Cleaning',
    description: 'Deep Home Cleaning',
    customerName: 'Nomsa Dlamini',
    area: 'Sandton, Johannesburg',
    payoutEstimate: 425,
    preSelectedPaymentType: 'card',
    timingPreference: 'now',
    structuredAnswers: {
      bedrooms: '3',
      cleaning_level: 'deep_clean',
      travel_distance_km: '4.2',
    },
    notes: 'Please bring oven cleaner.',
    offerToken: 'tok_abc',
    offerRevision: 2,
    offerExpiresAt: 2000000,
    lastOfferAt: 1970000,
  };

  assert.equal(resolveOfferPaymentType(offer), 'card');
  const details = extractOfferDetails(offer, offer.title);
  assert.equal(details.summaryText, '');
  assert.deepEqual(details.answerRows, [
    { key: 'bedrooms', label: 'Bedrooms', value: '3' },
    { key: 'cleaning_level', label: 'Cleaning level', value: 'Deep clean' },
  ]);
  assert.equal(details.noteText, 'Please bring oven cleaner.');

  const payload = buildOfferNotificationPayload(offer, {
    canRespond: true,
    endpoint: 'https://us-central1-test.cloudfunctions.net/respondToServiceRequestOffer',
    idToken: 'jwt-123',
    origin: 'https://helpers.bakayise.com',
    nowMs: 1975000,
  });

  assert.equal(payload.title, 'New Job Offer · Deep Home Cleaning (R425.00)');
  assert.match(payload.body, /Nomsa Dlamini \| Sandton, Johannesburg/);
  assert.match(payload.body, /Payment: Card · Timing: Now · 25s window/);
  assert.match(payload.body, /Bedrooms: 3 · Cleaning level: Deep clean/);
  assert.match(payload.body, /Notes: Please bring oven cleaner\./);
  assert.deepEqual(payload.actions, [
    { action: 'accept', title: 'Accept' },
    { action: 'decline', title: 'Decline' },
  ]);
  assert.equal(payload.data.acceptPath, '/requests/req_123');
  assert.equal(payload.data.focusPath, '/home?offerId=req_123');
  assert.equal(payload.data.endpoint, 'https://us-central1-test.cloudfunctions.net/respondToServiceRequestOffer');
  assert.equal(payload.data.idToken, 'jwt-123');
});

test('omits accept action when helper cannot respond and marks busy fallback destination', () => {
  const offer = {
    id: 'req_busy',
    serviceSummary: 'Lawn Mowing',
    customerName: 'Thabo Mokoena',
    area: 'Midrand',
    payoutEstimate: 180,
    paymentMethod: 'cash',
    offerType: 'busy_helper_fallback',
    offerToken: 'tok_busy',
    offerRevision: 1,
  };

  const payload = buildOfferNotificationPayload(offer, {
    canRespond: false,
    nowMs: 1000,
  });

  assert.equal(payload.title, 'Next Job Offer · Lawn Mowing (R180.00)');
  assert.match(payload.body, /Payment: Cash · Timing: After current job/);
  assert.deepEqual(payload.actions, [{ action: 'decline', title: 'Decline' }]);
  assert.equal(payload.data.acceptPath, '/home?acceptedQueued=1');
});
