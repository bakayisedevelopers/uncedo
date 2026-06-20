const test = require('node:test');
const assert = require('node:assert/strict');

const { classifySubjectLocally } = require('./extraction/localSubjectClassifier');
const { detectTopicsLocally } = require('./extraction/localTopicClassifier');
const { estimateMinutesLocally } = require('./extraction/minutesEstimator');

test('local subject classifier detects maths', () => {
  const result = classifySubjectLocally({
    text: 'Solve this algebra equation and factorise the quadratic expression.',
    supportedSubjects: [{ value: 'Mathematics', label: 'Mathematics' }],
  });
  assert.equal(result.subject, 'Mathematics');
  assert.ok(['high', 'low', 'unknown'].includes(result.subjectConfidence));
  assert.equal(result.method, 'local');
});

test('local topic detector returns topics for maths', () => {
  const result = detectTopicsLocally({
    text: 'Use sine and cosine to solve the trig problem.',
    subject: 'Mathematics',
  });
  assert.ok(Array.isArray(result.topics));
  assert.equal(result.method, 'local');
});

test('minutes estimator clamps range and returns signals', () => {
  const result = estimateMinutesLocally({
    text: 'Question one and two. Explain with full working and show all formulas.',
    questionBlocks: [{ text: 'Q1' }, { text: 'Q2' }],
    marksCount: 4,
    tableCount: 1,
    figureCount: 1,
    formulaCount: 2,
  });

  assert.ok(result.estimatedMinutes >= 10 && result.estimatedMinutes <= 90);
  assert.equal(result.method, 'local');
  assert.equal(typeof result.signalsUsed.words, 'number');
});
