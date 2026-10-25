import {
  createUserWithEmailAndPassword,
  deleteUser,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithCustomToken,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseClients } from '../firebase/config';
import { deleteUserProfile, getUserProfile, upsertCustomerProfile } from './userService';

export const HELPER_LOGIN_BLOCKED_CODE = 'HELPER_LOGIN_BLOCKED';

function buildHelperBlockedError() {
  const error = new Error('Helpers are not allowed to log in on this app. Please use the Uncedo Helpers app.');
  error.code = HELPER_LOGIN_BLOCKED_CODE;
  return error;
}

function isHelperProfile(profile = {}) {
  const role = String(profile?.role || '').toLowerCase();
  const activeRole = String(profile?.activeRole || '').toLowerCase();
  const roles = Array.isArray(profile?.roles)
    ? profile.roles.map((nextRole) => String(nextRole || '').toLowerCase())
    : [];

  return role === 'helper' || activeRole === 'helper' || roles.includes('helper');
}

function normalizeCustomerUser(firebaseUser, profile = {}) {
  if (!firebaseUser) return null;

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    emailVerified: Boolean(firebaseUser.emailVerified),
    displayName: profile.displayName || firebaseUser.displayName || '',
    fullName: profile.fullName || profile.displayName || firebaseUser.displayName || '',
    role: 'customer',
    activeRole: 'customer',
    roles: ['customer'],
    ...profile,
  };
}

export function subscribeToAuthChanges(callback, onError) {
  const { auth } = getFirebaseClients();

  return onAuthStateChanged(auth, async (firebaseUser) => {
    try {
      if (!firebaseUser) {
        callback(null);
        return;
      }

      const profile = await getUserProfile(firebaseUser.uid);
      if (isHelperProfile(profile)) {
        await signOut(auth);
        onError?.(buildHelperBlockedError());
        callback(null);
        return;
      }
      callback(normalizeCustomerUser(firebaseUser, profile || {}));
    } catch (error) {
      onError?.(error);
      callback(normalizeCustomerUser(firebaseUser));
    }
  }, onError);
}

export async function loginWithEmail({ email, password }) {
  const { auth } = getFirebaseClients();
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  const profile = await getUserProfile(credential.user.uid);
  if (isHelperProfile(profile)) {
    await signOut(auth);
    throw buildHelperBlockedError();
  }
  return normalizeCustomerUser(credential.user, profile || {});
}

export async function signupWithEmail({ name, email, password }) {
  const { auth } = getFirebaseClients();
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(credential.user, { displayName: name.trim() });
  const profile = await upsertCustomerProfile({
    uid: credential.user.uid,
    email: credential.user.email,
    displayName: name.trim(),
  });

  return normalizeCustomerUser(credential.user, profile || {});
}

export async function loginWithGoogle() {
  const { auth } = getFirebaseClients();
  if (typeof window === 'undefined') throw new Error('Google sign-in is available in the web app only until native OAuth is configured.');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const credential = await signInWithPopup(auth, provider);
  const profile = await upsertCustomerProfile({
    uid: credential.user.uid,
    email: credential.user.email,
    displayName: credential.user.displayName || '',
  });
  if (isHelperProfile(profile)) {
    await signOut(auth);
    throw buildHelperBlockedError();
  }
  return normalizeCustomerUser(credential.user, profile || {});
}

function whatsappAuthEnabled() {
  return String(process.env.EXPO_PUBLIC_WHATSAPP_AUTH_ENABLED || '').trim().toLowerCase() === 'true';
}

export async function startWhatsAppAuthChallenge({ phoneNumber, mode = 'login', name = '', email = '' }) {
  if (!whatsappAuthEnabled()) throw new Error('WhatsApp sign-in is awaiting Meta authentication configuration.');
  const { functions } = getFirebaseClients();
  const call = httpsCallable(functions, 'startWhatsAppAuthChallenge');
  const result = await call({ phoneNumber, mode, role: 'customer', name, email });
  return result.data;
}

export async function completeWhatsAppAuthChallenge({ challengeId, code }) {
  if (!whatsappAuthEnabled()) throw new Error('WhatsApp sign-in is awaiting Meta authentication configuration.');
  const { auth, functions } = getFirebaseClients();
  const complete = httpsCallable(functions, 'completeWhatsAppAuthChallenge');
  const result = await complete({ challengeId, code });
  const credential = await signInWithCustomToken(auth, result.data.customToken);
  const profile = await upsertCustomerProfile({
    uid: credential.user.uid,
    email: credential.user.email,
    displayName: credential.user.displayName || '',
  });
  const token = await credential.user.getIdTokenResult();
  if (token.claims.whatsappAuthenticated === true) {
    await httpsCallable(functions, 'linkWhatsAppIdentity')({});
  }
  const savedProfile = await getUserProfile(credential.user.uid);
  return normalizeCustomerUser(credential.user, savedProfile || profile || {});
}

export async function logoutUser() {
  const { auth } = getFirebaseClients();
  await signOut(auth);
}

export async function deleteAccount(uid) {
  const { auth } = getFirebaseClients();
  const authUser = auth.currentUser;
  if (!authUser) {
    throw new Error('No active user session found.');
  }

  await deleteUserProfile(uid);
  await deleteUser(authUser);
}
