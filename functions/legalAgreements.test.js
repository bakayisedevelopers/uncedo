const test = require('node:test');
const assert = require('node:assert/strict');

const {
  LEGAL_ENTITY_NAME,
  TUTOR_AGREEMENT_DEFAULT_VERSION,
  buildTutorAgreementMarkdown,
  computeContentHash,
  makeVersionDocId,
} = require('./legalAgreements');

test('tutor agreement template includes legal entity wording and starter sections', () => {
  const markdown = buildTutorAgreementMarkdown();
  assert.ok(markdown.includes(LEGAL_ENTITY_NAME));
  assert.ok(markdown.includes('Independent contractor status'));
  assert.ok(markdown.includes('Student safety and minors'));
  assert.ok(markdown.includes('Acceptance records capture the date, time, version'));
});

test('tutor agreement version ids are deterministic', () => {
  assert.equal(makeVersionDocId(TUTOR_AGREEMENT_DEFAULT_VERSION), 'tutor_agreement_1.0.1');
  assert.equal(makeVersionDocId('1.0.1'), 'tutor_agreement_1.0.1');
});

test('tutor agreement content hash changes with content', () => {
  const first = computeContentHash('hello world');
  const second = computeContentHash('hello world!');
  assert.notEqual(first, second);
});
