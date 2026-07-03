import { useEffect, useState } from 'react';
import { subscribeToUserProfile } from '../services/userService';

export function useLiveUserProfile(userId) {
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsub = subscribeToUserProfile(userId, (nextProfile) => {
      setProfile(nextProfile);
      setIsLoading(false);
    });

    return () => unsub?.();
  }, [userId]);

  return { profile, isLoading };
}
