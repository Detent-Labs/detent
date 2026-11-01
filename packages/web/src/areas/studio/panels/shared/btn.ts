import * as stylex from "@stylexjs/stylex";

/** Literal classes plus compiled styles, as one set of props. Spreading
 * `stylex.props(...)` beside a `className` attribute drops whichever of the
 * two the JSX writes first, so the class lists join here. The styles arrive as
 * separate arguments, so a conditional style stacks after the base one. */
export function btn(classes: string, ...style: stylex.StyleXStyles[]) {
  const compiled = stylex.props(...style);
  return { ...compiled, className: `${classes} ${compiled.className ?? ""}`.trim() };
}

/** `btn btn-ghost` plus compiled styles. */
export function ghost(...style: stylex.StyleXStyles[]) {
  return btn("btn btn-ghost", ...style);
}
