import { getFirebaseClients, getFunctionEndpoint } from '../firebase/config';

export async function verifyPaystackReference(reference, options = {}) {
  const { auth } = getFirebaseClients();
  const idToken = await auth.currentUser?.getIdToken();

  if (!idToken) {
    throw new Error('You must be signed in before adding a card.');
  }

  const response = await fetch(getFunctionEndpoint('verifyPaystack'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      reference,
      ...(options.nickname ? { nickname: options.nickname } : {}),
      ...(options.userId ? { userId: options.userId } : {}),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || 'Unable to verify payment method.');
  }

  if (payload?.success === false) {
    throw new Error(payload.message || 'Unable to verify payment method.');
  }

  return payload;
}

async function updateSavedPaymentMethod(user, methodId, action) {
  const { auth } = getFirebaseClients();
  if (!auth.currentUser?.uid || auth.currentUser.uid !== user?.uid) {
    throw new Error('Sign in to manage your saved cards.');
  }
  const idToken = await auth.currentUser.getIdToken();
  const response = await fetch(getFunctionEndpoint('updatePaymentMethod'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, methodId }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success !== true) {
    throw new Error(payload?.message || 'Unable to update the saved card.');
  }
  return { paymentMethods: Array.isArray(payload.paymentMethods) ? payload.paymentMethods : [] };
}

export async function setDefaultPaymentMethod(user, methodId) {
  return updateSavedPaymentMethod(user, methodId, 'set_default');
}

export async function removePaymentMethod(user, methodId) {
  return updateSavedPaymentMethod(user, methodId, 'remove');
}
