const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizePaddleResult,
  normalizeGeminiFallbackResult,
  evaluateExtractionQuality,
} = require('./ocr/ocrNormalization');

test('normalizePaddleResult preserves image-ocr contract fields', () => {
  const payload = {
    success: true,
    extractedText: 'Question 1 Solve x',
    textLength: 18,
    pages: [{ pageNumber: 1, success: true }],
    extractedImages: [{ id: 'img1' }],
    confidence: 0.87,
  };

  const result = normalizePaddleResult(payload, { isPdfInput: false });

  assert.equal(typeof result.success, 'boolean');
  assert.equal(typeof result.extractedText, 'string');
  assert.equal(typeof result.textLength, 'number');
  assert.equal(typeof result.text, 'string');
  assert.equal(typeof result.extractionMethod, 'string');
  assert.equal(typeof result.provider, 'string');
  assert.equal(typeof result.fileType, 'string');
  assert.equal(typeof result.extractionQuality, 'string');
  assert.equal(typeof result.scannedPdfDetected, 'boolean');
  assert.equal(typeof result.ocrStatus, 'string');
  assert.ok(Array.isArray(result.pages));
  assert.ok(Array.isArray(result.extractedImages));
  assert.equal(typeof result.failedPageCount, 'number');
  assert.equal(typeof result.partialSuccess, 'boolean');
  assert.equal(typeof result.source, 'string');
});

test('evaluateExtractionQuality marks weak text as unusable', () => {
  const quality = evaluateExtractionQuality('x', 0.2);
  assert.equal(quality.isUsable, false);
  assert.equal(quality.extractionQuality, 'poor');
});

test('normalizeGeminiFallbackResult includes fallback provider and contract fields', () => {
  const result = normalizeGeminiFallbackResult({
    extractedText: 'Question 1 Calculate',
    pages: [{ pageNumber: 1, success: true }],
  }, { isPdfInput: true });

  assert.equal(result.provider, 'gemini-2.5-flash-fallback');
  assert.equal(result.fileType, 'pdf');
  assert.ok(Array.isArray(result.pages));
});
