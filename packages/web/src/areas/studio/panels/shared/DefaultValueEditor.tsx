import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import type { DraftField } from "../../draft/fields";
import { useDraft } from "../../draft/store";
import { resolveDraftLocalizedText } from "../../draft/localized-text";
import { t } from "../../catalog.js";
import { numberRepeats } from "./optionText";
import { asExpression, defaultValueDisabledReason, literalControlKind, parseCelDefault, toggleMultiselectValue } from "./defaultValueLogic";

type DraftDefault = DraftField["default"];

const styles = stylex.create({
  defaultValueZone: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: space.s2,
    width: "100%",
  },
  studioNote: {
    color: colors.textMuted,
    minHeight: "1.25rem",
    marginBlockEnd: space.s2,
    marginBlockStart: 0,
    marginInline: 0,
  },
  // The disabled note's own zero-margin override.
  studioNoteInDisabledZone: {
    margin: 0,
  },
  conditionParseError: {
    margin: 0,
    color: colors.refusal,
    fontSize: "0.85rem",
  },
  conditionMode: {
    backgroundColor: "transparent",
    color: colors.accent,
    padding: 0,
    flex: "none",
  },
  defaultValueCheckbox: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: space.s2,
  },
  defaultValueOptions: {
    borderStyle: "none",
    padding: 0,
    margin: 0,
  },
  pluginFieldOption: {
    display: "flex",
    alignItems: "center",
    gap: space.s1,
  },
  // The condition input's Developer view (`ConditionInput.tsx`), duplicated:
  // an area's component never reads another component's style object.
  developer: {
    width: "100%",
    paddingBlock: space.s2,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.border,
  },
  developerSummary: {
    cursor: "pointer",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  celField: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    marginBlockStart: space.s2,
    minWidth: 0,
  },
  celCaption: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  // CEL is a machine value, so it takes the mono face.
  celInput: {
    fontFamily: fonts.mono,
    width: "100%",
  },
});

interface Props {
  field: DraftField;
  onChange: (next: DraftDefault) => void;
}

/**
 * `FieldDef.default`'s editor (design.md D9): the literal input matching the
 * field's own type first, then a "Developer view" disclosure holding the CEL
 * input. Deliberately not `ConditionInput`: a default is a value of the
 * field's own type, not a boolean.
 *
 * While the default is an expression, a note that a rule computes it stands
 * in place of the literal input, and the disclosure stands open. Clearing the
 * CEL text drops the `default` key, and the literal input returns. Text that
 * does not parse stays in the input and writes nothing.
 */
export function DefaultValueEditor({ field, onChange }: Props) {
  const { contentLocale, draft } = useDraft();
  const current = field.default;
  const currentExpr = asExpression(current);
  const disabledReason = defaultValueDisabledReason(field.type);

  // The typed CEL text while it does not parse; otherwise the input reads the
  // draft's own source, so a JSON-surface edit shows here too.
  const [unparsed, setUnparsed] = useState<string | undefined>(undefined);
  // The author's own toggle. An expression default opens the disclosure by
  // itself; a typed edit opens it for good, so clearing the text never closes
  // the input under the cursor.
  const [developerOpen, setDeveloperOpen] = useState(false);

  if (disabledReason) {
    return (
      <div {...stylex.props(styles.defaultValueZone)}>
        <p {...stylex.props(styles.studioNote, styles.studioNoteInDisabledZone)}>
          {disabledReason === "group" ? t("defaultValue.groupDisabledNote") : t("defaultValue.typeDisabledNote")}
        </p>
      </div>
    );
  }

  const commitCel = (text: string) => {
    setDeveloperOpen(true);
    const result = parseCelDefault(text);
    if (!result.ok) {
      setUnparsed(text);
      return;
    }
    setUnparsed(undefined);
    // An emptied input over a literal default leaves that literal alone.
    if (result.value === undefined && currentExpr === undefined) return;
    onChange(result.value as DraftDefault);
  };

  const clear = () => {
    setUnparsed(undefined);
    onChange(undefined);
  };

  const celText = unparsed ?? currentExpr?.src ?? "";

  return (
    <div {...stylex.props(styles.defaultValueZone)}>
      {currentExpr !== undefined ? (
        <p {...stylex.props(styles.studioNote)}>{t("defaultValue.computedNote")}</p>
      ) : (
        <LiteralDefaultInput
          field={field}
          value={current}
          onChange={onChange}
          contentLocale={contentLocale}
          baseLocale={draft.baseLocale ?? contentLocale}
        />
      )}
      {current !== undefined && (
        <button type="button" {...stylex.props(styles.conditionMode)} onClick={clear}>
          {t("defaultValue.clear")}
        </button>
      )}
      <details
        {...stylex.props(styles.developer)}
        open={developerOpen || currentExpr !== undefined || unparsed !== undefined}
        onToggle={(e) => setDeveloperOpen(e.currentTarget.open)}
      >
        <summary {...stylex.props(styles.developerSummary)}>{t("defaultValue.developerView")}</summary>
        <label {...stylex.props(styles.celField)}>
          <span {...stylex.props(styles.celCaption)}>{t("defaultValue.celLabel")}</span>
          <textarea
            rows={2}
            spellCheck={false}
            translate="no"
            {...stylex.props(styles.celInput)}
            value={celText}
            onChange={(e) => commitCel(e.target.value)}
          />
        </label>
        {unparsed !== undefined && (
          <p {...stylex.props(styles.conditionParseError)} role="status">
            {t("defaultValue.unparseable")}
          </p>
        )}
      </details>
    </div>
  );
}

/** A choice's name at the content locale, else the base locale, else the
 * unnamed-choice placeholder. The value stays the option's own `value`. */
function choiceName(label: NonNullable<DraftField["options"]>[number]["label"], contentLocale: string, baseLocale: string): string {
  return resolveDraftLocalizedText(label, contentLocale, baseLocale) || t("fieldCard.unnamedChoice");
}

interface LiteralProps {
  field: DraftField;
  value: DraftDefault;
  onChange: (next: DraftDefault) => void;
  contentLocale: string;
  baseLocale: string;
}

/** The choices a default can name, each with its printed name. A choice whose
 * value is still `""` stays out: it would collide with the None option. A
 * repeated name takes its count, as the other pickers number one. */
function pickableChoices(field: DraftField, contentLocale: string, baseLocale: string): { value: string; name: string }[] {
  const named = (field.options ?? []).filter((opt) => (opt.value ?? "") !== "");
  const names = numberRepeats(named, (opt) => choiceName(opt.label, contentLocale, baseLocale));
  return named.map((opt, i) => ({ value: opt.value ?? "", name: names[i] ?? "" }));
}

function LiteralDefaultInput({ field, value, onChange, contentLocale, baseLocale }: LiteralProps) {
  const kind = literalControlKind(field);

  if (kind === "boolean") {
    return (
      <label {...stylex.props(styles.defaultValueCheckbox)}>
        {t("defaultValue.literalLabel")}
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
      </label>
    );
  }
  if (kind === "number") {
    return (
      <label>
        {t("defaultValue.literalLabel")}
        <input
          type="number"
          value={typeof value === "number" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      </label>
    );
  }
  // A formatted string takes that format's own native input, so the value an
  // author types faces the same domain check at publish that a participant's
  // faces at submission.
  if (kind === "date" || kind === "datetime" || kind === "email") {
    return (
      <label>
        {t("defaultValue.literalLabel")}
        <input
          type={kind === "datetime" ? "datetime-local" : kind}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
        />
      </label>
    );
  }
  // Two fields reach "none", and the note names which one the author is on.
  // The data-source string names a data source by hand, so a bare person
  // field — which declares none — takes its own instead, never both.
  if (kind === "none") {
    const personNote = field.format === "person" && field.dataSource === undefined;
    return <p {...stylex.props(styles.studioNote)}>{t(personNote ? "defaultValue.personNoOptions" : "defaultValue.dataSourceNoOptions")}</p>;
  }
  if (kind === "options") {
    return (
      <label>
        {t("defaultValue.literalLabel")}
        <select value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}>
          <option value="">{t("fieldCatalog.noneOption")}</option>
          {pickableChoices(field, contentLocale, baseLocale).map((choice, i) => (
            <option key={i} value={choice.value}>
              {choice.name}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (kind === "options-multi") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <fieldset {...stylex.props(styles.defaultValueOptions)}>
        <legend>{t("defaultValue.literalLabel")}</legend>
        {pickableChoices(field, contentLocale, baseLocale).map((choice, i) => (
          <label key={i} {...stylex.props(styles.pluginFieldOption)}>
            <input
              type="checkbox"
              checked={selected.includes(choice.value)}
              onChange={(e) => onChange(toggleMultiselectValue(value, choice.value, e.target.checked) as DraftDefault)}
            />
            {choice.name}
          </label>
        ))}
      </fieldset>
    );
  }
  // string, and the custom/plugin fallback
  return (
    <label>
      {t("defaultValue.literalLabel")}
      <input
        type="text"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
      />
    </label>
  );
}
