import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { isUserAdmin } from '../utils/admin';

export function useAdmin() {
  const { user, isInitializing } = useAuth();
  const [adminClaims, setAdminClaims] = useState(null);
  const [isCheckingClaims, setIsCheckingClaims] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkTrustedAdminClaims() {
      if (!user?.uid) {
        setAdminClaims(null);
        setIsCheckingClaims(false);
        return;
      }

      setIsCheckingClaims(true);
      try {
        const tokenResult = await user.getIdTokenResult(true);
        if (!cancelled) {
          setAdminClaims(tokenResult?.claims || {});
        }
      } catch (_error) {
        if (!cancelled) {
          setAdminClaims({});
        }
      } finally {
        if (!cancelled) {
          setIsCheckingClaims(false);
        }
      }
    }

    checkTrustedAdminClaims();

    return () => {
      cancelled = true;
    };
  }, [user?.email, user?.emailVerified, user?.uid]);

  const isAdmin = isUserAdmin(user, adminClaims || {});

  return {
    isAdmin,
    isLoadingAdmin: isInitializing || isCheckingClaims,
  };
}
