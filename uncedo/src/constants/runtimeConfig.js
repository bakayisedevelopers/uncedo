const DEFAULT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCAGhIGyQlZvJwzJ-3FOBHsesF-bFf41Tg',
  authDomain: 'bakayise-uncedo.firebaseapp.com',
  projectId: 'bakayise-uncedo',
  storageBucket: 'bakayise-uncedo.firebasestorage.app',
  messagingSenderId: '618602036816',
  appId: '1:618602036816:web:5aa6a307585aee37c35b55',
  measurementId: 'G-W25WJ7H8QZ',
};

function readPublicEnv(value, fallback = '') {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

export const FIREBASE_PUBLIC_CONFIG = {
  apiKey: readPublicEnv(process.env.EXPO_PUBLIC_FIREBASE_API_KEY, DEFAULT_FIREBASE_CONFIG.apiKey),
  authDomain: readPublicEnv(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN, DEFAULT_FIREBASE_CONFIG.authDomain),
  projectId: readPublicEnv(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID, DEFAULT_FIREBASE_CONFIG.projectId),
  storageBucket: readPublicEnv(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET, DEFAULT_FIREBASE_CONFIG.storageBucket),
  messagingSenderId: readPublicEnv(process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, DEFAULT_FIREBASE_CONFIG.messagingSenderId),
  appId: readPublicEnv(process.env.EXPO_PUBLIC_FIREBASE_APP_ID, DEFAULT_FIREBASE_CONFIG.appId),
  measurementId: readPublicEnv(process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID, DEFAULT_FIREBASE_CONFIG.measurementId),
};

export const WEB_APP_BASE_URL = readPublicEnv(process.env.EXPO_PUBLIC_WEB_APP_URL, 'https://uncedo.bakayise.com').replace(/\/+$/, '');
export const AI_LIVE_PROXY_WS_URL = readPublicEnv(
  process.env.EXPO_PUBLIC_AI_LIVE_PROXY_WS_URL,
  WEB_APP_BASE_URL.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://'),
).replace(/\/+$/, '');
export const FIREBASE_EMULATOR_HOST = readPublicEnv(process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST, '10.0.2.2');
export const USE_FIREBASE_EMULATORS = readPublicEnv(process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS) === 'true';
