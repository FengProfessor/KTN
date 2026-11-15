export type AppLanguage = 'vi' | 'en';

export const APP_LANGUAGE_STORAGE_KEY = 'ktn_app_lang';

export function syncDocumentLang(lang: AppLanguage): void {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = lang;
  }
}

export function readInitialLanguage(): AppLanguage {
  let lang: AppLanguage = 'vi';
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
      if (saved === 'en') {
        lang = 'en';
      }
    }
  } catch {
    lang = 'vi';
  }
  syncDocumentLang(lang);
  return lang;
}

export function persistLanguage(lang: AppLanguage): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, lang);
    }
  } catch {
    // Ignore storage errors
  }
  syncDocumentLang(lang);
}
