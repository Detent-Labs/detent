import type { Expression } from "workflow-engine/schema";
import type { DraftOf } from "../../draft/types";
import { ExpressionInput } from "./ExpressionInput";

type BoolOrExpr = boolean | DraftOf<Expression> | undefined;

function isExpression(v: BoolOrExpr): v is DraftOf<Expression> {
  return typeof v === "object" && v !== null;
}

interface Props {
  label: string;
  value: BoolOrExpr;
  onChange: (next: BoolOrExpr) => void;
}

/** A view override (visible/required/readonly) is `boolean | Expression`; this toggles between the two representations. */
export function BooleanOrExpressionInput({ label, value, onChange }: Props) {
  const mode = isExpression(value) ? "cel" : "boolean";

  return (
    <span className="bool-or-expr">
      <label>
        {label}
        <select
          value={mode}
          onChange={(e) => {
            onChange(e.target.value === "cel" ? { lang: "cel", src: "" } : false);
          }}
        >
          <option value="boolean">boolean</option>
          <option value="cel">CEL</option>
        </select>
      </label>
      {mode === "boolean" ? (
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
      ) : (
        <ExpressionInput value={isExpression(value) ? value : undefined} onChange={onChange} />
      )}
    </span>
  );
}
