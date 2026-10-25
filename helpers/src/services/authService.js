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
profile?.agreement
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

function normalizeHelperUser(firebaseUser, profile = {}, whatsappAuthenticated = false) {
  if (!firebaseUser) return null;

  return {
    ...profile,
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    emailVerified: Boolean(firebaseUser.emailVerified),
    displayName: profile.displayName || firebaseUser.displayName || '',
    fullName: profile.fullName || profile.displayName || firebaseUser.displayName || '',
    phoneNumber: profile.phoneNumber || (whatsappAuthenticated ? firebaseUser.phoneNumber || '' : ''),
    whatsappAuthenticated: Boolean(whatsappAuthenticated),
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
      const token = await firebaseUser.getIdTokenResult();
      const whatsappAuthenticated = token.claims.whatsappAuthenticated === true
        || Boolean(profile?.whatsappVerifiedAt && profile?.whatsappPhoneNumber);
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
        callback(normalizeHelperUser(firebaseUser, repairedProfile || {}, whatsappAuthenticated));
        return;
      }

      callback(normalizeHelperUser(firebaseUser, profile || {}, whatsappAuthenticated));
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

export async function loginWithGoogle() {
  if (typeof window === 'undefined') {
    throw new Error('Google sign-in is available in the web version of Uncedo Helpers.');
  }
  const { auth } = getFirebaseClients();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const credential = await signInWithPopup(auth, provider);
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
        traceLabel: 'helpers:auth:loginWithGoogle:seedProfile',
      });
  return normalizeHelperUser(credential.user, syncedProfile || {});
}

export async function startWhatsAppAuthChallenge({ phoneNumber, mode = 'login', name = '', email = '' }) {
  if (process.env.EXPO_PUBLIC_WHATSAPP_AUTH_ENABLED !== 'true') {
    throw new Error('WhatsApp sign-in is awaiting Meta authentication configuration.');
  }
  const { functions, authProviders } = getFirebaseClients();
  const call = authProviders.httpsCallable(functions, 'startWhatsAppAuthChallenge');
  const result = await call({ phoneNumber, mode, role: 'helper', name, email });
  return result.data;
}

export async function completeWhatsAppAuthChallenge({ challengeId, code }) {
  if (process.env.EXPO_PUBLIC_WHATSAPP_AUTH_ENABLED !== 'true') {
    throw new Error('WhatsApp sign-in is awaiting Meta authentication configuration.');
  }
  const { auth, functions, authProviders } = getFirebaseClients();
  const call = authProviders.httpsCallable(functions, 'completeWhatsAppAuthChallenge');
  const result = await call({ challengeId, code });
  const credential = await authProviders.signInWithCustomToken(auth, result.data.customToken);
  const profile = await getUserProfile(credential.user.uid);
  if (shouldBlockAsCustomer(profile)) {
    await signOut(auth);
    throw buildHelperBlockedError();
  }
  const token = await credential.user.getIdTokenResult();
  if (token.claims.whatsappAuthenticated === true) {
    const linkCall = authProviders.httpsCallable(functions, 'linkWhatsAppIdentity');
    await linkCall({});
  }
  return normalizeHelperUser(
    credential.user,
    profile || {},
    token.claims.whatsappAuthenticated === true || Boolean(profile?.whatsappVerifiedAt && profile?.whatsappPhoneNumber),
  );
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
