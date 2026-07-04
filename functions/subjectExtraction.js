const SUBJECT_ALIASES = [
  ['Maths Literacy', ['mathematical literacy', 'math literacy', 'math lit', 'maths literacy', 'maths lit']],
  ['Physical Sciences', ['physical sciences', 'physical science', 'physics', 'chemistry', 'phys sci']],
  ['Life Sciences', ['life sciences', 'life science', 'biology']],
  ['Agriculture', ['agricultural sciences', 'agricultural science', 'agriculture']],
  ['Business Studies', ['business studies', 'business study', 'business']],
  ['Mathematics', ['mathematics', 'maths', 'math', 'algebra', 'geometry']],
  ['English', ['english', 'english home language', 'english first additional language', 'eng']],
  ['Accounting', ['accounting']],
  ['Economics', ['economics']],
];

const SUBJECT_NAMES = SUBJECT_ALIASES.map(([subject]) => subject);
const GRADE_1_TO_12_SUBJECT_NAMES = [
  'Mathematics',
  'Maths Literacy',
  'Physical Sciences',
  'Business Studies',
  'Economics',
  'Accounting',
  'Life Sciences',
  'Agriculture',
  'English',
];
const DISALLOWED_POST_SCHOOL_SUBJECT_PATTERNS = [
  'financial accounting',
  'management accounting',
  'cost accounting',
  'accounting science',
  'business management',
  'marketing management',
  'public relations',
  'human resource management',
  'psychology',
  'sociology',
  'philosophy',
  'political science',
  'commercial law',
  'law',
  'auditing',
  'taxation',
  'investment management',
  'operations management',
];

function normalizeForMatch(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function stripSubjectQualifierSuffixes(value = '') {
  return String(value || '')
    .replace(/\b(first additional language|home language|additional language|second additional language|hl|fal)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(value = '') {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsAlias(text = '', alias = '') {
  const normalizedText = normalizeForMatch(text);
  const normalizedAlias = normalizeForMatch(alias);
  if (!normalizedText || !normalizedAlias) return false;
  const pattern = new RegExp(`(^|\\s)${escapeRegex(normalizedAlias)}(?=\\s|$)`, 'i');
  return pattern.test(normalizedText);
}

function normalizeSubjectName(value = '') {
  const normalized = normalizeForMatch(value);
  if (!normalized) return '';

  const match = SUBJECT_ALIASES.find(([, aliases]) => aliases.some((alias) => {
    const normalizedAlias = normalizeForMatch(alias);
    return normalized === normalizedAlias || containsAlias(normalized, normalizedAlias);
  }));

  if (match?.[0]) return match[0];

  const stripped = normalizeForMatch(stripSubjectQualifierSuffixes(value));
  if (!stripped) return '';

  const strippedMatch = SUBJECT_ALIASES.find(([, aliases]) => aliases.some((alias) => {
    const normalizedAlias = normalizeForMatch(alias);
    return stripped === normalizedAlias || containsAlias(stripped, normalizedAlias);
  }));

  return strippedMatch?.[0] || '';
}

function isAllowedGrade1To12Subject(value = '') {
  const rawNormalized = normalizeForMatch(value);
  if (!rawNormalized) return false;

  if (DISALLOWED_POST_SCHOOL_SUBJECT_PATTERNS.some((pattern) => rawNormalized.includes(normalizeForMatch(pattern)))) {
    return false;
  }

  const normalized = normalizeSubjectName(value) || rawNormalized;

  return GRADE_1_TO_12_SUBJECT_NAMES.some((subject) => {
    const allowed = normalizeSubjectName(subject) || normalizeForMatch(subject);
    return allowed && allowed.toLowerCase() === normalized.toLowerCase();
  });
}

function extractMarkNearSubject(line, subjectIndex) {
  const afterSubject = line.slice(subjectIndex);
  const markPatterns = [
    /\b(\d{1,3})(?:\s*\/\s*100|\s*%)\b/g,
    /\blevel\s*[1-7]\s*\/\s*(\d{1,3})\b/gi,
    /\b(?:mark|percentage|result|score)\s*[:=-]?\s*(\d{1,3})\b/gi,
  ];

  for (const pattern of markPatterns) {
    const matches = [...afterSubject.matchAll(pattern)];
    const valid = matches
      .map((match) => Number(match[1]))
      .find((mark) => Number.isFinite(mark) && mark >= 0 && mark <= 100);
    if (valid !== undefined) return valid;
  }

  const numericMatches = [...afterSubject.matchAll(/\b(\d{1,3})\b/g)]
    .map((match) => Number(match[1]))
    .filter((mark) => Number.isFinite(mark) && mark >= 0 && mark <= 100);

  if (numericMatches.length) {
    return numericMatches[numericMatches.length - 1];
  }

  return null;
}

function extractSubjectsAndMarks(text = '') {
  const normalizedText = String(text || '')
    .replace(/[|]/g, ' ')
    .replace(/[•·]/g, ' ')
    .replace(/\bO\b/g, '0');

  const rawLines = normalizedText
    .split(/\r?\n|;/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const lines = rawLines.flatMap((line) => line.split(/\s{2,}/).map((segment) => segment.trim()).filter(Boolean));
  const bySubject = new Map();

  lines.forEach((line, index) => {
    const lowerLine = line.toLowerCase();
    const nextLine = lines[index + 1] || '';

    SUBJECT_ALIASES.forEach(([subject, aliases]) => {
      const subjectIndex = aliases.reduce((best, alias) => {
        const pattern = new RegExp(`(^|\\b)${escapeRegex(alias.toLowerCase())}(?=\\b|$)`, 'i');
        const match = lowerLine.match(pattern);
        const index = match ? match.index : -1;
        if (index < 0) return best;
        return best < 0 ? index : Math.min(best, index);
      }, -1);

      if (subjectIndex < 0) return;
      let mark = extractMarkNearSubject(line, subjectIndex);
      if (mark === null && nextLine) {
        mark = extractMarkNearSubject(`${line} ${nextLine}`, subjectIndex);
      }
      if (mark === null) return;

      const existing = bySubject.get(subject);
      if (!existing || mark > existing.mark) {
        bySubject.set(subject, { subject, mark });
      }
    });
  });

  return [...bySubject.values()].sort((a, b) => a.subject.localeCompare(b.subject));
}

module.exports = {
  SUBJECT_NAMES,
  GRADE_1_TO_12_SUBJECT_NAMES,
  DISALLOWED_POST_SCHOOL_SUBJECT_PATTERNS,
  normalizeSubjectName,
  isAllowedGrade1To12Subject,
  extractSubjectsAndMarks,
};
