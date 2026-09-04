import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import type { DraftField } from "../../draft/fields";
import { t } from "../../catalog.js";
import { RuleInput } from "./RuleInput";
import {
  offeredKeys,
  carriedKeys,
  patchValidation,
  type ValidationKey,
  type DraftFieldValidation,
} from "./fieldValidationLogic";
import { useDraft } from "../../draft/store";

const styles = stylex.create({
  fieldValidation: {
    marginBlock: space.s2,
    marginInline: 0,
    border: `1px solid ${colors.border}`,
    paddingBlock: space.s1,
    paddingInline: space.s2,
  },
  // `.field-validation summary` in app.css: a descendant rule on a bare
  // `<summary>` with no class of its own.
  fieldValidationSummary: {
    cursor: "pointer",
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: "0.85rem",
  },
  fieldValidationRow: {
    paddingBlock: space.s1,
    paddingInline: 0,
  },
  studioNote: {
    color: colors.textMuted,
    minHeight: "1.25rem",
    marginBlockEnd: space.s2,
    marginBlockStart: 0,
    marginInline: 0,
  },
});

interface Props {
  /** The field this `validation` belongs to — the row builder needs the
   * whole field, not just its id and type, for "this answer"'s own key. */
  field: DraftField;
  validation: DraftFieldValidation | undefined;
  onChange: (validation: DraftFieldValidation | undefined) => void;
}

/** A field's own `validation` object: a collapsed section inside `FieldRow`,
 * offering the keys its declared type suits plus any it already carries. */
export function FieldValidationEditor({ field, validation, onChange }: Props) {
  const { validation: draft } = useDraft();
  const fieldId = field.id;
  const offered = offeredKeys(field.type ?? "string");
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
    <details {...stylex.props(styles.fieldValidation)} open={initiallyOpen}>
      {/* The Rules tab's own zone heading already says "Validation" (design.md
          decision 2); this summary carries only the count, so no redundant
          second label renders beneath it. */}
      <summary {...stylex.props(styles.fieldValidationSummary)}>({carried.length})</summary>
      {keys.map((key) => {
        const notEvaluated = !offered.includes(key);
        return (
          <div {...stylex.props(styles.fieldValidationRow)} key={key}>
            <label>
              {key}
              {key === "rule" ? (
                <RuleInput field={field} value={validation?.rule} onChange={(next) => patch("rule", next)} />
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
            {notEvaluated && <p {...stylex.props(styles.studioNote)}>{t("fieldValidation.notEvaluated")}</p>}
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
