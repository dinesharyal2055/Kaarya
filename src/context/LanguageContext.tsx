/**
 * LanguageContext — global language state for Kaarya
 * Manages i18n language switching with AsyncStorage persistence
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { loadSavedLanguage, setLanguage as persistAndSetLanguage, SUPPORTED_LANGUAGES } from '@/i18n';

interface LanguageContextValue {
  language: string;
  setLanguage: (lang: string) => Promise<void>;
  isLoading: boolean;
  languages: readonly { code: string; name: string; nativeName: string }[];
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLangState] = useState('en');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSavedLanguage().then((saved) => {
      setLangState(saved);
      setIsLoading(false);
    });
  }, []);

  const setLanguage = useCallback(async (lang: string) => {
    await persistAndSetLanguage(lang);
    setLangState(lang);
  }, []);

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        isLoading,
        languages: SUPPORTED_LANGUAGES,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside <LanguageProvider>');
  return ctx;
}
