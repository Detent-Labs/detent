## Why

The form editor's "available fields" palette (`FormEditorScreen.tsx`) shows
each catalog field as a raw `key` plus its raw `type` string, in plain text
with no icon. The Fields tab's entity rail shows the same catalog fields with
a resolved label and a kind icon, and states in `studio-app` that "no row
prints a `key`". An author picking a field to place on a form meets a more
technical, visually inconsistent presentation of the exact same catalog than
the one they just left on the Fields tab.

## What Changes

- The form editor's palette row for an unplaced catalog field now shows the
  field's resolved label and its kind icon, the same presentation the Fields
  tab's entity rail already uses for the same field, instead of the field's
  raw `key` and raw `type` string.
- A field nested inside a catalog group now indents under that group in the
  palette, the same hierarchy the entity rail already draws. The palette's
  order is unchanged.
- The placed field cards on the form canvas, the "add a field to the process"
  section of the palette, and the Fields tab itself are unchanged. A placed
  card keeps showing the field's `key` in the mono face — that stays a
  distinct, deliberate presentation for a value already committed to the
  form (`studio-field-label-wrapping`), not something this change touches.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-form-editor`: the palette requirement ("The editor SHALL show every
  catalog field not currently referenced by the step's view in a palette on
  the left...") gains a presentation rule — a palette row shows the field's
  resolved label and kind icon, indented under its group where the catalog
  nests it, instead of the field's raw key and type.

## Impact

- `packages/web/src/areas/studio/screens/FormEditorScreen.tsx`: the palette's
  row markup switches to the `PanelsRailFieldRow` component
  (`packages/web/src/areas/studio/panels/EntityTabs.tsx`) already used by the
  Fields tab, and the id list driving it switches from `unplacedRefs` to
  `flattenRailFields` filtered to the unplaced set, for the same rows in the
  same order plus a depth value.
- `docs/browser-checks.md`: records the new palette-vs-entity-rail browser
  check.
- `docs/decisions.md`: drops the palette clause of the open **KEYS-1** item
  ("the 16rem palette wraps 10 of its 38 keys"), which this change makes
  false — the palette no longer shows a key at all. The entry's canvas-card
  clause is untouched and stays.
- No schema, engine, HTTP, or i18n catalog change. No change to the Fields
  tab, the placed field cards, or the "add a field to the process" section.
