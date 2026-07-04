import { getUserProfile, updateUserProfile } from './userService';
import { getFirebaseClients } from '../firebase/config';

const PAY_OUTSTANDING_BALANCE_ENDPOINT = import.meta.env.VITE_PAY_OUTSTANDING_BALANCE_ENDPOINT || '/pay-outstanding-balance';

function normalizeWallet(wallet = {}) {
  return {
    balance: Number(wallet.balance || 0),
    currency: wallet.currency || 'ZAR',
    updatedAt: wallet.updatedAt || new Date().toISOString(),
  };
}

export function getOutstandingAmount(wallet = {}) {
  const balance = Number(wallet.balance || 0);
  return balance < 0 ? Number(Math.abs(balance).toFixed(2)) : 0;
}

export async function applyWalletDebt(userId, amount) {
  const profile = await getUserProfile(userId);
  const wallet = normalizeWallet(profile?.wallet);
  const nextBalance = Number((wallet.balance - amount).toFixed(2));

  return updateUserProfile(userId, {
    wallet: {
      ...wallet,
      balance: nextBalance,
      updatedAt: new Date().toISOString(),
    },
  });
}

export async function payOutstandingBalance({ user, cardId }) {
  const outstandingAmount = getOutstandingAmount(user?.wallet);
  if (!outstandingAmount) {
    throw new Error('There is no outstanding balance to pay.');
  }

  const selectedCardId = cardId || user?.paymentMethods?.find((item) => item.isDefault)?.id || user?.paymentMethods?.[0]?.id || '';
  if (!selectedCardId) {
    throw new Error('Select a payment card before paying the outstanding balance.');
  }

  const clients = await getFirebaseClients();
  const idToken = await clients?.auth?.currentUser?.getIdToken?.();

  if (!idToken) {
    throw new Error('You must be signed in before paying an outstanding balance.');
  }

  const response = await fetch(PAY_OUTSTANDING_BALANCE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ cardId: selectedCardId }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.message || 'Outstanding balance payment failed. Please check your card and try again.');
  }

  return payload;
}
