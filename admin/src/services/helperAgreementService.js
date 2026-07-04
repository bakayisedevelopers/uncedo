import { getFirebaseClients } from '../firebase/config';

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'bakayise-uncedo';
const useFirebaseEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
const firebaseEmulatorHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || 'localhost';

function getFunctionEndpoint(functionName) {
  if (useFirebaseEmulators) {
    return `http://${firebaseEmulatorHost}:5001/${projectId}/us-central1/${functionName}`;
  }

  return `https://us-central1-${projectId}.cloudfunctions.net/${functionName}`;
}

async function getAuthToken() {
  const clients = await getFirebaseClients();
  return clients?.auth?.currentUser?.getIdToken?.() || '';
}

async function authorizedFetch(functionName, options = {}) {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('You must be signed in before accessing helper agreement management.');
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
    throw new Error(result?.message || 'Unable to complete the helper agreement request.');
  }
  return result;
}

export async function getHelperAgreementBundle() {
  return authorizedFetch('getHelperAgreement', {
    method: 'GET',
  });
}

export async function publishHelperAgreementVersion(payload = {}) {
  return authorizedFetch('publishHelperAgreementVersion', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}
