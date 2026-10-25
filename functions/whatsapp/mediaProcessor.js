'use strict';

const { createHash, timingSafeEqual } = require('node:crypto');

const MAX_REDIRECTS = 3;
const MEDIA_TYPES = Object.freeze({
  image: Object.freeze({
    'image/jpeg': { extension: 'jpg', maxBytes: 5 * 1024 * 1024, signatures: ['jpeg'] },
    'image/png': { extension: 'png', maxBytes: 5 * 1024 * 1024, signatures: ['png'] },
    'image/webp': { extension: 'webp', maxBytes: 5 * 1024 * 1024, signatures: ['webp'] },
  }),
  audio: Object.freeze({
    'audio/ogg': { extension: 'ogg', maxBytes: 16 * 1024 * 1024, signatures: ['ogg'] },
    'audio/mpeg': { extension: 'mp3', maxBytes: 16 * 1024 * 1024, signatures: ['mp3'] },
    'audio/mp4': { extension: 'm4a', maxBytes: 16 * 1024 * 1024, signatures: ['mp4'] },
    'audio/amr': { extension: 'amr', maxBytes: 16 * 1024 * 1024, signatures: ['amr'] },
  }),
  document: Object.freeze({
    'application/pdf': { extension: 'pdf', maxBytes: 10 * 1024 * 1024, signatures: ['pdf'] },
    'text/plain': { extension: 'txt', maxBytes: 2 * 1024 * 1024, signatures: ['text'] },
    'application/msword': { extension: 'doc', maxBytes: 10 * 1024 * 1024, signatures: ['ole'] },
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { extension: 'docx', maxBytes: 10 * 1024 * 1024, signatures: ['zip'] },
  }),
});

function normalizeMimeType(value) {
  return String(value || '').split(';')[0].trim().toLowerCase();
}

function validateMediaDescriptor({ mediaType, mimeType, mediaId } = {}) {
  const type = String(mediaType || '').trim().toLowerCase();
  const mime = normalizeMimeType(mimeType);
  const id = String(mediaId || '').trim();
  if (!Object.hasOwn(MEDIA_TYPES, type) || !/^[A-Za-z0-9_-]{1,256}$/.test(id)) {
    throw new Error('Unsupported WhatsApp media descriptor.');
  }
  const rule = MEDIA_TYPES[type][mime];
  if (!rule) throw new Error('This WhatsApp media type is not supported.');
  return { type, mimeType: mime, mediaId: id, ...rule };
}

function allowedMetaHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'graph.facebook.com'
    || host === 'lookaside.fbsbx.com'
    || host.endsWith('.fbcdn.net');
}

function assertSafeMetaUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || !allowedMetaHost(url.hostname) || url.username || url.password) {
    throw new Error('Meta returned an invalid media URL.');
  }
  return url;
}

function hasValidSignature(buffer, signatures) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return false;
  return signatures.some((signature) => {
    if (signature === 'jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (signature === 'png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (signature === 'webp') return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    if (signature === 'ogg') return buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'OggS';
    if (signature === 'mp3') return buffer.length >= 3 && (buffer.toString('ascii', 0, 3) === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0));
    if (signature === 'mp4') return buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp';
    if (signature === 'amr') return buffer.length >= 6 && buffer.toString('ascii', 0, 6) === '#!AMR\n';
    if (signature === 'pdf') return buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-';
    if (signature === 'ole') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    if (signature === 'zip') return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && [0x03, 0x05, 0x07].includes(buffer[2]);
    if (signature === 'text') return !buffer.includes(0) && !buffer.toString('utf8').includes('\ufffd');
    return false;
  });
}

function sha256Matches(buffer, expected) {
  const value = String(expected || '').trim();
  if (!value) return true;
  const digest = createHash('sha256').update(buffer).digest();
  const hex = digest.toString('hex');
  const base64 = digest.toString('base64').replace(/=+$/, '');
  const normalized = value.replace(/=+$/, '');
  const isHex = /^[a-f0-9]{64}$/i.test(value);
  const actual = isHex ? hex : base64;
  const left = Buffer.from(isHex ? normalized.toLowerCase() : normalized);
  const right = Buffer.from(isHex ? actual.toLowerCase() : actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function readBoundedBody(response, maxBytes) {
  const announcedLength = Number(response.headers?.get?.('content-length') || 0);
  if (announcedLength > maxBytes) throw new Error('WhatsApp media exceeds the supported size limit.');
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        size += chunk.length;
        if (size > maxBytes) {
          await reader.cancel();
          throw new Error('WhatsApp media exceeds the supported size limit.');
        }
        chunks.push(chunk);
      }
    } finally {
      reader.releaseLock?.();
    }
    return Buffer.concat(chunks, size);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) throw new Error('WhatsApp media exceeds the supported size limit.');
  return buffer;
}

async function downloadMetaMedia({ mediaId, mediaType, mimeType, sha256, accessToken, graphApiVersion, fetchImpl = fetch } = {}) {
  const descriptor = validateMediaDescriptor({ mediaType, mimeType, mediaId });
  const token = String(accessToken || '').trim();
  const version = String(graphApiVersion || '').trim();
  if (!token || !/^v\d{2}\.\d$/.test(version)) throw new Error('WhatsApp media API configuration is incomplete.');

  const metadataResponse = await fetchImpl(`https://graph.facebook.com/${version}/${encodeURIComponent(descriptor.mediaId)}`, {
    method: 'GET', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000),
  });
  if (!metadataResponse.ok) throw new Error('Meta media metadata request failed.');
  const metadata = await metadataResponse.json();
  const metadataMime = normalizeMimeType(metadata?.mime_type || descriptor.mimeType);
  if (!MEDIA_TYPES[descriptor.type][metadataMime]) throw new Error('Meta media MIME type is not supported.');
  const metadataSize = metadata?.file_size === undefined || metadata?.file_size === null ? 0 : Number(metadata.file_size);
  if (metadataSize && (!Number.isFinite(metadataSize) || metadataSize < 1)) throw new Error('Meta media size metadata is invalid.');
  if (metadataSize > descriptor.maxBytes) throw new Error('WhatsApp media exceeds the supported size limit.');

  let url = assertSafeMetaUrl(metadata?.url);
  let response;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    response = await fetchImpl(url.toString(), {
      method: 'GET', headers: { Authorization: `Bearer ${token}` }, redirect: 'manual', signal: AbortSignal.timeout(15_000),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers?.get?.('location');
    if (!location || redirect === MAX_REDIRECTS) throw new Error('Meta media download redirected too many times.');
    url = assertSafeMetaUrl(new URL(location, url).toString());
  }
  if (!response?.ok) throw new Error('Meta media download failed.');

  const responseMime = normalizeMimeType(response.headers?.get?.('content-type') || metadataMime);
  if (responseMime !== 'application/octet-stream' && responseMime !== metadataMime) {
    throw new Error('Downloaded media MIME type does not match Meta metadata.');
  }
  const buffer = await readBoundedBody(response, descriptor.maxBytes);
  if (metadataSize && buffer.length !== metadataSize) throw new Error('Downloaded media size does not match Meta metadata.');
  const expectedHash = sha256 || metadata?.sha256 || '';
  if (!sha256Matches(buffer, expectedHash)) throw new Error('WhatsApp media integrity check failed.');
  if (!hasValidSignature(buffer, MEDIA_TYPES[descriptor.type][metadataMime].signatures)) {
    throw new Error('WhatsApp media content does not match its declared file type.');
  }
  return { buffer, mediaType: descriptor.type, mimeType: metadataMime, size: buffer.length, extension: MEDIA_TYPES[descriptor.type][metadataMime].extension };
}

function privateObjectPath({ identityId, eventId, extension } = {}) {
  const identityHash = createHash('sha256').update(String(identityId || '')).digest('hex');
  const eventHash = createHash('sha256').update(String(eventId || '')).digest('hex');
  if (!identityId || !eventId || !/^[a-z0-9]{1,8}$/.test(String(extension || ''))) throw new Error('Invalid WhatsApp media storage path.');
  return `whatsapp-private/${identityHash}/${eventHash}.${extension}`;
}

async function storeWhatsAppMedia({ storageBucket, media, identityId, eventId, requestId = '', supportTicketId = '', retentionEnforced = false, now = Date.now() } = {}) {
  if (!storageBucket?.file || !media?.buffer || !identityId || !eventId) throw new Error('WhatsApp media storage context is incomplete.');
  if (retentionEnforced !== true) throw new Error('A Storage lifecycle retention policy must be configured before WhatsApp media storage is enabled.');
  const path = privateObjectPath({ identityId, eventId, extension: media.extension });
  const file = storageBucket.file(path);
  try {
    await file.save(media.buffer, {
      resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: {
        contentType: media.mimeType,
        cacheControl: 'private, no-store, max-age=0',
        contentDisposition: 'attachment',
        metadata: {
          identityHash: createHash('sha256').update(String(identityId)).digest('hex'),
          sourceEventHash: createHash('sha256').update(String(eventId)).digest('hex'),
          requestId: String(requestId || '').slice(0, 128),
          supportTicketId: String(supportTicketId || '').slice(0, 128),
          retentionExpiresAtMs: String(now + 30 * 24 * 60 * 60 * 1000),
        },
      },
    });
    return { path, size: media.size, mimeType: media.mimeType, duplicate: false };
  } catch (error) {
    if (Number(error?.code) === 412 || error?.code === 'preconditionFailed') {
      return { path, size: media.size, mimeType: media.mimeType, duplicate: true };
    }
    throw error;
  }
}

module.exports = {
  downloadMetaMedia,
  hasValidSignature,
  normalizeMimeType,
  privateObjectPath,
  sha256Matches,
  storeWhatsAppMedia,
  validateMediaDescriptor,
};
