import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, firebaseConfigured } from '../firebase/config';
import {
  ensureCustomerProfile,
  requestWhatsAppAuthCode,
  signInWithEmail,
  signInWithGoogle,
  signOutCustomer,
  signUpWithEmail,
  updateCustomerProfile,
  verifyWhatsAppAuthCode,
} from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(Boolean(firebaseConfigured));
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (!firebaseConfigured || !auth) {
      setInitializing(false);
      return undefined;
    }
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setInitializing(false);
        return;
      }
      try {
        const profile = await ensureCustomerProfile(firebaseUser);
        const token = await firebaseUser.getIdTokenResult();
        setUser({
          firebaseUser,
          profile,
          whatsappAuthenticated: token.claims.whatsappAuthenticated === true
            || Boolean(profile?.whatsappVerifiedAt && profile?.whatsappPhoneNumber),
        });
        setAuthError('');
      } catch (error) {
        setUser(null);
        setAuthError(error.message || 'Unable to load your account.');
      } finally {
        setInitializing(false);
      }
    });
  }, []);

  const value = useMemo(() => ({
    authError,
    clearAuthError: () => setAuthError(''),
    initializing,
    user,
    signInWithEmail,
    signInWithGoogle,
    signUpWithEmail,
    requestWhatsAppAuthCode,
    verifyWhatsAppAuthCode,
    signOut: signOutCustomer,
    updateProfile: async (updates) => {
      const profile = await updateCustomerProfile(user?.firebaseUser?.uid, updates);
      setUser((current) => current ? { ...current, profile } : current);
      return profile;
    },
  }), [authError, initializing, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be inside AuthProvider.');
  return context;
}
