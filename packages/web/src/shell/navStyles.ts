import * as stylex from "@stylexjs/stylex";
import { colors, space } from "form-ui/tokens.stylex";

/** `.shell-nav`, its `[aria-current="page"]` state and its sub-30rem
 * collapse, from `shell.css`. Declared once; every area root imports it
 * (design.md D9), studio included. The attribute condition applies
 * directly to each nav button rather than through a descendant selector:
 * only a nav button ever carries `aria-current="page"` in these roots. */
export const navStyles = stylex.create({
  nav: {
    display: "flex",
    gap: space.s2,
    flex: 1,
    order: { default: 0, "@media (max-width: 30rem)": 3 },
    flexBasis: { default: "auto", "@media (max-width: 30rem)": "100%" },
  },
  // Applied only when a root's own route check marks the tab current
  // (design.md D13) — not a CSS attribute condition, since an unconditional
  // StyleX `background` declaration here would out-specificity `.btn-
  // secondary`'s own `:hover`/`:active` rules on every OTHER tab too.
  navCurrent: {
    background: `color-mix(in srgb, ${colors.text} 7%, transparent)`,
  },
});
