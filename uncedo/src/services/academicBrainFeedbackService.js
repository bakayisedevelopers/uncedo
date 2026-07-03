import { getFirebaseClients, getFunctionEndpoint } from '../firebase/config';

const FEEDBACK_ENDPOINT = getFunctionEndpoint('saveAcademicBrainFeedback');

export async function recordAcademicBrainFeedback(payload = {}) {
  const clients = getFirebaseClients();
  const idToken = await clients?.auth?.currentUser?.getIdToken?.();
  if (!idToken) return { success: false, reason: 'unauthorized' };

  const response = await fetch(FEEDBACK_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  }).catch(() => null);

  if (!response) return { success: false, reason: 'network' };
  const json = await response.json().catch(() => ({}));
  return { success: Boolean(response.ok && json?.success), ...json };
}
