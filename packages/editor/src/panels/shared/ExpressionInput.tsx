import type { Expression } from "workflow-engine/schema";
import type { DraftOf } from "../../draft/types";

interface Props {
  value: DraftOf<Expression> | undefined;
  onChange: (next: DraftOf<Expression> | undefined) => void;
  placeholder?: string;
}

/** Raw CEL text entry — no non-CEL condition-builder abstraction (spec: editor-structural-panels). */
export function ExpressionInput({ value, onChange, placeholder }: Props) {
  return (
    <input
      type="text"
      className="cel-input"
      placeholder={placeholder ?? "CEL expression"}
      value={value?.src ?? ""}
      onChange={(e) => {
        const src = e.target.value;
        onChange(src === "" ? undefined : { lang: "cel", src });
      }}
    />
  );
}
