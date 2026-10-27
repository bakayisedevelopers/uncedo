'use strict';

const SAFE_FAILURE_STAGES = new Set([
  'read_conversation_state',
  'claim_outbound_record',
  'create_meta_client',
  'validate_sender_identity',
  'meta_send_request',
  'record_meta_acceptance',
  'reconcile_delivery_status',
  'persist_conversation_memory',
  'mark_assistant_send_attempt',
  'persist_outbound_reply',
  'mark_assistant_send_complete',
  'unknown',
]);

const SAFE_ERROR_CODES = new Set([
  'meta_graph_api_version_invalid',
  'meta_configuration_incomplete',
  'meta_recipient_invalid',
  'meta_text_invalid',
  'meta_interactive_invalid',
  'meta_send_timeout',
  'meta_send_network_error',
  'meta_response_missing_message_id',
  'template-required',
  'template-not-allowlisted',
  'recipient-not-allowlisted',
  'meta_sender_number_mismatch',
  'whatsapp_send_failed',
  'unclassified_error',
  'permission-denied',
  'failed-precondition',
  'deadline-exceeded',
  'resource-exhausted',
  'unavailable',
  'aborted',
  'internal',
  'unknown',
  'not-found',
  'already-exists',
  'invalid-argument',
]);

const SAFE_ERROR_NAMES = new Set([
  'Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError',
  'AbortError', 'TimeoutError', 'FirebaseError', 'HttpsError',
]);

function normalizeSafeErrorCode(error = {}) {
  const code = String(error?.code || '').trim().toLowerCase();
  if (/^meta_http_\d{3}$/.test(code)) return code;
  if (/^\d{1,3}$/.test(code)) return code;
  return SAFE_ERROR_CODES.has(code) ? code : 'unclassified_error';
}

function normalizeSafeFailureStage(stage) {
  const value = String(stage || '').trim().toLowerCase();
  return SAFE_FAILURE_STAGES.has(value) ? value : 'unknown';
}

function safeMetaCode(value) {
  const code = String(value ?? '').trim();
  return /^\d{1,12}$/.test(code) ? code : '';
}

function safeReferenceErrorDetails(error) {
  if (String(error?.name || '') !== 'ReferenceError') return {};
  const message = String(error?.message || '');
  const missing = message.match(/^([A-Za-z_$][A-Za-z0-9_$]{0,79}) is not defined$/);
  const temporalDeadZone = message.match(/^Cannot access '([A-Za-z_$][A-Za-z0-9_$]{0,79})' before initialization$/);
  const details = {};
  const identifier = missing?.[1] || temporalDeadZone?.[1] || '';
  if (identifier) details.referenceIdentifier = identifier;

  for (const frame of String(error?.stack || '').split('\n').slice(1, 12)) {
    const location = frame.match(/(?:^|[\\/])(functions[\\/](?:whatsapp[\\/])?[A-Za-z0-9_.-]+\.js):(\d+):(\d+)/);
    if (!location) continue;
    details.sourceLocation = `${location[1].replace(/\\/g, '/')}:${location[2]}:${location[3]}`;
    break;
  }
  return details;
}

function buildWhatsAppSendFailureDiagnostics(error, stage) {
  const errorCode = normalizeSafeErrorCode(error);
  const httpMatch = errorCode.match(/^meta_http_(\d{3})$/);
  const errorName = SAFE_ERROR_NAMES.has(String(error?.name || '')) ? String(error.name) : 'Error';
  const result = {
    failureStage: normalizeSafeFailureStage(stage || error?.whatsappFailureStage),
    errorCode,
    errorName,
  };
  Object.assign(result, safeReferenceErrorDetails(error));
  if (httpMatch) result.metaHttpStatus = Number(httpMatch[1]);
  const metaCode = safeMetaCode(error?.metaCode);
  const metaSubcode = safeMetaCode(error?.metaSubcode);
  if (metaCode) result.metaCode = metaCode;
  if (metaSubcode) result.metaSubcode = metaSubcode;
  return result;
}

function withWhatsAppFailureStage(error, stage) {
  const failure = error instanceof Error ? error : new Error('WhatsApp operation failed.');
  if (!failure.whatsappFailureStage) {
    try {
      Object.defineProperty(failure, 'whatsappFailureStage', {
        value: normalizeSafeFailureStage(stage),
        configurable: true,
      });
    } catch (_) {
      // The original failure remains intact; the diagnostic falls back to unknown.
    }
  }
  return failure;
}

module.exports = {
  buildWhatsAppSendFailureDiagnostics,
  normalizeSafeErrorCode,
  normalizeSafeFailureStage,
  safeReferenceErrorDetails,
  withWhatsAppFailureStage,
};
