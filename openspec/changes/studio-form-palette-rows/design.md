## Context

`FormEditorScreen.tsx` builds its palette from `unplacedRefs(catalogIds, rows)`
(`draft/view-layout.ts`), a flat `FieldId[]` with no depth. It displays each
id with local markup. A `formPaletteKey` span reads `labelFor(id)`. A
`formPaletteType` span reads the raw `type` string. Despite its name,
`labelFor` returns `fieldFor(ref)?.key`, the field's raw key. The field's own
`label` value is a separate thing `labelFor` never touches.

The Fields tab's entity rail (`EntityTabs.tsx`'s `FieldsTab`) already solves
the presentation this change wants: it builds its rows from
`flattenRailFields(draft.fields)` (`draft/panel-rail.ts`), which returns
`{ id, depth }` in catalog tree order, and displays each row through the
exported `PanelsRailFieldRow` component using `resolveDraftLocalizedText`,
`fieldKindIcon` and `fieldKindWord` (all already used elsewhere in
`FormEditorScreen.tsx` or its sibling draft modules) for the label, icon and
tooltip/screen-reader type text.

## Goals / Non-Goals

**Goals:**
- Make the palette's per-field row use the same component as the Fields
  tab's entity rail. Give it the same three label/icon/type calls and the
  same depth source. The two lists then display identically for the same
  field.

**Non-Goals:**
- Changing the placed field cards' `key`-in-mono presentation
  (`studio-field-label-wrapping`) is out of scope, confirmed with the user.
- Changing the "add a field to the process" (mint) section below the
  palette is out of scope. It names a field kind, not a catalog field, so
  it has no label, icon or depth to align.
- Changing `PanelsRailFieldRow` itself, `FieldsTab`, or anything under
  `openspec/specs/studio-app/` is out of scope. The entity rail's own
  requirements stay untouched.

## Decisions

**Reuse `PanelsRailFieldRow` directly, rather than duplicating its markup or
styles.**

The component is already exported and already used by exactly one
caller (`FieldsTab`). A second caller is therefore the intended shape here,
and it stays within the existing layering. `PanelsRailFieldRow` lives in
`panels/EntityTabs.tsx`, a sibling panel file in the same `studio` area.
`FormEditorScreen.tsx` already imports several sibling `draft/*` helpers.
The alternative would have copied the row's JSX and stylex rules into
`FormEditorScreen.tsx` instead. This design rejects that alternative. It
would let the two rows drift again the next time either one changes. That
drift is the exact problem this change fixes.

Props not meaningful for an unplaced field get fixed values: `onDrop={() =>
{}}`, `selected={false}`, `dragging={false}`, `issues={0}` and
`groupLabel={undefined}`. The palette is a drag source, never a reorder
target, so `onDrop` stays a no-op. The indent already shows the hierarchy,
so `groupLabel` stays `undefined`. Naming the parent a second time as
hidden text would duplicate `FieldsTab`'s own reason for that prop. Here it
has no matching removal or reparent affordance to justify it.

**Swap `unplacedRefs(catalogIds, rows)` for `flattenRailFields(draft.fields)`
filtered to the still-unplaced set.**

This avoids adding a depth computation to `view-layout.ts`.
`flattenRailFields` already walks the
catalog in the same document order `draftFields`/`flattenDraftFields`
produce: parent, then its own members. The filtered list's order therefore
stays the same. It only adds the `depth` value each row already carries in
the Fields tab.

**Keep `labelFor` and `unplacedRefs` as they are.** `labelFor` still backs
the placed-card key display (out of scope). Other code may still call
`unplacedRefs` elsewhere. Nothing here requires renaming or removing either
one.

## Risks / Trade-offs

The visible type text ("string", "group") disappears from the palette.
This matches the Fields tab's own trade-off, already shipped and accepted
there. The type still reaches the icon's tooltip and a screen reader
through `PanelsRailFieldRow`'s existing hidden text.

A field with an empty base-locale label reads as "Unnamed field" in the
palette. It previously showed a real key there. The definition contract
already requires a non-empty base-locale label (`authoring-invariants.md`).
This can only happen mid-edit on an unpublished draft. `FieldsTab` accepts
the same fallback for the identical reason.

The `formPaletteKey`/`formPaletteType` stylex rules may become dead code.
Delete them in the same change if nothing else in the file references
them. Both `formPaletteField` and `formPaletteFieldMint` stay, since the
mint section below the palette still uses them.

## Migration Plan

Purely presentational, single-file behavioral change behind no flag. No
data migration, no API change. Land it, then run the browser check:
compare the palette against the Fields tab's entity rail side by side.
Also run the four verification gates: `typecheck`, `build`, full `bun
test`, and antislop/whitespace on touched Markdown.

## Open Questions

None. The user walked through and approved this design in chat before
this change opened. That review included the explicit scope boundary
against the placed field cards.
