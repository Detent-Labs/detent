## Context

`FormEditorScreen.tsx` builds its palette from `unplacedRefs(catalogIds, rows)`
(`draft/view-layout.ts`), a flat `FieldId[]` with no depth, and renders each id
with local markup: a `formPaletteKey` span reading `labelFor(id)` — despite the
name, that function returns `fieldFor(ref)?.key`, the raw key, not the field's
`label` — and a `formPaletteType` span reading the raw `type` string.

The Fields tab's entity rail (`EntityTabs.tsx`'s `FieldsTab`) already solves
the presentation this change wants: it builds its rows from
`flattenRailFields(draft.fields)` (`draft/panel-rail.ts`), which returns
`{ id, depth }` in catalog tree order, and renders each row through the
exported `PanelsRailFieldRow` component using `resolveDraftLocalizedText`,
`fieldKindIcon` and `fieldKindWord` (all already used elsewhere in
`FormEditorScreen.tsx` or its sibling draft modules) for the label, icon and
tooltip/screen-reader type text.

## Goals / Non-Goals

**Goals:**
- Make the palette's per-field row use the same component, the same three
  label/icon/type calls, and the same depth source as the Fields tab's
  entity rail, so the two lists render identically for the same field.

**Non-Goals:**
- Changing the placed field cards' `key`-in-mono presentation
  (`studio-field-label-wrapping`) — out of scope, confirmed with the user.
- Changing the "add a field to the process" (mint) section below the
  palette — it names a field kind, not a catalog field, so it has no label,
  icon or depth to align.
- Changing `PanelsRailFieldRow` itself, `FieldsTab`, or anything under
  `openspec/specs/studio-app/` — the entity rail's own requirements are
  untouched.

## Decisions

**Reuse `PanelsRailFieldRow` directly, rather than duplicating its markup or
styles.** The component is already exported and already used by exactly one
caller (`FieldsTab`), so a second caller is the intended shape, not a layering
violation — it lives in `panels/EntityTabs.tsx`, a sibling panel file within
the same `studio` area, and `FormEditorScreen.tsx` already imports several
sibling `draft/*` helpers. The alternative (copy the row's JSX and stylex
rules into `FormEditorScreen.tsx`) was rejected: it would let the two rows
drift again the next time either one changes, which is the exact problem
this change fixes.

Props not meaningful for an unplaced field get fixed values: `onDrop={() =>
{}}` (the palette is a drag source, never a reorder target), `selected=
{false}`, `dragging={false}`, `issues={0}`, `groupLabel={undefined}` (the
indent already shows the hierarchy; naming the parent a second time as
hidden text would duplicate `FieldsTab`'s own reason for that prop without
its own removal/reparent affordance to justify it).

**Swap `unplacedRefs(catalogIds, rows)` for `flattenRailFields(draft.fields)`
filtered to the still-unplaced set**, instead of adding a depth computation
to `view-layout.ts`. `flattenRailFields` already walks the catalog in the
same document order `draftFields`/`flattenDraftFields` produce (parent
immediately followed by its own members), so the filtered list's order is
unchanged; it only adds the `depth` value each row already carries in the
Fields tab.

**Keep `labelFor` and `unplacedRefs` as they are.** `labelFor` still backs the
placed-card key display (out of scope), and `unplacedRefs` may still be used
elsewhere; nothing here requires renaming or removing either.

## Risks / Trade-offs

[The visible type text ("string", "group") disappears from the palette] →
Matches the Fields tab's own trade-off already shipped and accepted there;
the type still reaches the icon's tooltip and a screen reader via
`PanelsRailFieldRow`'s existing hidden text.

[A field with an empty base-locale label reads as "Unnamed field" in the
palette where it previously showed a real key] → The definition contract
already requires a non-empty base-locale label
(`authoring-invariants.md`), so this can only happen mid-edit on an
unpublished draft; `FieldsTab` accepts the same fallback for the identical
reason.

[`formPaletteKey`/`formPaletteType` stylex rules may become dead code] →
Delete them in the same change if nothing else in the file references them;
`formPaletteField`/`formPaletteFieldMint` stay, since the mint section below
the palette still uses them.

## Migration Plan

Purely presentational, single-file behavioral change behind no flag. No
data migration, no API change. Land it, run the browser check comparing the
palette against the Fields tab's entity rail side by side, and the four
verification gates (`typecheck`, `build`, full `bun test`, antislop/
whitespace on touched Markdown).

## Open Questions

None — the design was walked through and approved in chat before this
change was opened, including the explicit scope boundary against the
placed field cards.
