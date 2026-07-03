export const SOUTH_AFRICAN_SUBJECTS = [
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
