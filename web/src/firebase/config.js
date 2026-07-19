import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  deleteUser,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, collection, deleteDoc, serverTimestamp, onSnapshot, query, where, orderBy, runTransaction, writeBatch } from 'firebase/firestore';
import { connectStorageEmulator, getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

// Your web app's Firebase configuration
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

export class FirebaseConfigError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'FirebaseConfigError';
    this.missingKeys = options.missingKeys ?? [];
    this.cause = options.cause;
  }
}

let cachedClients = null;

function initializeFirebase() {
  if (cachedClients) {
    return cachedClients;
  }

  try {
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
      // Auth module functions
      authModule: {
        browserLocalPersistence,
        browserSessionPersistence,
        onAuthStateChanged,
        setPersistence,
        signInWithEmailAndPassword,
        createUserWithEmailAndPassword,
        updateProfile,
        signOut,
        deleteUser,
      },
      // Firestore module functions
      firestoreModule: {
        doc,
        getDoc,
        getDocs,
        setDoc,
        updateDoc,
        addDoc,
        collection,
        deleteDoc,
        serverTimestamp,
        onSnapshot,
        query,
        where,
        orderBy,
        runTransaction,
        writeBatch,
      },
      storageModule: {
        ref,
        uploadBytes,
        getDownloadURL,
        deleteObject,
      },
    };
    return cachedClients;
  } catch (error) {
    if (isProductionBuild) {
      throw new FirebaseConfigError(
        'Firebase initialization failed in production. Check Firebase environment variables and project configuration.',
        { cause: error },
      );
    }
    console.warn('Firebase SDK unavailable, using local mock mode.', error);
    return null;
  }
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

  return initializeFirebase();
}
