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
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      setPreference(val as ThemePreference);
      setIsLoading(false);
    });
  }, []);

  const isDark = preference !== null ? preference === 'dark' : systemScheme !== 'light';
  const theme = isDark ? DARK_THEME : LIGHT_THEME;

  const toggle = async () => {
    const next: ThemePreference = isDark ? 'light' : 'dark';
    setPreference(next);
    await AsyncStorage.setItem(STORAGE_KEY, next);
  };

  if (isLoading) return null;

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggle, isLoading }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
