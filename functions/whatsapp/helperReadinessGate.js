'use strict';

const HELPER_PROFILE_CAPTURE_STAGES = Object.freeze([
  'awaiting_preferred_name',
  'awaiting_home_address',
  'awaiting_helper_full_name',
  'awaiting_helper_provider_type',
  'awaiting_helper_business_name',
  'awaiting_helper_services',
]);

const POLICE_CLEARANCE_STAGES = Object.freeze([
  'awaiting_helper_police_clearance',
  'awaiting_helper_police_clearance_review',
]);

function resolveWhatsAppHelperReadinessState({
  state = {},
  ready = false,
  policeClearanceRequired = true,
  policeClearanceStatus = '',
  hasProfilePhoto = false,
  servicePhotosComplete = false,
  agreementCurrent = false,
  payoutVerified = false,
  adminReviewEligible = true,
  nowMs = Date.now(),
} = {}) {
  const current = { ...state };
  const stage = String(current.stage || '');

  // Clearance-review stages are durable conversation state, so every new
  // helper message must reconcile them with the authoritative backend status.
  // Otherwise an approval made in the admin app leaves the chat permanently
  // stuck on the old "awaiting review" prompt.
  if (POLICE_CLEARANCE_STAGES.includes(stage)) {
    const status = String(policeClearanceStatus || '').trim().toLowerCase();
    if (policeClearanceRequired !== true) {
      return {
        changed: true,
        reason: 'police-clearance-not-required',
        state: {
          ...current,
          role: 'helper',
          accountMode: 'account',
          stage: ready ? 'complete' : 'helper_readiness',
          updatedAtMs: nowMs,
        },
      };
    }

    if (status === 'approved') {
      return {
        changed: true,
        reason: 'police-clearance-approved',
        state: {
          ...current,
          role: 'helper',
          accountMode: 'account',
          stage: ready ? 'complete' : 'helper_readiness',
          updatedAtMs: nowMs,
        },
      };
    }

    if (stage === 'awaiting_helper_police_clearance_review'
      && !['pending', 'uploading'].includes(status)) {
      return {
        changed: true,
        reason: 'police-clearance-resubmission-required',
        state: {
          ...current,
          role: 'helper',
          accountMode: 'account',
          stage: 'awaiting_helper_police_clearance',
          updatedAtMs: nowMs,
        },
      };
    }

    if (stage === 'awaiting_helper_police_clearance' && ['pending', 'uploading'].includes(status)) {
      return {
        changed: true,
        reason: 'police-clearance-under-review',
        state: {
          ...current,
          role: 'helper',
          accountMode: 'account',
          stage: 'awaiting_helper_police_clearance_review',
          updatedAtMs: nowMs,
        },
      };
    }
  }

  if (stage === 'awaiting_helper_profile_photo' && (ready || hasProfilePhoto)) {
    return {
      changed: true,
      reason: 'profile-photo-saved',
      state: { ...current, role: 'helper', accountMode: 'account', stage: ready ? 'complete' : 'helper_readiness', updatedAtMs: nowMs },
    };
  }

  if (stage === 'awaiting_helper_service_photos' && (ready || servicePhotosComplete)) {
    return {
      changed: true,
      reason: 'service-photos-complete',
      state: { ...current, role: 'helper', accountMode: 'account', stage: ready ? 'complete' : 'helper_readiness', updatedAtMs: nowMs },
    };
  }

  if (stage === 'awaiting_helper_agreement' && (ready || agreementCurrent)) {
    return {
      changed: true,
      reason: 'agreement-accepted',
      state: { ...current, role: 'helper', accountMode: 'account', stage: ready ? 'complete' : 'helper_readiness', updatedAtMs: nowMs },
    };
  }

  if (stage === 'awaiting_helper_payout' && (ready || payoutVerified)) {
    return {
      changed: true,
      reason: 'payout-verified',
      state: { ...current, role: 'helper', accountMode: 'account', stage: ready ? 'complete' : 'helper_readiness', updatedAtMs: nowMs },
    };
  }

  if (stage === 'awaiting_helper_admin_verification') {
    if (ready) {
      return {
        changed: true,
        reason: 'admin-verification-approved',
        state: { ...current, role: 'helper', accountMode: 'account', stage: 'complete', updatedAtMs: nowMs },
      };
    }
    if (!adminReviewEligible) {
      return {
        changed: true,
        reason: 'helper-action-required',
        state: { ...current, role: 'helper', accountMode: 'account', stage: 'helper_readiness', updatedAtMs: nowMs },
      };
    }
  }

  if (ready && ['helper_readiness', 'awaiting_helper_agreement'].includes(stage)) {
    return { changed: true, state: { ...current, role: 'helper', accountMode: 'account', stage: 'complete', updatedAtMs: nowMs } };
  }
  if (!ready && (!stage || stage === 'complete')) {
    return { changed: true, state: { ...current, role: 'helper', accountMode: 'account', stage: 'helper_readiness', updatedAtMs: nowMs } };
  }
  return { changed: false, state: current };
}

function isWhatsAppHelperProfileCaptureStage(stage = '') {
  return HELPER_PROFILE_CAPTURE_STAGES.includes(String(stage || ''));
}

module.exports = {
  HELPER_PROFILE_CAPTURE_STAGES,
  POLICE_CLEARANCE_STAGES,
  isWhatsAppHelperProfileCaptureStage,
  resolveWhatsAppHelperReadinessState,
};
