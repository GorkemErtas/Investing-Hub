import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  commonEn,
  commonTr,
  defaultLocale,
  languageStorageKey,
  validateLocale,
  errorKey,
  type Locale,
} from '@investing-hub/shared/localization';
import { readStored, writeStored } from './storageAdapter';
import en from '../locales/en.json';
import tr from '../locales/tr.json';

const storage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
};
const saved = readStored(storage, languageStorageKey, defaultLocale, validateLocale);
export const initialLanguageWarning = saved.warning;
export const i18n = createInstance();
void i18n.use(initReactI18next).init({
  lng: saved.value,
  fallbackLng: defaultLocale,
  supportedLngs: ['tr-TR', 'en-US'],
  load: 'currentOnly',
  resources: { 'tr-TR': { common: commonTr, web: tr }, 'en-US': { common: commonEn, web: en } },
  defaultNS: 'web',
  fallbackNS: 'common',
  ns: ['web', 'common'],
  initAsync: false,
  interpolation: { escapeValue: false },
  returnNull: false,
  react: { useSuspense: false },
  parseMissingKeyHandler: (_key, value) =>
    value ??
    (i18n.language === 'en-US' ? commonEn.errors.SERVICE_ERROR : commonTr.errors.SERVICE_ERROR),
});
document.documentElement.lang = saved.value;
export const userError = (error: unknown) =>
  error instanceof Error && i18n.exists(error.message) ? error.message : errorKey(error);
export function changeLanguage(locale: Locale) {
  const result = writeStored(storage, languageStorageKey, locale, validateLocale);
  void i18n.changeLanguage(locale);
  document.documentElement.lang = locale;
  return result.warning ? 'common:languageSaved' : '';
}
