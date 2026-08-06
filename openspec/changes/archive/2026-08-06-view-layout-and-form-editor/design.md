## Context

See `proposal.md` for the motivation. Today `View`
(`src/schema/definition.ts:421`) is `{ fields: ViewField[]; renderer?:
Plugin }`. The `ViewField` type (`:412`) is `{ ref; visible?;
required?; readonly?; group? }`. Neither carries a layout property. The renderer,
`FieldForm` in `packages/form-ui/src/FieldForm.tsx`, renders every root
field into one `<div>`, stacked. `resolveFields` in `src/runtime/api.ts`
builds `ResolvedViewField[]` from a step's `view.fields`. The same
file's `getInstanceView` returns it as `InstanceView.fields`. No layout
data rides along.

`StepsPanel.tsx` mounts `ViewEditor.tsx` for a step's View section. The
`studio-canvas` capability now makes that section an entry in a compact
index, not an always-expanded accordion row. That editor renders the
override rows with `↑`/`↓` buttons. Array order is the only order a
form has. `form-ui`'s own "Groups nest their member fields"
requirement already documents that as declaration order, and this
change keeps it.

That same requirement covers how a group renders its members: nested in
a `<fieldset>`, stacked. This change makes a group inherit the form's
`columns` rather than stack unconditionally. On a one-column form that
is the same rendering it produces today.

## Goals / Non-Goals

**Goals:**
- Add `columns` and `span` as optional, purely presentational schema
  fields with a default that renders an existing view unchanged.
- Render the same grid everywhere `FieldForm` already renders: Player
  and the participant's Task screen.
- Replace `ViewEditor`'s override-row list with a visual editor, using
  the same draft-mutation call the panels already use.

**Non-Goals:**
- No third column count. The `columns` property is `1 | 2`, matching
  the wireframe's own "two columns where there is room" language and
  the Player's existing two-pane threshold.
- No validation coupling. `columns`/`span` never reach
  `submitAndTransition` or any CEL context. A malformed value renders
  as its nearest valid layout (see the clamping decision below).
- No change to `visible`/`required`/`readonly` semantics, to the
  `group` property, or to declaration order as the render-order rule.

## Decisions

**Decision: these two keys belong in the body, and nothing else can
carry them.**

`ROADMAP.md` stage 27 governs this work and states the rule plainly:
"Nothing here enters `src/schema/definition.ts`, so `definitionHash`,
version immutability and migration stay untouched." This change takes a
deliberate exception, and it is the only one the stage carries.

A step's canvas position already lives outside the body, in
`drafts.layout`. That works because position is authoring-time only.
Nothing renders a canvas from a published version.

A participant's form is the opposite case. It renders from the
immutable version the instance pinned. By then an author may long since
have discarded the draft that produced it. Layout the renderer needs at
that moment has to travel inside the body, or the form cannot render at
all.

The exception keeps what the rule protects. `definitionHash` still
derives from `ProcessBody` alone. Published versions stay immutable. A
hand-authored body that declares neither key stays valid, and the JSON
view still writes both. What the rule forbids is a second authoring
language beside the JSON definition. Two optional presentation keys are
not that.

*Alternative considered:* keep both keys out of the body and store the
layout beside it, the way `drafts.layout` stores canvas position. This
change rejects that option. `drafts.layout` is per draft and never
published, so a running instance could not reach it. Publishing it as a
sibling column would build a second immutable artifact per version.
Every version would then pin and migrate two artifacts, which is a far
larger change than two optional keys.

**Decision: `columns` and `span` are literal unions, not a plugin.**

`view.columns?: 1 | 2` and `viewField.span?: 1 | 2` are plain optional
Zod fields, not a `{ type, config }` envelope. Neither resolves
through a registry, and neither is extensible the way an action or a
data source is.

*Alternative considered:* an arbitrary numeric column count. This
change rejects that option. Nothing beyond two columns has a
Chrome/Bound/States note anywhere in the source wireframe. A wider
grid would need its own reflow rule at narrower widths. This change
does not need to solve that.

**Decision: an out-of-range `span` clamps at render time, and needs no
authoring invariant.**

A `span: 2` field on a `columns: 1` view renders at width `1`:
`min(span, columns)`. This stays a `FieldForm` rendering rule. It adds
no publish-time check to `src/schema/compile.ts` and no new row to
`.claude/rules/authoring-invariants.md`.

*Alternative considered:* reject `span > columns` as a publish-time
error, the way `compile.ts` already rejects other authoring mistakes.
This change rejects that option too. The two properties can change
independently. An author might drop a view from two columns to one
without revisiting every field's span. A publish-time error there
would block a change that has an obvious, harmless rendering.

**Decision: the new editor is a native `<dialog>` modal, reusing the
`studio-edit-shared-modal` pattern.**

D11 needs a palette, a canvas, and a selected-field strip, more room
than the section index's inline scroll target offers. `StepsPanel`'s
View entry opens it the same way the shared editing modal opens (see
the `studio-app` capability): `showModal()` on a
`useRef<HTMLDialogElement>`.

*Alternative considered:* a fourth view inside `EditPanelsModal`'s own
rail. This change rejects that option. That rail's entities are
process-wide: fields, data sources, contract. A step's view is
step-scoped. It belongs behind the step's own section index, not the
process-wide rail.

**Decision: drag-and-drop position writes straight into the view
array, mirroring canvas drag today.**

Dropping a field, or reordering one on the canvas, splices the view
array to match the drop position. This is the same `mutate()` call
`ViewEditor`'s own `move()` already uses. No new state model exists:
this editor changes how an author reorders the array, not what the
array is.

## Risks / Trade-offs

- **Risk:** A drag-and-drop editor is more code than an override-row
  list, and drag interactions are harder to keyboard-drive.

  **Mitigation:** The source wireframe already flags this as open: the
  cards need move commands as well as a drag handle. The task list
  tracks a keyboard-accessible move action alongside drag, not drag
  alone.
- **Risk:** Two renderers, Player and the Task screen, pick up a grid
  change at once. A layout bug ships to both surfaces together.

  **Mitigation:** This is the same shared-renderer property the
  proposal treats as a goal, not a side effect. A `form-ui` test
  covering the grid catches a regression before either consumer ships
  it.
- **Risk:** A group field could reflow on deploy. `FieldForm` stacks a
  group's children in a `<fieldset>` today. Giving a group its own
  fixed two-column area would change every already-published form that
  carries one, with no author action.

  **Mitigation:** A group inherits the form's own `columns` instead of
  declaring its own. A group inside a one-column form keeps today's
  stacked rendering exactly. A group inside a two-column form lays its
  members out in two columns, which is what the wireframe drew. Its
  own frame was a two-column form. A group's independent column count
  stays out of scope, and the editor never claims to offer one.
- **Not a one-way door:** a later stage that wants three columns widens
  `1 | 2` to `1 | 2 | 3`. Widening an optional literal union is safe on
  the read path. `definition.ts` is that read path, for every stored
  immutable body. A body valid against the narrow union stays valid
  against the wide one.

  The reverse does not hold. Narrowing the union later, or making either
  key required, would make an already-published body throw on READ. No
  later stage may do either.

## Migration Plan

No data migration applies. `columns` and `span` are optional, and
every already-published or drafted body reads back unchanged, since
both resolve to `1`. Roll out as a normal engine and
`packages/web`/`packages/form-ui` build and deploy. Rollback means
redeploying the previous build. No schema rollback applies, since a
body that never set the new fields never depended on them.

**`definitionHash` does not move.** Both keys are optional, and
`processBody.parse` leaves an absent optional absent. An existing body
therefore canonicalizes to the same JCS bytes and keeps the same hash.
No published version moves, and no pinned instance needs rehydrating
against a new one.

A body that *sets* either key hashes differently from one that does
not. That is correct: it is a different body, and it reaches a hash
only through a new published version.

**This change archives after `studio-edit-shared-modal`.** Both carry a
MODIFIED block for one `studio-canvas` requirement. That requirement is
`Selecting a node or edge expands its detail in a permanent inspector
beside the canvas`. A MODIFIED block replaces the whole requirement.
Whichever change archives second therefore decides the live text
outright.

This change carries the other change's block verbatim. It edits two
things in it. The scroll paragraph and its scenario exclude the view
entry. A paragraph and a scenario name what the view entry opens
instead.

Every paragraph the other change adds survives here. Those are the
identity section's translation warnings, the subprocess spec's
cross-process check fieldset, and the disclosure a11y shape. Dropping
any of them would revert that change on archive. No diff would carry
the loss.

Archiving this one first merges a requirement describing a section
index the live spec does not have yet. The other change would then
overwrite the view-entry exception.

## Open Questions

None. The source wireframe's own open question asks whether a group
can set its own column count independently. This design resolves it
above: not in this change.
