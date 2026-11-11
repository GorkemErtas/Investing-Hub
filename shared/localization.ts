export const locales = ["tr-TR", "en-US"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "tr-TR";
export const languageStorageKey = "ih:language:v1";
export function localeValue(value: unknown): Locale {
  return value === "en-US" ? "en-US" : defaultLocale;
}
export function validateLocale(value: unknown): Locale {
  if (!locales.includes(value as Locale)) throw new Error("Invalid locale");
  return value as Locale;
}
export function formatNumber(
  value: number | null | undefined,
  locale: Locale,
  options: Intl.NumberFormatOptions = {},
) {
  return value == null || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat(locale, options).format(value);
}
export function formatDate(
  value: string | number | Date,
  locale: Locale,
  dateOnly = false,
) {
  return new Intl.DateTimeFormat(
    locale,
    dateOnly
      ? { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }
      : { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" },
  ).format(new Date(value));
}
// Editable decimals stay ungrouped; API/Decimal values always use an ASCII decimal point.
export const decimalInput = (value: string, locale: Locale) =>
  locale === "tr-TR" ? value.replace(",", ".") : value;
export const decimalDisplay = (value: string | number, locale: Locale) =>
  locale === "tr-TR" ? String(value).replace(".", ",") : String(value);
export function errorKey(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return Object.hasOwn(commonEn.errors, error.code)
      ? `errors.${error.code}`
      : "errors.SERVICE_ERROR";
  }
  return error && typeof error === "object" && "issues" in error
    ? "errors.INVALID_REQUEST"
    : "errors.SERVICE_ERROR";
}
export const commonEn = {
  language: "Language",
  languageSaved:
    "Language preference could not be saved. It applies to this session.",
  nav: {
    overview: "Overview",
    portfolio: "Portfolio",
    predictions: "Price Predictions",
    learning: "Learning Hub",
    settings: "Settings",
    account: "Account",
  },
  action: {
    save: "Save",
    cancel: "Cancel",
    back: "Back",
    close: "Close",
    next: "Next",
    previous: "Previous",
    retry: "Try again",
    remove: "Remove",
    edit: "Edit",
    buy: "Buy",
    sell: "Sell",
    signIn: "Sign In",
    signUp: "Sign Up",
    logOut: "Log Out",
  },
  chart: {
    interval: {
      "15m": "15m",
      "1h": "1h",
      "4h": "4h",
      "1d": "1d",
      "1w": "1w",
      "1M": "1mo",
    },
    open: "Open",
    high: "High",
    low: "Low",
    close: "Close",
    volume: "Volume",
    day: "Day",
    hour: "Hour",
    week: "Week",
    month: "Month",
    minutes: "15 minutes",
  },
  prediction: {
    experimental: "Experimental prediction",
    unavailable: "Prediction unavailable",
    targetDate: "Target date (UTC)",
    generated: "Generated {{date}} UTC",
    note: "Experimental predictions can be inaccurate.",
    card: "{{coin}} price prediction",
  },
  storage: {
    read: "Saved data could not be read. Your original data is preserved.",
    write: "Storage is unavailable. Changes apply only to this session.",
  },
  errors: {
    SERVICE_ERROR: "The service is unavailable. Please try again.",
    NETWORK_ERROR: "Connection failed. Check your connection and try again.",
    INVALID_RESPONSE: "The service returned invalid data.",
    INVALID_REQUEST: "Check the fields and use valid values.",
    INVALID_BODY: "The request is invalid.",
    RATE_LIMITED: "Too many requests. Please wait a minute.",
    AUTH_RATE_LIMITED: "Too many account requests. Please try again later.",
    UNAUTHENTICATED: "Please sign in.",
    SESSION_EXPIRED: "Your session has expired. Please sign in again.",
    INVALID_CREDENTIALS: "Email or password is incorrect.",
    ACCOUNTS_DISABLED:
      "Account services are unavailable. Market data is still accessible.",
    ACCOUNTS_UNAVAILABLE:
      "Account storage is unavailable. Please try again later.",
    INVALID_PASSWORD:
      "Use a password of 12 to 72 characters (at most 72 UTF-8 bytes).",
    INVALID_VERIFICATION: "The verification code is invalid or expired.",
    VERIFICATION_COOLDOWN: "Wait a minute before requesting another code.",
    REGISTRATION_BUSY: "Registration is busy. Please try again later.",
    REGISTRATION_DISABLED: "Registration is currently unavailable.",
    EMAIL_UNAVAILABLE:
      "The verification email could not be sent. Please try again.",
    PORTFOLIO_NOT_FOUND: "Portfolio not found.",
    TRANSACTION_NOT_FOUND: "Transaction not found.",
    INVALID_LEDGER: "Check the transaction history and available holdings.",
    FUTURE_TRADE: "The transaction date cannot be in the future.",
    PORTFOLIO_FULL: "A portfolio supports up to 5,000 transactions.",
    PORTFOLIO_CONFLICT: "The portfolio changed. Reload it and try again.",
    NOTIFICATIONS_DISABLED: "Notification delivery is currently unavailable.",
    UNSUPPORTED_ALERT: "Price alerts require a supported asset.",
    PROVIDER_BUSY: "Market data is busy. Please try again shortly.",
    PROVIDER_UNAVAILABLE: "Market data is unavailable. Please try again later.",
    NOT_FOUND: "The requested item was not found.",
    INTERNAL_ERROR: "An unexpected error occurred. Please try again.",
  },
};
export const commonTr: typeof commonEn = {
  language: "Dil",
  languageSaved: "Dil tercihi kaydedilemedi. Bu oturumda geçerli olacak.",
  nav: {
    overview: "Genel Bakış",
    portfolio: "Portföy",
    predictions: "Fiyat Tahminleri",
    learning: "Eğitim Merkezi",
    settings: "Ayarlar",
    account: "Hesap",
  },
  action: {
    save: "Kaydet",
    cancel: "İptal",
    back: "Geri",
    close: "Kapat",
    next: "İleri",
    previous: "Önceki",
    retry: "Yeniden Dene",
    remove: "Kaldır",
    edit: "Düzenle",
    buy: "Al",
    sell: "Sat",
    signIn: "Giriş Yap",
    signUp: "Kayıt Ol",
    logOut: "Çıkış Yap",
  },
  chart: {
    interval: {
      "15m": "15 dk.",
      "1h": "1 sa.",
      "4h": "4 sa.",
      "1d": "1 gün",
      "1w": "1 hf.",
      "1M": "1 ay",
    },
    open: "Açılış",
    high: "En Yüksek",
    low: "En Düşük",
    close: "Kapanış",
    volume: "Hacim",
    day: "Gün",
    hour: "Saat",
    week: "Hafta",
    month: "Ay",
    minutes: "15 dakika",
  },
  prediction: {
    experimental: "Deneysel Tahmin",
    unavailable: "Tahmin Kullanılamıyor",
    targetDate: "Hedef tarih (UTC)",
    generated: "Oluşturulma: {{date}} UTC",
    note: "Deneysel tahminler hatalı olabilir.",
    card: "{{coin}} fiyat tahmini",
  },
  storage: {
    read: "Kayıtlı veriler okunamadı. Mevcut verileriniz korunuyor.",
    write:
      "Depolama kullanılamıyor. Değişiklikler yalnızca bu oturumda geçerli.",
  },
  errors: {
    SERVICE_ERROR: "Hizmete ulaşılamıyor. Lütfen yeniden deneyin.",
    NETWORK_ERROR:
      "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip yeniden deneyin.",
    INVALID_RESPONSE: "Hizmetten geçersiz veri alındı.",
    INVALID_REQUEST: "Alanları kontrol ederek geçerli değerler girin.",
    INVALID_BODY: "İstek geçersiz.",
    RATE_LIMITED: "Çok fazla istek gönderildi. Bir dakika bekleyin.",
    AUTH_RATE_LIMITED:
      "Çok fazla hesap isteği gönderildi. Daha sonra yeniden deneyin.",
    UNAUTHENTICATED: "Lütfen giriş yapın.",
    SESSION_EXPIRED: "Oturumunuz sona erdi. Lütfen yeniden giriş yapın.",
    INVALID_CREDENTIALS: "E-posta veya parola hatalı.",
    ACCOUNTS_DISABLED:
      "Hesap hizmetleri kullanılamıyor. Piyasa verilerine erişebilirsiniz.",
    ACCOUNTS_UNAVAILABLE:
      "Hesap verilerine ulaşılamıyor. Daha sonra yeniden deneyin.",
    INVALID_PASSWORD:
      "12–72 karakter uzunluğunda bir parola kullanın (en fazla 72 UTF-8 bayt).",
    INVALID_VERIFICATION: "Doğrulama kodu hatalı veya süresi dolmuş.",
    VERIFICATION_COOLDOWN: "Yeni kod istemeden önce bir dakika bekleyin.",
    REGISTRATION_BUSY: "Kayıt işlemleri yoğun. Daha sonra yeniden deneyin.",
    REGISTRATION_DISABLED: "Şu anda yeni kayıt alınamıyor.",
    EMAIL_UNAVAILABLE:
      "Doğrulama e-postası gönderilemedi. Lütfen yeniden deneyin.",
    PORTFOLIO_NOT_FOUND: "Portföy bulunamadı.",
    TRANSACTION_NOT_FOUND: "İşlem bulunamadı.",
    INVALID_LEDGER: "İşlem geçmişini ve mevcut varlık miktarını kontrol edin.",
    FUTURE_TRADE: "İşlem tarihi gelecekte olamaz.",
    PORTFOLIO_FULL: "Bir portföye en fazla 5.000 işlem eklenebilir.",
    PORTFOLIO_CONFLICT: "Portföy değişti. Yenileyip yeniden deneyin.",
    NOTIFICATIONS_DISABLED: "Şu anda bildirim gönderilemiyor.",
    UNSUPPORTED_ALERT: "Fiyat uyarıları için desteklenen bir varlık seçin.",
    PROVIDER_BUSY: "Piyasa verileri yoğun. Biraz sonra yeniden deneyin.",
    PROVIDER_UNAVAILABLE:
      "Piyasa verilerine ulaşılamıyor. Daha sonra yeniden deneyin.",
    NOT_FOUND: "İstenen öğe bulunamadı.",
    INTERNAL_ERROR: "Beklenmeyen bir hata oluştu. Lütfen yeniden deneyin.",
  },
};
