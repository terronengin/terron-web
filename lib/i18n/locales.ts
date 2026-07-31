export type LocaleCode = "tr" | "en" | "ar" | "de" | "ru" | "fr" | "es" | "fa" | "az" | "zh";

export const DEFAULT_LOCALE: LocaleCode = "tr";

export const LOCALES: { code: LocaleCode; label: string; nativeLabel: string; rtl?: boolean }[] = [
  { code: "tr", label: "Turkish", nativeLabel: "Türkçe" },
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", rtl: true },
  { code: "de", label: "German", nativeLabel: "Deutsch" },
  { code: "ru", label: "Russian", nativeLabel: "Русский" },
  { code: "fr", label: "French", nativeLabel: "Français" },
  { code: "es", label: "Spanish", nativeLabel: "Español" },
  { code: "fa", label: "Persian", nativeLabel: "فارسی", rtl: true },
  { code: "az", label: "Azerbaijani", nativeLabel: "Azərbaycan dili" },
  { code: "zh", label: "Chinese", nativeLabel: "中文" },
];

export function isRtlLocale(code: LocaleCode): boolean {
  return LOCALES.find((l) => l.code === code)?.rtl === true;
}
