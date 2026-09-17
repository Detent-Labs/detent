## Why

The step page's masthead lays a step's own Label and Key side by side. The
wider column carries Label. The Path to section's own Label and Key, one
row per path, stack instead: one full-width field over the other. Same
field pair, same step page, two layouts. The screen reads as inconsistent
where it should read as one register.

## What Changes

- Each path row in the Path to section now lays its Label and Key fields
  side by side. The two-column grid matches the masthead's own Label/Key
  row, with the wider column carrying Label.
- The row collapses to one column, Label over Key, under the step page's
  existing narrow-viewport breakpoint. That is the same collapse the
  masthead's row already performs.
- The path row's "to" (target step) field keeps its own full-width row
  below Label and Key. It is not part of this change.
- No new strings, no schema change. `Path.label` is a plain string, not
  `LocalizedText`. The path row carries no missing-translation warning and
  does not need an extra wrapper column the way the step's own Label field
  does.

## Capabilities

### Modified Capabilities

- `studio-step-page`: the Path to section's per-path Label and Key fields
  now stand side by side. The step page's own masthead already states
  that pattern as a requirement.

## Impact

- `packages/web/src/areas/studio/panels/PathsPanel.tsx`: adds a
  `labelKeyRow` grid style (copied from `StepPage.tsx`'s own compiled
  style, per this file's existing duplication comment) and wraps each
  path row's Label and Key fields in it.
- No engine, schema, or i18n catalog change.
