import { getFirebaseClients, getFunctionEndpoint } from '../firebase/config';

async function callHelperWalletEndpoint(functionName) {
  const { auth } = getFirebaseClients();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Sign in to view your helper wallet.');
  const response = await fetch(getFunctionEndpoint(functionName), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true) {
    throw new Error(payload?.message || 'Unable to load your helper wallet.');
  }
  return payload;
}

export async function getHelperWalletSnapshot() {
  const [summary, history] = await Promise.all([
    callHelperWalletEndpoint('getHelperWallet'),
    callHelperWalletEndpoint('getHelperWalletTransactions'),
  ]);
  return {
    wallet: summary.wallet || { availableMinor: 0, reservedMinor: 0, outstandingCommissionMinor: 0, currency: 'ZAR' },
    nextPayoutEstimateMinor: Math.max(0, Number(summary.nextPayoutEstimateMinor || 0)),
    transactions: Array.isArray(history.transactions) ? history.transactions : [],
  };
}
