## Context

See `proposal.md` for motivation. The current `EditScreen` renders
`.canvas-layout`: a `<CanvasView>` plus an `<aside class="canvas-inspector">`
holding `<StepsPanel/>`. `StepsPanel` is an accordion over every step in
the draft. Each card expands into seven sections. They are identity,
assignment, paths, timers, actions, subprocess, and view. Only one stays
open at a time. `PathsPanel` lives inside a step's expanded "paths"
section today. It is not its own selection-driven view yet.

`CanvasView` is a hand-rolled SVG canvas. It uses `@panzoom/panzoom` for
pan and zoom. It already supports drag-to-move for a step and
drag-to-connect for a path between two existing steps. It already syncs
canvas selection with the inspector's `selectedStepId`. Node position lives
in `saveState.layout`, outside what the Draft body's `mutate()` writes.

`ConditionInput` and `ConditionBuilder` already show a structured row
builder for a path guard. That builder already shows a live CEL readout
and a raw-CEL escape hatch. This design does not change that component's
logic.

`validation.issues[]` already carries `entityId`, `entityType`, and
`source`. Source values are zod, structural, CEL, registry, and
duration. These checks live in `.claude/rules/authoring-invariants.md`.
`IssueList` already shows a filtered view of this array per entity. A
consolidated view needs no new validation plumbing.

## Goals / Non-Goals

**Goals:**
- A four-column `EditScreen` layout: palette, canvas, inspector, checks
  rail.
- A selection-driven inspector that shows one step or one path at a time.
- A consolidated checks rail that reads the existing `validation.issues[]`.
- A canvas-edge label for an automatic path's guard.
- A gesture where dragging a handle onto empty canvas adds a step and a
  path together.
- A palette with drag-to-place for Step, Subprocess, and End.

**Non-Goals:**
- No change to `ConditionBuilder`'s row semantics, to `checkConnection`'s
  connection-validity rules, or to any Draft `mutate()` call shape.
- No change to `FormEditorDialog` or `EditPanelsModal`. A separate change
  covers those.
- No dark-scheme visual QA pass. A separate change covers that.
- No change to `src/schema/definition.ts` or the CEL/validation engine.
- No change to how `saveState.layout` persists. This design keeps that
  seam.

## Decisions

### The checks rail is new UI over existing data

`studio-checks-rail` is a new component, not a new capability. It renders
`validation.issues[]` grouped by `source`. `IssueList` already filters
that same array per entity today.

Alternative considered: extend `IssueList` itself with a "grouped,
unfiltered" mode. Rejected: `IssueList`'s contract is "issues for one
entity." Overloading it with a whole-draft mode would blur that contract
for every existing call site. A new component that takes the same
`validation.issues[]` prop keeps `IssueList` unchanged. It also lets the
rail and the per-entity lists diverge in layout without coupling them.

### The step inspector's mockup elements map onto existing fields, plus two additions

The mockup's step inspector shows five elements beside the seven
content sections. Three restyle data the inspector already carries: a
key field, a "performed by" control, and a form-status line. Two are
new: an inline rename on the canvas node, and a "Developer view"
disclosure.

**Key field.** No new field. The identity section already lists `key`
among its fields. See "Selecting a node or edge shows its detail in a
permanent, selection-driven inspector beside the canvas" in
`specs/studio-canvas/spec.md`.

**"Performed by."** A restyle, not a new field. It renders the
identity section's existing `type` and `terminal` controls as a
three-option segmented control. The options are participant (type
`task`), subprocess (type `subprocess`), and nothing/terminal.
Choosing an option sets the same fields the identity section's type
control already sets. `tasks.md` 3.10 tasks this restyle.

**Form-status line.** A restyle of the existing view entry's copy. The
entry still opens `FormEditorDialog` through the call it uses today.
See "Choosing the view entry opens the form editor" in
`specs/studio-canvas/spec.md`. This design changes only the entry's
label. A status line replaces the plain "view" entry label, for
example "N of M fields configured." A "Build the form" button sits
beside it. `tasks.md` 3.11 tasks this.

**Inline rename on the canvas node.** A new interaction, not a
restyle. Double-clicking a step node's label opens an inline text
field on the node.

Committing the field writes `step.label`, the same Draft mutation the
identity section's label input already calls. Task 3.8 in `tasks.md`
covers the interaction. Task 3.9 covers its `bun:test` coverage of the
commit logic as a pure function.

**"Developer view" (step-level).** New, and distinct from the
path-guard's CEL "Developer view" toggle. The condition-builder
decision below covers that one. This is an eighth disclosure in the
step inspector, beside the seven content sections. It shows the
selected step's raw JSON. `tasks.md` 3.12 tasks it.

### The structural group needs its own "did it run" flag, not `structurallyValid` alone

`ValidationResult` (`draft/validation.ts`) already tracks `zodValid`, and
`tasks.md` 4.0 adds `structurallyValid` (true iff `compileProcessBody`
returns a compiled body). Neither flag says whether the six structural
checks (`compile.ts::structuralIssues`) ran.

`compileProcessBody` runs `validateDurations` first and raises
`DurationValidationError` on the first duration issue, before it ever
calls `structuralIssues`. `runValidation`'s catch block for
`DurationValidationError` pushes no `"structural"` issues. None exist to
push: that check branch never ran. A Zod-valid draft can carry both a
duration issue and an independent structural issue, an uncompilable
`FieldValidation.pattern`, say. Today it reports only the duration
issue. Zero structural issues then reads the same as a draft with no
structural issue at all.

`tasks.md` 4.0 adds a second flag: `structuralChecked`. It is false when
`runValidation`'s catch block sees `DurationValidationError`, since
structural checks never ran. It is true when the catch block sees
`CompileValidationError`, since structural checks ran and reported real
issues. It is also true when no exception reaches the catch block,
since structural checks ran and passed. The checks rail's structural
group reads `structuralChecked`, not `zodValid`, to decide its
held-back state. See `specs/studio-checks-rail/spec.md`'s "held-back
state" requirement for the scenario this covers.

### The condition builder gets a restyle, not a new capability

<!-- antislop: allow passive-voice -->
<!-- "if Credit decision is approved" is a literal quote of mockup copy. -->
The mockup's "if Credit decision is approved" canvas-edge label is new.
So is its "Only when" panel heading. Both wrap the existing
`ConditionBuilder` in new markup.

The component's props do not change. Its row model does not change.
Its parse-back-from-CEL behavior does not change.

The canvas-edge label is not free, though. No plain-English summarizer
exists today. `celReadout` (`ConditionInput.tsx`) is the raw CEL
preview text `toCel()` produces; it is not a sentence. Producing that
label needs a new pure function in `conditionLogic.ts`, beside
`toCel`. Call it `summarizeCondition(condition: Condition, operands:
Operand[]): string`.

It walks the same `Condition`/`Row` model `ConditionBuilder` already
holds in state. Each row supplies an operand's label, the comparison
symbol, and the value's own label text. It joins rows with "and" or
"or" per the condition's `joiner`. A `raw` row falls back to its own
CEL text; that matches the "unbuildable guard" fallback
`specs/studio-condition-builder/spec.md` requires.

This is new logic, not a restyle. `tasks.md` 6.0 tasks it with
`bun:test` coverage. This change tasks every other new pure function
the same way (2.6, 4.5, 5.4).

The "Only when" heading is markup only. It wraps the existing
`ConditionBuilder` output with a new heading. The path inspector also
gains a "triggered by" segmented control that restyles the existing
`trigger: "manual" | "automatic"` field. Choosing "a condition" shows
the "Only when" panel. Choosing "a participant's choice" hides it,
since a manual path carries no guard. `tasks.md` 6.5 and 6.6 task
both.

### Canvas interaction: extend `CanvasView.tsx`'s drop-target resolution, do not replace it

The mockup shows one new gesture. An author drags a path off a step's
edge and releases it on empty canvas. That adds a new step. This
extends `CanvasView.tsx`'s `onHandlePointerUp` handler and its
`geometry.ts`-backed drop-target resolution (`hitTestNode`). Today a
drop that resolves to no existing step is a no-op.

`connection.ts` exports only `checkConnection`, a pure
trigger-consistency predicate. It holds no point, hit-test, or
threshold logic. It stays scoped to validating the newly created
path's trigger consistency.

This design adds one branch, guarded the same way the existing
step-to-step gesture already is.

Before creating anything, the branch runs `checkConnection` against
the candidate path's trigger. The trigger defaults to the source
step's existing trigger type, the same default the step-to-step
gesture already applies. That check already runs today, in
`onHandlePointerUp`, for a drop on an existing step.

If `checkConnection` rejects the candidate, the gesture creates
neither a step nor a path. It surfaces the same inline rejection the
step-to-step drop already shows. The canvas stays exactly as it was
before the drag.

If `checkConnection` allows the candidate, the gesture fires the "add
step" mutation at the drop coordinates. It then fires the "add path"
mutation from the source step to the new one. That order keeps a
rejected candidate from leaving an orphan step behind.

The gesture's drag-tracking, handle hit-testing, and in-flight
rendering stay as they are.

Palette drag-to-place (Step, Subprocess, End) is new. Today the only way
to add a step is `PathsPanel`'s "add path" flow, or `StepsPanel`'s "add
step" button. Neither is a canvas drag source. The palette adds a second
entry point to the same Draft mutation those buttons call.

Two entry points to one mutation is a deliberate choice, not duplication.
The palette serves a spatial place-then-wire-up workflow. The existing
buttons serve a list-first workflow. Both stay.

Palette drag-to-place uses the same Pointer Events pattern the canvas's
existing node and handle drags use: `onPointerDown`, `onPointerMove`,
`onPointerUp`. It does not use native HTML5 Drag-and-Drop. One drag
implementation covers both, not two.

`CanvasView.tsx`'s own comment documents why. Panzoom's native
pointer-down handler runs before React's synthetic events. It calls
`stopPropagation()`. So every node and handle element carries a
`panzoom-exclude` class as a workaround. The drop target inside the
SVG participates in that same `panzoom-exclude` handling.

### The header bar reads lifted `DraftToolbar` state; it does not replace `DraftToolbar`

The process-identity header bar (name, draft-rev badge, publish status)
shows dirty state and publish status. `saveState` is already lifted.
`EditorArea` (`EditScreen.tsx`) owns it. It passes `saveState`/
`onSaveState` to `DraftToolbar` as controlled props. `isDirty` and
`publishResult` are not lifted. `DraftToolbar` computes `isDirty` from
a private `savedBody` reducer. It holds `publishResult` in a private
`useState`. Neither reaches any prop or callback today. A sibling
header bar component cannot read either one as scoped.

This design lifts two things out of `DraftToolbar`, into `EditorArea`.
The first is `savedBody`/`dispatchSavedBody`, or a derived
`isDirty: boolean`. The second is `publishResult`/`setPublishResult`.
Both pass back down as controlled props, the same way
`saveState`/`onSaveState` already work. `DraftToolbar` still computes
both values. Only where they live moves up one level, to `EditorArea`.
`DraftToolbar` has exactly one call site. Widening its prop contract
stays a contained change.

`DraftToolbar` dispatches to `savedBody` from two call sites today:
`doSave()`'s success branch, and `reload()`'s conflict-recovery branch.
Lifting `dispatchSavedBody` as one shared channel would let a mere
reload advance `lastSavedAt`, which is not a save. This design lifts a
third, narrower callback instead: `onSaved`, fired only from `doSave()`'s
success branch. `EditorArea`'s `lastSavedAt` setter subscribes to
`onSaved`, not to the shared `dispatchSavedBody` channel. `reload()`
keeps calling `dispatchSavedBody` directly, unchanged. `tasks.md` 7.0
tasks the added callback.

<!-- antislop: allow synonym-rotation -->
<!-- "Discard" is a literal button label on `DraftToolbar`, not a synonym
     choice against "remove" elsewhere in this document. -->
`DraftToolbar`'s Save, Discard, and Publish buttons keep their current
click handlers and do not move.

Last-saved time is not data `DraftToolbar` tracks anywhere today:
neither `DraftSaveState` nor `PublishResult` carries a timestamp. This
design adds a client-only `lastSavedAt` timestamp, owned by
`EditorArea`, set on every successful save. It persists to nothing;
a reload starts it unset, the same way `savedBody` already resets on
reload.

The header bar is a read-only summary above the four-column layout.
`DraftToolbar` keeps living where it lives today. It likely stays docked
near the canvas top edge or the checks rail. `tasks.md` settles the exact
placement. This design does not fix it.

The four-column layout, the palette included, stays nested inside
`EditScreen.tsx`'s existing `surface === "structure"` conditional,
alongside `.canvas-layout` today. `studio-json-view` forbids a reachable
draft-body-mutating control while the JSON surface is active, and the
palette mutates the draft. The new header bar nests there too, reading
the state `EditorArea` now lifts. `DraftToolbar` itself keeps its
current placement: above the `surface`/`json` tab row, rendering on both
surfaces, unchanged from today. Only the new read-only header bar is
Structure-surface-only; `DraftToolbar`'s own Save/Discard/Publish
controls stay reachable from the JSON surface exactly as they are now.
`tasks.md` 2.5 tasks the four-column reflow inside the existing
conditional.

### The selection-driven inspector keeps all seven sections, as disclosures

The existing `studio-canvas` spec's inspector requirement anchors real
behavior other specs depend on. An assignment section carries a
no-assignment warning; `studio-app` requires this. An identity section
carries missing-translation warnings. A subprocess-spec section carries
the cross-process check fieldset.

The mockup's step inspector looks flatter than today's seven-section
accordion. Its example step is simple: no timers, no actions. Assignment
shows through the "performed by" restyle instead of a full editor. See
the "mockup elements" decision above for what each element maps to.

This design does not drop identity, assignment, timers, actions, or
subprocess as sections. It keeps all seven as collapsible disclosures
inside the new per-entity inspector. The "Developer view" decision
above adds an eighth. That is the same `aria-expanded` pattern
`spa-accessibility` already requires.

What changes is scope, not content. Today the inspector holds every
step's disclosures at once. This change limits it to either the selected
step's disclosures or the selected path's. A no-selection state replaces
the always-visible list. The list's own "+ Add step" button stays,
relocated. See "The no-selection state keeps the existing 'add step'
affordance, relocated" below.

### Selection-driven inspector: `StepsPanel` and `PathsPanel` restyle in place

`StepsPanel` and `PathsPanel` change in place, rather than gaining a new
wrapper component. Today `StepsPanel` is an accordion over every step, and
`PathsPanel` is a section nested inside a step card. After this change,
each renders the one selected entity only.

Alternative considered: a new `Inspector` component that wraps both.
Rejected for this change: removing the accordion is itself the risk to
land carefully (see Risks below). Folding that into a restyle of two
already-tested components is smaller. Adding a third component on top of
two still-accordion components would be a bigger change.

### The no-selection state keeps the existing "add step" affordance, relocated

<!-- antislop: allow synonym-rotation -->
<!-- "remove" here names a UI element leaving the layout, unrelated to
     "Discard", a literal `DraftToolbar` button label used elsewhere in
     this document. -->
The always-visible step list hosts `StepsPanel`'s own "+ Add step"
button, below the list. Removing the list would remove the button too.
This design relocates the button into the inspector's no-selection
state instead. `proposal.md`'s "What Changes" describes palette
drag-to-place as one more way to add a step, beside the existing "add
step" affordance. That affordance stays reachable for an author who
does not drag. `tasks.md` 3.14 tasks the relocation.

### A selected path highlights its own row, not only its source step's section

`proposal.md`'s Impact section states a selected path "resolves to, and
highlights within, its source step's paths section." Today `PathsPanel`
receives no `selectedPathId` prop, and `CanvasView`'s edge click calls
only `onSelectStep(step.id)`.

This design adds a `selectedPathId` prop to `PathsPanel`. It also
widens the edge-click callback so it passes the clicked path's id, not
only its source step's id. The specific row highlights then, not only
the section that contains it. `tasks.md` 3.13 tasks this.

## Risks / Trade-offs

- Removing the all-steps accordion removes a "see everything at once"
  view some authors may use today. Mitigation: the canvas itself already
  shows every step spatially, and `Fit to view` already exists for the
  whole graph. No text-list "all steps" view survives this change as
  scoped. Flag this to the user before implementation if it turns out to
  matter.
- The drop-on-empty-canvas gesture could add an accidental step from a
  slightly-off drag. Mitigation: reuse `CanvasView.tsx`'s existing
  `CLICK_THRESHOLD`/`HANDLE_RADIUS` constants and `geometry.ts`'s
  `hitTestNode`. Do not add a new threshold.
- A canvas-edge guard label could overlap densely packed edges on a large
  process. Mitigation: this design does not solve general graph layout. A
  busy graph already has this issue for edge labels like priority
  badges today. An edge-label collision system stays out of scope.
- Two entry points to "add a step" (palette drag, existing buttons) could
  drift in which fields they set. Mitigation: both call the same Draft
  mutation function. One call site keeps them from drifting by
  construction.
- The view entry's `aria-haspopup="dialog"` describes
  `FormEditorDialog`'s current modal form only. The sibling change
  `studio-canvas-first-form-builder` converts that dialog to a routed
  page, reached from the same entry point this change adds. That
  sibling change will need to revisit this attribute.

## Migration Plan

This change needs no data migration. It touches `packages/web`
presentation only. No schema, API, or stored data shape changes.

Deploy is a normal `packages/web` build and release. Rollback is a normal
revert of that build. No draft or published data needs a matching
rollback step: `saveState.layout` and the Draft body keep their current
shape throughout.

## Open Questions

- What exact pixel widths should the four columns (palette, canvas,
  inspector, checks) use? The mockup's 220/flex/360/300 is illustrative.
  This does not change the spec or the task breakdown. Settle it during
  implementation, against the real `tokens.css` spacing scale.
- Should the checks rail show a `NotCheckedBadge`-equivalent "held back
  until structurally valid" state (mockup state B1)? It could show as one
  rail-level banner, or per group. Either satisfies the spec-level
  requirement. Settle it during implementation.
