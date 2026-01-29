import { useState, useEffect } from 'react';
import { User, Unsubscribe } from '../models/types';
import AuthenticationModule from '../services/AuthenticationModule';

/**
 * useAuth Hook
 *
 * Provides authentication state management for components.
 * Subscribes to Firebase auth state changes and user data updates.
 *
 * Usage:
 *   const { user, familyGroupId, loading } = useAuth();
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [familyGroupId, setFamilyGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe: Unsubscribe = AuthenticationModule.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setFamilyGroupId(currentUser?.familyGroupId ?? null);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return {
    user,
    familyGroupId,
    loading,
    isAuthenticated: !!user,
    hasFamilyGroup: !!familyGroupId,
  };
}

export default useAuth;
