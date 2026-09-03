import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { AvailablePath } from "./types.js";

interface PathButtonsProps {
  paths: AvailablePath[];
  onSubmit: (pathId: string) => void;
  loading?: boolean;
  /** The host's button look. form-ui owns the layout of the row, never the
   * look of a button: today that comes from the host's `btn btn-primary`
   * stylesheet classes, here it is a style the host passes across the
   * package boundary. */
  buttonStyle?: StyleXStyles;
}

const styles = stylex.create({
  row: {
    display: "flex",
    gap: "var(--space-2)",
  },
});

/** One submit action per `availablePaths` entry; none when the list is empty
 * (a wait-state with no currently-matching manual path renders read-only). */
export function PathButtons({ paths, onSubmit, loading, buttonStyle }: PathButtonsProps) {
  if (paths.length === 0) return null;
  return (
    <div {...stylex.props(styles.row)}>
      {paths.map((path) => (
        <button key={path.id} type="button" {...stylex.props(buttonStyle)} disabled={loading} onClick={() => onSubmit(path.id)}>
          {path.label ?? path.key}
        </button>
      ))}
    </div>
  );
}
