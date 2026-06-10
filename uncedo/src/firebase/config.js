import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, inMemoryPersistence, initializeAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import {
  FIREBASE_EMULATOR_HOST,
  FIREBASE_PUBLIC_CONFIG,
  USE_FIREBASE_EMULATORS,
} from '../constants/runtimeConfig';

const firebaseConfig = FIREBASE_PUBLIC_CONFIG;
const projectId = firebaseConfig.projectId || 'parakleo';
let emulatorsConnected = false;
let authInstance = null;

function getFirebaseAuth(app) {
  if (authInstance) {
    return authInstance;
  }

  try {
    authInstance = initializeAuth(app, {
      persistence: inMemoryPersistence,
    });
  } catch (error) {
    authInstance = getAuth(app);
  }

  return authInstance;
}

export function getFirebaseClients() {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getFirebaseAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);

  if (USE_FIREBASE_EMULATORS && !emulatorsConnected) {
    connectAuthEmulator(auth, `http://${FIREBASE_EMULATOR_HOST}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, FIREBASE_EMULATOR_HOST, 8080);
    connectStorageEmulator(storage, FIREBASE_EMULATOR_HOST, 9199);
    emulatorsConnected = true;
  }

  return { app, auth, db, storage };
}

export function getFunctionEndpoint(functionName) {
  if (USE_FIREBASE_EMULATORS) {
    return `http://${FIREBASE_EMULATOR_HOST}:5001/${projectId}/us-central1/${functionName}`;
  }

  return `https://us-central1-${projectId}.cloudfunctions.net/${functionName}`;
}
