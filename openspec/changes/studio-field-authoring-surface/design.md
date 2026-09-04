## Context

This design records a finished `/impeccable shape` run over
`packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx`. The owner
confirmed it. Seed key `befc7c7d`, round 5, locked card
`definition-wirkung` ("definition and effect"). See `proposal.md` for the
motivation.

### Task and audience

The process author opens the screen to decide what data the process
collects. The author arrives from a draft's panels screen and works on a
catalog holding between one and about twenty fields.

The mode is Operate. The author does a task. The author reads no prose and
needs no persuading. Scannability, steadiness and familiar controls beat
expression.

The first audience is the no-code author. The developer stays served as an
equal, but the developer's vocabulary no longer leads.

### Result and evidence

The author adds a field and understands what they picked, with no manual. In
the same place the author sees where that field acts in the process.

The seven definitions under `examples/` are the material. They carry between
one and eighteen top-level fields. `purchase-requisition` is the largest
case. It carries eighteen fields at the top level and twenty-two counting the
children, under one group. The kinds spread unevenly. Of the
thirty-nine fields across every example, counting children, thirty-six are
`string` or `number`.
Invented catalogs are unnecessary.

## Goals / Non-Goals

**Goals:**

- One screen that says what a field is and where it acts, at once.
- A start state for the empty catalog, so a fresh draft needs no manual.
- A field that moves into a group and out of it, with the group untouched.
- A keyboard route for that move, inside the same list.

**Non-Goals:**

- No new visual world. `DESIGN.md` holds, and the Rubber Stamp Ledger
  stands. This round decided composition alone.
- No engine change.
- No radius, no shadow on a resting plane, no toast.
- The form editor's palette, where a field is born by dragging, stays the
  second entry point. Its five entries and its drag behaviour do not change.
  Its own kind table does, per the field-kind decision below.

## Decisions

### The chosen direction: definition and effect

The editor divides on what the field is and where it acts in the process.
Left: label, kind, required, values, default. Right: the steps the field
appears in, its visibility there, its condition and its column mapping. A
change on the left tints the affected row on the right.

The screen therefore falls into three upright regions. Left a narrow nested
list of every field. In the middle the definition. On the right the effect.

The deliberate break with today: the usage list no longer sits behind a
disclosure, and the three tabs go away.

Four steers from the selection run bind this design and stand above the
card:

- The checks rail gets no standing column. Its column came about because a
  `<dialog>` once covered it. The reason was visibility while editing, not
  the column. A check stands from now on at the zone it belongs to.
- A group needs no level of its own, no column of its own and no step of its
  own. Membership shows through nesting alone.
- A field moves freely into a group and out of it, with no delete and no
  rebuild of the group.
- The list stays narrow. The horizontal room belongs to editing.

### Scope and boundary

The rebuild covers the field-authoring screen whole. That takes in
`FieldCatalogPanel` and the rail's field sub-list in `PanelsScreen`. It takes
in the route from adding a field to a finished field.

The definition contract stands open. The vocabulary of type, format and
control may need a schema change to reach the right shape. This design
proposes one where it does. That costs an OpenSpec change of its own, plus a
sweep over `examples/`, the tests and `docs/authoring-guide.md`.

### States and ranges

Confirmed: the empty catalog. A fresh draft with no field at all must let the
author start with no manual. Today that is one line of text.

Unanswered, but forced by the real material and therefore carried by this
design:

- Nested groups. `purchase-requisition` has one, so the structure is no
  special case.
- A field already in use. A delete and a kind change must name their
  consequence first. `droppedByTypeChange` does that today through `confirm`.
- A missing translation. The warning today is one line in the editor, and it
  is invisible in the overview.

Ranges: one to twenty-two fields, zero to several groups, zero to twelve
steps a field can appear in.

### Interaction and build-up

The rank reads: what does the field ask, what kind is it, where does it act,
what else holds.

The list on the left carries nesting through indentation. A field changes its
group in place, with the group untouched. The gesture needs an equivalent
without a mouse, because `spa-accessibility` demands one.

The right half is empty for as long as a field goes unused anywhere. It must
then say why, and offer the route to use. An empty region must not take the
refusal tone.

Feedback: a change on the left tints the affected row on the right. No
animation beyond what shows the connection.

At a narrow width the three regions fall under one another. The list becomes
a disclosure header then.

### Binding constraints

- `spa-accessibility`. Everything that navigates is a real `button` or
  `a href` in the tab order. Every focusable element shows a visible focus. A
  drag gesture needs a keyboard equivalent.
- Two languages. German labels run up to forty percent longer. No control
  takes its width from the English label.
- `packages/form-ui` renders the preview. What the author sees is what the
  participant gets.
- The spec deltas go against `studio-app`, plus `spa-accessibility` and
  `ui-string-overrides` for new catalog keys. This change adds a fourth,
  `studio-checks-rail`, because the checks decision below contradicts that
  capability's standing-column requirement. It adds a fifth,
  `studio-condition-builder`, because the condition row leaves the Rules tab
  that capability names.

### Decision: field kind

A named field-kind table lands beside `ALLOWED_BY_TYPE` in `src/schema`, and
this change exports it. The studio side reads it over the exports map and
composes `type`, `format` and `control` from an entry. The JSON definition
keeps its shape. The definition contract stays as it is.

The table's size holds. `ALLOWED_BY_TYPE` today admits twenty-five
combinations over six types. Fifteen of those sit on `string` alone.

This round rejected two routes. A table in the web package alone makes a second
source of truth. A drift between the two would first show at publish. A new
field in the contract costs a sweep and brings the engine nothing. The engine
already has everything in type, format and control. The definition would get
a second way to say the same thing.

One such web-package table already exists.
`packages/web/src/areas/studio/draft/mintField.ts` declares
`PaletteFieldKind`, `PALETTE_FIELD_KINDS` and `baseTypeForPaletteKind`. That
last one maps a palette kind name to a `{type, format}` pair by hand, and
`FormEditorScreen.tsx` consumes it. Leaving it as it is would make this
decision argue against a table the same package keeps.

`baseTypeForPaletteKind` therefore indexes into the engine's table instead of
restating the pairs. The palette keeps its five names and its behaviour. What
goes is the second hand-written copy of the type-and-format mapping.

`packages/web/src/areas/studio/draft/field-type-labels.ts` carries the same
split one layer up. The `FIELD_TYPE_LABELS` record names a base type. The
panels screen prints that name beside the rail row, while the picker names a
kind. After this change both read the engine's table. Both read their words
through catalog keys.

### Decision: checks

A check on a field stands at the zone it belongs to. The draft-wide checks
and the publish gate ride in the `collapsed` `ChecksRail` at the bottom edge.
That version exists and serves two sites. One of them docks at the bottom
edge of the canvas inspector. No new component comes about. The standing
column goes, and its width goes to the editor.

### Decision: group change

There is no key conflict to handle. `definition.ts:866` checks uniqueness
through `collectFieldsDeep`. That function takes in a group's children. So
`FieldDef.key` is a flat CEL namespace over every depth.

A group has no entry in the `data` namespace, as `leafFields` records. A leaf
field takes a flat address through its own key, whatever group it sits in. Views
and column mappings reference the `id`. A group change therefore alters
neither the key nor a CEL expression nor a reference. One missing helper
remains to build. It re-hangs a field inside the array.

## Risks / Trade-offs

**The right region reads as broken when it is empty.**

A field no step view references leaves the whole region blank. → The region
states why it is empty. It offers the route to a step view, and it takes the
empty tone rather than the refusal tone.

**A narrow window loses the three-region reading.**

→ The regions stack, and the list collapses into a disclosure header. The
reading order stays list, definition, effect.

**The kind table drifts from `ALLOWED_BY_TYPE`.**

Both live in `src/schema/definition.ts`, so a drift is a same-file change.
A test synthesizes one body per kind entry. It runs `compileProcessBody` over
each one. The `checkFieldFormatControl` function is module-private. The test
therefore reaches it through the exported compile pass, never by name. The
`ALLOWED_BY_TYPE` record stays the single source, and the kind table indexes
into it.

**Dropping the standing checks column hides a draft-wide issue.**

The full rail today lists every group. → The `collapsed` rail keeps the count
and the held-back indicator. It expands in place, and `studio-checks-rail`
already states both.

**A keyboard move is a second write path beside the drag.**

Two paths can drift. → Both call one helper in `fieldCatalogLogic.ts`. The
test covers the helper. The browser check covers the two gestures.

**German labels overflow a control sized for English.**

→ No control declares a fixed width from its English label.
`docs/browser-checks.md` gets the narrow-width pass and the German pass.

## Migration Plan

Nothing to migrate. No definition changes, so `definitionHash` keeps its
value and no stored instance rehydrates differently. No draft carries a tab
name, so no persisted state names what this change deletes.

The rollout is one deployment of `packages/web` plus the engine package's new
export. The order inside it matters once. The field-kind table has to exist
before the studio reads it. That is why it is task group 1.

Rollback is a revert of the same two. The reverted studio reads the reverted
engine table, and neither leaves a row or a key behind.

One thing does not roll back cleanly, and it is a browser-local convenience.
An author who has the Fields view open across the deployment sees the old
markup until a reload. That is the same reload every studio deployment asks
for today.

## Open Questions

- Does the kind list name a kind for every one of the twenty-five
  combinations, or a curated subset? The requirement already settles the rule
  that matters. Every named kind publishes, and the JSON view stays the route
  for an omitted triple. The list's exact membership can settle during apply,
  against the seven definitions under `examples/`. Neither a spec nor a task
  changes with it.
- Which keystroke moves a field in the rail? `spa-accessibility` demands one
  and names none. The choice follows the canvas's own keyboard set during
  apply.
