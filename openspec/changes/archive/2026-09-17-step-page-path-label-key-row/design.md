## Context

`PathsPanel.tsx` already duplicates `fieldLabel`, `fieldLabelText` and
`monoInput` from `StepPage.tsx` on purpose. A comment in the file states
why: compiled StyleX styles stay beside their own module
(`.claude/rules/design-language.md`'s styling model, restated in
`CLAUDE.md`). `StepPage.tsx` already carries the target layout in
`labelKeyRow`, a grid with `minmax(0, 2fr) minmax(0, 1fr)` columns. That
grid collapses to one column under `NARROW` (`@media (max-width:
64rem)`). `StepPage.tsx` wraps the step's own Label field in a further
`labelKeyColumn` div, so a missing-translation warning can sit as the
label's sibling.

`Path.label` is a plain string, not `LocalizedText`
(`.claude/rules/process-contract.md`), so the path row has no
missing-translation warning. Proposal.md states why this change stays
scoped to the Path to section's row.

## Goals / Non-Goals

**Goals:**
- Match the path row's Label/Key layout to the masthead's, including the
  narrow-breakpoint collapse.

**Non-Goals:**
- Moving the "to" select into the Label/Key row (proposal.md decides this
  stays out of scope).
- Touching any other Label/Key pair in the studio; this conversation found
  none beyond the masthead, which already matches.

## Decisions

- **Copy `labelKeyRow` and the `NARROW` breakpoint constant into
  `PathsPanel.tsx`'s own `stylex.create()` block, rather than importing
  either from `StepPage.tsx`.** This follows the pattern the file's own
  comment already states for `fieldLabel`, `fieldLabelText` and
  `monoInput`. Compiled StyleX styles stay beside their own module.
  Importing instead would create the one cross-import this file
  deliberately avoids for every other shared style.
- **Wrap Label and Key directly in `labelKeyRow`, with no
  `labelKeyColumn` wrapper.** `StepPage.tsx` wraps its Label field in
  `labelKeyColumn` only to give the missing-translation warning a sibling
  slot. `Path.label` is a plain string with no translation state, so that
  wrapper has nothing to carry here. Key already renders directly inside
  `fieldLabel` on both pages.
- **Leave the "to" field where it is, as its own row below
  `labelKeyRow`.** This is the brief's default. The user asked only about
  Label and Key. The three-field stack of Label, Key and "to" becomes a
  two-row stack instead: the Label/Key grid, then "to". A three-column
  row would squeeze "to"'s target-step `<select>` into a column sized for
  a short field. That select's option text is a step key or label of
  unbounded length. The masthead's own two-field row sets no precedent
  for a third column either.

## Risks / Trade-offs

- Risk: the Path to section's leading column is narrower than the
  masthead's full width. It is `minmax(0, 3fr)` of a `3fr 1px 2fr` split,
  where the masthead's own row spans the full width. The same 2fr:1fr
  ratio inside a narrower parent could read tighter than the masthead's
  version.
  Mitigation: verify this in the browser check the brief already calls
  for. The grid's `minmax(0, …)` tracks shrink before they clip, and the
  narrow-viewport collapse is the existing fallback for a tight column.

## Migration Plan

None. Presentation-only change to one existing screen; no data, no schema,
no API.

## Open Questions

None. The brief raised two open questions. Goals / Non-Goals and
Decisions above answer both: whether "to" joins the row, and whether the
fix reaches elsewhere.
