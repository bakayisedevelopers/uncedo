'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPublicTutorSummary } = require('./publicProfileSummary');

test('tutor summary exposes only bounded public fields', () => {
  const summary = buildPublicTutorSummary({
    fullName: 'Tutor One',
    profilePhoto: 'https://example.com/tutor.jpg',
    tutorProfile: { overallRating: 4.6 },
    email: 'private@example.com',
    payout: { accountNumber: 'secret' },
  });
  assert.deepEqual(summary, { name: 'Tutor One', profilePhoto: 'https://example.com/tutor.jpg', rating: 4.6 });
  assert.equal(Object.hasOwn(summary, 'email'), false);
});

test('tutor summary rejects unsafe image URLs and invalid ratings', () => {
  assert.deepEqual(buildPublicTutorSummary({ fullName: 'Tutor', profilePhoto: 'javascript:alert(1)', tutorProfile: { overallRating: 25 } }, 'Fallback'), {
    name: 'Tutor', profilePhoto: '', rating: 0,
  });
});

test('tutor summary uses a safe fallback and bounds user-controlled text', () => {
  assert.deepEqual(buildPublicTutorSummary({ fullName: `${'A'.repeat(140)}\nUnsafe` }, 'Fallback'), {
    name: 'A'.repeat(120), profilePhoto: '', rating: 0,
  });
});
