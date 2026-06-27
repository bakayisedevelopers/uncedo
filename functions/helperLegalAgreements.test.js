const test = require('node:test');
const assert = require('node:assert/strict');

const {
  LEGAL_ENTITY_NAME,
  HELPER_AGREEMENT_DEFAULT_VERSION,
  buildHelperAgreementMarkdown,
  computeContentHash,
  makeHelperVersionDocId,
  isHelperAgreementCurrent,
} = require('./helperLegalAgreements');

test('helper agreement template includes legal entity wording and core acceptance section', () => {
  const markdown = buildHelperAgreementMarkdown();
  assert.ok(markdown.includes(LEGAL_ENTITY_NAME));
  assert.ok(markdown.includes('Independent contractor status'));
  assert.ok(markdown.includes('Availability, routing, and live updates'));
  assert.ok(markdown.includes('Acceptance records capture the helper identity'));
});

test('helper agreement version ids are deterministic', () => {
  assert.equal(makeHelperVersionDocId(HELPER_AGREEMENT_DEFAULT_VERSION), 'helper_agreement_1.0.1');
  assert.equal(makeHelperVersionDocId('1.0.1'), 'helper_agreement_1.0.1');
});

test('helper agreement content hash changes with content', () => {
  const first = computeContentHash('hello world');
  const second = computeContentHash('hello world!');
  assert.notEqual(first, second);
});

test('helper agreement current check requires the latest accepted version', () => {
  assert.equal(isHelperAgreementCurrent({
    agreement: {
      requiredVersion: '1.0.2',
      acceptedVersion: '1.0.2',
      currentVersionAccepted: true,
    },
  }), true);

  assert.equal(isHelperAgreementCurrent({
    agreement: {
      requiredVersion: '1.0.2',
      acceptedVersion: '1.0.1',
      currentVersionAccepted: false,
    },
  }), false);
});
