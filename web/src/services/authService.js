import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, firebaseConfigured, whatsappAuthEnabled } from '../firebase/config';

function requireFirebase() {
  if (!firebaseConfigured || !auth || !db) {
    throw new Error('Customer sign-in is not configured yet. Please contact Uncedo support.');
  }
}

function hasHelperRole(profile = {}) {
  const roles = [profile.role, profile.activeRole, ...(Array.isArray(profile.roles) ? profile.roles : [])]
    .map((value) => String(value || '').toLowerCase());
  return roles.some((role) => ['helper', 'provider', 'tutor'].includes(role));
}

function requireE164PhoneNumber(value) {
  const phoneNumber = String(value || '').replace(/[\s().-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
    throw new Error('Enter your WhatsApp number with its international country code, for example +27 71 234 5678.');
  }
  return phoneNumber;
}

function withSignupStage(error, stage) {
  const message = String(error?.message || 'The account setup step failed.');
  const wrapped = new Error(message);
  wrapped.code = error?.code || 'setup-failed';
  wrapped.setupStage = stage;
  wrapped.cause = error;
  return wrapped;
}

async function saveCustomerContactNumber(phoneNumber) {
  const safePhone = requireE164PhoneNumber(phoneNumber);
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  try {
    const result = await httpsCallable(getFunctions(auth.app, 'us-central1'), 'setWhatsAppContactNumber')({
      role: 'customer',
      phoneNumber: safePhone,
    });
    return result.data || {};
  } catch (error) {
    throw withSignupStage(error, 'whatsapp_number_reservation');
  }
}

export async function ensureCustomerProfile(firebaseUser) {
  requireFirebase();
  const userRef = doc(db, 'users', firebaseUser.uid);
  let existing;
  try {
    existing = await getDoc(userRef);
  } catch (error) {
    throw withSignupStage(error, 'customer_profile_read');
  }
  const profile = existing.exists() ? existing.data() : {};
  if (hasHelperRole(profile)) {
    await signOut(auth);
    throw new Error('This is a helper account. Please sign in through Uncedo Helpers.');
  }

  const displayName = String(profile.fullName || profile.displayName || firebaseUser.displayName || '').trim();
  const defaults = {
    uid: firebaseUser.uid,
    email: firebaseUser.email || '',
    fullName: displayName,
    displayName,
    role: 'customer',
    activeRole: 'customer',
    roles: ['customer'],
    phoneNumber: '',
    paymentMethods: [],
    customerProfile: {
      accountType: '',
      customerType: '',
      serviceAddress: '',
      discoverySource: '',
      preferredServiceCategories: [],
      businessName: '',
      businessEmail: '',
      businessCategory: '',
    },
  };
  try {
    await setDoc(userRef, {
      ...defaults,
      ...profile,
      uid: firebaseUser.uid,
      email: firebaseUser.email || profile.email || '',
      fullName: profile.fullName || defaults.fullName,
      displayName: profile.displayName || defaults.displayName,
      role: 'customer',
      activeRole: 'customer',
      roles: ['customer'],
      customerProfile: { ...defaults.customerProfile, ...(profile.customerProfile || {}) },
      createdAt: existing.exists() ? profile.createdAt || serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    throw withSignupStage(error, 'customer_profile_write');
  }
  let saved;
  try {
    saved = await getDoc(userRef);
  } catch (error) {
    throw withSignupStage(error, 'customer_profile_verify');
  }
  return { uid: firebaseUser.uid, ...saved.data() };
}

export async function signInWithEmail({ email, password }) {
  requireFirebase();
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  const profile = await ensureCustomerProfile(credential.user);
  return { firebaseUser: credential.user, profile };
}

export async function signUpWithEmail({ name, email, password, phoneNumber }) {
  requireFirebase();
  const safePhone = requireE164PhoneNumber(phoneNumber);
  const normalizedEmail = email.trim();
  let firebaseUser;
  try {
    const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
    firebaseUser = credential.user;
  } catch (error) {
    // Account creation and Firestore profile creation are separate operations.
    // If Auth succeeded but profile setup failed, retrying signup must resume the
    // signed-in account instead of leaving the user stuck at email-already-in-use.
    const currentUser = auth.currentUser;
    const sameAuthenticatedEmail = currentUser
      && String(currentUser.email || '').trim().toLowerCase() === normalizedEmail.toLowerCase();
    if (error?.code !== 'auth/email-already-in-use' || !sameAuthenticatedEmail) throw error;
    await reauthenticateWithCredential(currentUser, EmailAuthProvider.credential(normalizedEmail, password));
    firebaseUser = currentUser;
  }
  await updateProfile(firebaseUser, { displayName: name.trim() });
  await ensureCustomerProfile(firebaseUser);
  await saveCustomerContactNumber(safePhone);
  const profile = await ensureCustomerProfile(firebaseUser);
  return { firebaseUser, profile };
}

export async function signInWithGoogle({ phoneNumber = '' } = {}) {
  requireFirebase();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const credential = await signInWithPopup(auth, provider);
  await ensureCustomerProfile(credential.user);
  if (String(phoneNumber || '').trim()) await saveCustomerContactNumber(phoneNumber);
  const profile = await ensureCustomerProfile(credential.user);
  return { firebaseUser: credential.user, profile };
}

export async function requestWhatsAppAuthCode({ phoneNumber, mode = 'login', name = '', email = '' }) {
  requireFirebase();
  if (!whatsappAuthEnabled) throw new Error('WhatsApp sign-in will be available after Uncedo finishes configuring its verified WhatsApp authentication service.');
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const callable = httpsCallable(getFunctions(auth.app, 'us-central1'), 'startWhatsAppAuthChallenge');
  const result = await callable({ phoneNumber, mode, role: 'customer', name, email });
  return result.data;
}

export async function verifyWhatsAppAuthCode({ challengeId, code }) {
  requireFirebase();
  if (!whatsappAuthEnabled) throw new Error('WhatsApp sign-in is not configured yet.');
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const callable = httpsCallable(getFunctions(auth.app, 'us-central1'), 'completeWhatsAppAuthChallenge');
  const result = await callable({ challengeId, code });
  const credential = await signInWithCustomToken(auth, result.data.customToken);
  const profile = await ensureCustomerProfile(credential.user);
  await httpsCallable(getFunctions(auth.app, 'us-central1'), 'linkWhatsAppIdentity')({});
  const linkedProfile = await ensureCustomerProfile(credential.user);
  return { firebaseUser: credential.user, profile: linkedProfile || profile };
}

export async function completeWhatsAppSignupLink({ token }) {
  requireFirebase();
  const safeToken = String(token || '').trim();
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(safeToken)) {
    throw new Error('This WhatsApp account link is invalid or expired. Return to the Uncedo chat and request a fresh link.');
  }
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  try {
    const callable = httpsCallable(getFunctions(auth.app, 'us-central1'), 'completeWhatsAppSignupLink');
    const result = await callable({ token: safeToken });
    return result.data || {};
  } catch (error) {
    throw withSignupStage(error, 'whatsapp_identity_link');
  }
}

export async function completeWhatsAppAccountLink({ token }) {
  requireFirebase();
  const safeToken = String(token || '').trim();
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(safeToken)) {
    throw new Error('This WhatsApp account link is invalid or expired. Return to the Uncedo chat and request a fresh link.');
  }
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const callable = httpsCallable(getFunctions(auth.app, 'us-central1'), 'completeWhatsAppAccountLink');
  const result = await callable({ token: safeToken });
  return result.data || {};
}

export async function updateCustomerProfile(uid, updates) {
  requireFirebase();
  const safeUpdates = { ...updates };
  if (Object.hasOwn(safeUpdates, 'phoneNumber')) {
    await saveCustomerContactNumber(safeUpdates.phoneNumber);
    delete safeUpdates.phoneNumber;
  }
  const userRef = doc(db, 'users', uid);
  if (Object.keys(safeUpdates).length) await setDoc(userRef, { ...safeUpdates, updatedAt: serverTimestamp() }, { merge: true });
  const saved = await getDoc(userRef);
  return { uid, ...saved.data() };
}

export async function signOutCustomer() {
  requireFirebase();
  await signOut(auth);
}
