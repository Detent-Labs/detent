import { useId, useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { space } from "form-ui/tokens.stylex";
import { t } from "../../catalog.js";
import { parseLines, shownLines, type LinesEdit } from "./pluginConfigText.js";

const styles = stylex.create({
  field: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    minWidth: 0,
  },
});

interface Props {
  /** The label text above the control. */
  label: ReactNode;
  /** The stored list. */
  value: unknown;
  onChange: (next: string[]) => void;
  /** A caption that states the one-per-line rule. It replaces the default hint and serves as the description. */
  caption?: ReactNode;
  /** An error line, a sibling of the label. */
  error?: ReactNode;
}

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
      <label htmlFor={id}>{label}</label>
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
      <small id={ruleId}>{caption ?? t("plugin.arrayHint")}</small>
    </div>
  );
}
