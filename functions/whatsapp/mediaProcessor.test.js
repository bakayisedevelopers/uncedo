'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const {
  downloadMetaMedia,
  privateObjectPath,
  sha256Matches,
  storeWhatsAppMedia,
  validateMediaDescriptor,
} = require('./mediaProcessor');

function response({ status = 200, headers = {}, json, bytes } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers[name.toLowerCase()] || null },
    json: async () => json,
    arrayBuffer: async () => Uint8Array.from(bytes || []).buffer,
  };
}

test('media allow-list rejects unsafe MIME types and oversized descriptors', () => {
  assert.equal(validateMediaDescriptor({ mediaType: 'image', mimeType: 'image/jpeg', mediaId: 'abc-123' }).maxBytes, 5 * 1024 * 1024);
  assert.throws(() => validateMediaDescriptor({ mediaType: 'image', mimeType: 'image/svg+xml', mediaId: 'abc' }), /not supported/);
  assert.throws(() => validateMediaDescriptor({ mediaType: 'document', mimeType: 'application/pdf', mediaId: '../private' }), /descriptor/);
});

test('media downloader validates Meta hosts, MIME, file signature, size and hash', async () => {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return calls.length === 1
      ? response({ json: { url: 'https://lookaside.fbsbx.com/file/1', mime_type: 'image/jpeg', file_size: bytes.length, sha256: digest } })
      : response({ headers: { 'content-type': 'image/jpeg', 'content-length': String(bytes.length) }, bytes });
  };
  const result = await downloadMetaMedia({ mediaId: 'media_1', mediaType: 'image', mimeType: 'image/jpeg', accessToken: 'test-only', graphApiVersion: 'v99.0', fetchImpl });
  assert.equal(result.size, bytes.length);
  assert.equal(result.mimeType, 'image/jpeg');
  assert.equal(calls.length, 2);
  assert.equal(calls.every((url) => !url.includes('test-only')), true);
  assert.equal(sha256Matches(bytes, digest), true);
  assert.equal(sha256Matches(bytes, createHash('sha256').update(bytes).digest('base64')), true);
});

test('media downloader rejects private, non-HTTPS or unapproved download URLs', async () => {
  const fetchImpl = async () => response({ json: { url: 'http://127.0.0.1/secret', mime_type: 'image/jpeg', file_size: 4 } });
  await assert.rejects(downloadMetaMedia({ mediaId: 'media_1', mediaType: 'image', mimeType: 'image/jpeg', accessToken: 'test-only', graphApiVersion: 'v99.0', fetchImpl }), /invalid media URL/);
});

test('private storage paths hide source identifiers and require enforced retention', async () => {
  const path = privateObjectPath({ identityId: 'phone_identity', eventId: 'meta_event', extension: 'pdf' });
  assert.match(path, /^whatsapp-private\/[a-f0-9]{64}\/[a-f0-9]{64}\.pdf$/);
  assert.doesNotMatch(path, /phone_identity|meta_event/);
  const storageBucket = { file: () => ({ save: async () => { throw new Error('must not save'); } }) };
  await assert.rejects(storeWhatsAppMedia({ storageBucket, media: { buffer: Buffer.from('x'), extension: 'pdf' }, identityId: 'i', eventId: 'e' }), /lifecycle retention policy/);
});

test('storage upload uses create-only writes and returns idempotently for an existing media object', async () => {
  const calls = [];
  const storageBucket = { file: (path) => ({ save: async (buffer, options) => {
    calls.push({ path, size: buffer.length, options });
    const error = new Error('already exists'); error.code = 412; throw error;
  } }) };
  const result = await storeWhatsAppMedia({
    storageBucket, media: { buffer: Buffer.from('data'), size: 4, mimeType: 'application/pdf', extension: 'pdf' },
    identityId: 'identity', eventId: 'event', requestId: 'request_123456', retentionEnforced: true,
  });
  assert.equal(result.duplicate, true);
  assert.equal(calls[0].options.preconditionOpts.ifGenerationMatch, 0);
  assert.equal(calls[0].options.metadata.metadata.requestId, 'request_123456');
  assert.equal(calls[0].options.metadata.metadata.retentionExpiresAtMs.length > 0, true);
});
