import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DARK_THEME, LIGHT_THEME, Theme } from '../styles/theme';

const STORAGE_KEY = 'theme_preference';
type ThemePreference = 'light' | 'dark' | null;

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>(null);

  // Load saved preference after mount; system scheme is the immediate default so
  // children always render on the first pass (no null/blank frame).
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(val => { setPreference(val as ThemePreference); })
      .catch(() => {});
  }, []);

  const isDark = preference !== null ? preference === 'dark' : systemScheme !== 'light';
  const theme = isDark ? DARK_THEME : LIGHT_THEME;

  const toggle = async () => {
    const next: ThemePreference = isDark ? 'light' : 'dark';
    setPreference(next);
    await AsyncStorage.setItem(STORAGE_KEY, next);
  };

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
