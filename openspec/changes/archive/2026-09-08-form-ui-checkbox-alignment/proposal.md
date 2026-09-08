## Why

A standalone `boolean` field with no `control: "radio"` renders its checkbox
inside the same flex-column label wrapper every other control type uses. That
wrapper stretches its children to the row's full width by default. A text or
date input carries a visible bordered box. That box fills the stretched
width, so the field reads as flush left.

A checkbox has no visible box of its own. Its reset strips the border and
the background. The stretch still enlarges the checkbox's layout box, but
that box stays invisible. The browser paints the checkbox glyph at that
invisible box's horizontal center. A wider row pushes the glyph further from
its own label.

A live-browser repro against the production styles confirmed this mechanism.
The checkbox's layout box computed to 333px wide. Its intrinsic size is
13px. The glyph sat centered inside the wider box.

## What Changes

- The single standalone checkbox control gets its own alignment fix. This is
  the `boolean` field's non-`radio` branch in `FieldForm.tsx`. It stops
  stretching to the row width. It renders at its intrinsic size, flush left
  under its label. That matches every other option control (radio, checkbox
  group). It also matches the flush-left rule in
  `.claude/rules/design-language.md`.
- Every other control type keeps its current rendering. So does the grouped
  radio/checkbox-group rendering. Both already render flush left today.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `form-ui`: a standalone boolean checkbox gains an explicit layout
  requirement. It must render flush left, at its intrinsic size. No
  requirement covered this before. The addition sits at the spec level. It
  goes beyond an implementation detail.

## Impact

- Affected code: `packages/form-ui/src/FieldForm.tsx`. One StyleX style
  addition applies to the single-checkbox `<input>`, in the `boolean` +
  non-`radio` branch only.
- Affected tests: `packages/form-ui/test/field-form.test.tsx`. A regression
  assertion covers the new style.
- No schema, API, or markup-structure changes.
- Every consumer of `FieldForm` picks up the fix automatically. None needs
  its own change. All four share one renderer:
  - the studio Player
  - the app area's Task screen
  - the studio form editor's preview
  - the field catalog's own inert field preview (`FieldCatalogPanel.tsx`)
