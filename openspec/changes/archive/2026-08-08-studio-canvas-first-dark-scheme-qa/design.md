## Context

See `proposal.md` for motivation. `src/shell/tokens.css` defines dark
mode entirely through `@media (prefers-color-scheme: dark)`. It
overrides primitive color values under the same semantic names light
mode uses. No component reads a primitive token directly. Every
component reads a semantic one instead, three examples being
`--color-surface`, `--color-text`, and `--color-accent`.
`.claude/rules/design-language.md` states this as a firm rule, not a
suggestion.

This already holds for every existing studio component. The risk this
change addresses is narrow. The two prior changes' new components each
started from the mockup's own "Modernist" reference styling. That
mockup is a static HTML file with its own inline styles; it is not
built against `tokens.css`. A new component could reach for a literal
hex value, or a primitive token, out of habit.

## Goals / Non-Goals

**Goals:**
- Confirm every new component from the two prior changes renders
  correctly under `prefers-color-scheme: dark`.
- Fix a hardcoded color or primitive-token reference found during that
  check. Route it through the existing semantic layer instead.

**Non-Goals:**
- No new theme-switching mechanism. `prefers-color-scheme` stays the
  only signal.
- No change to `src/shell/tokens.css`'s token values or names.
- No visual redesign. This change fixes conformance. It does not
  restyle a component the prior changes already shipped correctly.

## Decisions

### This is a QA pass over existing components, not a new capability

Dark mode is not new. It already works for every existing studio
component, through the semantic-token layer. This change does not add a
dark-mode capability. It extends that existing, working guarantee to
cover components two other changes introduce.

That is why this change's `.openspec.yaml` sets `skip_specs: true`. No
capability's observable behavior changes. Correct dark rendering is
already the specified norm; this change only verifies new code against
it.

### Verification is manual, in a real browser

`tokens.css`'s dark-mode values differ from light mode by design: an
ink-tinted, not just inverted, palette, per `design-language.md`. An
automated screenshot diff would need its own dark-mode baseline images.
This repo does not maintain those today.

A manual walkthrough is the established tool for this kind of check,
per `docs/browser-checks.md`'s existing convention for UI changes. It
is proportionate to a handful of new components. `tasks.md` task 4.3
adds this walkthrough's checklist as an entry in
`docs/browser-checks.md` itself. The check then stays re-runnable
after this change archives.

## Risks / Trade-offs

- A manual pass could miss a low-contrast state a screenshot diff might
  catch. One example: a focus ring on a dark-scheme disabled control.
  Mitigation: `tasks.md`'s walkthrough names each new component's
  interactive states explicitly, not just its default appearance.

## Open Questions

- None known going in. This is a QA-and-fix pass over already-specified
  components. A finding's correct fix follows one rule: route the
  offending color through the matching semantic token in `tokens.css`.
  If the walkthrough surfaces a color with no obvious matching semantic
  token, settle the mapping during `tasks.md` section 4. Do not open a
  new token.

## Migration Plan

This change needs no data migration. This change may find nothing to
fix; then it needs no code change at all. Any fix it does make stays
CSS-only within
the two prior changes' new components. Deploy and rollback are a normal
`packages/web` build and release.
