import * as stylex from "@stylexjs/stylex";

/**
 * StyleX view of every custom property `packages/web/src/shell/tokens.css`
 * declares. `tokens.css` stays authoritative: each value here aliases the
 * custom property it already declares, so dark mode, `color-scheme` and the
 * primitive ramp keep one source. A StyleX file may only export
 * `defineVars`, and its name must end in `.stylex.ts`, or the compiler
 * refuses the import.
 *
 * `colors` folds `tokens.css`'s three color sections (primitives, ramps,
 * semantic aliases) into one group, mirroring how `accent600`/`accent700`
 * already sat beside the semantic names before this move. `fonts`, `space`,
 * `radius` and `shadow` mirror `tokens.css`'s remaining sections one for
 * one. 39 variables total, matching `tokens.css`'s own count.
 */
export const colors = stylex.defineVars({
  // primitives
  paper50: "var(--paper-50)",
  ledger100: "var(--ledger-100)",
  ink900: "var(--ink-900)",
  slate500: "var(--slate-500)",
  hairline300: "var(--hairline-300)",
  stamp600: "var(--stamp-600)",
  refusal700: "var(--refusal-700)",
  flagVisible: "var(--color-flag-visible)",
  flagRequired: "var(--color-flag-required)",
  flagReadonly: "var(--color-flag-readonly)",
  // tonal ramps
  neutral500: "var(--color-neutral-500)",
  neutral900: "var(--color-neutral-900)",
  accent400: "var(--color-accent-400)",
  accent600: "var(--color-accent-600)",
  accent700: "var(--color-accent-700)",
  // semantic aliases — components should read these, never a primitive or a ramp step
  surface: "var(--color-surface)",
  surfaceMuted: "var(--color-surface-muted)",
  text: "var(--color-text)",
  textMuted: "var(--color-text-muted)",
  border: "var(--color-border)",
  divider: "var(--color-divider)",
  accent: "var(--color-accent)",
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
  s6: "var(--space-6)",
  s8: "var(--space-8)",
});

export const radius = stylex.defineVars({
  sm: "var(--radius-sm)",
  md: "var(--radius-md)",
  lg: "var(--radius-lg)",
});

export const shadow = stylex.defineVars({
  md: "var(--shadow-md)",
  lg: "var(--shadow-lg)",
});
