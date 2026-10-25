'use strict';

function isPrivateWhatsAppMediaPath(value) {
  return /^whatsapp-private\/[a-f0-9]{64}\/[a-f0-9]{64}\.[a-z0-9]{1,8}$/.test(String(value || ''));
}

async function createWhatsAppSupportMediaUrl({ db, storageBucket, ticketId, messageId, now = Date.now() } = {}) {
  if (!db || !storageBucket?.file || !/^wa_support_[a-f0-9]{32}$/.test(String(ticketId || ''))
    || !/^wa_[a-f0-9]{64}$/.test(String(messageId || ''))) return { code: 'invalid-reference' };
  const ticketRef = db.collection('supportTickets').doc(ticketId);
  const ticketSnapshot = await ticketRef.get();
  if (!ticketSnapshot.exists) return { code: 'not-found' };
  const ticket = ticketSnapshot.data() || {};
  const messageSnapshot = await ticketRef.collection('messages').doc(messageId).get();
  if (!messageSnapshot.exists) return { code: 'not-found' };
  const media = messageSnapshot.data()?.media || {};
  const assetId = String(media.assetId || '').trim();
  if (!/^wa_[a-f0-9]{64}$/.test(assetId)) return { code: 'media-not-found' };
  const assetSnapshot = await db.collection('whatsappMediaAssets').doc(assetId).get();
  if (!assetSnapshot.exists) return { code: 'media-not-found' };
  const asset = assetSnapshot.data() || {};
  if (String(asset.identityId || '') !== String(ticket.identityId || '')
    || String(asset.supportTicketId || '') !== ticketId
    || !isPrivateWhatsAppMediaPath(asset.storagePath)
    || String(media.storagePath || '') !== String(asset.storagePath || '')
    || String(asset.status || '') !== 'stored') return { code: 'media-not-authorized' };

  const expiresAtMs = now + 5 * 60 * 1000;
  const [url] = await storageBucket.file(asset.storagePath).getSignedUrl({ action: 'read', expires: expiresAtMs, version: 'v4' });
  return { code: 'available', url, expiresAtMs, mimeType: String(asset.mimeType || 'application/octet-stream') };
}

module.exports = { createWhatsAppSupportMediaUrl, isPrivateWhatsAppMediaPath };
