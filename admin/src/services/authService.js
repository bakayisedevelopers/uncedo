import { getFirebaseClients } from '../firebase/config';

const REMEMBER_ME_KEY = 'uncedo_admin_remember_me';

export function getRememberMePreference() {
  try {
    return window.localStorage.getItem(REMEMBER_ME_KEY) !== 'false';
  } catch (_error) {
    return true;
  }
}

export function setRememberMePreference(nextValue) {
  try {
    window.localStorage.setItem(REMEMBER_ME_KEY, nextValue ? 'true' : 'false');
  } catch (_error) {
    // Ignore storage failures.
  }
}

export async function loginWithEmail({ email, password, rememberMe = true }) {
  const clients = await getFirebaseClients();
  if (!clients) {
    throw new Error('Firebase is not configured for the admin app.');
  }

  const { auth, authModule } = clients;
  const { browserLocalPersistence, browserSessionPersistence, setPersistence, signInWithEmailAndPassword } = authModule;
  await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
  const credential = await signInWithEmailAndPassword(auth, String(email || '').trim(), String(password || ''));
  return credential.user;
}

export async function logoutUser() {
  const clients = await getFirebaseClients();
  if (!clients) return;
  await clients.authModule.signOut(clients.auth);
}

export function subscribeToAuthChanges(callback) {
  let unsub = () => {};

  getFirebaseClients()
    .then((clients) => {
      if (!clients) {
        callback(null);
        return;
      }

      const authChanged = clients.authModule?.onAuthStateChanged;
      if (typeof authChanged !== 'function') {
        callback(clients.auth?.currentUser || null);
        return;
      }

      try {
        unsub = authChanged(clients.auth, (user) => {
          callback(user || null);
        });
      } catch (_error) {
        callback(clients.auth?.currentUser || null);
      }
    })
    .catch(() => {
      callback(null);
    });

  return () => unsub?.();
}
