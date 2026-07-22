import { createContext, useContext, useState, type ReactNode } from "react";
import { resolveInitialLocale, resolveTranslation, SUPPORTED_LOCALES, type LocaleCode, type TranslationKey } from "./catalog";

const STORAGE_KEY = "editor.locale";

interface LocaleContextValue {
  locale: LocaleCode;
  setLocale: (locale: LocaleCode) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readStoredLocale(): string | null {
  return typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(() => resolveInitialLocale(readStoredLocale()));

  const setLocale = (next: LocaleCode) => {
    const resolved = resolveInitialLocale(next, SUPPORTED_LOCALES);
    setLocaleState(resolved);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, resolved);
  };

  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>;
}

/** Catalog-agnostic on purpose (design.md "Locale state and the string catalog are two separate pieces") — a later change can depend on just this. */
export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
}

/** Thin wrapper over `resolveTranslation` — components call this; non-component modules receive the resolved string as a parameter instead (design.md). */
export function useT(): (key: TranslationKey) => string {
  const { locale } = useLocale();
  return (key: TranslationKey) => resolveTranslation(locale, key);
}
