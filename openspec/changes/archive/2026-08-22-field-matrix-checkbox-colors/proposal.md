## Why

The field matrix packs up to three plain, uncolored checkboxes
(`visible`/`required`/`readonly`) into every live cell. All three render
identically. Finding which fields carry `required`, or which cells got
marked `readonly`, means reading each `aria-label` in turn, not
pattern-matching by sight. A distinct color per checkbox function turns
that into a glance.

## What Changes

- Give each of the three flag checkboxes (`visible`, `required`,
  `readonly`) in a field-matrix live cell its own color. Apply it
  consistently across the panels-screen grid and the canvas dock's Field
  matrix tab.
- Add matching swatches to the panels screen's field matrix legend. The
  legend states the color-to-function mapping on-screen; a developer no
  longer has to infer it.
- Introduce the new color tokens this needs in `tokens.css`. A component
  reads a semantic role by class, per the design language's rule; it
  never reads a hex value directly.
- The colors add to the existing checkbox. They do not replace the
  `aria-label`, the disabled/gated dimming, or the flagged-cell ring.
  None of those three change.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-app`: two requirements change. "A live cell edits its own view
  entry inline" gains a per-flag color rule for the three checkboxes.
  The field-matrix legend requirement grows a seventh entry for the new
  colors.

## Impact

- `packages/web/src/areas/studio/panels/FieldMatrixGrid.tsx`: a
  per-checkbox class keyed on `FlagKey`.
- `packages/web/src/areas/studio/panels/FieldMatrixPanel.tsx`: the legend
  entry and its swatches.
- `packages/web/src/areas/studio/app.css`: new `.studio-matrix*` color
  rules. `packages/web/src/shell/tokens.css`: the new color tokens.
- `packages/web/src/i18n/catalogs/studio.ts`: a new
  `fieldMatrix.legendColors` (or equivalent) key for the seventh
  legend entry's text.
- `.claude/rules/design-language.md`: one line documenting the
  `--color-flag-*` tokens as a scoped exception to the one-hue palette.
- `tmp/Detent Design Language.dc.html`: the three `--color-flag-*`
  swatches/roles, added to the "02 Colour" section. The rule file states
  that the two documents must change together.
- `openspec/specs/studio-app/spec.md`: synced with this change's two
  `MODIFIED Requirements`.
- `packages/web/test/studio-fieldMatrixPanel-legend.test.tsx`: raised
  legend span-count expectation, plus new swatch-token assertions.
- `packages/web/test/studio-editorDock-fieldMatrixTab.test.tsx`: a new
  assertion that a gated checkbox carries `aria-disabled="true"` and no
  native `disabled` attribute.
- `packages/web/src/areas/studio/draft/view-flags.ts`: a new exported
  predicate wrapping `gatedKeys`, reused by the field matrix's `onChange`
  guard.
- `packages/web/test/studio-viewFlags.test.ts`: a new assertion for that
  predicate.
- `docs/browser-checks.md`: one new entry documenting the
  color/legend/dimming manual check.
- No schema, engine, or API changes. The change is presentational only.
  `setFlag`, the gating rules, and the definition contract stay
  unchanged.
