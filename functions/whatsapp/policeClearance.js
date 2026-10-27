'use strict';

const { createHash } = require('node:crypto');

const CLEARANCE_STATUSES = Object.freeze([
  'missing',
  'uploading',
  'pending',
  'approved',
  'rejected',
  'resubmission_required',
  'expired',
  'failed',
]);

const MAX_CLEARANCE_RETENTION_DAYS = 365;

function normalizePoliceClearanceInbound(inbound = {}) {
  const incomingType = String(inbound.type || '').trim().toLowerCase();
  const mimeType = String(inbound.media?.mimeType || '').split(';')[0].trim().toLowerCase();
  if (!inbound.media?.mediaId || !['document', 'image'].includes(incomingType)) return null;

  if (mimeType === 'application/pdf') {
    return { mediaType: 'document', mimeType, maxBytes: 10 * 1024 * 1024, extension: 'pdf' };
  }
  if (mimeType === 'image/jpeg' && (incomingType === 'image' || incomingType === 'document')) {
    return { mediaType: 'image', mimeType, maxBytes: 5 * 1024 * 1024, extension: 'jpg' };
  }
  if (mimeType === 'image/png' && (incomingType === 'image' || incomingType === 'document')) {
    return { mediaType: 'image', mimeType, maxBytes: 5 * 1024 * 1024, extension: 'png' };
  }
  return null;
}

function policeClearanceRetentionDays(env = {}) {
  const raw = String(env.WHATSAPP_HELPER_CLEARANCE_RETENTION_DAYS || '').trim();
  if (!/^\d{1,3}$/.test(raw)) return null;
  const days = Number(raw);
  return Number.isInteger(days) && days >= 1 && days <= MAX_CLEARANCE_RETENTION_DAYS ? days : null;
}

function isPoliceClearanceUploadConfigured(env = {}) {
  return String(env.WHATSAPP_HELPER_POLICE_CLEARANCE_ENABLED || '').trim().toLowerCase() === 'true'
    && String(env.WHATSAPP_MEDIA_RETENTION_ENFORCED || '').trim().toLowerCase() === 'true'
    && String(env.WHATSAPP_RETENTION_CLEANUP_ENABLED || '').trim().toLowerCase() === 'true'
    && String(env.WHATSAPP_STORAGE_RETENTION_POLICY_VERIFIED || '').trim().toLowerCase() === 'true'
    && policeClearanceRetentionDays(env) !== null;
}

function policeClearanceStoragePath(uid, eventId, extension) {
  const helperUid = String(uid || '').trim();
  const sourceEventId = String(eventId || '').trim();
  const ext = String(extension || '').trim().toLowerCase();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(helperUid)
    || !/^[A-Za-z0-9_-]{1,256}$/.test(sourceEventId)
    || !['pdf', 'jpg', 'png'].includes(ext)) {
    throw new Error('Invalid police-clearance storage context.');
  }
  const helperHash = createHash('sha256').update(helperUid).digest('hex');
  const eventHash = createHash('sha256').update(sourceEventId).digest('hex');
  return `helper-police-clearance-private/${helperHash}/${eventHash}.${ext}`;
}

function policeClearanceSubmissionId(uid, eventId) {
  const helperUid = String(uid || '').trim();
  const sourceEventId = String(eventId || '').trim();
  if (!helperUid || !sourceEventId) throw new Error('Invalid police-clearance submission context.');
  return createHash('sha256').update(`${helperUid}:${sourceEventId}`).digest('hex');
}

async function storePoliceClearanceObject({ storageBucket, uid, eventId, media, retentionDays, now = Date.now() } = {}) {
  if (!storageBucket?.file || !Buffer.isBuffer(media?.buffer) || !media.buffer.length) {
    throw new Error('Police-clearance storage context is incomplete.');
  }
  const days = Number(retentionDays);
  if (!Number.isInteger(days) || days < 1 || days > MAX_CLEARANCE_RETENTION_DAYS) {
    throw new Error('Police-clearance retention is not configured.');
  }
  const path = policeClearanceStoragePath(uid, eventId, media.extension);
  const file = storageBucket.file(path);
  try {
    await file.save(media.buffer, {
      resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: {
        contentType: media.mimeType,
        cacheControl: 'private, no-store, max-age=0',
        contentDisposition: 'inline',
        metadata: {
          documentType: 'police_clearance',
          helperHash: createHash('sha256').update(String(uid)).digest('hex'),
          sourceEventHash: createHash('sha256').update(String(eventId)).digest('hex'),
          retentionExpiresAtMs: String(now + days * 24 * 60 * 60 * 1000),
        },
      },
    });
    return { path, duplicate: false };
  } catch (error) {
    if (Number(error?.code) === 412 || error?.code === 'preconditionFailed') return { path, duplicate: true };
    throw error;
  }
}

function normalizePoliceClearanceStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  return CLEARANCE_STATUSES.includes(status) ? status : 'missing';
}

function isHelperPoliceClearanceApproved(value) {
  return normalizePoliceClearanceStatus(value) === 'approved';
}

function meetsHelperPoliceClearanceRequirement(required, status) {
  return required !== true || isHelperPoliceClearanceApproved(status);
}

module.exports = {
  CLEARANCE_STATUSES,
  MAX_CLEARANCE_RETENTION_DAYS,
  isPoliceClearanceUploadConfigured,
  isHelperPoliceClearanceApproved,
  meetsHelperPoliceClearanceRequirement,
  normalizePoliceClearanceInbound,
  normalizePoliceClearanceStatus,
  policeClearanceRetentionDays,
  policeClearanceStoragePath,
  policeClearanceSubmissionId,
  storePoliceClearanceObject,
};
