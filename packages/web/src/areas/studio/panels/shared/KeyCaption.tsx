import * as stylex from "@stylexjs/stylex";
import { colors, fonts } from "form-ui/tokens.stylex";

const styles = stylex.create({
  // The JSON property the control writes. The engine matches it exactly, so
  // it takes the mono face (`design-language.md`). A caption can sit inside an
  // uppercase, tracked label, and the name must keep its own case.
  jsonKey: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textMuted,
    textTransform: "none",
    letterSpacing: "normal",
  },
});

interface Props {
  /** The caption's plain words, read from the studio catalog. */
  text: string;
  /** The JSON property the control writes. Omit it when no property sits behind the control. */
  jsonKey?: string;
}

/**
 * A field caption: plain words, then the JSON property name in mono after one
 * space (`ui-string-overrides`). The property name is an engine value and
 * carries no catalog key.
 */
export function KeyCaption({ text, jsonKey }: Props) {
  return (
    <>
      {text}
      {jsonKey !== undefined && (
        <>
          {" "}
          <code {...stylex.props(styles.jsonKey)}>{jsonKey}</code>
        </>
      )}
    </>
  );
}
