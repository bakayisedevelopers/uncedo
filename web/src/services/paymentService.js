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
  const url = `${functionsBase()}/${encodeURIComponent(name)}`;
  const retries = 3;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if ([502, 503, 504].includes(response.status) && attempt < retries) {
        const delayMs = 1200 * (attempt + 1) + Math.floor(Math.random() * 400);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) {
        const error = new Error(result.message || 'Payment service is temporarily unavailable.');
        error.code = result.code || `http-${response.status}`;
        throw error;
      }
      return result;
    } catch (err) {
      const isNetworkError = err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(String(err?.message || ''));
      if (isNetworkError && attempt < retries) {
        const delayMs = 1200 * (attempt + 1) + Math.floor(Math.random() * 400);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      if (isNetworkError) {
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        const netErr = new Error(
          offline
            ? 'Unable to reach Uncedo payment servers. Please check your connection and try again.'
            : 'Uncedo payment servers are temporarily busy. Please wait a moment and try again.',
        );
        netErr.code = 'network-error';
        throw netErr;
      }
      throw err;
    }
  }
}
