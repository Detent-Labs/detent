import * as stylex from "@stylexjs/stylex";
import { colors, fonts, radius, space } from "./tokens.stylex";

/**
 * `.btn` and `.btn-primary` from `tokens.css`, as StyleX. The CSS rules stay
 * for the many literal `btn` emitters; this pair exists so a web screen can
 * hand the button look across the package boundary to `form-ui`'s
 * `PathButtons`, which today reaches into the host's stylesheet for it.
 */
export const btn = stylex.create({
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.s1,
    fontFamily: fonts.heading,
    fontWeight: fonts.headingWeight,
    fontSize: 14,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    borderRadius: radius.md,
    paddingBlock: space.s2,
    paddingInline: `calc(${space.s3} * 1.2)`,
    cursor: { default: "pointer", ":disabled": "not-allowed" },
    opacity: { default: null, ":disabled": 0.45 },
  },
  primary: {
    backgroundColor: { default: colors.accent, ":hover": colors.accent600, ":active": colors.accent700 },
    color: colors.accentContrast,
  },
});
