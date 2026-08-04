import { useState } from "react";
import type { DraftField } from "../../draft/fields";
import { t } from "../../catalog.js";
import { ExpressionInput } from "./ExpressionInput";
import {
  offeredKeys,
  carriedKeys,
  patchValidation,
  type ValidationKey,
  type DraftFieldValidation,
} from "./fieldValidationLogic";
import { useDraft } from "../../draft/store";

interface Props {
  fieldId: string | undefined;
  type: DraftField["type"];
  validation: DraftFieldValidation | undefined;
  onChange: (validation: DraftFieldValidation | undefined) => void;
}

/** A field's own `validation` object: a collapsed section inside `FieldRow`,
 * offering the keys its declared type suits plus any it already carries. */
export function FieldValidationEditor({ fieldId, type, validation, onChange }: Props) {
  const { validation: draft } = useDraft();
  const offered = offeredKeys(type ?? "string");
  const carried = carriedKeys(validation);
  const keys = Array.from(new Set([...offered, ...carried]));

  // Mount-time only: the field's own control toggle takes over from here, so
  // a later edit that empties `validation` does not snap the section shut
  // under the author.
  const [initiallyOpen] = useState(() => carried.length > 0);

  const patch = (key: ValidationKey, value: DraftFieldValidation[ValidationKey]) => onChange(patchValidation(validation, key, value));

  // `EditorIssue` carries no structured field-path suffix (`resolveLoc`
  // collapses every structural issue on this field to the same `entityId`),
  // so the pattern-specific ones are the ones whose message names `pattern`
  // — `compile.ts::checkPatterns`' own wording, the only check that ever
  // produces one.
  const patternIssues = draft.issues.filter(
    (issue) => issue.entityType === "field" && issue.entityId === fieldId && issue.message.includes("pattern"),
  );

  return (
    <details className="field-validation" open={initiallyOpen}>
      <summary>
        {t("fieldValidation.legend")} ({carried.length})
      </summary>
      {keys.map((key) => {
        const notEvaluated = !offered.includes(key);
        return (
          <div className="field-validation-row" key={key}>
            <label>
              {key}
              {key === "rule" ? (
                <ExpressionInput value={validation?.rule} onChange={(next) => patch("rule", next)} />
              ) : key === "pattern" ? (
                <input
                  type="text"
                  value={validation?.pattern ?? ""}
                  onChange={(e) => patch("pattern", e.target.value === "" ? undefined : e.target.value)}
                />
              ) : (
                <input
                  type="number"
                  value={validation?.[key] ?? ""}
                  onChange={(e) => patch(key, e.target.value === "" ? undefined : Number(e.target.value))}
                />
              )}
            </label>
            {notEvaluated && <p className="studio-note">{t("fieldValidation.notEvaluated")}</p>}
            {key === "pattern" && patternIssues.length > 0 && (
              <ul className="issue-list">
                {patternIssues.map((issue, i) => (
                  <li key={i} className={`issue issue-${issue.source}`}>
                    [{issue.source}] {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </details>
  );
}
