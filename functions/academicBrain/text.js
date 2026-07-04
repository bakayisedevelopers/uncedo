const OCR_CORRECTION_DICTIONARY = {
  'rn': 'm',
  '0f': 'of',
  'l0': '10',
  'l1': '11',
  'quesfion': 'question',
  'sectlon': 'section',
};

function normalizeExtractedText(rawText = '') {
  const base = String(rawText || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');

  const corrected = base
    .split(/\b/)
    .map((token) => {
      const key = token.toLowerCase();
      return OCR_CORRECTION_DICTIONARY[key] || token;
    })
    .join('');

  const mergedLines = corrected
    .replace(/(\w)-\n(\w)/g, '$1$2')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  const deduped = mergedLines
    .split('\n')
    .map((line) => line.trim())
    .filter((line, index, arr) => line || (index > 0 && arr[index - 1]))
    .filter((line, index, arr) => !(line && index > 0 && line === arr[index - 1]))
    .join('\n')
    .trim();

  return deduped;
}

function detectScannedPage({ nativeText = '', nativeTextConfidence = 0, ocrText = '' } = {}) {
  const cleanedNative = normalizeExtractedText(nativeText);
  const cleanedOcr = normalizeExtractedText(ocrText);
  const nativeWords = cleanedNative ? cleanedNative.split(/\s+/).length : 0;
  const ocrWords = cleanedOcr ? cleanedOcr.split(/\s+/).length : 0;
  const garbageChars = (cleanedNative.match(/[^\w\s.,;:!?()\[\]{}'"\-/%]/g) || []).length;
  const garbageRatio = cleanedNative.length ? garbageChars / cleanedNative.length : 1;

  const poorNative = !cleanedNative || nativeWords < 6 || garbageRatio > 0.35 || Number(nativeTextConfidence || 0) < 0.35;
  const ocrMuchBetter = ocrWords > nativeWords * 1.6 && ocrWords >= 10;

  return {
    scanned: poorNative || ocrMuchBetter,
    reason: poorNative ? 'poor_native_text' : (ocrMuchBetter ? 'ocr_better_than_native' : 'native_text_usable'),
    nativeWords,
    ocrWords,
    garbageRatio,
  };
}

module.exports = {
  normalizeExtractedText,
  detectScannedPage,
};
