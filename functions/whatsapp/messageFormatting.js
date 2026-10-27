'use strict';

function getWhatsAppDisplayName(identity = {}) {
  const candidates = [
    identity.preferredName,
    identity.whatsappPreferredName,
    identity.firstName,
    identity.fullName,
    identity.displayName,
    identity.profileName,
  ];
  for (const candidate of candidates) {
    const token = String(candidate || '')
      .normalize('NFKC')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .trim()
      .split(/\s+/)[0]
      .replace(/[^\p{L}\p{M}'’.-]/gu, '');
    if (token && /\p{L}/u.test(token)) return token.slice(0, 50);
  }
  return '';
}

function formatWhatsAppText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/```(?:[a-zA-Z0-9_-]+)?\s*\n?([\s\S]*?)```/g, '$1')
    .replace(/^\s*#{1,6}\s+(.+?)\s*#*\s*$/gm, '*$1*')
    .replace(/\*\*([^*\n][\s\S]*?)\*\*/g, '*$1*')
    .replace(/__([^_\n][\s\S]*?)__/g, '_$1_')
    .replace(/^\s*[-+]\s+/gm, '• ')
    .replace(/^\s*\*\s+/gm, '• ')
    .replace(/^\s*(\d+)\)\s+/gm, '$1. ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 4096)
    .trimEnd();
}

module.exports = { formatWhatsAppText, getWhatsAppDisplayName };
