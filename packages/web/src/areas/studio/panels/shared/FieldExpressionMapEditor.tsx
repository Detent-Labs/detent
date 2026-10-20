import type { ReactNode } from "react";
import type { Expression, FieldId } from "workflow-engine/schema";
import type { DraftOf } from "../../draft/types";
import { t } from "../../catalog.js";
import { ExpressionInput } from "./ExpressionInput";
import {
  EMPTY_EXPRESSION,
  type MapTargetField,
  editRow,
  moveRow,
  nextUnusedTarget,
  removeRow,
  rowOptions,
  targetsOf,
} from "./fieldExpressionMapLogic";

interface FieldExpressionMapEditorProps {
  legend: ReactNode;
  addLabel: string;
  removeLabel: string;
  placeholder?: string;
  mapping: Partial<Record<FieldId, DraftOf<Expression>>> | undefined;
  /** The target list. A group field is never offered. */
  fields: readonly MapTargetField[];
  /** Disables "+ add" while the caller has no target list yet. */
  addDisabled?: boolean;
  /** The id of an element that says why "+ add" is disabled. */
  addDescribedBy?: string;
  /** False while the caller cannot say which targets exist. A stored key then
   * carries no unlisted mark. Defaults to true. */
  targetsKnown?: boolean;
  onChange: (next: Partial<Record<FieldId, DraftOf<Expression>>>) => void;
}

/** Shared by SubprocessSpecEditor (input/output mapping) and ActionListEditor (output mapping). */
export function FieldExpressionMapEditor({
  legend,
  addLabel,
  removeLabel,
  placeholder,
  mapping,
  fields,
  addDisabled,
  addDescribedBy,
  targetsKnown = true,
  onChange,
}: FieldExpressionMapEditorProps) {
  const entries = Object.entries(mapping ?? {});
  const usedKeys = entries.map(([k]) => k);
  const targets = targetsOf(fields);
  const nextTarget = nextUnusedTarget(fields, usedKeys);

  const addEntry = () => {
    if (nextTarget === undefined) return;
    onChange(editRow(mapping, nextTarget, EMPTY_EXPRESSION));
  };

  return (
    <fieldset>
      <legend>{legend}</legend>
      {entries.map(([fieldId, expr]) => (
        <div key={fieldId} className="mapping-row">
          <select value={fieldId} onChange={(e) => onChange(moveRow(mapping, fieldId, e.target.value, expr))}>
            {rowOptions(targets, usedKeys, fieldId, targetsKnown).map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.unlisted ? `${o.label} ${t("mapping.unlistedKey")}` : o.label}
              </option>
            ))}
          </select>
          <ExpressionInput
            value={expr}
            onChange={(v) => onChange(editRow(mapping, fieldId, v))}
            placeholder={placeholder}
          />
          <button type="button" className="btn btn-secondary" onClick={() => onChange(removeRow(mapping, fieldId))}>
            {removeLabel}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-secondary"
        onClick={addEntry}
        aria-describedby={addDescribedBy}
        disabled={addDisabled === true || nextTarget === undefined}
      >
        {addLabel}
      </button>
    </fieldset>
  );
}
