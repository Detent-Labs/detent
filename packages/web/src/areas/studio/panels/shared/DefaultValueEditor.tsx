import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, space } from "form-ui/tokens.stylex";
import type { DraftField } from "../../draft/fields";
import { t } from "../../catalog.js";
import { asExpression, defaultValueDisabledReason, literalControlKind, parseCelDefault, toggleMultiselectValue } from "./defaultValueLogic";

type DraftDefault = DraftField["default"];

/** Every class this file's own markup renders, from `app.css`. */
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
  // `.default-value-disabled .studio-note { margin: 0 }`: the disabled
  // note's own zero-margin override.
  studioNoteInDisabledZone: {
    margin: 0,
  },
  conditionParseError: {
    margin: 0,
    color: colors.refusal,
    fontSize: "0.85rem",
  },
  defaultValueFooter: {
    display: "flex",
    gap: space.s3,
  },
  conditionMode: {
    background: "none",
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
    border: "none",
    padding: 0,
    margin: 0,
  },
  pluginFieldOption: {
    display: "flex",
    alignItems: "center",
    gap: space.s1,
  },
});

interface Props {
  field: DraftField;
  onChange: (next: DraftDefault) => void;
}

/**
 * `FieldDef.default`'s editor: a literal input matching the field's own
 * type, or — behind a link-styled toggle mirroring `ConditionInput`'s own —
 * a raw CEL expression. Deliberately not `ConditionInput` itself: a default
 * is a value of the field's own type, not a boolean (design.md Decision 3).
 */
export function DefaultValueEditor({ field, onChange }: Props) {
  const current = field.default;
  const currentExpr = asExpression(current);
  const disabledReason = defaultValueDisabledReason(field.type);

  const [celMode, setCelMode] = useState(currentExpr !== undefined);
  const [celText, setCelText] = useState(currentExpr?.src ?? "");
  const [celInvalid, setCelInvalid] = useState(false);

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
    setCelText(text);
    const result = parseCelDefault(text);
    if (result.ok) {
      setCelInvalid(false);
      onChange(result.value as DraftDefault);
    } else {
      setCelInvalid(true);
    }
  };

  const switchToCel = () => {
    setCelText(currentExpr?.src ?? "");
    setCelInvalid(false);
    setCelMode(true);
  };

  const clear = () => {
    setCelText("");
    setCelInvalid(false);
    onChange(undefined);
  };

  return (
    <div {...stylex.props(styles.defaultValueZone)}>
      {celMode ? (
        <>
          <label>
            {t("defaultValue.celLabel")}
            <textarea rows={2} className="cel-input" value={celText} onChange={(e) => commitCel(e.target.value)} />
          </label>
          {celInvalid && (
            <p {...stylex.props(styles.conditionParseError)} role="status">
              {t("defaultValue.unparseable")}
            </p>
          )}
        </>
      ) : (
        <LiteralDefaultInput field={field} value={current} onChange={onChange} />
      )}
      <div {...stylex.props(styles.defaultValueFooter)}>
        <button type="button" {...stylex.props(styles.conditionMode)} onClick={celMode ? () => setCelMode(false) : switchToCel}>
          {celMode ? t("defaultValue.useValue") : t("defaultValue.editAsCel")}
        </button>
        {current !== undefined && (
          <button type="button" {...stylex.props(styles.conditionMode)} onClick={clear}>
            {t("defaultValue.clear")}
          </button>
        )}
      </div>
    </div>
  );
}

function LiteralDefaultInput({ field, value, onChange }: { field: DraftField; value: DraftDefault; onChange: (next: DraftDefault) => void }) {
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
          {(field.options ?? []).map((opt, i) => (
            <option key={i} value={opt.value ?? ""}>
              {opt.value ?? ""}
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
        {(field.options ?? []).map((opt, i) => (
          <label key={i} {...stylex.props(styles.pluginFieldOption)}>
            <input
              type="checkbox"
              checked={selected.includes(opt.value ?? "")}
              onChange={(e) => onChange(toggleMultiselectValue(value, opt.value ?? "", e.target.checked) as DraftDefault)}
            />
            {opt.value ?? ""}
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
