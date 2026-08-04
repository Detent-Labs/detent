import { useState } from "react";
import { ConditionInput } from "./ConditionInput";
import { isExpression, overrideMode, type BoolOrExpr, type OverrideMode } from "./overrideMode";

interface Props {
  label: string;
  value: BoolOrExpr;
  /** The step this override sits on, for the condition builder's `child.*` operands. */
  stepId?: string;
  onChange: (next: BoolOrExpr) => void;
}

/**
 * A view override (visible/required/readonly) is `boolean | Expression`; this
 * toggles between the two representations.
 *
 * That select stays the outer mode. `ConditionInput` renders the CEL arm and
 * carries its own builder/CEL toggle inside it, so the site never shows two
 * controls for one choice.
 *
 * The chosen arm is remembered rather than read back off the value: the builder
 * writes `undefined` while a row is incomplete, and deriving the mode from that
 * would collapse the override to the checkbox mid-edit. See `overrideMode`.
 */
export function BooleanOrExpressionInput({ label, value, stepId, onChange }: Props) {
  const [chosen, setChosen] = useState<OverrideMode | undefined>(undefined);
  const mode = overrideMode(value, chosen);

  return (
    <span className="bool-or-expr">
      <label>
        {label}
        <select
          value={mode}
          onChange={(e) => {
            const next = e.target.value as OverrideMode;
            setChosen(next);
            onChange(next === "cel" ? undefined : false);
          }}
        >
          <option value="boolean">boolean</option>
          <option value="cel">CEL</option>
        </select>
      </label>
      {mode === "boolean" ? (
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
      ) : (
        <ConditionInput value={isExpression(value) ? value : undefined} stepId={stepId} onChange={onChange} />
      )}
    </span>
  );
}
