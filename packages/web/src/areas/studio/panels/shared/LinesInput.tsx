import { useId, useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, space } from "form-ui/tokens.stylex";
import { t } from "../../catalog.js";
import { parseLines, shownLines, type LinesEdit } from "./pluginConfigText.js";

const styles = stylex.create({
  field: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    minWidth: 0,
  },
  captionLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
});

type Props = {
  /** The stored list. */
  value: unknown;
  onChange: (next: string[]) => void;
  /** An error line, a sibling of the label. */
  error?: ReactNode;
} & (
  | {
      /** The label text above the control. The default one-per-line hint stands under it. */
      label: ReactNode;
      caption?: undefined;
    }
  | {
      /** A caption that states the one-per-line rule. It stands as the label above the control, in place of the hint, and serves as the description. */
      caption: ReactNode;
      label?: undefined;
    }
);

/** The one string-list textarea: one value per line. The draft updates on each
 * key, and the author's text stays while it parses to the stored list. */
export function LinesInput({ label, value, onChange, caption, error }: Props) {
  const [edit, setEdit] = useState<LinesEdit | null>(null);
  const id = useId();
  const ruleId = `${id}-rule`;
  const errorId = `${id}-error`;
  const text = shownLines(edit, value);
  return (
    <div {...stylex.props(styles.field)}>
      {caption === undefined ? (
        <label htmlFor={id}>{label}</label>
      ) : (
        <label id={ruleId} htmlFor={id} {...stylex.props(styles.captionLabel)}>
          {caption}
        </label>
      )}
      {error && (
        <span id={errorId} className="error">
          {error}
        </span>
      )}
      <textarea
        id={id}
        rows={3}
        value={text}
        aria-describedby={error ? `${ruleId} ${errorId}` : ruleId}
        onChange={(e) => {
          const list = parseLines(e.target.value);
          setEdit({ text: e.target.value, base: JSON.stringify(list) });
          onChange(list);
        }}
      />
      {caption === undefined && <small id={ruleId}>{t("plugin.arrayHint")}</small>}
    </div>
  );
}
