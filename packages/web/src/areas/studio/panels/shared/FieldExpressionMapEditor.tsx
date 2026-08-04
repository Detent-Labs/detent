import type { Expression, FieldId } from "workflow-engine/schema";
import type { DraftOf } from "../../draft/types";
import type { DraftField } from "../../draft/fields";
import { ExpressionInput } from "./ExpressionInput";

interface FieldExpressionMapEditorProps {
  legend: string;
  addLabel: string;
  removeLabel: string;
  placeholder?: string;
  mapping: Partial<Record<FieldId, DraftOf<Expression>>> | undefined;
  fields: DraftField[];
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
  onChange,
}: FieldExpressionMapEditorProps) {
  const entries = Object.entries(mapping ?? {});

  const setEntry = (fieldId: string, expr: DraftOf<Expression> | undefined) => {
    const next = { ...(mapping ?? {}) };
    if (expr === undefined) delete next[fieldId as FieldId];
    else next[fieldId as FieldId] = expr;
    onChange(next);
  };

  const addEntry = () => {
    const used = new Set(entries.map(([k]) => k));
    const target = fields.find((f) => f.id !== undefined && !used.has(f.id));
    if (!target?.id) return;
    setEntry(target.id, { lang: "cel", src: "" });
  };

  // A single onChange with the fully-computed map, not two setEntry calls —
  // those would each read the same pre-change `mapping` closure and the
  // delete would be lost, duplicating the row under both field ids.
  const moveEntry = (oldFieldId: string, newFieldId: string, expr: DraftOf<Expression> | undefined) => {
    const next = { ...(mapping ?? {}) };
    delete next[oldFieldId as FieldId];
    if (expr !== undefined) next[newFieldId as FieldId] = expr;
    onChange(next);
  };

  return (
    <fieldset>
      <legend>{legend}</legend>
      {entries.map(([fieldId, expr]) => (
        <div key={fieldId} className="mapping-row">
          <select value={fieldId} onChange={(e) => moveEntry(fieldId, e.target.value, expr)}>
            {fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.key ?? f.id}
              </option>
            ))}
          </select>
          <ExpressionInput value={expr} onChange={(v) => setEntry(fieldId, v)} placeholder={placeholder} />
          <button type="button" className="btn btn-secondary" onClick={() => setEntry(fieldId, undefined)}>
            {removeLabel}
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary" onClick={addEntry} disabled={fields.length === 0}>
        {addLabel}
      </button>
    </fieldset>
  );
}
