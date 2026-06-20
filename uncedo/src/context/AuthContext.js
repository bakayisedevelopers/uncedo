import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { deleteAccount, loginWithEmail, logoutUser, signupWithEmail, subscribeToAuthChanges } from '../services/authService';
import { logError } from '../services/logger';
import { subscribeToUserProfile } from '../services/userService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges(
      (nextUser) => {
        setUser(nextUser);
        setInitializing(false);
      },
      (error) => {
        logError('AuthContext', error);
        setAuthError(error.message);
        setInitializing(false);
      },
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user?.uid) return undefined;

    return subscribeToUserProfile(
      user.uid,
      (profile) => {
        if (profile) {
          setUser((prev) => ({ ...prev, ...profile }));
        }
      },
      (error) => logError('AuthContext.profile', error),
    );
  }, [user?.uid]);

  const value = useMemo(() => ({
    authError,
    initializing,
    user,
    login: loginWithEmail,
    logout: logoutUser,
    signup: signupWithEmail,
    deleteAccount,
    setUser,
  }), [authError, initializing, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
