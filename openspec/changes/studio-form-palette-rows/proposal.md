## Why

The form editor's "available fields" palette (`FormEditorScreen.tsx`) shows
each field's `key` and `type` as raw text, with no icon.

The Fields tab's entity rail shows the same fields differently: a resolved
label and a kind icon.

`studio-app` states that "no row prints a `key`". An author picks a field
to place on a form. They meet a more technical, visually inconsistent view
of that same catalog there. That author just left a cleaner presentation
of it on the Fields tab.

## What Changes

- The form editor's palette row for an unplaced catalog field now shows a
  resolved label and a kind icon. This is the same presentation the Fields
  tab's entity rail already uses for the same field. The row no longer
  shows the field's raw `key` or raw `type` string.
- A field nested inside a catalog group now indents under that group in
  the palette. This follows the same hierarchy the entity rail already
  draws. The palette keeps its existing order.
- This change does not touch the placed field cards on the form canvas.
  It also does not touch the "add a field to the process" section of the
  palette. Nor does it touch the Fields tab itself. A placed card keeps
  showing the field's `key` in the mono face. That stays a distinct,
  deliberate presentation for a value already committed to the form
  (`studio-field-label-wrapping`). This change does not touch that
  presentation either.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-form-editor`'s palette requirement (the one about showing every
  unreferenced catalog field in a left-hand palette) gains a presentation
  rule. A palette row now shows the field's resolved label and kind icon.
  It indents under its group where the catalog nests it. It no longer
  shows the field's raw key or type.

## Impact

- `packages/web/src/areas/studio/screens/FormEditorScreen.tsx`: the
  palette's row markup switches to the `PanelsRailFieldRow` component
  (`packages/web/src/areas/studio/panels/EntityTabs.tsx`), already used by
  the Fields tab. The id list driving it switches from `unplacedRefs` to
  `flattenRailFields`, filtered to the unplaced set. This keeps the same
  rows in the same order, and adds a depth value.
- `docs/browser-checks.md`: records the new palette-vs-entity-rail browser
  check.
- `docs/decisions.md`: drops the palette clause of the open **KEYS-1** item
  ("the 16rem palette wraps 10 of its 38 keys"). This change makes that
  clause false, since the palette no longer shows a key at all. The
  entry's canvas-card clause stays as it is.
- No schema, engine, HTTP, or i18n catalog change. No change to the Fields
  tab, the placed field cards, or the "add a field to the process" section.
