const { extractDocumentText } = require('./extraction');
const { detectScannedPage, normalizeExtractedText } = require('./text');
const {
  runAcademicBrainMini,
  loadEnabledSubjectPacks,
  scoreSubjectPacks,
  detectTopics,
  estimateMinutes,
  segmentQuestions,
  validateAcademicBrainOutput,
} = require('./engine');
const { saveAcademicBrainFeedback } = require('./feedback');

module.exports = {
  extractDocumentText,
  detectScannedPage,
  normalizeExtractedText,
  runAcademicBrainMini,
  loadEnabledSubjectPacks,
  scoreSubjectPacks,
  detectTopics,
  estimateMinutes,
  segmentQuestions,
  validateAcademicBrainOutput,
  saveAcademicBrainFeedback,
};
