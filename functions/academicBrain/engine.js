const { loadEnabledSubjectPacks } = require('./subjectPacks');
const { normalizeExtractedText } = require('./text');

const QUESTION_BOUNDARY = /(?:^|\n)\s*(SECTION\s+[A-Z]|Question\s*\d+|Q\s*\d+|\d+(?:\.\d+)*[.)]?|\([a-zA-Zivx]+\)|[a-zA-Zivx]+[.)])\s*/gim;
const ROMAN = /^(?=[ivxlcdm]+$)i|ii|iii|iv|v|vi|vii|viii|ix|x$/i;

function tokenize(text = '') {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function scoreSubjectPacks({ text = '', packs = [] } = {}) {
  const tokens = tokenize(text);
  const tokenSet = new Set(tokens);
  const scores = packs.map((pack) => {
    let score = 0;
    const matchedSignals = [];

    for (const alias of pack.aliases || []) {
      const n = String(alias || '').toLowerCase();
      if (n && text.toLowerCase().includes(n)) {
        score += 2;
        matchedSignals.push(`alias:${alias}`);
      }
    }

    for (const keyword of pack.keywords || []) {
      const n = String(keyword || '').toLowerCase();
      if (tokenSet.has(n) || text.toLowerCase().includes(n)) {
        score += 1;
        matchedSignals.push(`keyword:${keyword}`);
      }
    }

    for (const verb of pack.commandWords || []) {
      const n = String(verb || '').toLowerCase();
      if (tokenSet.has(n)) {
        score += 0.6;
        matchedSignals.push(`command:${verb}`);
      }
    }

    return {
      subjectId: pack.subjectId,
      displayName: pack.displayName,
      score,
      matchedSignals,
      pack,
    };
  }).sort((a, b) => b.score - a.score);

  return scores;
}

function detectTopics({ text = '', pack = null } = {}) {
  if (!pack) return [];
  const lc = text.toLowerCase();
  const topics = Object.entries(pack.topicKeywords || {}).map(([topicId, words]) => {
    const matchedKeywords = (words || []).filter((word) => lc.includes(String(word || '').toLowerCase()));
    const confidence = matchedKeywords.length / Math.max(1, (words || []).length);
    return {
      topicId,
      label: topicId.replace(/_/g, ' '),
      confidence: Number(confidence.toFixed(3)),
      matchedKeywords,
    };
  }).filter((entry) => entry.matchedKeywords.length > 0)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 6);

  return topics;
}

function isLikelyBoundary(line = '') {
  const trimmed = String(line || '').trim();
  if (!trimmed) return false;
  if (/^SECTION\s+[A-Z]/i.test(trimmed)) return true;
  if (/^(Question|Q)\s*\d+/i.test(trimmed)) return true;
  if (/^\d+(?:\.\d+)*[.)]?\s+/.test(trimmed)) return true;
  if (/^\([a-zA-Zivx]+\)\s+/.test(trimmed)) return true;
  if (/^[a-zA-Zivx]+[.)]\s+/.test(trimmed) && ROMAN.test(trimmed.split(/[.)]/)[0])) return true;
  if (/\[\d+\]|\(\d+\s*marks?\)|\d+\s*marks?/i.test(trimmed)) return true;
  return false;
}

function isLikelyInstructionOnly(line = '') {
  return /^(instructions?|read the passage|use the table|answer all|section\s+[a-z])/i.test(String(line || '').trim());
}

function segmentQuestions({ text = '', ocrBlocks = [] } = {}) {
  const normalized = normalizeExtractedText(text);
  const lines = normalized.split('\n').map((line) => line.trim());
  const questions = [];
  const warnings = [];
  let current = null;

  const pushCurrent = () => {
    if (!current) return;
    const questionText = normalizeExtractedText(current.lines.join('\n'));
    if (!questionText) return;
    questions.push({
      id: `q_${String(questions.length + 1).padStart(3, '0')}`,
      number: current.number || null,
      text: questionText,
      type: current.type,
      marks: current.marks,
      confidence: Number(current.confidence.toFixed(3)),
      source: { page: current.page || null, blockIndex: current.blockIndex || null },
      children: [],
    });
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;

    const boundary = isLikelyBoundary(line);
    const isInstruction = isLikelyInstructionOnly(line);
    const marksMatch = line.match(/(?:\[|\()(\d{1,3})(?:\]|\)\s*marks?)/i) || line.match(/(\d{1,3})\s*marks?/i);

    if (boundary) {
      pushCurrent();
      const numMatch = line.match(/(?:question\s*|q\s*)?(\d+(?:\.\d+)*)/i) || line.match(/^\(([a-zA-Zivx]+)\)/i) || line.match(/^([a-zA-Zivx]+)[.)]/i);
      current = {
        number: numMatch ? numMatch[1] : null,
        type: isInstruction ? 'instruction' : 'question',
        marks: marksMatch ? Number(marksMatch[1]) : null,
        confidence: 0.72,
        lines: [line],
      };
    } else if (current) {
      current.lines.push(line);
      current.confidence = Math.min(0.92, current.confidence + 0.01);
    } else {
      current = {
        number: null,
        type: 'unstructured_block',
        marks: marksMatch ? Number(marksMatch[1]) : null,
        confidence: 0.35,
        lines: [line],
      };
    }
  }

  pushCurrent();

  const questionOnly = questions.filter((q) => q.type === 'question');
  if (!questionOnly.length && normalized) {
    warnings.push('No explicit question boundaries found; returned unstructured block.');
    questionOnly.push({
      id: 'q_001',
      number: null,
      text: normalized,
      type: 'unstructured_block',
      marks: null,
      confidence: 0.2,
      source: { page: null, blockIndex: null },
      children: [],
    });
  }

  if (ocrBlocks.length && questionOnly.length) {
    questionOnly[0].source.blockIndex = 0;
  }

  return { questions: questionOnly, warnings };
}

function estimateMinutes({ text = '', questions = [], pack = null } = {}) {
  const rules = pack?.estimatedMinuteRules || {
    baseMinutes: 15,
    perQuestionMinutes: 10,
    perSubQuestionMinutes: 2,
    readingPassageBonus: 8,
    maxMinutes: 90,
    minMinutes: 10,
  };

  const questionCount = questions.filter((q) => q.type === 'question').length;
  const subQuestionCount = questions.filter((q) => q.number && String(q.number).includes('.')).length;
  const hasPassage = /passage|read the text|comprehension/i.test(text);

  let minutes = rules.baseMinutes
    + (questionCount * rules.perQuestionMinutes)
    + (subQuestionCount * rules.perSubQuestionMinutes)
    + (hasPassage ? rules.readingPassageBonus : 0);

  minutes = Math.max(rules.minMinutes, Math.min(rules.maxMinutes, Math.round(minutes)));
  return minutes;
}

function validateAcademicBrainOutput(output = {}) {
  const warnings = Array.isArray(output.warnings) ? [...output.warnings] : [];
  if (!output.subject || !output.subject.subjectId) warnings.push('Subject detection confidence is low.');
  if (!Array.isArray(output.questions)) warnings.push('Questions list missing.');
  const needsReview = Boolean(output.needsReview || warnings.length > 0 || (output.subject?.confidence || 0) < 0.45);
  return {
    ...output,
    warnings,
    needsReview,
  };
}

function runAcademicBrainMini({ extractedText = '', ocrBlocks = [], country = 'ZA', grade = '' } = {}) {
  const text = normalizeExtractedText(extractedText);
  const packs = loadEnabledSubjectPacks().filter((pack) => (pack.countriesSupported || []).includes(country));
  const scored = scoreSubjectPacks({ text, packs });
  const top = scored[0] || null;
  const runnerUp = scored[1] || null;
  const subjectConfidence = top ? Number((top.score / Math.max(1, top.score + (runnerUp?.score || 0))).toFixed(3)) : 0;
  const selectedPack = top?.pack || null;
  const topics = detectTopics({ text, pack: selectedPack });
  const segmented = segmentQuestions({ text, ocrBlocks });
  const estimatedMinutes = estimateMinutes({ text, questions: segmented.questions, pack: selectedPack });

  const output = {
    subject: {
      subjectId: top?.subjectId || '',
      displayName: top?.displayName || '',
      confidence: subjectConfidence,
      matchedSignals: top?.matchedSignals || [],
    },
    topics,
    estimatedMinutes,
    questions: segmented.questions,
    warnings: [
      ...segmented.warnings,
      ...(subjectConfidence < 0.45 ? ['Low confidence subject prediction.'] : []),
    ],
    needsReview: subjectConfidence < 0.45 || segmented.questions.some((q) => q.type === 'unstructured_block'),
    engine: {
      name: 'academic-brain',
      version: '1.0.0',
      subjectPackVersions: packs.map((pack) => ({ subjectId: pack.subjectId, version: pack.version })),
      grade: String(grade || ''),
    },
  };

  return validateAcademicBrainOutput(output);
}

module.exports = {
  loadEnabledSubjectPacks,
  scoreSubjectPacks,
  detectTopics,
  estimateMinutes,
  segmentQuestions,
  validateAcademicBrainOutput,
  runAcademicBrainMini,
};
