import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const required = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Object.values(required).every((value) => (
  typeof value === 'string' && value.trim() && !value.includes('PASTE_')
));

const app = getApps().length ? getApp() : firebaseConfigured ? initializeApp(required) : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const whatsappAuthEnabled = import.meta.env.VITE_WHATSAPP_AUTH_ENABLED === 'true';
export const googleAuthEnabled = import.meta.env.VITE_GOOGLE_AUTH_ENABLED === 'true';
