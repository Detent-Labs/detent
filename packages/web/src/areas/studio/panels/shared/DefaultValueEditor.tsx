import { useState } from "react";
import type { DraftField } from "../../draft/fields";
import { t } from "../../catalog.js";
import { asExpression, defaultValueDisabledReason, literalControlKind, parseCelDefault, toggleMultiselectValue } from "./defaultValueLogic";

type DraftDefault = DraftField["default"];

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
      <div className="default-value-zone default-value-disabled">
        <p className="studio-note">
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
    <div className="default-value-zone">
      {celMode ? (
        <>
          <label>
            {t("defaultValue.celLabel")}
            <textarea rows={2} className="cel-input" value={celText} onChange={(e) => commitCel(e.target.value)} />
          </label>
          {celInvalid && (
            <p className="condition-parse-error" role="status">
              {t("defaultValue.unparseable")}
            </p>
          )}
        </>
      ) : (
        <LiteralDefaultInput field={field} value={current} onChange={onChange} />
      )}
      <div className="default-value-footer">
        <button type="button" className="condition-mode" onClick={celMode ? () => setCelMode(false) : switchToCel}>
          {celMode ? t("defaultValue.useValue") : t("defaultValue.editAsCel")}
        </button>
        {current !== undefined && (
          <button type="button" className="condition-mode" onClick={clear}>
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
      <label className="default-value-checkbox">
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
    return <p className="studio-note">{t(personNote ? "defaultValue.personNoOptions" : "defaultValue.dataSourceNoOptions")}</p>;
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
      <fieldset className="default-value-options">
        <legend>{t("defaultValue.literalLabel")}</legend>
        {(field.options ?? []).map((opt, i) => (
          <label key={i} className="plugin-field-option">
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
