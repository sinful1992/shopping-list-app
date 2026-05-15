import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DARK_THEME, LIGHT_THEME, Theme } from '../styles/theme';

const STORAGE_KEY = 'theme_preference';
type ThemePreference = 'light' | 'dark' | null;

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(val => { setPreference(val as ThemePreference); })
      .catch(() => {});
  }, []);

  const isDark = preference !== null ? preference === 'dark' : systemScheme !== 'light';
  const theme = isDark ? DARK_THEME : LIGHT_THEME;
  const themeMode: ThemeMode = preference ?? 'system';

  const setThemeMode = async (mode: ThemeMode) => {
    if (mode === 'system') {
      setPreference(null);
      await AsyncStorage.removeItem(STORAGE_KEY);
    } else {
      setPreference(mode);
      await AsyncStorage.setItem(STORAGE_KEY, mode);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, isDark, themeMode, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
