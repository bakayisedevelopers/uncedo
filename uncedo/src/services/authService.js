import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { getFirebaseClients } from '../firebase/config';
import { deleteUserProfile, getUserProfile, upsertStudentProfile } from './userService';

export const TUTOR_LOGIN_BLOCKED_CODE = 'TUTOR_LOGIN_BLOCKED';

function buildTutorBlockedError() {
  const error = new Error('Providers are not allowed to log in on this app. Please use the Uncedo Helpers app.');
  error.code = TUTOR_LOGIN_BLOCKED_CODE;
  return error;
}

function isTutorProfile(profile = {}) {
  const role = String(profile?.role || '').toLowerCase();
  const activeRole = String(profile?.activeRole || '').toLowerCase();
  const roles = Array.isArray(profile?.roles)
    ? profile.roles.map((nextRole) => String(nextRole || '').toLowerCase())
    : [];

  return role === 'tutor' || activeRole === 'tutor' || roles.includes('tutor');
}

function normalizeStudentUser(firebaseUser, profile = {}) {
  if (!firebaseUser) return null;

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    emailVerified: Boolean(firebaseUser.emailVerified),
    displayName: profile.displayName || firebaseUser.displayName || '',
    fullName: profile.fullName || profile.displayName || firebaseUser.displayName || '',
    role: 'student',
    activeRole: 'student',
    roles: ['student'],
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
      if (isTutorProfile(profile)) {
        await signOut(auth);
        onError?.(buildTutorBlockedError());
        callback(null);
        return;
      }
      callback(normalizeStudentUser(firebaseUser, profile || {}));
    } catch (error) {
      onError?.(error);
      callback(normalizeStudentUser(firebaseUser));
    }
  }, onError);
}

export async function loginWithEmail({ email, password }) {
  const { auth } = getFirebaseClients();
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  const profile = await getUserProfile(credential.user.uid);
  if (isTutorProfile(profile)) {
    await signOut(auth);
    throw buildTutorBlockedError();
  }
  return normalizeStudentUser(credential.user, profile || {});
}

export async function signupWithEmail({ name, email, password }) {
  const { auth } = getFirebaseClients();
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(credential.user, { displayName: name.trim() });
  const profile = await upsertStudentProfile({
    uid: credential.user.uid,
    email: credential.user.email,
    displayName: name.trim(),
  });

  return normalizeStudentUser(credential.user, profile || {});
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
