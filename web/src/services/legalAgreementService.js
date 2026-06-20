import { getFirebaseClients } from '../firebase/config';

const GET_TUTOR_AGREEMENT_ENDPOINT = import.meta.env.VITE_GET_TUTOR_AGREEMENT_ENDPOINT || '/getTutorAgreement';
const ACCEPT_TUTOR_AGREEMENT_ENDPOINT = import.meta.env.VITE_ACCEPT_TUTOR_AGREEMENT_ENDPOINT || '/acceptTutorAgreement';
const PUBLISH_TUTOR_AGREEMENT_ENDPOINT = import.meta.env.VITE_PUBLISH_TUTOR_AGREEMENT_ENDPOINT || '/publishTutorAgreementVersion';
const EMAIL_SIGNED_TUTOR_AGREEMENT_ENDPOINT = import.meta.env.VITE_EMAIL_SIGNED_TUTOR_AGREEMENT_ENDPOINT || '/emailSignedTutorAgreement';
const CLOUD_FUNCTIONS_BASE_URL = String(import.meta.env.VITE_CLOUD_FUNCTIONS_URL || '').trim();
const PUBLISH_TUTOR_AGREEMENT_FALLBACK_ENDPOINT = CLOUD_FUNCTIONS_BASE_URL
  ? `${CLOUD_FUNCTIONS_BASE_URL.replace(/\/+$/, '')}/publishTutorAgreementVersion`
  : 'https://us-central1-parakleo.cloudfunctions.net/publishTutorAgreementVersion';

export const LEGAL_ENTITY_NAME = 'Parakleo, operated by Jabu Msiza';
export const TUTOR_AGREEMENT_DOCUMENT_ID = 'tutor_agreement';

function normalizeDate(value) {
  if (!value) return '';
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (typeof value?.toMillis === 'function') return new Date(value.toMillis()).toISOString();
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : '';
}

function sortNewestFirst(a, b) {
  const aMillis = new Date(normalizeDate(a.createdAt || a.effectiveDate || a.acceptedAt || 0) || 0).getTime();
  const bMillis = new Date(normalizeDate(b.createdAt || b.effectiveDate || b.acceptedAt || 0) || 0).getTime();
  return bMillis - aMillis;
}

export async function getTutorAgreementBundle() {
  const clients = await getFirebaseClients();
  if (!clients) {
    return {
      activeVersion: null,
      document: null,
      versions: [],
      acceptances: [],
      user: null,
    };
  }

  const { db, firestoreModule } = clients;
  const { collection, doc, getDoc, getDocs, query, where } = firestoreModule;
  const authUser = clients.auth.currentUser;
  const token = await authUser?.getIdToken?.();

  const response = await fetch(GET_TUTOR_AGREEMENT_ENDPOINT, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  const result = await response.json().catch(() => ({}));
  if (response.ok && result?.success) {
    return {
      document: result.document ? { id: result.document.id || result.document.documentId || TUTOR_AGREEMENT_DOCUMENT_ID, ...result.document } : null,
      activeVersion: result.activeVersion ? { id: result.activeVersion.id || result.activeVersion.versionId || '', ...result.activeVersion } : null,
      versions: Array.isArray(result.versions) ? result.versions : [],
      acceptances: Array.isArray(result.acceptances) ? result.acceptances : [],
      user: result.user || null,
    };
  }

  const [documentSnap, versionsSnap, acceptancesSnap, userSnap] = await Promise.all([
    getDoc(doc(db, 'legalDocuments', TUTOR_AGREEMENT_DOCUMENT_ID)),
    getDocs(collection(db, 'legalDocumentVersions')),
    authUser?.uid ? getDocs(query(collection(db, 'userAgreementAcceptances'), where('userId', '==', authUser.uid))) : Promise.resolve({ docs: [] }),
    authUser?.uid ? getDoc(doc(db, 'users', authUser.uid)) : Promise.resolve({ exists: () => false, data: () => ({}) }),
  ]);

  const documentData = documentSnap.exists() ? { id: documentSnap.id, ...documentSnap.data() } : null;
  const versions = versionsSnap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => item.documentId === TUTOR_AGREEMENT_DOCUMENT_ID)
    .sort(sortNewestFirst);
  const acceptances = (acceptancesSnap.docs || [])
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => item.documentId === TUTOR_AGREEMENT_DOCUMENT_ID)
    .sort(sortNewestFirst);
  const user = userSnap?.exists?.() ? { uid: userSnap.id, ...userSnap.data() } : null;
  const activeVersion = documentData
    ? versions.find((item) => item.version === documentData.currentVersion) || null
    : null;

  return {
    document: documentData,
    activeVersion,
    versions,
    acceptances,
    user,
  };
}

export async function acceptTutorAgreement({ typedSignatureName, checkboxAccepted = true }) {
  const clients = await getFirebaseClients();
  const token = await clients?.auth?.currentUser?.getIdToken?.();

  if (!token) {
    throw new Error('You must be signed in before accepting the Tutor Agreement.');
  }

  const response = await fetch(ACCEPT_TUTOR_AGREEMENT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      typedSignatureName,
      checkboxAccepted,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.success) {
    throw new Error(result?.message || 'Unable to accept Tutor Agreement.');
  }

  return result;
}

export async function publishTutorAgreementVersion(payload = {}) {
  const clients = await getFirebaseClients();
  const token = await clients?.auth?.currentUser?.getIdToken?.();

  if (!token) {
    throw new Error('You must be signed in before publishing a Tutor Agreement version.');
  }

  const requestOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  };

  let response;
  let result = {};
  let networkError = null;
  try {
    response = await fetch(PUBLISH_TUTOR_AGREEMENT_ENDPOINT, requestOptions);
    result = await response.json().catch(() => ({}));
  } catch (error) {
    networkError = error;
  }

  if ((!response || !response.ok) && PUBLISH_TUTOR_AGREEMENT_FALLBACK_ENDPOINT) {
    try {
      response = await fetch(PUBLISH_TUTOR_AGREEMENT_FALLBACK_ENDPOINT, requestOptions);
      result = await response.json().catch(() => ({}));
      networkError = null;
    } catch (error) {
      networkError = networkError || error;
    }
  }

  if (!response) {
    throw new Error(networkError?.message || 'Network request failed while publishing Tutor Agreement version.');
  }
  if (!response.ok || !result?.success) {
    throw new Error(result?.message || networkError?.message || 'Unable to publish Tutor Agreement version.');
  }

  return result;
}

export async function emailSignedTutorAgreement({ acceptanceId, destinationEmail } = {}) {
  const clients = await getFirebaseClients();
  const token = await clients?.auth?.currentUser?.getIdToken?.();

  if (!token) {
    throw new Error('You must be signed in before emailing a signed Tutor Agreement.');
  }

  const response = await fetch(EMAIL_SIGNED_TUTOR_AGREEMENT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      acceptanceId,
      destinationEmail,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.success) {
    throw new Error(result?.message || 'Unable to email the signed Tutor Agreement.');
  }

  return result;
}

export function formatAgreementDate(value) {
  const iso = normalizeDate(value);
  if (!iso) return 'Not specified';
  return new Date(iso).toLocaleDateString();
}
