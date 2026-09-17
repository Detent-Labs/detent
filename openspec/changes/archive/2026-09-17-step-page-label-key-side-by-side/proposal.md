## Why

The step page masthead renders LABEL and KEY as two stacked full-width
fields, one directly under the other. Each is a short value and does not
need the full width. The user asked for them to stand side by side in one
row instead. That uses the masthead's width better and reads as one identity block,
where two stacked rows read as unrelated fields.

## What Changes

- Lay LABEL and KEY out as a two-column row (`minmax(0, 2fr) minmax(0, 1fr)`)
  instead of two stacked full-width fields. LABEL takes the wider column: it
  carries prose and can run up to 40% longer in German. KEY carries a short
  slug.
- The row collapses back to one column under the step page's existing narrow
  breakpoint (`NARROW`, 64rem). The masthead's own two-column section layout
  already uses that same collapse.
- LABEL's missing-translation warning moves inside LABEL's own column. It
  stays a sibling of the `<label>`, per the design language's rule that a
  field's messages never nest inside its label. It now reads under LABEL
  alone, instead of spanning the row under KEY too.
- DESCRIPTION keeps its own full-width field below the new row, unchanged.

## Capabilities

### Modified Capabilities

- `studio-step-page`: the step page's naming requirement gains a layout
  detail. LABEL and KEY stand in one row, and the row's narrow-viewport
  collapse and warning placement are now spec'd.

## Impact

- `packages/web/src/areas/studio/panels/StepPage.tsx`: the masthead's LABEL
  and KEY fields (lines ~722-741) move into a new two-column row. A new
  local `stylex.create()` style pair (row + column) reuses the file's
  existing `NARROW` breakpoint. DESCRIPTION and every other masthead element
  keep their current markup.
- `docs/browser-checks.md`: this change adds an entry for the masthead's
  Label/Key row, per this repo's UI-change convention.
