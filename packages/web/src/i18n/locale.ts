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

/** A stored or transmitted value narrowed to a supported UI locale, or `undefined`. The account route bounds what it stores; this narrows what arrives. */
export function asUiLocale(value: string | undefined): UiLocale | undefined {
  return value !== undefined && isSupported(value) ? value : undefined;
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

/**
 * The account's locale, hydrated from `GET /account/me`, becomes the active one
 * only where this browser holds no choice of its own. A language picked here
 * outranks the account's stored value, so a new device follows the account and a
 * browser with a chosen language keeps it.
 *
 * Returns the adopted locale, already written to `storage`, or `undefined` where
 * nothing is adopted.
 */
export function adoptHydratedLocale(hydrated: string | undefined, storage: StorageLike | undefined): UiLocale | undefined {
  const account = asUiLocale(hydrated);
  if (!account) return undefined;
  if (asUiLocale(storage?.getItem(LOCALE_STORAGE_KEY) ?? undefined)) return undefined;
  persistLocale(account, storage);
  return account;
}
