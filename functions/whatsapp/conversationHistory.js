'use strict';

const MAX_PAGE_SIZE = 100;

function encodeHistoryCursor(value) {
  if (!value || !Number.isFinite(Number(value.createdAtMs)) || !/^[A-Za-z0-9_-]{1,160}$/.test(String(value.id || ''))) return '';
  const cursor = { createdAtMs: Number(value.createdAtMs), id: String(value.id) };
  if (Number.isInteger(Number(value.createdAtSeconds)) && Number.isInteger(Number(value.createdAtNanoseconds))) {
    cursor.createdAtSeconds = Number(value.createdAtSeconds);
    cursor.createdAtNanoseconds = Number(value.createdAtNanoseconds);
  }
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeHistoryCursor(value) {
  const token = String(value || '').trim();
  if (!token || token.length > 512 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (!Number.isFinite(Number(parsed.createdAtMs)) || !/^[A-Za-z0-9_-]{1,160}$/.test(String(parsed.id || ''))) return null;
    const cursor = { createdAtMs: Number(parsed.createdAtMs), id: String(parsed.id) };
    if (Number.isInteger(Number(parsed.createdAtSeconds)) && Number.isInteger(Number(parsed.createdAtNanoseconds))) {
      cursor.createdAtSeconds = Number(parsed.createdAtSeconds);
      cursor.createdAtNanoseconds = Number(parsed.createdAtNanoseconds);
    }
    return cursor;
  } catch (_) {
    return null;
  }
}

function timestampMillis(value) {
  if (Number.isFinite(Number(value))) return Number(value);
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && Number.isFinite(Number(value.seconds))) return Number(value.seconds) * 1000;
  return 0;
}

function sanitizeConversationMessage(id, message = {}) {
  return {
    id: String(id || ''),
    direction: ['inbound', 'outbound', 'relay'].includes(String(message.direction || '').toLowerCase()) ? String(message.direction).toLowerCase() : 'system',
    senderType: String(message.senderType || message.direction || 'system').slice(0, 40),
    type: String(message.type || 'text').slice(0, 40),
    text: String(message.text || '').slice(0, 5000),
    requestId: String(message.requestId || '').slice(0, 128),
    ticketId: String(message.ticketId || '').slice(0, 128),
    status: String(message.status || message.deliveryStatus || '').slice(0, 50),
    createdAtMs: timestampMillis(message.createdAt || message.createdAtMs),
    media: message.media ? {
      assetId: String(message.media.assetId || '').slice(0, 160),
      mimeType: String(message.media.mimeType || '').slice(0, 120),
      mediaType: String(message.media.mediaType || '').slice(0, 40),
      filename: String(message.media.filename || '').slice(0, 180),
    } : null,
  };
}

async function getWhatsAppConversationHistory({ db, documentIdField, identityId, pageSize = 50, cursor = '', timestampFactory } = {}) {
  if (!db || !documentIdField || !/^[a-f0-9]{64}$/.test(String(identityId || ''))) return { code: 'invalid-input' };
  const limit = Math.max(1, Math.min(MAX_PAGE_SIZE, Number.parseInt(String(pageSize), 10) || 50));
  const decoded = cursor ? decodeHistoryCursor(cursor) : null;
  if (cursor && !decoded) return { code: 'invalid-cursor' };
  let query = db.collection('whatsappMessages')
    .where('identityId', '==', identityId)
    .orderBy('createdAt', 'desc')
    .orderBy(documentIdField, 'desc');
  if (decoded) {
    const time = decoded.createdAtSeconds !== undefined && typeof timestampFactory === 'function'
      ? timestampFactory(decoded.createdAtSeconds, decoded.createdAtNanoseconds)
      : new Date(decoded.createdAtMs);
    query = query.startAfter(time, decoded.id);
  }
  const snapshot = await query.limit(limit + 1).get();
  const docs = Array.isArray(snapshot.docs) ? snapshot.docs : [];
  const hasMore = docs.length > limit;
  const pageDocs = docs.slice(0, limit);
  const lastCreatedAt = pageDocs.length ? pageDocs[pageDocs.length - 1].data()?.createdAt : null;
  const next = hasMore && pageDocs.length
    ? encodeHistoryCursor({
      id: pageDocs[pageDocs.length - 1].id,
      createdAtMs: timestampMillis(lastCreatedAt),
      ...(Number.isInteger(Number(lastCreatedAt?.seconds ?? lastCreatedAt?._seconds)) ? {
        createdAtSeconds: Number(lastCreatedAt.seconds ?? lastCreatedAt._seconds),
        createdAtNanoseconds: Number(lastCreatedAt.nanoseconds ?? lastCreatedAt._nanoseconds ?? 0),
      } : {}),
    })
    : '';
  return {
    code: 'ok',
    messages: pageDocs.map((document) => sanitizeConversationMessage(document.id, document.data() || {})).reverse(),
    nextCursor: next,
    hasMore,
  };
}

module.exports = { MAX_PAGE_SIZE, decodeHistoryCursor, encodeHistoryCursor, getWhatsAppConversationHistory, sanitizeConversationMessage, timestampMillis };
