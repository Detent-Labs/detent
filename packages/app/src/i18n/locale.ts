export type UiLocale = "en" | "de";
const SUPPORTED: UiLocale[] = ["en", "de"];
export const LOCALE_STORAGE_KEY = "app.locale";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isSupported(value: string): value is UiLocale {
  return (SUPPORTED as string[]).includes(value);
}

/** `navigator.language` (e.g. "de-DE") narrowed to a supported UI locale, defaulting to "en". */
export function detectLocale(navigatorLanguage: string | undefined): UiLocale {
  const lang = (navigatorLanguage ?? "en").slice(0, 2).toLowerCase();
  return isSupported(lang) ? lang : "en";
}

/** A persisted choice wins over the browser's language; neither wins over "en". */
export function loadLocale(storage: StorageLike | undefined, navigatorLanguage: string | undefined): UiLocale {
  const stored = storage?.getItem(LOCALE_STORAGE_KEY);
  if (stored && isSupported(stored)) return stored;
  return detectLocale(navigatorLanguage);
}

export function persistLocale(locale: UiLocale, storage: StorageLike | undefined): void {
  storage?.setItem(LOCALE_STORAGE_KEY, locale);
}
