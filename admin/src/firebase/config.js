import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const REQUIRED_FIREBASE_ENV_FIELDS = [
  ['VITE_FIREBASE_API_KEY', firebaseConfig.apiKey],
  ['VITE_FIREBASE_AUTH_DOMAIN', firebaseConfig.authDomain],
  ['VITE_FIREBASE_PROJECT_ID', firebaseConfig.projectId],
  ['VITE_FIREBASE_APP_ID', firebaseConfig.appId],
];

export const missingFirebaseEnvKeys = REQUIRED_FIREBASE_ENV_FIELDS
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const hasFirebaseEnv = missingFirebaseEnvKeys.length === 0;
const isProductionBuild = import.meta.env.PROD;
const useFirebaseEmulators = !isProductionBuild && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
const firebaseEmulatorHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || 'localhost';
let emulatorsConnected = false;
let cachedClients = null;

export class FirebaseConfigError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'FirebaseConfigError';
    this.missingKeys = options.missingKeys ?? [];
    this.cause = options.cause;
  }
}

function initializeFirebase() {
  if (cachedClients) {
    return cachedClients;
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);

  if (useFirebaseEmulators && !emulatorsConnected) {
    connectAuthEmulator(auth, `http://${firebaseEmulatorHost}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, firebaseEmulatorHost, 8080);
    connectStorageEmulator(storage, firebaseEmulatorHost, 9199);
    emulatorsConnected = true;
  }

  cachedClients = {
    auth,
    db,
    storage,
    authModule: {
      browserLocalPersistence,
      browserSessionPersistence,
      createUserWithEmailAndPassword,
      onAuthStateChanged,
      setPersistence,
      signInWithEmailAndPassword,
      signOut,
      updateProfile,
    },
    firestoreModule: {
      collection,
      doc,
      getDoc,
      getDocs,
      getFirestore,
      onSnapshot,
      orderBy,
      query,
      runTransaction,
      serverTimestamp,
      setDoc,
      updateDoc,
      where,
      writeBatch,
    },
  };

  return cachedClients;
}

export async function getFirebaseClients() {
  if (!hasFirebaseEnv) {
    if (isProductionBuild) {
      throw new FirebaseConfigError(
        `Missing required Firebase environment variables: ${missingFirebaseEnvKeys.join(', ')}`,
        { missingKeys: missingFirebaseEnvKeys },
      );
    }

    return null;
  }

  try {
    return initializeFirebase();
  } catch (error) {
    if (isProductionBuild) {
      throw new FirebaseConfigError('Firebase initialization failed in production.', { cause: error });
    }
    console.warn('Firebase SDK unavailable, running without backend access.', error);
    return null;
  }
}
