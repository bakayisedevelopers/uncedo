import { getFirebaseClients } from '../firebase/config';

const VERIFY_TUTOR_PAYOUT_ACCOUNT_ENDPOINT = import.meta.env.VITE_VERIFY_TUTOR_PAYOUT_ACCOUNT_ENDPOINT || '/verify-tutor-payout-account';
const LIST_TUTOR_PAYOUT_BANKS_ENDPOINT = import.meta.env.VITE_LIST_TUTOR_PAYOUT_BANKS_ENDPOINT || '/list-tutor-payout-banks';

export async function listTutorPayoutBanks() {
  const clients = await getFirebaseClients();
  const idToken = await clients?.auth?.currentUser?.getIdToken?.();

  if (!idToken) {
    throw new Error('You must be signed in before loading payout banks.');
  }

  const response = await fetch(LIST_TUTOR_PAYOUT_BANKS_ENDPOINT, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.success) {
    throw new Error(result?.message || 'Unable to load payout banks.');
  }

  return Array.isArray(result.banks) ? result.banks : [];
}

export async function verifyTutorPayoutAccount(payload = {}) {
  const clients = await getFirebaseClients();
  const idToken = await clients?.auth?.currentUser?.getIdToken?.();

  if (!idToken) {
    throw new Error('You must be signed in before verifying payout details.');
  }

  const response = await fetch(VERIFY_TUTOR_PAYOUT_ACCOUNT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.success) {
    throw new Error(result?.message || 'Unable to verify payout account.');
  }

  return result.payout;
}
