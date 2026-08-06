import { useState } from "react";
import { useDraft } from "../../draft/store";
import { t } from "../../catalog.js";
import { localeGapCount, resolveAddLocaleAttempt } from "../../draft/localized-text";

/**
 * Which locale of the *authored process content* is currently shown/edited —
 * unrelated to the app's own fixed-English UI-chrome text. Its option set is
 * derived per-Draft (every locale already used, plus whichever one is
 * currently selected), not a fixed platform list.
 */
export function ContentLocaleSwitcher() {
  const { draft, contentLocale, setContentLocale, usedLocales } = useDraft();
  const [newLocale, setNewLocale] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  // The currently selected locale must always be a valid <option>, even
  // right after adding one with no content typed into any field yet (so it
  // isn't in usedLocales, which is derived from the Draft's content).
  const options = Array.from(new Set([...usedLocales, contentLocale])).sort();

  const addLocale = () => {
    const attempt = resolveAddLocaleAttempt(newLocale);
    if (!attempt.ok) {
      setError(t("contentLocale.invalid"));
      return;
    }
    setContentLocale(attempt.locale);
    setNewLocale("");
    setError(undefined);
  };

  return (
    <fieldset className="content-locale-switcher">
      <legend>{t("contentLocale.legend")}</legend>
      <select aria-label="content locale" value={contentLocale} onChange={(e) => setContentLocale(e.target.value)}>
        {/* The gap count rides in the option's own text: a native <select>
            renders no markup inside an <option>, so there is no badge to
            place. Omitted at zero, so a fully-translated locale reads
            exactly as it did before. */}
        {options.map((code) => {
          const gaps = localeGapCount(draft, code);
          return (
            <option key={code} value={code}>
              {gaps > 0 ? `${code} — ${gaps} missing` : code}
            </option>
          );
        })}
      </select>
      <input
        type="text"
        placeholder={t("contentLocale.addPlaceholder")}
        value={newLocale}
        onChange={(e) => setNewLocale(e.target.value)}
      />
      <button type="button" className="btn btn-secondary" onClick={addLocale}>
        {t("contentLocale.add")}
      </button>
      {error && <span className="content-locale-error">{error}</span>}
    </fieldset>
  );
}
