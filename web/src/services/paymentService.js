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
  const retries = 2;
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
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
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
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
        continue;
      }
      if (isNetworkError) {
        const netErr = new Error('Unable to reach Uncedo payment servers. Please check your connection and try again.');
        netErr.code = 'network-error';
        throw netErr;
      }
      throw err;
    }
  }
}
