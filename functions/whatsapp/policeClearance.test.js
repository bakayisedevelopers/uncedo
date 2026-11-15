'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isPoliceClearanceUploadConfigured,
  isHelperPoliceClearanceApproved,
  meetsHelperPoliceClearanceRequirement,
  normalizePoliceClearanceInbound,
  normalizePoliceClearanceStatus,
  policeClearanceReviewValidityDays,
  clearanceReviewDeadlineMs,
  isClearanceReviewExpired,
  policeClearanceStoragePath,
  policeClearanceSubmissionId,
  storePoliceClearanceObject,
  validatePoliceClearanceBuffer,
} = require('./policeClearance');

test('police-clearance uploads accept only PDF, JPEG, and PNG attachments', () => {
  assert.equal(normalizePoliceClearanceInbound({ type: 'document', media: { mediaId: 'm1', mimeType: 'application/pdf' } }).extension, 'pdf');
  assert.equal(normalizePoliceClearanceInbound({ type: 'image', media: { mediaId: 'm2', mimeType: 'image/jpeg' } }).extension, 'jpg');
  assert.equal(normalizePoliceClearanceInbound({ type: 'document', media: { mediaId: 'm3', mimeType: 'image/png' } }).extension, 'png');
  assert.equal(normalizePoliceClearanceInbound({ type: 'document', media: { mediaId: 'm4', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } }), null);
  assert.equal(normalizePoliceClearanceInbound({ type: 'audio', media: { mediaId: 'm5', mimeType: 'audio/ogg' } }), null);
  assert.equal(normalizePoliceClearanceInbound({ type: 'document', media: { mediaId: '', mimeType: 'application/pdf' } }), null);
});

test('police-clearance upload requires explicit enablement and a review validity period', () => {
  const configured = {
    WHATSAPP_HELPER_POLICE_CLEARANCE_ENABLED: 'true',
    WHATSAPP_HELPER_CLEARANCE_REVIEW_VALIDITY_DAYS: '90',
  };
  assert.equal(isPoliceClearanceUploadConfigured(configured), true);
  assert.equal(isPoliceClearanceUploadConfigured({ ...configured, WHATSAPP_HELPER_POLICE_CLEARANCE_ENABLED: 'false' }), false);
  assert.equal(isPoliceClearanceUploadConfigured({ ...configured, WHATSAPP_HELPER_CLEARANCE_REVIEW_VALIDITY_DAYS: '0' }), false);
  assert.equal(policeClearanceReviewValidityDays(configured), 90);
  assert.equal(policeClearanceReviewValidityDays({ WHATSAPP_HELPER_CLEARANCE_REVIEW_VALIDITY_DAYS: '366' }), null);
});

test('pending clearance expires for approval after its review deadline but approved status never expires', () => {
  const uploadedAtMs = 1_000;
  const deadline = clearanceReviewDeadlineMs(uploadedAtMs, 90);
  assert.equal(deadline, uploadedAtMs + 90 * 24 * 60 * 60 * 1000);
  assert.equal(isClearanceReviewExpired('pending', deadline, deadline - 1), false);
  assert.equal(isClearanceReviewExpired('pending', deadline, deadline), true);
  assert.equal(isClearanceReviewExpired('approved', deadline, deadline + 1), false);
  assert.equal(isClearanceReviewExpired('resubmission_required', deadline, deadline + 1), false);
  assert.equal(clearanceReviewDeadlineMs(0, 90), null);
});

test('police-clearance paths and submission IDs do not expose sender or source event identifiers', () => {
  const path = policeClearanceStoragePath('helper_123', 'wa_event_456', 'pdf');
  const id = policeClearanceSubmissionId('helper_123', 'wa_event_456');
  assert.match(path, /^helper-police-clearance-private\/[a-f0-9]{64}\/[a-f0-9]{64}\.pdf$/);
  assert.match(id, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(`${path}/${id}`, /helper_123|wa_event_456/);
  assert.throws(() => policeClearanceStoragePath('../helper', 'event', 'pdf'), /Invalid/);
  assert.throws(() => policeClearanceStoragePath('helper', 'event', 'docx'), /Invalid/);
});

test('only an administrator-approved clearance opens helper dispatch readiness', () => {
  for (const status of ['', 'missing', 'uploading', 'pending', 'rejected', 'resubmission_required', 'expired', 'unknown']) {
    assert.equal(isHelperPoliceClearanceApproved(status), false, `expected ${status || 'empty'} to block dispatch`);
  }
  assert.equal(isHelperPoliceClearanceApproved('approved'), true);
  assert.equal(meetsHelperPoliceClearanceRequirement(false, 'missing'), true);
  assert.equal(meetsHelperPoliceClearanceRequirement(true, 'missing'), false);
  assert.equal(meetsHelperPoliceClearanceRequirement(true, 'approved'), true);
});

test('private police-clearance object is create-only and no-store without a deletion timestamp', async () => {
  let saved = null;
  const storageBucket = { file: (path) => ({ save: async (buffer, options) => { saved = { path, buffer, options }; } }) };
  const result = await storePoliceClearanceObject({
    storageBucket,
    uid: 'helper_123',
    eventId: 'wa_event_456',
    media: { buffer: Buffer.from('%PDF-test'), extension: 'pdf', mimeType: 'application/pdf' },
  });
  assert.equal(result.duplicate, false);
  assert.equal(saved.options.preconditionOpts.ifGenerationMatch, 0);
  assert.equal(saved.options.metadata.cacheControl, 'private, no-store, max-age=0');
  assert.equal(saved.options.metadata.temporaryHold, true);
  assert.equal(saved.options.metadata.metadata.documentType, 'police_clearance');
  assert.equal(Object.hasOwn(saved.options.metadata.metadata, 'retentionExpiresAtMs'), false);
  assert.equal(normalizePoliceClearanceStatus('approved'), 'approved');
  assert.equal(normalizePoliceClearanceStatus('untrusted'), 'missing');
});

test('validatePoliceClearanceBuffer verifies magic bytes and supported MIME types', () => {
  assert.equal(validatePoliceClearanceBuffer({ mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n...') }).extension, 'pdf');
  assert.equal(validatePoliceClearanceBuffer({ mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) }).extension, 'jpg');
  assert.equal(validatePoliceClearanceBuffer({ mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }).extension, 'png');
  assert.equal(validatePoliceClearanceBuffer({ mimeType: 'application/pdf', buffer: Buffer.from('not-a-pdf') }), null);
  assert.equal(validatePoliceClearanceBuffer({ mimeType: 'image/png', buffer: Buffer.from('%PDF-1.4') }), null);
  assert.equal(validatePoliceClearanceBuffer({ mimeType: 'text/plain', buffer: Buffer.from('hello') }), null);
});
