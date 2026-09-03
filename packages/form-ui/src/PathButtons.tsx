import * as stylex from "@stylexjs/stylex";
import type { AvailablePath } from "./types.js";
import { space } from "./tokens.stylex.js";

const styles = stylex.create({
  paths: {
    display: "flex",
    gap: space.s2,
  },
});

interface PathButtonsProps {
  paths: AvailablePath[];
  onSubmit: (pathId: string) => void;
  loading?: boolean;
  /** Composed after the component's own wrapper style, so a caller can
   * extend or override its layout without form-ui declaring a variant on
   * its own behalf. */
  style?: stylex.StyleXStyles;
}

/** One submit action per `availablePaths` entry; none when the list is empty
 * (a wait-state with no currently-matching manual path renders read-only).
 * The button's `btn btn-primary` className stays literal: `.btn` is a
 * shared control class this package does not own (`web-styling`'s phase 2
 * scope), so form-ui declares no compiled style for it. */
export function PathButtons({ paths, onSubmit, loading, style }: PathButtonsProps) {
  if (paths.length === 0) return null;
  return (
    <div {...stylex.props(styles.paths, style)}>
      {paths.map((path) => (
        <button key={path.id} type="button" className="btn btn-primary" disabled={loading} onClick={() => onSubmit(path.id)}>
          {path.label ?? path.key}
        </button>
      ))}
    </div>
  );
}
