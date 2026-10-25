import { auth } from '../firebase/config';

const DEFAULT_FUNCTIONS_BASE = 'https://us-central1-bakayise-uncedo-latest.cloudfunctions.net';

function functionsBase() {
  const configured = String(import.meta.env.VITE_API_BASE_URL || '').trim();
  return (!configured || configured.includes('PASTE_') ? DEFAULT_FUNCTIONS_BASE : configured).replace(/\/$/, '');
}

export async function requestPaymentFunction(name, payload = {}, { authenticated = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authenticated && auth?.currentUser) {
    headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
  }
  const response = await fetch(`${functionsBase()}/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) {
    const error = new Error(result.message || 'Payment service is temporarily unavailable.');
    error.code = result.code || `http-${response.status}`;
    throw error;
  }
  return result;
}
