'use strict';

const MAX_RECENT_TURNS = 20;
const MAX_SUMMARY_TURNS = 6;
const MAX_SUMMARY_TEXT = 180;

function normalizeTurn(turn = {}) {
  const text = String(turn.text || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return {
    role: turn.role === 'assistant' ? 'assistant' : 'user',
    text: text.slice(0, 900),
    type: String(turn.type || 'text').slice(0, 40),
    timestampMs: Math.max(0, Number(turn.timestampMs || 0)),
  };
}

function appendBoundedConversationTurn({ recentHistory = [], conversationSummary = {}, turn } = {}) {
  const normalizedTurn = normalizeTurn(turn);
  const history = (Array.isArray(recentHistory) ? recentHistory : []).map(normalizeTurn).filter(Boolean);
  if (normalizedTurn) history.push(normalizedTurn);
  history.sort((left, right) => left.timestampMs - right.timestampMs);
  const overflow = history.slice(0, Math.max(0, history.length - MAX_RECENT_TURNS));
  const recent = history.slice(-MAX_RECENT_TURNS);
  const olderTurns = [
    ...(Array.isArray(conversationSummary.olderTurns) ? conversationSummary.olderTurns : []),
    ...overflow.map((item) => ({ role: item.role, text: item.text.slice(0, MAX_SUMMARY_TEXT), timestampMs: item.timestampMs })),
  ].slice(-MAX_SUMMARY_TURNS);
  return {
    recentHistory: recent,
    conversationSummary: {
      olderTurns,
      currentMode: String(conversationSummary.currentMode || '').slice(0, 60),
      currentIntent: String(conversationSummary.currentIntent || '').slice(0, 60),
      selectedServiceId: String(conversationSummary.selectedServiceId || '').slice(0, 120),
      presentedServiceIds: (Array.isArray(conversationSummary.presentedServiceIds) ? conversationSummary.presentedServiceIds : []).slice(0, 20),
      activeServiceRequestId: String(conversationSummary.activeServiceRequestId || '').slice(0, 128),
      activeSupportTicketId: String(conversationSummary.activeSupportTicketId || '').slice(0, 128),
      summarizedAtMs: Date.now(),
    },
  };
}

module.exports = { MAX_RECENT_TURNS, MAX_SUMMARY_TURNS, appendBoundedConversationTurn, normalizeTurn };
