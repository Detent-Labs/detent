import { useState } from "react";
import { ConditionInput } from "./ConditionInput";
import { isExpression, overrideMode, type BoolOrExpr, type OverrideMode } from "./overrideMode";
import { effectiveFlag, FLAG_DEFAULT, type FlagKey } from "../../draft/view-flags";

interface Props {
  label: string;
  value: BoolOrExpr;
  /** Which of the three view flags this control edits. The checkbox's
   * `checked` state reads the engine's resolved default for an absent key,
   * not `value === true` — an absent `visible` renders ticked, matching
   * `resolveFields` (`src/runtime/api.ts`). */
  flagKey: FlagKey;
  /** The step this override sits on, for the condition builder's `child.*` operands. */
  stepId?: string;
  onChange: (next: BoolOrExpr) => void;
  /** Forwarded to the mode select and the checkbox, so a caller with its own
   * roving-tabindex model (the field matrix's grid, `field-matrix-toolbar-
   * and-inline-editing`) can keep every inactive cell's controls out of the
   * page's tab order. Left unset, both take the browser's own default. */
  tabIndex?: number;
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
export function BooleanOrExpressionInput({ label, value, flagKey, stepId, onChange, tabIndex }: Props) {
  const [chosen, setChosen] = useState<OverrideMode | undefined>(undefined);
  const mode = overrideMode(value, chosen);

  return (
    <span className="bool-or-expr">
      <label>
        {label}
        <select
          value={mode}
          tabIndex={tabIndex}
          onChange={(e) => {
            const next = e.target.value as OverrideMode;
            setChosen(next);
            // The boolean arm writes the flag's own default, not a hardcoded
            // `false`: leaving CEL for `visible` must not silently delete
            // `required`/`readonly` the way a literal `false` would
            // (setFlag's gate, view-flags.ts).
            onChange(next === "cel" ? undefined : FLAG_DEFAULT[flagKey]);
          }}
        >
          <option value="boolean">boolean</option>
          <option value="cel">CEL</option>
        </select>
      </label>
      {mode === "boolean" ? (
        <input
          type="checkbox"
          tabIndex={tabIndex}
          checked={effectiveFlag(value, flagKey) === true}
          onChange={(e) => onChange(e.target.checked)}
        />
      ) : (
        <ConditionInput value={isExpression(value) ? value : undefined} stepId={stepId} onChange={onChange} />
      )}
    </span>
  );
}
