import { getFirebaseClients } from '../firebase/config';

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'bakayise-uncedo-latest';
const useEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
const host = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || 'localhost';
const endpoint = (name) => useEmulator ? `http://${host}:5001/${projectId}/us-central1/${name}` : `https://us-central1-${projectId}.cloudfunctions.net/${name}`;

async function request(name, { method = 'POST', body } = {}) {
  const clients = await getFirebaseClients();
  const token = await clients?.auth?.currentUser?.getIdToken();
  if (!token) throw new Error('Sign in again to continue.');
  const response = await fetch(endpoint(name), { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(payload.message || 'Reward operation failed.');
  return payload;
}

export const getRewardOperations = () => request('adminRewardOperations', { method: 'GET' });
export const updateRewardConfig = (configId, patch, reason) => request('adminUpdateRewardConfig', { body: { configId, patch, reason } });
export const adjustReward = (payload) => request('adminAdjustReward', { body: payload });
