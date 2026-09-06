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
