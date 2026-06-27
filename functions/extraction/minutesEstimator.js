function clampMinutes(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 10;
  return Math.min(90, Math.max(10, Math.round(numeric)));
}

function normalizeText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function estimateMinutesLocally({
  text = '',
  questionBlocks = [],
  marksCount = 0,
  tableCount = 0,
  figureCount = 0,
  formulaCount = 0,
} = {}) {
  const normalized = normalizeText(text);
  const words = normalized ? normalized.split(/\s+/).length : 0;
  const questionCount = Array.isArray(questionBlocks) ? questionBlocks.length : 0;
  const avgQuestionLength = questionCount
    ? Math.round((Array.isArray(questionBlocks)
      ? questionBlocks.reduce((sum, block) => sum + String(block?.text || '').length, 0)
      : 0) / Math.max(questionCount, 1))
    : 0;

  const score = 10
    + Math.round(words / 55)
    + (questionCount * 30)
    + (Number(marksCount || 0) * 0.35)
    + (Number(tableCount || 0) * 4)
    + (Number(figureCount || 0) * 3)
    + (Number(formulaCount || 0) * 2)
    + Math.round(avgQuestionLength / 220);

  const estimatedMinutes = clampMinutes(score);
  const confidenceScore = Math.max(0.35, Math.min(0.92, 0.45 + (questionCount * 0.05) + (words > 80 ? 0.12 : 0) + (tableCount ? 0.06 : 0)));
  const hasEnoughSignals = questionCount > 0 || words >= 25 || Number(marksCount || 0) > 0 || Number(tableCount || 0) > 0 || Number(figureCount || 0) > 0 || Number(formulaCount || 0) > 0;
  const needsGeminiFallback = !hasEnoughSignals || confidenceScore < 0.5;
  const fallbackReason = !hasEnoughSignals ? 'insufficient_local_signals' : (confidenceScore < 0.5 ? 'low_local_minutes_confidence' : 'none');

  return {
    estimatedMinutes,
    confidence: confidenceScore >= 0.75 ? 'high' : (confidenceScore >= 0.5 ? 'low' : 'unknown'),
    confidenceScore,
    needsGeminiFallback,
    fallbackReason,
    signalsUsed: {
      words,
      questionCount,
      marksCount: Number(marksCount || 0),
      tableCount: Number(tableCount || 0),
      figureCount: Number(figureCount || 0),
      formulaCount: Number(formulaCount || 0),
      avgQuestionLength,
    },
    method: 'local',
  };
}

module.exports = {
  estimateMinutesLocally,
  clampMinutes,
};
