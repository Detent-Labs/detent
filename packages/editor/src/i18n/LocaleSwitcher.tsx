import { useLocale } from "./store";
import { SUPPORTED_LOCALES, type LocaleCode } from "./catalog";

/** Lists whatever `SUPPORTED_LOCALES` currently holds — adding a locale never touches this file (design.md "Single-locale scope"). */
export function LocaleSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <select className="locale-switcher" aria-label="locale" value={locale} onChange={(e) => setLocale(e.target.value as LocaleCode)}>
      {SUPPORTED_LOCALES.map((code) => (
        <option key={code} value={code}>
          {code}
        </option>
      ))}
    </select>
  );
}
