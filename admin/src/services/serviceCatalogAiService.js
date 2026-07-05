import { getFirebaseClients } from '../firebase/config';

export async function generateServiceCatalogDraft(payload = {}) {
  const clients = await getFirebaseClients();
  if (!clients) {
    throw new Error('Firebase is not configured for the admin app.');
  }

  const { functions, functionsModule } = clients;
  const { httpsCallable } = functionsModule;
  const invoke = httpsCallable(functions, 'generateServiceDraft');
  const result = await invoke(payload);
  return result?.data || null;
}
