## Context

See proposal.md for motivation. Three facts shape the approach.

`form-ui` collects a group's members by `group === def.key`, over the whole
view array (`packages/form-ui/src/FieldForm.tsx:256,321`). Array position
decides order among the members and nothing else. Two members may sit far
apart in the array and still render adjacent.

The form editor keys everything on the array index. Selection, the strip, the
move buttons and the remove button all address `rows[i]`. Any change that
renumbers the array invalidates the selection, which is why `dropAt` already
clears it.

The catalog nests. `FieldDef.fields` holds a group's children, and
`fieldCatalogLogic.ts::moveFieldToGroup` moves a field between groups there.
`EntityTabs.tsx:423`'s `moveField` is its only caller, and both the drag and
the keyboard move reach it. Until now nothing tied that write to
`ViewField.group`, and the requirement behind it says so in as many words:
"No CEL expression, no view entry and no column mapping SHALL change".

## Goals / Non-Goals

**Goals:**

- One answer to "which group holds this field", readable from the catalog
  alone.
- A canvas whose nesting matches the preview beside it, without reading the
  preview, for every draft a publish accepts.
- A move gesture that cannot express something the publish rejects.

**Non-Goals:**

- Reordering the stored view array so a group's members become contiguous.
  Nothing renders from contiguity, and rewriting the array would move
  `definitionHash` on bodies that draw identically.
- A collapse control on the group card. The owner's "anzeigen ja/nein" asks
  which fields a form places, and the palette already answers that.
- Any change to `form-ui`. It reads `group` and draws the container today.
- Nesting in the Forms tab's card miniature (`studio-forms-overview`). That
  card draws bar heights alone.

## Decisions

### One function derives the canvas tree; the array keeps its shape

A pure function reads `(rows, parentGroupKeyByFieldId)` and returns the roots
plus, per group entry, its members. Each node carries the entry's own array
index. The renderer walks that tree; every handler still addresses `rows[i]`.

Alternative considered: normalize the array so members follow their group
entry. Rejected on two counts. It changes `definitionHash` for a body that
renders the same. It would also have to run on every load of an older draft.

### Both move commands are sibling swaps

Move-up and move-down swap an entry with its previous or next sibling. For a
member, siblings are the entries naming the same group. For a root entry,
siblings are the entries naming no group, group cards included.

That gives the root case its stepping-over behaviour for free. Swapping a root
entry past a group card moves it past every member the card draws. The members
never left their own positions.

Alternative considered: keep the splice-based `moveViewField` and compute a
target slot per case. Rejected. Two scopes would need two slot computations,
and a splice renumbers entries that neither gesture named.

`moveViewField` stays as it is for the drag path, which still names a slot.

### One parentage helper, exported from the engine package

`src/schema/definition.ts` gains a function mapping each field id to its
parent group's key, or to nothing for a top-level field. `compile.ts`'s
`checkViewGroupReferences` reads it, and so does the studio through the
`./schema` export.

The engine has no UI dependency, and `packages/web` reaches it only over
that exports map. A second implementation in the studio would drift from the
publish check, which is exactly the disagreement
`field-tree-check-consolidation` exists to prevent.

### A refused drop uses the browser's own no-drop cursor

The canvas calls `preventDefault()` on `dragover` only where the drop is
lawful. Where a member's drag reaches a slot outside its group, the handler
leaves the event alone. The browser then draws its own no-drop cursor and
fires no `drop`.

Alternative considered: accept every `dragover`, then reject inside `drop` and
paint a refusal state. Rejected. It needs a new visual state, and it tells the
author only after they let go.

### The group card is a fieldset inside the canvas list

The canvas stays an `<ol>`. A group entry's `<li>` holds a `<fieldset>` whose
`<legend>` names the group and carries the group's own controls. The members
sit in a nested `<ol>` inside that fieldset.

That keeps list semantics for the members, which carry an order and a count.
It also matches the element `form-ui` already draws for a group. The 1px
stroke with no fill is the canvas-group treatment `DESIGN.md` already names.

### One helper keeps the view entries level with the catalog

Two catalog edits can now strand a view entry. Moving a field between groups
changes its parent, and renaming a group changes the key the entries store.
Both leave every entry naming the field or the group pointing at the old
answer, which the publish then refuses.

One exported helper in `draft/` rewrites the entries for both. Three call
sites reach it: `EntityTabs.tsx:423`'s `moveField`, and the two key inputs in
`FieldCatalogPanel.tsx`. Each writes the catalog and the views in one
`mutate`, so no reader sees the two disagree.

`moveFieldToGroup` itself keeps its signature. It takes `DraftField[]` and
answers `DraftField[]`, and it cannot reach `workflow.steps[].view` at all.
Widening it to take the whole draft would give the rail's pure tree function
a second job.

Alternative considered: normalize every view entry's `group` from the catalog
on each draft load. Rejected on two counts. It would silently rewrite a body
somebody hand-edited in the JSON view. It would also hide the error the
checks rail exists to report.

### The drag path keeps its splice

`moveViewField` splices an entry out and back in at an absolute slot. The
keyboard path becomes a sibling swap, so the two look like different
operations on an interleaved array.

They agree where it counts. A splice shifts the entries between the source
and the target by one position each. It changes no pair's relative order
except the moved entry's. Root order therefore survives a member's splice,
and member order survives a root's. Only the entry the author dragged moves.

### The parentage half binds in both directions

A field entry whose catalog parent is a group must declare that group's key.
An absent or an empty `group` on such an entry fails to publish, exactly as a
wrong one does.

The one-directional reading was a hole. It let a hand-authored body lift a
grouped field onto the form's root. The catalog still held it in a group. The
editor would never write that shape, and the JSON view reaches it in one
keystroke.

A group whose own `key` is empty is the exception. Its children can name
nothing, so they have no `group` either. Such a body already fails the
field-key grammar, so the exception never reaches a publish.

### The strip drops its group select rather than showing it read-only

A read-only field would restate what the card's own nesting shows. The
catalog's move control is the one place that changes parentage, and it already
exists.

The note strip keeps its select. A note has no catalog parent, so nothing else
can answer the question for it.

### purchase-requisition unifies its grouping instead of splitting its fields

Eight of its fields name a different group per step. Each one gets a single
catalog parent, chosen from the groups it already names. `quantity` picks one
of `request`, `line_item`, `order`, `ordered` and `ordered_vs_received`.

The rule for picking: take the group the field's earliest step names, in
`registerOrder`. An author meets that step first, so the grouping reads right
where the field first appears. Where the earliest step's group would hold only
that one field, take the next step's instead. A group of one is a box around
nothing.

Alternative considered: split each such field into one catalog field per
group. Rejected. Five `quantity` fields hold five values, so the example would
stop describing one quantity moving through a process.

## Shape brief

`/impeccable shape` ran against `FormEditorScreen.tsx` with `DESIGN.md`
loaded. The owner confirmed both open decisions.

**Job and audience.** A process author arranges one step's form. Visitor mode
is Operate: scanability and native expectation outrank expression.

**Layout.** A group card spans the form's full width, drawn as a 1px stroke
with no fill. Its legend row carries the group's name in the Title role, then
its own move and remove controls. Members sit inside at the form's own column
count, each keeping its `span`. A tail drop slot closes the group, so an empty
group still accepts a drop.

**The boundary.** Move-up on a group's first member renders disabled. So does
move-down on its last. Both take the 45% opacity and the `not-allowed` cursor
`DESIGN.md` fixes. That is what the first and last root card already do. The group's
stroke is what explains the dead control, so the pattern does not need a new
mechanism.

**The group's remove control.** It takes the destructive variant, outlined in
the accent and never filled. Its label names how many entries the click takes,
so a group holding three members reads "Remove (3)". No dialog and no second
click.

**Anti-goals.** No new stamp tone, no radius, no shadow. No colour marks a
group as special. The group reads as a box on the page,
the way a canvas group already does.

## Risks / Trade-offs

**A draft can already break the rule.** A stored body may name a group the
catalog does not hold. The check sits on the write path, so
the body still loads and the editor still opens. The canvas draws such an
entry at the form's root, and the checks rail reports it.

**The two checks can disagree.** Both read the same exported helper. A
divergence needs someone to bypass it. The test suite covers the
publish side; the studio side gets its own unit test over the derived tree.

**A group with one member shows two dead buttons.** The owner accepted it. The
alternative moved the remove control between cards, which costs more.

**An interleaved array reorders on sight.** A member swap writes two array
positions. A reader of the JSON view sees both entries move, while the
rendered form stays as it was.

## Migration Plan

1. Land the parentage helper alone. Nothing reads it yet, so the tree stays
   green.
2. Fix `examples/purchase-requisition.json` while the check is still absent.
   Nest each grouped field under its chosen group in the catalog, and align its
   view entries. Regenerate the wrapper's `definitionHash`. The seed script
   reads `raw.definition` and ignores that field, so a stale hash breaks
   nothing meanwhile.
3. Extend the example loops in `compile-validation.test.ts` and
   `validate.test.ts` to all nine files. Neither covers `it-onboarding` or
   `it-offboarding` today, and both examples already satisfy the new rule.
4. Land the publish check and the tests that reject a violating body. Step 2
   put every example on the right side of it first.
5. Land the canvas tree, then the catalog-to-view sync, then the editor screen.
   The sync belongs before the screen: the screen's own nesting reads the
   `group` the sync keeps correct.
6. Rewrite `docs/authoring-guide.md` and `.claude/rules/authoring-invariants.md`
   where each states the old group rule.

No rollback step applies. No deployment runs this engine, and no stored
instance pins a body this change rewrites.

## Open Questions

None. The owner settled five questions during the proposal. Group membership,
note placement, group removal, the boundary's disabled controls, and the
remove control's label.
