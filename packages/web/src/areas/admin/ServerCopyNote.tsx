import * as stylex from "@stylexjs/stylex";
import { colors, space } from "form-ui/tokens.stylex";

/** `DESIGN.md`'s Warning Callout: refusal text beside a 3px rule in the advisory role. */
const styles = stylex.create({
  note: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: space.s2,
    color: colors.refusal,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: colors.advisory,
    paddingLeft: space.s2,
    marginBottom: space.s3,
  },
  text: {
    margin: 0,
  },
});

interface ServerCopyNoteProps {
  /** The callout sentence. Unset or empty while the server copy matches the one the input started from. */
  message?: string;
  discardLabel: string;
  onDiscard: () => void;
}

/**
 * The callout an admin editor shows when the server copy changed under unsaved
 * input. The status region stays mounted, so a screen reader announces the
 * callout when it appears without interrupting.
 */
export function ServerCopyNote({ message, discardLabel, onDiscard }: ServerCopyNoteProps) {
  return (
    <div role="status">
      {message ? (
        <div {...stylex.props(styles.note)}>
          <p {...stylex.props(styles.text)}>{message}</p>
          <button type="button" className="btn btn-secondary" onClick={onDiscard}>
            {discardLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
