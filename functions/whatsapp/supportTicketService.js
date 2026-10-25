'use strict';

const { createHash } = require('node:crypto');

function supportTicketId(identityId, eventId) {
  return `wa_support_${createHash('sha256').update(`${identityId}:${eventId}`).digest('hex').slice(0, 32)}`;
}

function normalizeSupportMessage(inbound = {}) {
  const text = String(inbound.text || inbound.media?.caption || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, 4000);
  return {
    text,
    type: String(inbound.type || 'text').slice(0, 40),
    media: inbound.media ? {
      mimeType: String(inbound.media.mimeType || '').slice(0, 120),
      filename: String(inbound.media.filename || '').slice(0, 200),
      assetId: String(inbound.media.assetId || '').slice(0, 160),
      storagePath: String(inbound.media.storagePath || '').startsWith('whatsapp-private/')
        ? String(inbound.media.storagePath).slice(0, 500)
        : '',
    } : null,
  };
}

async function createOrAppendWhatsAppSupportMessage({
  db, admin, identityId, conversationRef, eventId, principalId, linkedUid = '', role = 'customer',
  requestId = '', inbound = {}, now = Date.now(),
} = {}) {
  if (!db || !admin || !identityId || !conversationRef || !eventId) throw new Error('Support ticket context is incomplete.');
  const message = normalizeSupportMessage(inbound);
  return db.runTransaction(async (transaction) => {
    const currentConversation = await transaction.get(conversationRef);
    const activeTicketId = String(currentConversation.data()?.activeSupportTicketId || '').trim();
    let ticketId = activeTicketId || supportTicketId(identityId, eventId);
    let ticketRef = db.collection('supportTickets').doc(ticketId);
    let currentTicket = activeTicketId ? await transaction.get(ticketRef) : null;
    if (!currentTicket?.exists || ['closed', 'resolved'].includes(String(currentTicket.data()?.status || '').toLowerCase())) {
      ticketId = supportTicketId(identityId, eventId);
      ticketRef = db.collection('supportTickets').doc(ticketId);
      currentTicket = await transaction.get(ticketRef);
    }
    const ticketMessageRef = ticketRef.collection('messages').doc(eventId);
    const existingMessage = await transaction.get(ticketMessageRef);
    if (existingMessage.exists) return { ticketId, duplicate: true };
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const isNew = !currentTicket.exists;
    const ticketData = {
      ticketId,
      channel: 'whatsapp',
      identityId,
      linkedUid: String(linkedUid || '') || null,
      principalId: String(principalId || '') || null,
      role: String(role || 'customer').slice(0, 40),
      requestId: String(requestId || '') || null,
      status: isNew ? 'open' : String(currentTicket.data()?.status || 'open'),
      subject: String(message.text || 'WhatsApp support request').split('\n')[0].slice(0, 180),
      lastMessageAtMs: now,
      updatedAt: timestamp,
      ...(isNew ? { createdAt: timestamp, assignedAdminUid: null, sourceEventId: eventId } : {}),
    };
    transaction.set(ticketRef, ticketData, { merge: true });
    transaction.create(ticketMessageRef, {
      messageId: eventId,
      senderType: 'user',
      senderUid: linkedUid || null,
      ...message,
      createdAt: timestamp,
      createdAtMs: now,
    });
    transaction.set(conversationRef, {
      currentMode: 'human_handoff',
      currentIntent: 'human_escalation',
      activeSupportTicketId: ticketId,
      humanHandoff: true,
      updatedAt: timestamp,
    }, { merge: true });
    return { ticketId, created: isNew, duplicate: false };
  });
}

module.exports = { createOrAppendWhatsAppSupportMessage, normalizeSupportMessage, supportTicketId };
