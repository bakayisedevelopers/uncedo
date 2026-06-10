const test = require('node:test');
const assert = require('node:assert/strict');
const fixtures = require('../__fixtures__/cases.json');
const { runAcademicBrainMini, segmentQuestions } = require('../engine');
const { normalizeExtractedText, detectScannedPage } = require('../text');

test('normalizeExtractedText cleans OCR noise', () => {
  const text = normalizeExtractedText('Quesfion 1  \r\n  Solve  x  -\\n y');
  assert.equal(typeof text, 'string');
  assert.ok(text.includes('Solve'));
});

test('detectScannedPage flags poor native text', () => {
  const result = detectScannedPage({ nativeText: 'x x', nativeTextConfidence: 0.1, ocrText: 'This has many readable words and context now' });
  assert.equal(result.scanned, true);
});

test('segmentQuestions handles mixed numbering styles', () => {
  const segmented = segmentQuestions({ text: 'SECTION A\nQuestion 1 Solve x\n1.1 Expand\na) Explain\n(i) reason' });
  assert.ok(segmented.questions.length >= 3);
});

for (const entry of fixtures) {
  test(`Academic Brain fixture: ${entry.name}`, () => {
    const output = runAcademicBrainMini({ extractedText: entry.text, country: 'ZA' });
    assert.ok(output.engine.name === 'academic-brain');
    assert.ok(Array.isArray(output.questions));
    if (entry.expectSubject) {
      assert.equal(output.subject.subjectId, entry.expectSubject);
    }
    if (entry.expectNeedsReview) {
      assert.equal(output.needsReview, true);
    }
  });
}
