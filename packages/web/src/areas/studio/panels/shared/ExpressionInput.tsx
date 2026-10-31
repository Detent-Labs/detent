import * as stylex from "@stylexjs/stylex";
import { fonts } from "form-ui/tokens.stylex";
import type { Expression } from "workflow-engine/schema";
import type { DraftOf } from "../../draft/types";
import { t } from "../../catalog.js";

const styles = stylex.create({
  // CEL is a machine value, so it prints in mono (design-language rule 4).
  celInput: {
    fontFamily: fonts.mono,
  },
});

interface Props {
  value: DraftOf<Expression> | undefined;
  onChange: (next: DraftOf<Expression> | undefined) => void;
  placeholder?: string;
}

/** Raw CEL text entry — no non-CEL condition-builder abstraction. The text is
 * a machine value, so it carries `translate="no"`. */
export function ExpressionInput({ value, onChange, placeholder }: Props) {
  // `cel-input` plus the compiled style, joined in one `className`: a
  // `className` written after a spread of `stylex.props` would replace it.
  // The literal class names the input for the tests that find it.
  const compiled = stylex.props(styles.celInput);
  return (
    <input
      type="text"
      {...compiled}
      className={`cel-input ${compiled.className ?? ""}`.trim()}
      translate="no"
      placeholder={placeholder ?? t("expression.placeholder")}
      value={value?.src ?? ""}
      onChange={(e) => {
        const src = e.target.value;
        onChange(src === "" ? undefined : { lang: "cel", src });
      }}
    />
  );
}
