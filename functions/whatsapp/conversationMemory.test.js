'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_RECENT_TURNS, appendBoundedConversationTurn } = require('./conversationMemory');

test('conversation memory retains bounded recent turns and a compact untrusted older-turn summary', () => {
  const initial = Array.from({ length: 25 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', text: `turn ${index}`, timestampMs: index + 1 }));
  const result = appendBoundedConversationTurn({ recentHistory: initial, conversationSummary: {}, turn: { role: 'user', text: 'latest', timestampMs: 26 } });
  assert.equal(result.recentHistory.length, MAX_RECENT_TURNS);
  assert.equal(result.recentHistory.at(-1).text, 'latest');
  assert.ok(result.conversationSummary.olderTurns.length <= 6);
  assert.equal(result.conversationSummary.olderTurns.at(-1).text, 'turn 5');
});

test('conversation memory excludes empty turns and bounds potentially hostile content', () => {
  const result = appendBoundedConversationTurn({ turn: { role: 'system', text: `${'x'.repeat(3000)}\u0000`, timestampMs: 1 } });
  assert.equal(result.recentHistory.length, 1);
  assert.equal(result.recentHistory[0].role, 'user');
  assert.equal(result.recentHistory[0].text.length, 900);
});

test('messages with the same Meta second sort by webhook receipt order, not Firestore write time', () => {
  const result = appendBoundedConversationTurn({
    recentHistory: [{ role: 'user', text: 'second received', timestampMs: 1000, receivedAtMs: 200, eventId: 'event-b' }],
    conversationSummary: {},
    turn: { role: 'user', text: 'first received', timestampMs: 1000, receivedAtMs: 100, eventId: 'event-a' },
  });
  assert.deepEqual(result.recentHistory.map(({ text }) => text), ['first received', 'second received']);
});
