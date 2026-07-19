import { getFirebaseClients, getFunctionEndpoint } from '../firebase/config';

export async function fetchIceServers() {
  const { auth } = getFirebaseClients();
  const idToken = await auth.currentUser?.getIdToken();

  if (!idToken) {
    throw new Error('You must be signed in before starting a session.');
  }

  const response = await fetch(getFunctionEndpoint('getIceConfig'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false || !Array.isArray(payload?.iceServers)) {
    throw new Error(payload?.message || 'Unable to load network relay configuration right now.');
  }

  return payload.iceServers;
}
