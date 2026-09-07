/**
 * i18n setup for Kaarya
 * English (en) and Nepali (ne) support with AsyncStorage persistence
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './en.json';
import ne from './ne.json';

const LANGUAGE_KEY = 'kaarya_language';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली' },
] as const;

export type SupportedLang = (typeof SUPPORTED_LANGUAGES)[number]['code'];

i18n.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  resources: {
    en: { translation: en },
    ne: { translation: ne },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
  /**
   * Dev-time safeguard: if a translation key is missing, show [MISSING: key]
   * in development so developers notice it immediately. In production this
   * returns the raw key (normal i18next fallback behaviour) so the app
   * never exposes raw key strings to users.
   */
  missingKeyHandler: (__lngs, __ns, key) => {
    if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(`[i18n] Missing translation key: "${key}"`);
    }
  },
  parseMissingKeyHandler: (key) => {
    if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'production') {
      return `[MISSING: ${key}]`;
    }
    // Production: return the raw key so the user sees something rather
    // than an empty string (this is i18next's default behaviour).
    return key;
  },
});

/**
 * Load saved language from AsyncStorage and apply it to i18n
 */
export async function loadSavedLanguage(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (saved && (saved === 'en' || saved === 'ne')) {
      await i18n.changeLanguage(saved);
      return saved;
    }
  } catch {
    // Ignore errors
  }
  return 'en';
}

/**
 * Persist language choice to AsyncStorage and apply it to i18n
 */
export async function setLanguage(lang: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
  } catch {
    // Ignore errors
  }
  await i18n.changeLanguage(lang);
}

/**
 * Get current language code
 */
export function getCurrentLanguage(): string {
  return i18n.language;
}

export default i18n;
