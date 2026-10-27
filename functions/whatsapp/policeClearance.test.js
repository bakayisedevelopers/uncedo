'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isPoliceClearanceUploadConfigured,
  isHelperPoliceClearanceApproved,
  meetsHelperPoliceClearanceRequirement,
  normalizePoliceClearanceInbound,
  normalizePoliceClearanceStatus,
  policeClearanceRetentionDays,
  policeClearanceStoragePath,
  policeClearanceSubmissionId,
  storePoliceClearanceObject,
} = require('./policeClearance');

test('police-clearance uploads accept only PDF, JPEG, and PNG attachments', () => {
  assert.equal(normalizePoliceClearanceInbound({ type: 'document', media: { mediaId: 'm1', mimeType: 'application/pdf' } }).extension, 'pdf');
  assert.equal(normalizePoliceClearanceInbound({ type: 'image', media: { mediaId: 'm2', mimeType: 'image/jpeg' } }).extension, 'jpg');
  assert.equal(normalizePoliceClearanceInbound({ type: 'document', media: { mediaId: 'm3', mimeType: 'image/png' } }).extension, 'png');
  assert.equal(normalizePoliceClearanceInbound({ type: 'document', media: { mediaId: 'm4', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } }), null);
  assert.equal(normalizePoliceClearanceInbound({ type: 'audio', media: { mediaId: 'm5', mimeType: 'audio/ogg' } }), null);
  assert.equal(normalizePoliceClearanceInbound({ type: 'document', media: { mediaId: '', mimeType: 'application/pdf' } }), null);
});

test('police-clearance upload requires explicit enablement and enforced retention', () => {
  const configured = {
    WHATSAPP_HELPER_POLICE_CLEARANCE_ENABLED: 'true',
    WHATSAPP_MEDIA_RETENTION_ENFORCED: 'true',
    WHATSAPP_RETENTION_CLEANUP_ENABLED: 'true',
    WHATSAPP_STORAGE_RETENTION_POLICY_VERIFIED: 'true',
    WHATSAPP_HELPER_CLEARANCE_RETENTION_DAYS: '90',
  };
  assert.equal(isPoliceClearanceUploadConfigured(configured), true);
  assert.equal(isPoliceClearanceUploadConfigured({ ...configured, WHATSAPP_STORAGE_RETENTION_POLICY_VERIFIED: 'false' }), false);
  assert.equal(isPoliceClearanceUploadConfigured({ ...configured, WHATSAPP_HELPER_CLEARANCE_RETENTION_DAYS: '0' }), false);
  assert.equal(policeClearanceRetentionDays(configured), 90);
  assert.equal(policeClearanceRetentionDays({ WHATSAPP_HELPER_CLEARANCE_RETENTION_DAYS: '366' }), null);
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

test('private police-clearance object is create-only, no-store, and retention-tagged', async () => {
  let saved = null;
  const storageBucket = { file: (path) => ({ save: async (buffer, options) => { saved = { path, buffer, options }; } }) };
  const result = await storePoliceClearanceObject({
    storageBucket,
    uid: 'helper_123',
    eventId: 'wa_event_456',
    media: { buffer: Buffer.from('%PDF-test'), extension: 'pdf', mimeType: 'application/pdf' },
    retentionDays: 30,
    now: 1000,
  });
  assert.equal(result.duplicate, false);
  assert.equal(saved.options.preconditionOpts.ifGenerationMatch, 0);
  assert.equal(saved.options.metadata.cacheControl, 'private, no-store, max-age=0');
  assert.equal(saved.options.metadata.metadata.documentType, 'police_clearance');
  assert.equal(saved.options.metadata.metadata.retentionExpiresAtMs, String(1000 + 30 * 24 * 60 * 60 * 1000));
  assert.equal(normalizePoliceClearanceStatus('approved'), 'approved');
  assert.equal(normalizePoliceClearanceStatus('untrusted'), 'missing');
});
