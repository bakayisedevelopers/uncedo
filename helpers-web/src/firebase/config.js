import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
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
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import {
  connectStorageEmulator,
  deleteObject,
  getDownloadURL,
  getStorage,
  ref as storageRef,
  uploadBytes,
} from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  ...(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
    ? { measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID }
    : {}),
  ...(import.meta.env.VITE_FIREBASE_DATABASE_URL
    ? { databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL }
    : {}),
};

const useEmulators = !import.meta.env.PROD && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
const emulatorHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || 'localhost';

let cached = null;

export function getFirebaseClients() {
  if (cached) return cached;

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  setPersistence(auth, browserLocalPersistence).catch(() => null);
  const db = getFirestore(app);
  const storage = getStorage(app);
  const functions = getFunctions(app, 'us-central1');

  if (useEmulators) {
    connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, emulatorHost, 8080);
    connectStorageEmulator(storage, emulatorHost, 9199);
    connectFunctionsEmulator(functions, emulatorHost, 5001);
  }

  cached = {
    app,
    auth,
    db,
    storage,
    functions,
    httpsCallable,
    authModule: {
      createUserWithEmailAndPassword,
      onAuthStateChanged,
      signInWithEmailAndPassword,
      signOut,
      updateProfile,
    },
    firestoreModule: {
      collection,
      deleteDoc,
      doc,
      getDoc,
      getDocs,
      onSnapshot,
      query,
      serverTimestamp,
      setDoc,
      updateDoc,
      where,
    },
    storageModule: {
      deleteObject,
      getDownloadURL,
      ref: storageRef,
      uploadBytes,
    },
  };

  return cached;
}

export function getFunctionEndpoint(functionName) {
  const projectId = String(firebaseConfig.projectId || 'bakayise-uncedo-latest').trim();
  if (useEmulators) {
    return `http://${emulatorHost}:5001/${projectId}/us-central1/${functionName}`;
  }
  return `https://us-central1-${projectId}.cloudfunctions.net/${functionName}`;
}
