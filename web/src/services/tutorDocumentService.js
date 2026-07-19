import { getFirebaseClients } from '../firebase/config';
import { appendUserAiLog } from './aiLogService';
import { normalizeSubjectList, SUPPORTED_TUTOR_SUBJECTS } from '../constants/subjects';

const DOCUMENT_STATUSES = new Set(['UPLOADED', 'PROCESSING', 'VERIFIED', 'FAILED']);
const ALLOWED_TUTOR_SUBJECTS = new Set(SUPPORTED_TUTOR_SUBJECTS.map((subject) => String(subject).trim().toLowerCase()));
const TUTOR_SUBJECT_ALIASES = new Map([
  ['mathematics', 'Mathematics'],
  ['maths', 'Mathematics'],
  ['math', 'Mathematics'],
  ['maths literacy', 'Maths Literacy'],
  ['maths lit', 'Maths Literacy'],
  ['math literacy', 'Maths Literacy'],
  ['math lit', 'Maths Literacy'],
  ['mathematical literacy', 'Maths Literacy'],
  ['physical sciences', 'Physical Sciences'],
  ['physical science', 'Physical Sciences'],
  ['physics', 'Physical Sciences'],
  ['chemistry', 'Physical Sciences'],
  ['business studies', 'Business Studies'],
  ['economics', 'Economics'],
  ['accounting', 'Accounting'],
  ['life sciences', 'Life Sciences'],
  ['life science', 'Life Sciences'],
  ['biology', 'Life Sciences'],
  ['agriculture', 'Agriculture'],
  ['agricultural sciences', 'Agriculture'],
  ['agricultural science', 'Agriculture'],
  ['english', 'English'],
  ['english home language', 'English'],
  ['english first additional language', 'English'],
]);

function normalizeTutorSubject(value = '') {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return TUTOR_SUBJECT_ALIASES.get(normalized) || String(value || '').trim();
}

function sanitizeFileName(fileName = 'document') {
  return String(fileName || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function uploadTutorDocument({ uid, file }) {
  if (!uid) throw new Error('Missing tutor id.');
  if (!file) throw new Error('No document selected.');

  appendUserAiLog(uid, {
    source: 'tutor_results_extraction',
    step: 'upload_started',
    status: 'info',
    message: 'Tutor results upload started.',
    details: {
      fileName: file.name,
      fileType: file.type || '',
      fileSize: Number(file.size || 0),
    },
  }).catch(() => null);

  const clients = await getFirebaseClients();
  if (!clients?.storage || !clients?.db) {
    return null;
  }

  const { db, storage, firestoreModule, storageModule } = clients;
  const { collection, doc, serverTimestamp, setDoc } = firestoreModule;
  const docRef = doc(collection(db, 'tutorDocuments'));
  const safeName = sanitizeFileName(file.name);
  const filePath = `tutorDocuments/${uid}/${docRef.id}/${safeName}`;
  const fileRef = storageModule.ref(storage, filePath);

  await storageModule.uploadBytes(fileRef, file, {
    contentType: file.type || 'application/octet-stream',
    cacheControl: 'private,max-age=3600',
  });

  const fileUrl = await storageModule.getDownloadURL(fileRef);
  const record = {
    id: docRef.id,
    uid,
    fileName: file.name,
    fileUrl,
    filePath,
    contentType: file.type || 'application/octet-stream',
    status: 'UPLOADED',
    extractedText: '',
    extractedSubjects: [],
    qualifiedSubjects: [],
    error: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(docRef, record);
  appendUserAiLog(uid, {
    source: 'tutor_results_extraction',
    step: 'upload_record_created',
    status: 'info',
    message: 'Tutor results upload record created.',
    details: {
      docId: docRef.id,
      fileName: file.name,
      filePath,
      fileType: file.type || '',
      fileSize: Number(file.size || 0),
    },
  }).catch(() => null);
  return { ...record, createdAt: Date.now(), updatedAt: Date.now() };
}

export function subscribeToTutorDocuments(uid, callback) {
  let unsubscribe = null;

  getFirebaseClients().then((clients) => {
    if (!uid || !clients) {
      callback([]);
      return;
    }

    const { db, firestoreModule } = clients;
    const { collection, onSnapshot, query, where } = firestoreModule;
    const documentsQuery = query(
      collection(db, 'tutorDocuments'),
      where('uid', '==', uid),
    );

    unsubscribe = onSnapshot(
      documentsQuery,
      (snapshot) => callback(snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => {
          const aTime = typeof a.createdAt?.toMillis === 'function' ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
          const bTime = typeof b.createdAt?.toMillis === 'function' ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
          return bTime - aTime;
        })),
      () => callback([]),
    );
  });

  return () => unsubscribe?.();
}

export async function updateTutorActiveSubjects(uid, activeSubjects, qualifiedSubjects = []) {
  if (!uid) throw new Error('Missing tutor id.');

  const allowedSubjects = new Set(
    (qualifiedSubjects || [])
      .map((item) => item?.subject || item)
      .filter(Boolean),
  );
  const safeSubjects = normalizeSubjectList(activeSubjects).filter((subject) => allowedSubjects.has(subject));

  const clients = await getFirebaseClients();
  if (!clients) {
    return { activeSubjects: safeSubjects, subjects: safeSubjects };
  }

  const { db, firestoreModule } = clients;
  const { doc, serverTimestamp, updateDoc } = firestoreModule;
  await updateDoc(doc(db, 'users', uid), {
    activeSubjects: safeSubjects,
    subjects: safeSubjects,
    updatedAt: serverTimestamp(),
  });

  return { activeSubjects: safeSubjects, subjects: safeSubjects };
}

function sanitizeQualifiedSubjects(values = []) {
  const bySubject = new Map();
  (values || []).forEach((item) => {
    const subject = normalizeTutorSubject(String(item?.subject || item || '').trim());
    const subjectKey = subject.toLowerCase();
    const numericMark = Number(item?.mark);
    if (!subject) return;
    if (!ALLOWED_TUTOR_SUBJECTS.has(subjectKey)) return;
    if (!Number.isFinite(numericMark)) return;
    const mark = Math.max(0, Math.min(100, Math.round(numericMark)));
    if (mark < 60) return;
    const existing = bySubject.get(subject);
    if (!existing || mark > Number(existing.mark || 0)) {
      bySubject.set(subject, { subject, mark });
    }
  });
  return [...bySubject.values()];
}

export async function updateTutorQualifiedSubjectsAndActiveSubjects(uid, qualifiedSubjects = [], activeSubjects = []) {
  if (!uid) throw new Error('Missing tutor id.');

  const safeQualified = sanitizeQualifiedSubjects(qualifiedSubjects);
  const allowedSubjects = new Set(safeQualified.map((item) => item.subject));
  const safeActive = normalizeSubjectList(activeSubjects).filter((subject) => allowedSubjects.has(subject));

  const clients = await getFirebaseClients();
  if (!clients) {
    return {
      qualifiedSubjects: safeQualified,
      activeSubjects: safeActive,
      subjects: safeActive,
    };
  }

  const { db, firestoreModule } = clients;
  const { doc, serverTimestamp, updateDoc } = firestoreModule;
  await updateDoc(doc(db, 'users', uid), {
    qualifiedSubjects: safeQualified,
    activeSubjects: safeActive,
    subjects: safeActive,
    updatedAt: serverTimestamp(),
  });

  return {
    qualifiedSubjects: safeQualified,
    activeSubjects: safeActive,
    subjects: safeActive,
  };
}

export function normalizeDocumentStatus(status) {
  const normalized = String(status || '').toUpperCase();
  return DOCUMENT_STATUSES.has(normalized) ? normalized : 'UPLOADED';
}

export async function retryTutorDocument(documentId) {
  if (!documentId) throw new Error('Missing document id.');

  const clients = await getFirebaseClients();
  if (!clients) {
    return { id: documentId, status: 'UPLOADED' };
  }

  const { db, firestoreModule } = clients;
  const { doc, serverTimestamp, updateDoc } = firestoreModule;

  await updateDoc(doc(db, 'tutorDocuments', documentId), {
    status: 'UPLOADED',
    error: null,
    updatedAt: serverTimestamp(),
  });

  return { id: documentId, status: 'UPLOADED' };
}

export async function deleteTutorDocument(documentRecord) {
  const documentId = documentRecord?.id;
  if (!documentId) throw new Error('Missing document id.');

  const clients = await getFirebaseClients();
  if (!clients) {
    return { id: documentId, deleted: true };
  }

  const { db, storage, firestoreModule, storageModule } = clients;
  const { deleteDoc, doc } = firestoreModule;

  if (documentRecord.filePath && storage && storageModule?.deleteObject) {
    try {
      await storageModule.deleteObject(storageModule.ref(storage, documentRecord.filePath));
    } catch (error) {
      if (error?.code !== 'storage/object-not-found') {
        throw error;
      }
    }
  }

  await deleteDoc(doc(db, 'tutorDocuments', documentId));
  return { id: documentId, deleted: true };
}
