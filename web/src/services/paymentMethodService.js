import { updateUserProfile } from './userService';
import { getFirebaseClients } from '../firebase/config';

const DELETE_PAYMENT_METHOD_ENDPOINT = import.meta.env.VITE_DELETE_PAYMENT_METHOD_ENDPOINT || '/delete-payment-method';

export async function addPaymentMethod(user, { nickname, paystackAuthorization }) {
  const nextMethod = {
    id: crypto.randomUUID(),
    nickname: nickname?.trim() || 'My Card',
    brand: paystackAuthorization.brand || 'Card',
    last4: paystackAuthorization.last4,
    paystackAuthorizationCode: paystackAuthorization.authorization_code,
    isDefault: (user?.paymentMethods || []).length === 0,
    createdAt: new Date().toISOString(),
  };

  const existing = sanitizeMethods(user?.paymentMethods || []);
  const paymentMethods = [...existing, nextMethod];

  return updateUserProfile(user.uid, { paymentMethods });
}

export async function setDefaultPaymentMethod(user, methodId) {
  const paymentMethods = sanitizeMethods((user?.paymentMethods || []).map((method) => ({
    ...method,
    isDefault: method.id === methodId,
  })));

  return updateUserProfile(user.uid, { paymentMethods });
}

export async function removePaymentMethod(user, methodId) {
  const clients = await getFirebaseClients();
  const idToken = await clients?.auth?.currentUser?.getIdToken?.();

  if (!idToken) {
    throw new Error('You must be signed in before removing a card.');
  }

  const response = await fetch(DELETE_PAYMENT_METHOD_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ methodId }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.message || 'Unable to remove this card right now.');
  }

  return payload.profile;
}
