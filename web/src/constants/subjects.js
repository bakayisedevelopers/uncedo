export const ALLOWED_SUBJECTS = [
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

export const FALLBACK_SUBJECTS = ALLOWED_SUBJECTS;
export const SOUTH_AFRICAN_SUBJECTS = ALLOWED_SUBJECTS;

export const SUPPORTED_TUTOR_SUBJECTS = ALLOWED_SUBJECTS;

export const SUBJECT_OPTIONS = FALLBACK_SUBJECTS.map((subject) => ({
  value: subject,
  label: subject,
}));

export const DEFAULT_SUBJECTS = FALLBACK_SUBJECTS;

export function toSubjectOptions(subjectNames = FALLBACK_SUBJECTS) {
  return normalizeSubjectList(subjectNames).map((subject) => ({
    value: subject,
    label: subject,
  }));
}

export function normalizeSubjectList(values = []) {
  const seen = new Set();
  return values
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
