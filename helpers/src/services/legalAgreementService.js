import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { getFirebaseClients, getFunctionEndpoint } from '../firebase/config';

export const HELPER_AGREEMENT_DOCUMENT_ID = 'helper_agreement';

async function authorizedFetch(functionName, options = {}) {
  const { auth } = getFirebaseClients();
  const token = await auth.currentUser?.getIdToken?.();
  if (!token) {
    throw new Error('You must be signed in before accessing the Helper Agreement.');
  }

  const response = await fetch(getFunctionEndpoint(functionName), {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.success) {
    throw new Error(result?.message || 'Unable to complete the Helper Agreement request.');
  }
  return result;
}

export async function getHelperAgreementBundle() {
  const { auth, db } = getFirebaseClients();
  const uid = String(auth.currentUser?.uid || '').trim();
  if (!uid) {
    throw new Error('You must be signed in before accessing the Helper Agreement.');
  }

  const [documentSnap, versionsSnap, acceptancesSnap] = await Promise.all([
    getDoc(doc(db, 'legalDocuments', HELPER_AGREEMENT_DOCUMENT_ID)),
    getDocs(query(collection(db, 'legalDocumentVersions'), where('documentId', '==', HELPER_AGREEMENT_DOCUMENT_ID))),
    getDocs(query(collection(db, 'userAgreementAcceptances'), where('userId', '==', uid))),
  ]);

  const documentData = documentSnap.exists() ? { id: documentSnap.id, ...documentSnap.data() } : null;
  const versions = versionsSnap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((left, right) => normalizeTime(right.createdAt || right.effectiveDate) - normalizeTime(left.createdAt || left.effectiveDate));
  const activeVersionId = String(documentData?.currentVersionId || '').trim();
  const activeVersion = versions.find((item) => item.id === activeVersionId)
    || versions.find((item) => String(item.version || '').trim() === String(documentData?.currentVersion || '').trim())
    || versions[0]
    || null;
  const acceptances = acceptancesSnap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => item.documentId === HELPER_AGREEMENT_DOCUMENT_ID)
    .sort((left, right) => normalizeTime(right.acceptedAt) - normalizeTime(left.acceptedAt));

  return {
    success: true,
    document: documentData,
    activeVersion,
    versions,
    acceptances,
  };
}

export async function acceptHelperAgreement({ typedSignatureName, checkboxAccepted = true } = {}) {
  return authorizedFetch('acceptHelperAgreement', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      typedSignatureName,
      checkboxAccepted,
    }),
  });
}

export function formatAgreementDate(value) {
  if (!value) return 'Not specified';
  const parsed = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not specified';
  return parsed.toLocaleDateString();
}

function normalizeTime(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
