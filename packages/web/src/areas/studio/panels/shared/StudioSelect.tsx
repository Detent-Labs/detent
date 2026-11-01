import type { ReactNode, SelectHTMLAttributes } from "react";
import * as stylex from "@stylexjs/stylex";
import { ChevronDown } from "lucide-react";
import { colors, space } from "form-ui/tokens.stylex";

const styles = stylex.create({
  // The studio select: a native `<select>` with its UA chevron dropped in
  // favor of a decorative `ChevronDown` layered over the trailing edge.
  selectWrap: {
    position: "relative",
    display: "block",
  },
  select: {
    // `selectWrap` stretches to the flex column's full width (its own
    // `<label>` parent is a flex column, and a flex item stretches on the
    // cross axis by default), but a bare `<select>` sizes to its option
    // text unless told otherwise. Without this, the select's own box stays
    // content-width while `selectIcon` sits at the wrapper's trailing edge,
    // landing well past the select's own right border.
    width: "100%",
    appearance: "none",
    paddingInlineEnd: space.s8,
  },
  selectIcon: {
    position: "absolute",
    insetInlineEnd: space.s2,
    insetBlock: 0,
    display: "flex",
    alignItems: "center",
    color: colors.textMuted,
    pointerEvents: "none",
  },
});

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className" | "style"> & {
  children: ReactNode;
};

/**
 * The studio select. The native `<select>` stays the element, so a `<label>`
 * wrapping this component still names it. Every prop but the style passes
 * through to it.
 */
export function StudioSelect({ children, ...rest }: Props) {
  return (
    <span {...stylex.props(styles.selectWrap)}>
      <select {...rest} {...stylex.props(styles.select)}>
        {children}
      </select>
      <span {...stylex.props(styles.selectIcon)}>
        <ChevronDown size={18} strokeWidth={1.75} aria-hidden="true" />
      </span>
    </span>
  );
}
