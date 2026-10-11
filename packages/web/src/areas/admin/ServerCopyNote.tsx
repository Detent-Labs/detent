import { useRef } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, space } from "form-ui/tokens.stylex";

/** `DESIGN.md`'s Warning Callout: refusal text beside a 3px rule in the advisory role. */
const styles = stylex.create({
  // The wrapper takes script focus only, after Discard. It has no role, so it needs no ring.
  wrapper: {
    outline: "none",
  },
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
    maxWidth: "68ch",
  },
  discard: {
    textAlign: "left",
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
 * input. The status region stays mounted and holds the sentence alone, so a
 * screen reader announces the sentence when it appears without interrupting.
 * The button sits outside the region. Discard unmounts the button, so focus
 * moves to the wrapper, which keeps the callout's place in the page order.
 */
export function ServerCopyNote({ message, discardLabel, onDiscard }: ServerCopyNoteProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const discard = stylex.props(styles.discard);
  return (
    <div ref={wrapperRef} tabIndex={-1} {...stylex.props(styles.wrapper, message ? styles.note : undefined)}>
      <div role="status">{message ? <p {...stylex.props(styles.text)}>{message}</p> : null}</div>
      {message ? (
        <button
          type="button"
          className={`btn btn-secondary ${discard.className}`}
          style={discard.style}
          onClick={() => {
            onDiscard();
            wrapperRef.current?.focus();
          }}
        >
          {discardLabel}
        </button>
      ) : null}
    </div>
  );
}
