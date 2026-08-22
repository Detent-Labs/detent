## Why

The field matrix draws three bulk-toggle badges at two different
widths. Each badge is a content-sized button in the mono face. The
labels are VIS, REQ and RO.

Two of them use three characters, so they share one width. The third
uses two, so it renders narrower. The three badges sit as one group of
interchangeable toggles. The uneven badge reads as a defect, not a
distinction.

## What Changes

- `.studio-matrix-flag-badge` gains a fixed width. All three badges,
  `VIS`, `REQ` and `RO`, then render at one width. The width reuses the
  `--matrix-flag-col` custom property that `.studio-matrix-table`
  already declares and sizes to the widest badge.
- The badge text centers inside that width. The narrower `RO` label
  then reads as a member of the group, not a smaller badge.
- The change reaches every mount of `FieldMatrixGrid` that draws bulk
  badges: the panels screen's column and row headers. The canvas dock's
  Field matrix tab draws no bulk badge.
- CSS only. What a badge does, which flags stay eligible, and its
  accessible name all stay the same.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-app`: the field matrix's bulk-toggle badges gain a layout
  constraint. The `visible`, `required` and `readonly` badges SHALL
  render at one shared fixed width.

## Impact

- `packages/web/src/areas/studio/app.css`: `.studio-matrix-flag-badge`
  gains `width` and `text-align`.
- `docs/browser-checks.md`: adds a manual browser-check step under "The
  field matrix" for equal badge width.
- No API, schema, or engine changes.
