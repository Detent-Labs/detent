import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { useDraft } from "../../draft/store";
import { t } from "../../catalog.js";
import { localeGapCount, resolveAddLocaleAttempt } from "../../draft/localized-text";

/** `.studio-header-bar-locale-badge` and `.studio-header-bar-menu-
 * add-locale` from `app.css`. */
const styles = stylex.create({
  localeBadge: {
    fontFamily: fonts.mono,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    background: colors.surface,
    color: colors.text,
    paddingBlock: space.s1,
    paddingInline: space.s2,
  },
  addLocale: {
    display: "flex",
    alignItems: "center",
    gap: space.s2,
  },
});

/**
 * The switch alone: a compact control for the header row (studio-canvas: "A
 * process-identity header bar shows draft and publish status" — the
 * content-locale badge). Its option set is derived per-Draft (every locale
 * already used, plus whichever one is currently selected), not a fixed
 * platform list. Split out of the combined fieldset below so the header row
 * can show only the switch, never the add-locale control beside it
 * (design.md: "ContentLocaleSwitcher's add-locale control moves into
 * [the `⋮` menu's 'Process, saved with the draft'] group, not just its
 * dropdown").
 */
export function ContentLocaleBadge() {
  const { draft, contentLocale, setContentLocale, usedLocales } = useDraft();

  // The currently selected locale must always be a valid <option>, even
  // right after adding one with no content typed into any field yet (so it
  // isn't in usedLocales, which is derived from the Draft's content).
  const options = Array.from(new Set([...usedLocales, contentLocale])).sort();

  return (
    <select
      aria-label={t("contentLocale.legend")}
      {...stylex.props(styles.localeBadge)}
      value={contentLocale}
      onChange={(e) => setContentLocale(e.target.value)}
    >
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
  );
}

/**
 * The add-locale input and button alone, split out for the `⋮` menu's
 * "Process, saved with the draft" group (design.md) — declaring a new
 * content locale is itself a draft-scoped concern, the same as the process
 * key and the base locale it now sits beside.
 */
export function AddLocaleControl() {
  const { setContentLocale } = useDraft();
  const [newLocale, setNewLocale] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

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
    <div {...stylex.props(styles.addLocale)}>
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
    </div>
  );
}
