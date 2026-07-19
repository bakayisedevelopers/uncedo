const admin = require('firebase-admin');

async function saveAcademicBrainFeedback(db, payload = {}) {
  if (!db) return { saved: false, reason: 'missing_db' };

  const doc = {
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    userId: payload.userId || '',
    role: payload.role || '',
    country: payload.country || '',
    grade: payload.grade || '',
    selectedSubjectId: payload.selectedSubjectId || '',
    originalOcrText: payload.originalOcrText || '',
    originalOcrBlocks: Array.isArray(payload.originalOcrBlocks) ? payload.originalOcrBlocks : [],
    predictedOutput: payload.predictedOutput || null,
    correctedOutput: payload.correctedOutput || null,
    correctionType: payload.correctionType || '',
    engineVersion: payload.engineVersion || '1.0.0',
    subjectPackVersions: Array.isArray(payload.subjectPackVersions) ? payload.subjectPackVersions : [],
    uploadId: payload.uploadId || '',
    sessionId: payload.sessionId || '',
  };

  const ref = await db.collection('academicBrainFeedback').add(doc);
  return { saved: true, id: ref.id };
}

module.exports = { saveAcademicBrainFeedback };
