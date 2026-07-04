import { getFirebaseClients, getFunctionEndpoint } from '../firebase/config';
import { normalizePricingSnapshot } from '../utils/pricing';

const PRICING_QUOTE_ENDPOINT = getFunctionEndpoint('getPricingQuote');

export async function fetchPricingQuote({ durationMinutes, subject }) {
  const clients = getFirebaseClients();
  if (!clients?.auth?.currentUser) {
    throw new Error('You must be signed in to request a pricing quote.');
  }

  const idToken = await clients.auth.currentUser.getIdToken();
  const response = await fetch(PRICING_QUOTE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ durationMinutes, subject }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success || !payload?.quote) {
    throw new Error(payload?.message || 'Unable to fetch pricing quote right now.');
  }

  return normalizePricingSnapshot(payload.quote);
}
