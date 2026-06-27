import { createContext, useEffect, useMemo, useState } from 'react';
import { getRememberMePreference, loginWithEmail, logoutUser, setRememberMePreference, subscribeToAuthChanges } from '../services/authService';

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
      logout: logoutUser,
      setRememberMePreference: (nextValue) => {
        const normalized = Boolean(nextValue);
        setRememberMe(normalized);
        setRememberMePreference(normalized);
      },
      setUser,
    }),
    [isInitializing, rememberMe, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
