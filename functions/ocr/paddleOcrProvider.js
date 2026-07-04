function getTimeoutMs(value, fallback) {
  const numeric = Number(value || fallback);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.min(120000, Math.max(3000, Math.round(numeric)));
}

async function callPaddleOcrService() {
  throw new Error('PaddleOCR is deprecated in this MVP branch.');
}

async function geminiOcrFallback() {
  throw new Error('Gemini OCR fallback is deprecated in this MVP branch.');
}

module.exports = {
  callPaddleOcrService,
  geminiOcrFallback,
  getTimeoutMs,
};
