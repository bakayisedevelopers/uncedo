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
  const error = new Error('Customer accounts are not allowed in this app. Please use the Uncedo customer app.');
  error.code = HELPER_LOGIN_BLOCKED_CODE;
  return error;
}

function normalizeRole(value) {
  return String(value || '').trim().toLowerCase();
}

function collectRoles(profile = {}) {
  return new Set([
    normalizeRole(profile?.role),
    normalizeRole(profile?.activeRole),
    ...(Array.isArray(profile?.roles) ? profile.roles.map(normalizeRole) : []),
  ].filter(Boolean));
}

function hasHelperSignals(profile = {}) {
  return Boolean(
    (Array.isArray(profile?.services) && profile.services.length)
    || profile?.agreement
    || profile?.payout
    || normalizeRole(profile?.providerType)
    || String(profile?.businessName || '').trim()
    || normalizeRole(profile?.verificationStatus)
    || normalizeRole(profile?.onlineStatus)
    || profile?.locationSharingEnabled !== undefined
  );
}

function shouldTreatAsHelper(profile = {}) {
  const roles = collectRoles(profile);
  return roles.has('helper') || roles.has('provider') || roles.has('tutor') || hasHelperSignals(profile);
}

function shouldBlockAsCustomer(profile = {}) {
  const roles = collectRoles(profile);
  const hasCustomerRole = roles.has('customer') || roles.has('student');
  const hasCustomerSignals = Boolean(
    profile?.wallet
    || Array.isArray(profile?.paymentMethods)
    || profile?.freeMinutesRemaining !== undefined
    || profile?.customerProfile
    || profile?.studentProfile
  );

  return !shouldTreatAsHelper(profile) && hasCustomerSignals && hasCustomerRole;
}

function normalizeHelperUser(firebaseUser, profile = {}) {
  if (!firebaseUser) return null;

  return {
    ...profile,
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    emailVerified: Boolean(firebaseUser.emailVerified),
    displayName: profile.displayName || firebaseUser.displayName || '',
    fullName: profile.fullName || profile.displayName || firebaseUser.displayName || '',
    role: 'helper',
    activeRole: 'helper',
    roles: ['helper'],
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
      if (shouldBlockAsCustomer(profile)) {
        await signOut(auth);
        onError?.(buildHelperBlockedError());
        callback(null);
        return;
      }

      if (!shouldTreatAsHelper(profile || {})) {
        const repairedProfile = await upsertHelperProfile({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          fullName: firebaseUser.displayName || profile?.fullName || profile?.displayName || '',
          traceLabel: 'helpers:auth:subscribeToAuthChanges:repairProfile',
        });
        callback(normalizeHelperUser(firebaseUser, repairedProfile || {}));
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

  if (shouldBlockAsCustomer(profile)) {
    await signOut(auth);
    throw buildHelperBlockedError();
  }

  const syncedProfile = shouldTreatAsHelper(profile || {})
    ? profile
    : await upsertHelperProfile({
        uid: credential.user.uid,
        email: credential.user.email,
        fullName: credential.user.displayName || profile?.fullName || profile?.displayName || '',
        traceLabel: 'helpers:auth:loginWithEmail:seedProfile',
      });

  return normalizeHelperUser(credential.user, syncedProfile || {});
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
    traceLabel: 'helpers:auth:signupWithEmail:createProfile',
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
