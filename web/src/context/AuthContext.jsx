import { createContext, useEffect, useMemo, useState } from 'react';
import {
  deleteAccount,
  getRememberMePreference,
  loginWithEmail,
  logoutUser,
  setRememberMePreference,
  signupWithEmail,
  subscribeToAuthChanges,
} from '../services/authService';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [rememberMe, setRememberMe] = useState(() => getRememberMePreference());

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((nextUser) => {
      setUser(nextUser);
      setIsInitializing(false);
    });

    return () => unsubscribe?.();
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isInitializing,
      rememberMe,
      login: loginWithEmail,
      signup: signupWithEmail,
      logout: logoutUser,
      deleteAccount,
      setUser,
      setRememberMePreference: (nextValue) => {
        const normalizedValue = Boolean(nextValue);
        setRememberMe(normalizedValue);
        setRememberMePreference(normalizedValue);
      },
    }),
    [user, isInitializing, rememberMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
