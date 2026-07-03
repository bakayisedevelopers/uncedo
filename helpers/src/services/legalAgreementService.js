import { getFirebaseClients, getFunctionEndpoint } from '../firebase/config';

export const HELPER_AGREEMENT_DOCUMENT_ID = 'helper_agreement';

async function getAuthToken() {
  const { auth } = getFirebaseClients();
  return auth.currentUser?.getIdToken?.() || '';
}

async function authorizedFetch(functionName, options = {}) {
  const token = await getAuthToken();
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
  return authorizedFetch('getHelperAgreement', {
    method: 'GET',
  });
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
