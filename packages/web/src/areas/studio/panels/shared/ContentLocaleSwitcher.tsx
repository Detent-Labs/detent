import { useId, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, space } from "form-ui/tokens.stylex";
import { useDraft } from "../../draft/store";
import { t } from "../../catalog.js";
import { localeGapCount, resolveAddLocaleAttempt } from "../../draft/localized-text";
import type { Draft } from "../../draft/types";
import { languageName } from "../../screens/draftToolbarState.js";
import { StudioSelect } from "./StudioSelect";

const styles = stylex.create({
  // The design language's field: label above control, 4px apart.
  field: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    fontSize: "0.9rem",
  },
  fieldText: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  addLocale: {
    display: "flex",
    alignItems: "center",
    gap: space.s2,
  },
  addLocaleError: {
    margin: 0,
    color: colors.refusal,
  },
});

/** One locale's option text: the language's name and code, "German (de)", or
 * the code alone when no name exists. A locale with gaps adds its count of
 * missing entries. A native `<option>` renders no markup, so the count rides in
 * the text. Omitted at zero. The Publish dialog's Languages fact reads the same
 * wording. */
export function localeOptionLabel(draft: Draft, code: string): string {
  const name = languageName(code);
  const language = name === code ? code : `${name} (${code})`;
  const gaps = localeGapCount(draft, code);
  return gaps > 0 ? t("contentLocale.optionGap").replace("{locale}", () => language).replace("{count}", () => String(gaps)) : language;
}

/**
 * The language the studio edits in, as a labelled field for the Settings
 * tab's Process view. Its option set is derived per draft: every locale
 * already used, plus whichever one is currently selected. It writes no draft
 * body.
 */
export function ContentLocaleSelect() {
  const { draft, contentLocale, setContentLocale, usedLocales } = useDraft();

  // The currently selected locale must always be a valid <option>, even
  // right after adding one with no content typed into any field yet (so it
  // isn't in usedLocales, which is derived from the Draft's content).
  const options = Array.from(new Set([...usedLocales, contentLocale])).sort();

  return (
    <label {...stylex.props(styles.field)}>
      <span {...stylex.props(styles.fieldText)}>{t("settings.contentLocale")}</span>
      <StudioSelect value={contentLocale} onChange={(e) => setContentLocale(e.target.value)}>
        {options.map((code) => (
          <option key={code} value={code}>
            {localeOptionLabel(draft, code)}
          </option>
        ))}
      </StudioSelect>
    </label>
  );
}

/**
 * The add-locale field with its state lifted out: a visible label above the
 * input and the button, then the refusal while one stands. The refusal is an
 * alert, and the input points at it with `aria-describedby`.
 */
export function AddLocaleField({
  value,
  error,
  onChange,
  onAdd,
}: {
  value: string;
  error: string | undefined;
  onChange: (next: string) => void;
  onAdd: () => void;
}) {
  const inputId = useId();
  const errorId = useId();

  return (
    <div {...stylex.props(styles.field)}>
      <label htmlFor={inputId} {...stylex.props(styles.fieldText)}>
        {t("contentLocale.addLabel")}
      </label>
      <div {...stylex.props(styles.addLocale)}>
        <input
          id={inputId}
          type="text"
          placeholder={t("contentLocale.addPlaceholder")}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="btn btn-secondary" onClick={onAdd}>
          {t("contentLocale.add")}
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" {...stylex.props(styles.addLocaleError)}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The add-locale field for the Settings tab's Process view. Declaring a new
 * content locale is a draft-scoped concern, the same as the base locale it
 * sits beside.
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

  return <AddLocaleField value={newLocale} error={error} onChange={setNewLocale} onAdd={addLocale} />;
}
