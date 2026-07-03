const test = require('node:test');
const assert = require('node:assert/strict');
const { extractSubjectsAndMarks, normalizeSubjectName, isAllowedGrade1To12Subject } = require('./subjectExtraction');

test('normalizes common South African subject aliases', () => {
  assert.equal(normalizeSubjectName('Maths'), 'Mathematics');
  assert.equal(normalizeSubjectName('Physical Science'), 'Physical Sciences');
  assert.equal(normalizeSubjectName('Math Lit'), 'Maths Literacy');
  assert.equal(normalizeSubjectName('English FAL'), 'English');
  assert.equal(normalizeSubjectName('Agricultural Sciences'), 'Agriculture');
});

test('allows only grade 1 to 12 school subjects', () => {
  assert.equal(isAllowedGrade1To12Subject('Maths'), true);
  assert.equal(isAllowedGrade1To12Subject('English FAL'), true);
  assert.equal(isAllowedGrade1To12Subject('Agriculture'), true);
  assert.equal(isAllowedGrade1To12Subject('unsupported_subject_x'), false);
  assert.equal(isAllowedGrade1To12Subject('random_topic_y'), false);
});

test('extracts subjects and percentage marks from result text', () => {
  const result = extractSubjectsAndMarks(`
    Maths 78%
    Physical Sciences: 65
    English Home Language Level 5 / 70
    Business Studies 42
    Accounting 101
  `);

  assert.deepEqual(result, [
    { subject: 'Business Studies', mark: 42 },
    { subject: 'English', mark: 70 },
    { subject: 'Mathematics', mark: 78 },
    { subject: 'Physical Sciences', mark: 65 },
  ]);
});

test('maps common subject variations into normalized tutor subjects', () => {
  const result = extractSubjectsAndMarks(`
    Physics 74%
    Chemistry 69%
    Economics 81%
    English 66%
  `);

  assert.deepEqual(result, [
    { subject: 'Economics', mark: 81 },
    { subject: 'English', mark: 66 },
    { subject: 'Physical Sciences', mark: 74 },
  ]);
});

test('prefers the trailing tabular mark for subject rows', () => {
  const result = extractSubjectsAndMarks(`
    Maths 123456 7 78
    English Home Language 99887 5 70
    Life Sciences
    64
  `);

  assert.deepEqual(result, [
    { subject: 'English', mark: 70 },
    { subject: 'Life Sciences', mark: 64 },
    { subject: 'Mathematics', mark: 78 },
  ]);
});
