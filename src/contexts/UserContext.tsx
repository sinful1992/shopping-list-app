import { createContext, useContext } from 'react';
import { User } from '../models/types';

/**
 * UserContext
 * Distributes the authenticated user held by App (from
 * AuthenticationModule.onAuthStateChanged, which keeps it live via an
 * onValue listener on /users/<uid>). Screens should read the user from here
 * instead of re-fetching with getCurrentUser(); services (non-React) keep
 * calling AuthenticationModule.getCurrentUser().
 */
export const UserContext = createContext<User | null>(null);

export const useUser = (): User | null => useContext(UserContext);
