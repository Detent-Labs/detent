import * as stylex from "@stylexjs/stylex";

/**
 * StyleX view of a slice of `tokens.css`. `tokens.css` stays authoritative:
 * every semantic value here aliases the custom property it already declares,
 * so dark mode, `color-scheme` and the primitive ramp keep one source. A
 * StyleX file may only export `defineVars`, and its name must end in
 * `.stylex.ts`, or the compiler refuses the import.
 *
 * The one exception is `textDormant`. Its two values live today in
 * `areas/admin/app.css` (`#726e6e` light, `--color-neutral-500` dark) rather
 * than in `tokens.css`, so this is the repo's real color-scheme case written
 * the StyleX way: a value keyed on a media query.
 */
export const colors = stylex.defineVars({
  surface: "var(--color-surface)",
  surfaceMuted: "var(--color-surface-muted)",
  text: "var(--color-text)",
  textMuted: "var(--color-text-muted)",
  textDormant: { default: "#726e6e", "@media (prefers-color-scheme: dark)": "var(--color-neutral-500)" },
  border: "var(--color-border)",
  divider: "var(--color-divider)",
  accent: "var(--color-accent)",
  accent600: "var(--color-accent-600)",
  accent700: "var(--color-accent-700)",
  accentContrast: "var(--color-accent-contrast)",
  refusal: "var(--color-refusal)",
});

export const fonts = stylex.defineVars({
  heading: "var(--font-heading)",
  headingWeight: "var(--font-heading-weight)",
  body: "var(--font-body)",
  mono: "var(--font-mono)",
});

export const space = stylex.defineVars({
  s1: "var(--space-1)",
  s2: "var(--space-2)",
  s3: "var(--space-3)",
  s4: "var(--space-4)",
});

export const radius = stylex.defineVars({
  md: "var(--radius-md)",
});
