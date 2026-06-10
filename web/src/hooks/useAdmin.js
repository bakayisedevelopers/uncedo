import { useEffect, useMemo, useState } from 'react';
import { useAuth } from './useAuth';
import { isEmailAllowlistedAdmin, isUserAdmin } from '../utils/admin';
import { getUserProfile } from '../services/userService';

export function useAdmin() {
  const { user, isInitializing } = useAuth();
  const [profileAdminFlag, setProfileAdminFlag] = useState(null);
  const [isCheckingProfile, setIsCheckingProfile] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkProfileAdminFlag() {
      if (!user?.uid || isEmailAllowlistedAdmin(user?.email) || user?.isAdmin === true) {
        setProfileAdminFlag(null);
        setIsCheckingProfile(false);
        return;
      }

      setIsCheckingProfile(true);
      try {
        const profile = await getUserProfile(user.uid);
        if (!cancelled) {
          setProfileAdminFlag(profile?.isAdmin === true);
        }
      } catch (_error) {
        if (!cancelled) {
          setProfileAdminFlag(false);
        }
      } finally {
        if (!cancelled) {
          setIsCheckingProfile(false);
        }
      }
    }

    checkProfileAdminFlag();

    return () => {
      cancelled = true;
    };
  }, [user?.email, user?.isAdmin, user?.uid]);

  const isAdmin = useMemo(() => {
    if (isUserAdmin(user)) return true;
    return profileAdminFlag === true;
  }, [profileAdminFlag, user]);

  return {
    isAdmin,
    isLoadingAdmin: isInitializing || isCheckingProfile,
  };
}
