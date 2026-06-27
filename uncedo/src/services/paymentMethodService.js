import { getFirebaseClients, getFunctionEndpoint } from '../firebase/config';
import { updateUserProfile } from './userService';

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `card_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeMethods(methods = []) {
  return methods.map((method, index) => ({
    ...method,
    id: method.id || makeId(),
    nickname: method.nickname || `${method.brand || 'Card'} ending ${method.last4 || '----'}`,
    brand: method.brand || 'Card',
    last4: method.last4 || '----',
    isDefault: Boolean(method.isDefault || index === 0),
  }));
}

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

export async function setDefaultPaymentMethod(user, methodId) {
  const paymentMethods = sanitizeMethods(user?.paymentMethods || []).map((method) => ({
    ...method,
    isDefault: method.id === methodId,
  }));

  return updateUserProfile(user.uid, { paymentMethods });
}

export async function removePaymentMethod(user, methodId) {
  const paymentMethods = sanitizeMethods(user?.paymentMethods || []).filter((method) => method.id !== methodId);

  if (paymentMethods.length && !paymentMethods.some((method) => method.isDefault)) {
    paymentMethods[0].isDefault = true;
  }

  return updateUserProfile(user.uid, { paymentMethods });
}
