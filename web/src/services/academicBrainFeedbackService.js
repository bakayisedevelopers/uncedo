import { getFirebaseClients } from '../firebase/config';

const FEEDBACK_ENDPOINT = import.meta.env.VITE_ACADEMIC_BRAIN_FEEDBACK_ENDPOINT || '/save-academic-brain-feedback';

export async function recordAcademicBrainFeedback(payload = {}) {
  const clients = await getFirebaseClients();
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
