import { getFirebaseClients } from '../firebase/config';

export async function getMyPoliceClearanceReview() {
  const { functions, authProviders } = getFirebaseClients();
  const call = authProviders.httpsCallable(functions, 'getMyHelperPoliceClearanceReview');
  const result = await call({});
  return result.data || { status: 'missing', submissions: [] };
}

export async function getMyPoliceClearanceViewUrl(submissionId) {
  const { functions, authProviders } = getFirebaseClients();
  const call = authProviders.httpsCallable(functions, 'getMyHelperPoliceClearanceViewUrl');
  const result = await call({ submissionId: String(submissionId || '') });
  return result.data || null;
}
