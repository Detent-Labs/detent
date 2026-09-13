## Context

See proposal.md for the motivation. This section names the code the change
reshapes.

`FieldsTab` in `packages/web/src/areas/studio/panels/EntityTabs.tsx` owns the
Fields tab's selection. It keeps two ids in component state. The id
`selectedFieldId` names a top-level field. The id `focusFieldId` names the row
a rail click named, which can be a group's child. A rail entry reads `RailFieldRow.rootId` from
`draft/panel-rail.ts`. A click stores that root as the selection and the row's
own id as the focus id. The current mark compares `selectedFieldId` with
`row.rootId`, so every child of a selected group carries it.

`FieldCatalogPanel` looks the selection up in `draft.fields` alone. It writes
through `updateInDraftArray` with a top-level index. `FieldEditor` draws the
two halves for that field. A group's children follow its "Validation" zone as
`SubFieldRow` entries, and a `SubFieldRow` calls itself for a nested group. A
scroll effect in `FieldEditor` moves the `field-row-<id>` anchor of the focused
child into view.

`SubFieldRow` lacks the Default value zone, the preview and the effect half. It
carries its own key input, move control, kind picker, Technical checkbox,
options editor, validation editor and check list.

`FieldsTab` already owns one piece of focus handling. After a move, `moveField`
stores `moveControlId(fieldId)` as `refocusId`, and an effect focuses that
element after the commit. The helper `moveControlId` lives in
`fieldCatalogLogic.ts`. The tab file imports the panel, so the panel cannot
import back from it.

`addField` and `removeField` in `FieldsTab` work on the top-level array only.
A child's add and remove run inside `FieldEditor` and `SubFieldRow`, through
the parent's `onChange`.

`LocalizedTextInput` accepts no `id`. `PanelsRailFieldRow` renders its button
without one.

The editor pane in `FieldsTab` scrolls on its own. A selection change remounts
`FieldEditor` and leaves the pane's scroll offset where it was.

The function `resolveLoc` in `draft/issues.ts` gives each check the id of the
entity its location names. For a field it keeps the first `fields[i]` index
alone. The engine locates a nested field's check as `fields[3].fields[0].key`,
so that check names the top-level group today.

The example `examples/it-offboarding.json` holds 51 rail entries: 7 groups and
44 fields. Every one of those fields sits inside a group. The largest group,
"Processing (Fabrikam)", holds 18 fields, and "Permissions" holds 1.

## Shape brief

The owner confirmed this brief from `/impeccable shape` on 2026-09-12. The
choices came from
[a clickable mockup](https://claude.ai/code/artifact/6c932e86-9806-4da7-ba91-ce9008e2103d)
built on the IT Offboarding fields.

- **Job and audience.** A process author, in Operate mode, maintains fields
  that nearly all sit inside groups. They scan the rail for one field and
  open it.
- **Outcome.** Each of the 44 fields opens the zones a top-level field shows.
  The rail marks exactly one entry.
- **Direction.** The world `DESIGN.md` records stays as it is. A group's
  editor gains one zone after "Validation". The zone carries the 2px
  structural rule and the heading "Fields inside this group". It holds one
  secondary button, styled like "+ Add option". A selection takes effect at
  once, under the Still Page Rule.
- **Boundaries.** The rail indent, the drag, the move's destinations and its
  announcement stay as they are. So do the other zones of a group's editor.
  Three anti-goals: no breadcrumb in the heading, no child list inside the
  editor, and no new style.
- **States and ranges.** The walk needs a group with 18 fields, and a group
  with 1 field that the author then removes. It needs a group inside a group
  at the rail's indent cap, and a nested field carrying a check. It needs the
  longest label, "Written confirmation of the immediate lock obtained". It
  needs the layout below 64rem.
- **Confirmation round.** Keyboard focus lands in the new field's label input
  after "+ Add field to this group". The rail scrolls the new entry into view,
  and no further.

## Goals / Non-Goals

**Goals:**

- A nested field and a top-level field reach one editor through one code path.
- The selection names exactly the field the author chose, at any depth.
- A keyboard user keeps a place in the page after an add and after a move.

**Non-Goals:**

- A check in the Checks tab still opens the Fields tab alone.
  `studio-process-tabs` asks for the field to open selected too.
  `EditScreen.tsx` calls `goToTab(tabForIssue(issue.entityType))` and passes no
  field. That gap predates this change and gets its own change.
- The zones "Where values come from" and "Validation" still show for a group.
- Focus after Remove keeps the behavior it has today.
- The glossary row for "field tabs" in `.claude/rules/ui-glossary.md` still
  describes a tab set that no longer exists.
- The rail's two-level indent cap and the drag stay as they are.

## Decisions

### The selection is the chosen entry's own id

`FieldsTab` stores `row.id` on a rail click. The current mark compares the
selection with `row.id`. `focusFieldId`, its prop on `FieldCatalogPanel` and
`FieldEditor`, the scroll effect and the `field-row-<id>` anchor all go.
`RailFieldRow.rootId` loses its last reader, so it goes as well.

The selection falls back to the first rail entry when it names no field in the
tree. It resolves against `flattenDraftFields`, since a nested id is valid now.

Considered: keep `rootId` and scroll to the child's row. That is the behavior
the owner turned down.

### A new selection opens the editor at its top

The tab resets the editor pane's scroll offset whenever the selection changes.
That effect sits before the refocus effect, so an add still lands focus in the
new label input. A move keeps its field selected, so it resets nothing.

Considered: keep the offset, as a top-level field does today. A field among
the 18 in "Processing (Fabrikam)" would then open halfway down, with its label and
key out of view. The mockup left this case out. One effect carries the reset,
so a veto costs one deletion.

### The panel finds the field by id at any depth

The panel finds the selected field in `flattenDraftFields(draft.fields)`. Its
write passes `updateInDraftArray` a lookup that finds the same id inside the
mutable draft. That flatten returns the draft's own objects, so the patch lands
on the nested field. The editor component keys on `field.id` alone.

Considered: a path of indices from the root. A move reorders the arrays, and an
index path then names the wrong field. The id is the definition contract's
sole reference anchor.

### One add function serves the rail, the start state and the group zone

`addField` in `FieldsTab` takes an optional group id. Without one it appends at
the top level, as today. With one it calls the pure `appendToGroup(fields,
groupId, field)` inside the same `mutate`. That helper returns a new top-level
array, as `moveFieldToGroup` does. Both paths select the new field.

`FieldCatalogPanel` receives `onAdd(groupId?)`. The start state and the
panel's own "+ Add field" call it without an id. The panel hands its own
`onAdd` to a new `FieldEditor` prop. The zone "Fields inside this group" calls
that prop with the group's id. The zone renders for `type: "group"` alone,
directly after "Validation". A field that a kind switch moved out of `group`
offers no group to add into.

Three buttons pass a handler straight to `onClick` today. Each one wraps it,
as in `onClick={() => onAdd()}`. A bare handler would receive the click event
as its group id, and `tsc` rejects that form.

The zone's heading reads `fieldCatalog.groupChildrenHeading`, which already
holds "Fields inside this group". The button reuses `fieldCatalog.addSubField`,
and its text becomes "+ Add field to this group". The studio catalog ships
English alone, so no German entry follows.

### Focus and the rail entry after an add into a group

Every add path stores two ids for the commit that follows. The paths are the
rail's "+ Add field", the start state, the panel's own "+ Add field" and the
group zone. One id names the new field's label input, through a new
`fieldLabelInputId(fieldId)`. The other names the new rail entry, through a new
`railEntryId(fieldId)`. Both helpers sit in `fieldCatalogLogic.ts`, beside
`moveControlId`.

The panel's own "+ Add field" stands under every nested field's editor, and
its new field lands at the catalog's end. Focus left on that button would sit
off screen once the editor opens at its top. The new entry would sit below the
rail's fold.

The existing refocus effect focuses the label input. The same effect calls
`scrollIntoView({ block: "nearest", behavior: "instant" })` on the rail entry.
A `nearest` scroll does nothing while the entry already shows. The `instant`
behavior keeps any stylesheet's `scroll-behavior` from animating it.

A move through the move control stores the moved field's rail entry as well.
The effect scrolls that entry into the rail's view, and focus returns to the
move control. A pointer drop clears both ids, so it moves neither focus nor
the rail.

`LocalizedTextInput` gains an optional `id`, placed on its `input`.
`PanelsRailFieldRow` gains an optional `id`, placed on its `button`.

Considered: focus on the new rail entry. A keyboard user would then tab through
every later entry to reach the label. The owner chose the label input.

### Remove selects a sibling, then the group

`removeField` in `FieldsTab` takes a field id. It removes the field at any
depth, through the pure helper `removeFieldIn`. A second pure helper,
`neighbourAfterRemove`, answers which id to select. It returns the next
sibling, then the previous sibling, then the parent group. For a top-level field it returns the next or
the previous top-level field, which is the rule today.

The neighbour helper reads the draft from the handler's closure. The store
applies a `mutate` recipe later, so that draft still holds the removed field.

Considered: the next entry in rail order. Removing a group's last field would
then jump to the first field of the next group.

### A move keeps its own field selected

`moveField` stores `fieldId` as the selection instead of the landed root. The
refocus effect still hands focus to `moveControlId(fieldId)`. The field's own
editor stays mounted across the move, because its key does not change.

### A nested field's check names that field

The resolver keeps the first index of a location alone, so a nested field's
check names the top-level group today. The group's editor used to list the
child, so the check still stood on the right screen. This change moves the
child out of that screen.

The resolver follows the whole index chain instead. A new `fieldAtPath` walks
`fields[i].fields[j]` down to the deepest field carrying an id. The group's
editor and its rail entry then carry the group's own checks alone. A location
that names a field by id, such as `["fields", fieldId, "label"]`, resolves as
before.

Considered: filter the editor's checks by location instead of by id. The
rail's per-entry mark reads `entityId` too, so it would need the same walk.

### `SubFieldRow` goes, and its readers follow

`FieldEditor` becomes the one component that edits a field.
`FieldKeyInput` keeps both its branches and loses one call site.
`fieldCatalog.subFieldsLegend` and `fieldCatalog.optionsLegend` go, since only
`SubFieldRow` reads them. The child fieldset's helpers in `FieldEditor` go in
the same task, since `noUnusedLocals` rejects a declaration nothing reads.

Four comments name `SubFieldRow` and change with it. They are the docs on
`FieldKeyInput`, `FieldEditorProps.onMoveField` and `FieldEditor`, and the doc
on `needsTechnicalToggleConfirm` in `field-usage.ts`. Other comments describe
two field editors or a top-level selection without naming the component. They
sit in `EntityTabs.tsx`, `fieldCatalogLogic.ts`, `FieldValidationEditor.tsx`
and `mintField.ts`. Those comments change too.

The doc in `field-usage.ts` counts the studio's remaining `confirm()` prompts.
One of them sits in `SubFieldRow`, so the count drops from seven to six. The
same count in `docs/decisions.md` follows.

`boundaries.test.ts` counts `LocalizedTextInput` sites and expects 10.
`SubFieldRow` holds 3 of them: the label, the description and the option
label. The expectation becomes 7, and the comment above it names the sites
that remain.

### Pure logic gets assertions, and the gestures get a walk

`studio-fieldCatalogLogic.test.ts` covers `neighbourAfterRemove`: the next
sibling, the previous sibling, the parent group, and the two top-level
fallbacks. It asserts `appendToGroup` on a nested group and `removeFieldIn` at
depth two. It also pins both new id helpers.

The test file `studio-issues.test.ts` resolves nested index chains to the
nested field. The test file `studio-fieldCheckZone.test.ts` runs
`runValidation` on a nested key and reads the nested field's id.

`studio-fieldCatalogPanel.test.tsx` renders the panel through
`renderToStaticMarkup`. The markup for a selected nested `string` field holds
its own move control and the Technical checkbox. It also holds the Default
value zone, the preview and the "Used in" heading, and its label input carries
`fieldLabelInputId`. A selected group renders the zone "Fields inside this
group" and no move control for its child. The markup for a selected top-level
`string` field holds no such zone. The file's `MoveFieldControl` block stays
as it stands.

The rail row's test asserts that the new `id` lands on the entry's button.
`studio-edit-panel-rail.test.ts` drops `rootId` from its expected rows.

Focus, the rail scroll, the editor's reset and the current mark need a live
draft store and a real DOM. They land in `docs/browser-checks.md` as walks,
per the `development-toolchain` rule that splits a browser check between an
assertion and a checklist entry.

### Each task changes both sides of a prop it touches

The tab and the panel meet in the props of `FieldCatalogPanel`. A task that
changes one side of a prop also changes the other side and the test.
The field `rootId` goes only after its last reader in `EntityTabs.tsx` goes.
Every task group therefore ends with a green `bun run typecheck`.

### The delta spec rewrites prose it copies

A MODIFIED requirement carries its whole block into a new delta file. The
prose gate counts every finding in a new file as a rise. The seven blocks this
change first touched held 32 findings, so the delta rewrites those sentences.

Two more blocks join the delta, since this change makes one live sentence in
each false. One pinned the count of `LocalizedTextInput` sites at ten. The
other ordered the field matrix's rows by the panel's child list, which goes.

The live panels-screen block ends in two comment lines above the next
requirement's heading. OpenSpec counts those lines as the block's tail and
replaces them at archive. The delta's first block therefore ends in the same
two lines.

The key auto-derive requirement takes the largest rewrite. Its long sentences
become short ones, and the rules they state stay the same. Each other
requirement loses its findings through small wording fixes.

OpenSpec 1.13 refuses a MODIFIED block that drops a scenario heading. Three
headings therefore keep the live wording above a body that now states the new
behavior. A fourth keeps a live wording the linter flags, under a targeted
directive. A one-line comment above each heading says why.

## Risks / Trade-offs

- [A group's editor no longer shows what the group holds] → The rail lists the
  group's fields directly beside the editor. The group's preview still draws
  every descendant.
- [Focus leaves the rail after an add, the rail's own add included] → The owner
  chose the label input on 2026-09-12. A new field needs its label before
  anything else.
- [The scroll moves the page on a narrow window] → Below 64rem the rail stands
  above the editor. The scroll moves only as far as the entry needs.
- [A former group keeps its children after a kind switch] → The rail still
  lists those children. Each one opens its own editor, and its move control
  takes it out.
- [Three scenario headings no longer describe their bodies] → The tool forces
  the headings to stay. The comment above each names the new behavior.
- [A check that named a group now names its field] → Every other reader of
  `entityId` compares a step, path, timer or action id. The Fields tab's count
  reads `entityType` alone.
- [The mockup left out the editor's reset] → It answers the owner's complaint
  about a misplaced editor. One effect carries it.
- [The rewritten requirements drift from the live rules] → The review compares
  each rewritten sentence against the live spec before apply.

## Migration Plan

Nothing migrates. The change touches no data, no stored state and no
definition contract. The next build ships it, and a rollback reverts its
commits.

## Open Questions

None.
