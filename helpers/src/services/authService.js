import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { getFirebaseClients } from '../firebase/config';
import { deleteUserProfile, getUserProfile, upsertHelperProfile } from './userService';
import { stopActiveJobTrackingForSignOut } from './activeJobTrackingService';

export const HELPER_LOGIN_BLOCKED_CODE = 'HELPER_LOGIN_BLOCKED';

function buildHelperBlockedError() {
  const error = new Error('Client accounts are not allowed in this app. Please use the Uncedo app.');
  error.code = HELPER_LOGIN_BLOCKED_CODE;
  return error;
}

function isClientProfile(profile = {}) {
  const role = String(profile?.role || '').toLowerCase();
  const activeRole = String(profile?.activeRole || '').toLowerCase();
  const roles = Array.isArray(profile?.roles)
    ? profile.roles.map((nextRole) => String(nextRole || '').toLowerCase())
    : [];

  return role === 'student' || activeRole === 'student' || roles.includes('student');
}

function normalizeHelperUser(firebaseUser, profile = {}) {
  if (!firebaseUser) return null;

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    emailVerified: Boolean(firebaseUser.emailVerified),
    displayName: profile.displayName || firebaseUser.displayName || '',
    fullName: profile.fullName || profile.displayName || firebaseUser.displayName || '',
    role: 'helper',
    activeRole: 'helper',
    roles: ['helper'],
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
      if (isClientProfile(profile)) {
        await signOut(auth);
        onError?.(buildHelperBlockedError());
        callback(null);
        return;
      }

      callback(normalizeHelperUser(firebaseUser, profile || {}));
    } catch (error) {
      onError?.(error);
      callback(normalizeHelperUser(firebaseUser));
    }
  }, onError);
}

export async function loginWithEmail({ email, password }) {
  const { auth } = getFirebaseClients();
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  const profile = await getUserProfile(credential.user.uid);

  if (isClientProfile(profile)) {
    await signOut(auth);
    throw buildHelperBlockedError();
  }

  return normalizeHelperUser(credential.user, profile || {});
}

export async function signupWithEmail({ name, email, password }) {
  const { auth } = getFirebaseClients();
  const fullName = String(name || '').trim();
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(credential.user, { displayName: fullName });
  const profile = await upsertHelperProfile({
    uid: credential.user.uid,
    email: credential.user.email,
    fullName,
  });

  return normalizeHelperUser(credential.user, profile || {});
}

export async function logoutUser() {
  await stopActiveJobTrackingForSignOut().catch(() => null);
  const { auth } = getFirebaseClients();
  await signOut(auth);
}

export async function deleteAccount(uid) {
  const { auth } = getFirebaseClients();
  const authUser = auth.currentUser;

  if (!authUser) {
    throw new Error('No active helper session found.');
  }

  await deleteUserProfile(uid);
  await deleteUser(authUser);
}
