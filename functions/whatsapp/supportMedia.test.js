'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createWhatsAppSupportMediaUrl, isPrivateWhatsAppMediaPath } = require('./supportMedia');

const ticketId = `wa_support_${'a'.repeat(32)}`;
const messageId = `wa_${'b'.repeat(64)}`;
const assetId = `wa_${'c'.repeat(64)}`;
const storagePath = `whatsapp-private/${'d'.repeat(64)}/${'e'.repeat(64)}.pdf`;

function fakeDb({ ticket, message, asset }) {
  const ticketRef = {
    get: async () => ({ exists: Boolean(ticket), data: () => ticket || {} }),
    collection: () => ({ doc: () => ({ get: async () => ({ exists: Boolean(message), data: () => message || {} }) }) }),
  };
  return { collection: (name) => ({ doc: () => name === 'supportTickets'
    ? ticketRef
    : ({ get: async () => ({ exists: Boolean(asset), data: () => asset || {} }) }) }) };
}

test('private media object paths must match the deterministic hashed path schema', () => {
  assert.equal(isPrivateWhatsAppMediaPath(storagePath), true);
  assert.equal(isPrivateWhatsAppMediaPath('whatsapp-private/../public.pdf'), false);
});

test('support media URL requires an admin-authorized caller at the endpoint and exact ticket ownership', async () => {
  let signed;
  const db = fakeDb({
    ticket: { identityId: 'identity_1' },
    message: { media: { assetId, storagePath } },
    asset: { identityId: 'identity_1', supportTicketId: ticketId, storagePath, status: 'stored', mimeType: 'application/pdf' },
  });
  const result = await createWhatsAppSupportMediaUrl({
    db,
    storageBucket: { file: (path) => ({ getSignedUrl: async (options) => { signed = { path, options }; return ['https://signed.test/private']; } }) },
    ticketId, messageId, now: 1000,
  });
  assert.equal(result.code, 'available');
  assert.equal(signed.path, storagePath);
  assert.equal(signed.options.expires, 301000);
  assert.equal(result.expiresAtMs, 301000);
  assert.equal(result.mimeType, 'application/pdf');
});

test('support media cannot be loaded across identities, tickets or arbitrary storage paths', async () => {
  const storageBucket = { file: () => ({ getSignedUrl: async () => ['https://signed.test/private'] }) };
  const otherIdentity = fakeDb({
    ticket: { identityId: 'identity_1' },
    message: { media: { assetId, storagePath } },
    asset: { identityId: 'identity_2', supportTicketId: ticketId, storagePath, status: 'stored' },
  });
  assert.equal((await createWhatsAppSupportMediaUrl({ db: otherIdentity, storageBucket, ticketId, messageId })).code, 'media-not-authorized');
  const unsafePath = fakeDb({
    ticket: { identityId: 'identity_1' },
    message: { media: { assetId, storagePath: 'whatsapp-private/../public' } },
    asset: { identityId: 'identity_1', supportTicketId: ticketId, storagePath: 'whatsapp-private/../public', status: 'stored' },
  });
  assert.equal((await createWhatsAppSupportMediaUrl({ db: unsafePath, storageBucket, ticketId, messageId })).code, 'media-not-authorized');
});
