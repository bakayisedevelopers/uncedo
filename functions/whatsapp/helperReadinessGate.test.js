'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isWhatsAppHelperProfileCaptureStage,
  resolveWhatsAppHelperReadinessState,
} = require('./helperReadinessGate');

test('incomplete helper profile is re-gated when a completed conversation receives another message', () => {
  const result = resolveWhatsAppHelperReadinessState({ state: { stage: 'complete' }, ready: false, nowMs: 100 });
  assert.equal(result.changed, true);
  assert.equal(result.state.stage, 'helper_readiness');
  assert.equal(result.state.role, 'helper');
});

test('a newly accepted current agreement releases a helper from the agreement gate', () => {
  const result = resolveWhatsAppHelperReadinessState({ state: { stage: 'awaiting_helper_agreement' }, ready: true, nowMs: 200 });
  assert.equal(result.changed, true);
  assert.equal(result.state.stage, 'complete');
});

test('an administrator-approved police clearance releases the review gate', () => {
  const result = resolveWhatsAppHelperReadinessState({
    state: { stage: 'awaiting_helper_police_clearance_review', role: 'helper' },
    policeClearanceStatus: 'approved',
    ready: false,
    nowMs: 300,
  });
  assert.equal(result.changed, true);
  assert.equal(result.reason, 'police-clearance-approved');
  assert.equal(result.state.stage, 'helper_readiness');
});

test('an approved clearance completes onboarding when no other requirements remain', () => {
  const result = resolveWhatsAppHelperReadinessState({
    state: { stage: 'awaiting_helper_police_clearance_review', role: 'helper' },
    policeClearanceStatus: 'approved',
    ready: true,
    nowMs: 301,
  });
  assert.equal(result.changed, true);
  assert.equal(result.reason, 'police-clearance-approved');
  assert.equal(result.state.stage, 'complete');
});

test('a stale clearance step is released when clearance is no longer required', () => {
  const result = resolveWhatsAppHelperReadinessState({
    state: { stage: 'awaiting_helper_police_clearance_review', role: 'helper' },
    policeClearanceRequired: false,
    ready: true,
    nowMs: 302,
  });
  assert.equal(result.changed, true);
  assert.equal(result.reason, 'police-clearance-not-required');
  assert.equal(result.state.stage, 'complete');
});

test('a rejected or expired review returns the helper to the upload step', () => {
  for (const policeClearanceStatus of ['rejected', 'resubmission_required', 'expired', 'missing', 'failed']) {
    const result = resolveWhatsAppHelperReadinessState({
      state: { stage: 'awaiting_helper_police_clearance_review', role: 'helper' },
      policeClearanceStatus,
      ready: false,
      nowMs: 302,
    });
    assert.equal(result.changed, true, policeClearanceStatus);
    assert.equal(result.reason, 'police-clearance-resubmission-required', policeClearanceStatus);
    assert.equal(result.state.stage, 'awaiting_helper_police_clearance', policeClearanceStatus);
  }
});

test('readiness rechecks do not interrupt an active profile answer step', () => {
  assert.equal(isWhatsAppHelperProfileCaptureStage('awaiting_home_address'), true);
  const result = resolveWhatsAppHelperReadinessState({ state: { stage: 'awaiting_home_address' }, ready: false });
  assert.equal(result.changed, false);
  assert.equal(result.state.stage, 'awaiting_home_address');
});

test('completed helper profile photo, service photos, and payout verification release their gates', () => {
  const photo = resolveWhatsAppHelperReadinessState({
    state: { stage: 'awaiting_helper_profile_photo', role: 'helper' },
    hasProfilePhoto: true,
    ready: false,
    nowMs: 400,
  });
  assert.equal(photo.changed, true);
  assert.equal(photo.reason, 'profile-photo-saved');
  assert.equal(photo.state.stage, 'helper_readiness');

  const photos = resolveWhatsAppHelperReadinessState({
    state: { stage: 'awaiting_helper_service_photos', role: 'helper' },
    servicePhotosComplete: true,
    ready: false,
    nowMs: 401,
  });
  assert.equal(photos.changed, true);
  assert.equal(photos.reason, 'service-photos-complete');
  assert.equal(photos.state.stage, 'helper_readiness');

  const payout = resolveWhatsAppHelperReadinessState({
    state: { stage: 'awaiting_helper_payout', role: 'helper' },
    payoutVerified: true,
    ready: false,
    nowMs: 402,
  });
  assert.equal(payout.changed, true);
  assert.equal(payout.reason, 'payout-verified');
  assert.equal(payout.state.stage, 'helper_readiness');
});

test('admin verification stage stays waiting until approved or helper action is required', () => {
  const waiting = resolveWhatsAppHelperReadinessState({
    state: { stage: 'awaiting_helper_admin_verification', role: 'helper' },
    adminReviewEligible: true,
    ready: false,
    nowMs: 500,
  });
  assert.equal(waiting.changed, false);

  const rejectedOffering = resolveWhatsAppHelperReadinessState({
    state: { stage: 'awaiting_helper_admin_verification', role: 'helper' },
    adminReviewEligible: false,
    ready: false,
    nowMs: 501,
  });
  assert.equal(rejectedOffering.changed, true);
  assert.equal(rejectedOffering.reason, 'helper-action-required');
  assert.equal(rejectedOffering.state.stage, 'helper_readiness');

  const approved = resolveWhatsAppHelperReadinessState({
    state: { stage: 'awaiting_helper_admin_verification', role: 'helper' },
    adminReviewEligible: true,
    ready: true,
    nowMs: 502,
  });
  assert.equal(approved.changed, true);
  assert.equal(approved.reason, 'admin-verification-approved');
  assert.equal(approved.state.stage, 'complete');
});
