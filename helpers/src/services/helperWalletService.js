import { getFirebaseClients, getFunctionEndpoint } from '../firebase/config';

async function callHelperWalletEndpoint(functionName, { method = 'GET', body } = {}) {
  const { auth } = getFirebaseClients();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Sign in to view your helper wallet.');
  const response = await fetch(getFunctionEndpoint(functionName), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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
    wallet: summary.wallet || { balanceMinor: 0, balance: 0, availableMinor: 0, reservedMinor: 0, outstandingCommissionMinor: 0, currency: 'ZAR' },
    nextPayoutEstimateMinor: Math.max(0, Number(summary.nextPayoutEstimateMinor || 0)),
    legacySummary: summary.legacySummary || {
      unresolvedAmountMinor: 0,
      unresolvedAmount: 0,
      unresolvedJobsCount: 0,
      hasUnresolvedLegacyJobs: false,
    },
    transactions: Array.isArray(history.transactions) ? history.transactions : [],
  };
}

export async function resolveLegacyCompletedJobsWallet() {
  return callHelperWalletEndpoint('resolveLegacyCompletedJobsWallet', {
    method: 'POST',
    body: {},
  });
}
