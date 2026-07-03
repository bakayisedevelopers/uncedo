const { spawnSync } = require('child_process');
const path = require('path');

function normalizeText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function toConfidence(score) {
  if (score >= 0.75) return 'high';
  if (score >= 0.5) return 'low';
  return 'unknown';
}

function classifyWithLocalMl({
  text = '',
  supportedSubjects = [],
  questionBlocks = [],
  marksCount = 0,
  tableCount = 0,
  figureCount = 0,
  formulaCount = 0,
} = {}) {
  const inputText = normalizeText(text);
  if (!inputText) {
    return {
      available: false,
      error: 'empty_input',
    };
  }

  const scriptPath = path.join(__dirname, '..', 'ml', 'local_classifier.py');
  const modelPath = path.join(__dirname, '..', 'ml', 'local_model.json');
  const inputPayload = {
    text: inputText.slice(0, 8000),
    supportedSubjects: (Array.isArray(supportedSubjects) ? supportedSubjects : []).map((entry) => ({
      value: String(entry?.value || entry || '').trim(),
      label: String(entry?.label || '').trim(),
    })),
    features: {
      questionCount: Array.isArray(questionBlocks) ? questionBlocks.length : 0,
      marksCount: Number(marksCount || 0),
      tableCount: Number(tableCount || 0),
      figureCount: Number(figureCount || 0),
      formulaCount: Number(formulaCount || 0),
    },
  };
  const supportedSubjectSet = new Set(
    (Array.isArray(supportedSubjects) ? supportedSubjects : [])
      .map((entry) => String(entry?.value || entry || '').trim())
      .filter(Boolean),
  );

  try {
    const execution = spawnSync('python3', [scriptPath, 'predict', '--model', modelPath], {
      input: JSON.stringify(inputPayload),
      encoding: 'utf8',
      timeout: 2500,
    });
    if (execution.error) throw execution.error;
    if (execution.status !== 0) {
      throw new Error((execution.stderr || execution.stdout || 'python_predict_failed').trim());
    }
    const parsed = JSON.parse(String(execution.stdout || '{}'));
    const subjectScore = Number(parsed?.subjectScore || 0);
    const topicScore = Number(parsed?.topicScore || 0);
    const minutesScore = Number(parsed?.minutesScore || 0);

    const subject = normalizeText(parsed?.subject || '');
    const topic = normalizeText(parsed?.topic || '');
    const estimatedMinutes = Number(parsed?.estimatedMinutes || 0);

    const subjectSupported = !supportedSubjectSet.size || supportedSubjectSet.has(subject);
    const subjectStrong = subjectScore >= 0.78;
    const topicStrong = topicScore >= 0.62;
    const minutesStrong = minutesScore >= 0.6;

    return {
      available: true,
      subject,
      topic,
      topics: topic ? [topic] : [],
      estimatedMinutes: Number.isFinite(estimatedMinutes) ? estimatedMinutes : 0,
      subjectConfidence: toConfidence(subjectScore),
      topicConfidence: toConfidence(topicScore),
      minutesConfidence: toConfidence(minutesScore),
      confidenceScore: Math.max(0, Math.min(1, (subjectScore + topicScore + minutesScore) / 3)),
      method: 'local_ml_python',
      debug: parsed?.debug || {},
      needsJsFallback: !subject || !subjectSupported || !subjectStrong || !topicStrong || !minutesStrong,
      reason: !subject
        ? 'no_ml_subject'
        : (!subjectSupported
          ? 'unsupported_ml_subject'
          : (!subjectStrong
            ? 'low_ml_subject_confidence'
            : (!topicStrong
              ? 'low_ml_topic_confidence'
              : (!minutesStrong ? 'low_ml_minutes_confidence' : 'ok')))),
    };
  } catch (error) {
    return {
      available: false,
      error: error?.message || 'python_predict_unavailable',
      method: 'local_ml_python',
    };
  }
}

module.exports = {
  classifyWithLocalMl,
};
