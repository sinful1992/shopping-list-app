/**
 * Internationalization (i18n) Configuration
 * Provides localization support for the app
 */

import { I18n } from 'i18n-js';
import * as RNLocalize from 'react-native-localize';

// Import translations
import en from './translations/en';

// Create i18n instance
const i18n = new I18n({
  en,
});

// Set default locale
i18n.defaultLocale = 'en';

// Enable fallback to default locale
i18n.enableFallback = true;

/**
 * Set the locale based on the device's language settings
 */
export const setI18nConfig = (): void => {
  const locales = RNLocalize.getLocales();

  if (locales && locales.length > 0) {
    // Get the best available language
    const bestLanguage = locales[0].languageCode;

    // Set locale if we have translations for it, otherwise use default
    i18n.locale = i18n.translations[bestLanguage] ? bestLanguage : 'en';
  } else {
    i18n.locale = 'en';
  }
};

/**
 * Get the current locale
 */
export const getCurrentLocale = (): string => {
  return i18n.locale;
};

/**
 * Change the locale manually
 */
export const setLocale = (locale: string): void => {
  if (i18n.translations[locale]) {
    i18n.locale = locale;
  }
};

/**
 * Translate a key
 * Usage: t('common.loading') or t('items.addItem')
 */
export const t = (key: string, options?: object): string => {
  return i18n.t(key, options);
};

// Initialize locale on import
setI18nConfig();

export default i18n;
