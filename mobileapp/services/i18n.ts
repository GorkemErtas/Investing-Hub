import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import {
  commonEn,
  commonTr,
  defaultLocale,
  languageStorageKey,
  validateLocale,
  errorKey,
  type Locale,
} from "@investing-hub/shared/localization";
import AsyncStorage from "@react-native-async-storage/async-storage";
import en from "../locales/en.json";
import tr from "../locales/tr.json";
export const i18n = createInstance();
void i18n.use(initReactI18next).init({
  lng: defaultLocale,
  fallbackLng: defaultLocale,
  supportedLngs: ["tr-TR", "en-US"],
  load: "currentOnly",
  resources: {
    "tr-TR": { common: commonTr, mobile: tr },
    "en-US": { common: commonEn, mobile: en },
  },
  defaultNS: "mobile",
  fallbackNS: "common",
  ns: ["mobile", "common"],
  initAsync: false,
  interpolation: { escapeValue: false },
  returnNull: false,
  react: { useSuspense: false },
  parseMissingKeyHandler: (_key, value) =>
    value ??
    (i18n.language === "en-US"
      ? commonEn.errors.SERVICE_ERROR
      : commonTr.errors.SERVICE_ERROR),
});
export const userError = (error: unknown) =>
  error instanceof Error && i18n.exists(error.message)
    ? error.message
    : errorKey(error);
export async function loadLanguage() {
  const value = await AsyncStorage.getItem(languageStorageKey);
  await i18n.changeLanguage(
    value === null ? defaultLocale : validateLocale(value),
  );
}
export async function changeLanguage(locale: Locale) {
  await i18n.changeLanguage(locale);
  await AsyncStorage.setItem(languageStorageKey, locale);
}
