## Why

A step's view is a flat array. Group membership rides on
`view.fields[].group`, which names a group field's key. `form-ui` collects a
group's members by that key alone, and array position plays no part.

The form editor draws that array flat. A group card and its member cards sit
side by side as peers, at one indentation. Move-up on a member walks it past
its own group card and past unrelated cards. The preview beside the canvas
does not move, because `form-ui` re-collects by key on the next render. The
gesture reads as "take this field out of the group" and does nothing of the
sort.

Placing a group's field is the same story from the other side. An author drags
`vorname` from the palette and drops it. Then the author opens the strip on
the right and picks `Gruppe = personendetails`. Four fields mean four trips
through that select, and nothing on the canvas shows the result.

## What Changes

- **BREAKING** (authoring, pre-1.0): a field entry's `group` SHALL name the key
  of the field's own catalog parent group. A field the catalog hangs at the top
  level has no `group`. The published contract today states the opposite in as
  many words, so this reverses it.
- A note keeps the freedom the old rule gave every entry. A note names no
  catalog field, so nothing parents it. Its strip keeps the group select.
- The form editor canvas nests. A group card draws its placed members inside
  it. A member sitting in a group is then visible without opening the preview.
- Dragging a group's field from the palette places it inside that group,
  whatever slot the drop named. Where the group's own card is not on the form
  yet, the same drop places the card too.
- A member's move commands reach its own group's members and stop there.
  Move-up on the first member and move-down on the last are unavailable. The
  canvas rejects a drag aimed past the group's edge.
- Removing a group card removes the members placed in it, from that view. The
  catalog keeps every field, and each one returns to the palette.
- A field card's strip drops its group select. The field catalog's own
  move control becomes the one place that answers where a field belongs.
- That move control gains a second write. Moving a field between groups now
  rewrites the `group` of every view entry naming it, across every step.
  Renaming a group's key does the same. Without those, the one control the
  rule points at produces a draft no publish accepts.
- `examples/purchase-requisition.json` gets its catalog restructured. It places
  40 top-level fields into groups through `group` alone, which the new rule
  rejects. Eight of its fields also sit in a different group per step. `quantity`
  names five: `request`, `line_item`, `order`, `ordered` and
  `ordered_vs_received`. Each such field gets one group for the whole process,
  and its five view entries then agree.

Not every catalog child of a group has to be on a given form. A group holding
`vorname`, `nachname`, `geburtsdatum` and `wohnort` can appear on one form with
the first two, and on another with the last two. That already works, and it
stays.

What does not survive is the reverse: one field wearing a different group per
step. The catalog answers that question once, for the whole process. The
owner weighed the loss against `purchase-requisition.json`'s eight such fields
and took it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `definition-contract`: one requirement gains a parentage half for field
  entries. It is the one titled "A view entry's group names a group field the
  same view carries". It loses the paragraph permitting an entry to name any
  group the view carries. The note half stays as written.
- `studio-form-editor`: the canvas nests a group's members inside its card. The
  palette drop places a group's field into its group, and places the group's
  own card where that is missing. The group bounds every move command.
  Removing a group card takes its members with it. A field's strip no longer
  offers a group select.
- `studio-app`: the catalog rail's field move rewrites the view entries naming
  the moved field, instead of rewriting no reference at all. A new requirement
  gives a group's key rename the same treatment.

`form-ui` is untouched. It already reads membership from `group` and draws the
container. The rule above only narrows which values reach it.

## Impact

- `src/schema/compile.ts`. `checkViewGroupReferences` gains the parentage
  check, on the write path. That follows the placement criterion the
  requirement already states. Three published bodies violated the earlier
  half, and a schema refinement would strand every instance pinned to one of
  them.
- `packages/web/src/areas/studio/draft/view-layout.ts`. The group-aware move,
  the group-aware insert, and the cascading remove.
- `packages/web/src/areas/studio/screens/FormEditorScreen.tsx`. Nested canvas
  rendering, the drop handler, the disabled move buttons, and the strip's
  dropped control.
- `packages/web/src/areas/studio/panels/EntityTabs.tsx`. `moveField` writes the
  field array today (`EntityTabs.tsx:423`). It gains the view rewrite, in the
  same `mutate`. Both the drag and the keyboard move already funnel through it.
- `packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx`. The two key
  inputs gain the rename rewrite. A group's `key` is what a view entry stores.
- `packages/web/src/areas/studio/draft/`. One new helper does both rewrites.
- `packages/web/src/areas/studio/panels/fieldCatalogLogic.ts`. `moveFieldToGroup`
  keeps its signature and its job. Its doc comment states the old
  no-view-change rule and needs correcting.
- `examples/purchase-requisition.json`, and `docs/authoring-guide.md` where it
  teaches the group rule.
- Tests: `test/compile-validation.test.ts` for the publish rejection and the
  example loop, `test/validate.test.ts` for its own example list, and
  `packages/web/test/studio-view-layout.test.ts`,
  `packages/web/test/studio-fieldCatalogLogic.test.ts` and
  `packages/web/test/studio-formEditor-strip.test.tsx` for the studio.
