import { getFirebaseClients, getFunctionEndpoint } from '../firebase/config';

async function getCurrentUserToken() {
  const { auth } = getFirebaseClients();
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('You must be signed in.');
  }
  return token;
}

async function callPayoutFunction(functionName, { method = 'POST', body = null } = {}) {
  const token = await getCurrentUserToken();
  const response = await fetch(getFunctionEndpoint(functionName), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const responseText = await response.text();
  const payload = responseText ? (() => {
    try {
      return JSON.parse(responseText);
    } catch (_error) {
      return null;
    }
  })() : null;

  if (!response.ok || payload?.success === false) {
    const fallbackMessage = response.status === 404
      ? 'The payout verification service is not available yet. Please try again shortly.'
      : `Unable to complete the payout request (${response.status || 'network error'}).`;
    throw new Error(payload?.message || fallbackMessage);
  }

  return payload;
}

export async function getHelperPayoutBanks() {
  const payload = await callPayoutFunction('getHelperPayoutBanks', { method: 'GET' });
  return Array.isArray(payload?.banks) ? payload.banks : [];
}

export async function verifyHelperPayout(payout) {
  return callPayoutFunction('verifyHelperPayout', { body: { payout } });
}
