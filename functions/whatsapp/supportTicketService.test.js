'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSupportMessage, supportTicketId } = require('./supportTicketService');

test('support ticket IDs are deterministic and do not expose WhatsApp identifiers', () => {
  const first = supportTicketId('wa-ident-123456', 'wa-event-abcdef');
  const retry = supportTicketId('wa-ident-123456', 'wa-event-abcdef');
  assert.equal(first, retry);
  assert.match(first, /^wa_support_[a-f0-9]{32}$/);
  assert.equal(first.includes('123456'), false);
});

test('support message records are bounded and retain only safe media metadata', () => {
  const result = normalizeSupportMessage({
    type: 'image',
    text: `${'x'.repeat(4200)}\u0000`,
    media: { mediaId: 'meta-media-id', assetId: 'wa_asset_123', storagePath: 'whatsapp-private/a/b.jpg', mimeType: 'image/jpeg', filename: 'photo.jpg', sha256: 'private-hash' },
  });
  assert.equal(result.text.length, 4000);
  assert.equal(result.media.assetId, 'wa_asset_123');
  assert.equal(result.media.storagePath, 'whatsapp-private/a/b.jpg');
  assert.equal('mediaId' in result.media, false);
  assert.equal('sha256' in result.media, false);
});
