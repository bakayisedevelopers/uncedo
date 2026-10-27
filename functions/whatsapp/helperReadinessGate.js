'use strict';

const HELPER_PROFILE_CAPTURE_STAGES = Object.freeze([
  'awaiting_preferred_name',
  'awaiting_home_address',
  'awaiting_helper_full_name',
  'awaiting_helper_provider_type',
  'awaiting_helper_business_name',
  'awaiting_helper_services',
]);

function resolveWhatsAppHelperReadinessState({ state = {}, ready = false, nowMs = Date.now() } = {}) {
  const current = { ...state };
  const stage = String(current.stage || '');
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

module.exports = { HELPER_PROFILE_CAPTURE_STAGES, isWhatsAppHelperProfileCaptureStage, resolveWhatsAppHelperReadinessState };
