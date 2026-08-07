## Context

See `proposal.md` for motivation. `FormEditorDialog` today is a native
`<dialog>`. It mounts for the life of `EditScreen` and toggles by an
`open` prop. It writes straight into the draft on every change. It has
no Save button, per `studio-form-editor`'s existing "opens as a modal"
requirement.

`EditPanelsModal` is a separate 3-tab dialog: fields, data sources, and
contract. This change touches only its fields tab's field-minting flow,
via `FieldCatalogPanel`.

`FieldValidationEditor`'s `rule` key writes through `ExpressionInput`
today. That is a raw CEL text box, per `studio-field-validation-form`'s
"rule editor uses the studio's CEL expression input" requirement. That
requirement already names its own likely successor: "a future condition
builder may later replace this input."

`checkConstraints` (`src/runtime/api.ts:521`) evaluates `min`, `max`,
`minLength`, `maxLength`, and `pattern` directly against the submitted
value's JavaScript type. `rule` evaluates differently
(`src/runtime/api.ts:598-601`). It calls `evalGuard(rule, guardCtx)`.
`guardCtx` comes from `buildGuardContext(body, {...instance, data:
mergedData}, actor)`, the same context builder path guards use.

There is no special `value` binding scoped to the field under check. A
rule that means "this field's own answer" already works today. An
author names that field's own key: `data.<ownKey>`. `mergedData`
includes the field's submitted value before this check runs.

## Goals / Non-Goals

**Goals:**
- Move `FormEditorDialog` from a modal to a full-screen routed page.
- Let the palette mint a new catalog field and place it in one drag.
- A structured row builder for `validation.rule`, with a CEL escape
  hatch.
- A "Developer view" placement for the override strip's and the field
  catalog panel's existing escape hatches.

**Non-Goals:**
- No change to `checkConstraints`, `evalGuard`, or `buildGuardContext`.
  The rule builder writes CEL the engine already evaluates the same way.
- No new CEL binding: no `value` identifier, no new namespace. "This
  answer" in the builder's UI is sugar for `data.<the field's own key>`.
- No change to `min`, `max`, `minLength`, `maxLength`, or `pattern`
  editing.
- No change to `EditPanelsModal`'s data-sources or contract tabs.
- No dark-scheme visual QA pass. A separate change covers that.

## Decisions

### "This answer" compiles to `data.<own key>`, not a new binding

The mockup's rule-row example reads `value >= 1000 && value <=
data.checked_amount`. It uses a bare `value` token.
`checkConstraints` evaluates `rule` through the same `guardCtx` a path
guard uses. That context has no `value` binding.

Adding one would be an engine change. That sits out of scope, per this
change's own "no contract change" claim. Instead, the rule builder's
"this answer" row option SHALL write `data.<key>`, naming the field's
own catalog key. That already resolves correctly: `mergedData` includes
the field's own submitted value before `checkConstraints` runs.

Alternative considered: petition for a `value` binding in a follow-up
engine change. Treat the mockup's literal example as the target syntax.
Rejected for this change. It would touch `src/runtime/api.ts`
and `buildGuardContext`, both explicitly out of scope.
`data.<own key>` reaches the same author-facing meaning, "this answer,"
with no engine change.

### The rule builder is a new component, not a `ConditionBuilder` instance

`ConditionBuilder`'s operand picker (see `studio-condition-builder`)
offers the catalog, `instance.*`, `actor.*`, and, on a resolved
subprocess step, `child.*`. A rule row's most common operand is the
field's own answer. `ConditionBuilder`'s picker has no special handling
for that case today.

The new rule-row builder reuses two things from `ConditionBuilder`. One
is its parse-back approach: read existing CEL into rows. Fall back to a
raw row when a fragment does not fit. The other is its CEL-readout
line. It stays a separate component: its default operand, "this
answer," and its join semantics differ. Rows join by "and" only, no
"or," per the mockup.

Alternative considered: extend `ConditionBuilder` with a "this answer"
operand option. Rejected for this change. `ConditionBuilder` also drives
view overrides and path guards. Neither has a concept for the field
itself. Adding one there would widen that component's contract for one
call site.

`ConditionBuilder` re-reads its rows from the source whenever the
operand set changes. That is `studio-condition-builder`'s own "the
builder re-reads when the operand set changes" requirement. A field
rename falls its guard back to a raw row, so a stale reference never
stays silently editable. The rule-row builder follows the same
convention. A renamed or retyped field falls its row back to raw CEL,
the same way a guard's row would.

### Reopening stage 27b's deferred field-against-field comparison, scoped to `validation.rule`

`ROADMAP.md` stage 27b names "field-against-field comparison" as a
deferred capability. `ConditionBuilder`'s row model bears this out:
`conditionLogic.ts`'s `Row.value` is always a literal. `readRow` and
`literalOf` never resolve a right-hand member path.

This change's rule-row builder reopens that comparison, narrowly. A row
may compare "this answer" against another field, not only a literal.
The scope stays `validation.rule` alone. `ConditionBuilder` itself, and
every site it drives (path guards, view overrides), keeps its
literal-only `value`.

The field-picker for that operand SHALL filter its list to fields whose
`celType` matches the row's left operand. An unfiltered picker would let
an author compare a `number` field against a `string` field. That
guarantees a publish-time type-check issue, with no better feedback than
the draft's existing generic issue list. `ConditionBuilder`'s own
literal `ValueEditor` already keys its input on `celType`; this filter
follows that same convention on the operand side.

### The form editor is a sub-state of the `edit` route, not a new top-level route

`FormEditorDialog`'s existing comment on staying mounted for the
screen's life exists to preserve half-typed state across opens. That
concern does not disappear with a route move: it shifts to whichever
component owns the mounted `DraftProvider`.

Every existing studio route (`processes`, `edit`, `versions`, `migrate`,
`tools`, `play`, `templates`) is a flat entry in `StudioArea`'s render
switch (`root.tsx`). Only `edit` owns a `DraftProvider`, instantiated
fresh from `getDraft()` on `EditScreen` mount. A form-editor route added
as a new sibling entry there would unmount `EditScreen` and its
`DraftProvider`. It would then remount a fresh screen that re-fetches
the last-saved server copy. That navigation would lose every unsaved
`mutate()` made before it.

The form editor is instead a sub-state of the existing `edit` route, not
a new top-level `Route`. `routing.ts`'s `edit` variant gains an optional
target: `{ name: "edit"; processId: string; formStepId?: string }`.
`matchRoute` and `routePath` parse and serialize
`/processes/:id/edit/form/:stepId`. `EditorArea`, not `StudioArea`,
branches on `formStepId`. It renders the form-editor screen in place of
the canvas and inspector, inside the same tree, under the same mounted
`DraftProvider`. The sub-state inherits `edit`'s `system:developer`
gate, so it needs no new `ROUTE_ROLE` entry.

A route navigation away and back then reads the same in-memory `Draft`
state a re-opened modal would have shown. The `DraftProvider` never
unmounts.

### Two entry points to field-minting is deliberate

The palette's "mint and place" entry mints a catalog field. So does
`FieldCatalogPanel`'s existing "add field" button.
`studio-canvas-first-structure-editor` sets a precedent for this. Its
own add-step palette names two entry points to one mutation as
deliberate, not duplicative.

Both routes here call the same underlying mint pattern (`mintId`,
`seedLocalizedText`). One call site keeps them from drifting by
construction. That is the same reasoning the sibling change gives for
its own two entry points.

## Risks / Trade-offs

- A field-minting palette entry could mint a catalog field an author
  did not mean to keep, from a habitual drag. Mitigation: this is the
  same recoverable mistake "remove a field" already handles today. This
  design adds no new confirmation step.
- The rule builder's "this answer" sugar could confuse an author. They
  may read the compiled CEL in "Developer view" and find `data.<key>`
  there, not a `value` token. Mitigation: `ConditionBuilder`'s guard
  builder already shows a compiled CEL readout distinct from its rows.
  This follows the same convention. The field's own key is already
  visible elsewhere on the same screen.
- This change's `specs/studio-canvas/spec.md` delta assumes
  `studio-canvas-first-structure-editor` archives first. It targets that
  change's renamed requirement header, carrying the requirement's full
  post-rename body, per the MODIFIED-requirement "full content" rule.

  Mitigation: this change's own proposal already depends on
  structure-editor's "Build the form" entry point. The same order
  applies to both. If the archive order ever flips, this delta's target
  header needs to revert to the pre-rename wording. A comment at the top
  of `specs/studio-canvas/spec.md` says so.

  A related hazard: a MODIFIED block's requirement body replaces the
  base spec's text verbatim at sync time. That is not only its header.
  Structure-editor's own delta words some shared paragraphs
  differently than the live spec does. Copying this delta's body from
  structure-editor's delta, not from the then-current live spec, is
  the risk. That copy would silently revert each such paragraph to
  structure-editor's older wording.

  This change's own authors reconciled this delta's body against the
  live spec as of this change's authoring. A comment at the top of
  `specs/studio-canvas/spec.md` names the reconciled spots. Re-check
  that reconciliation at sync or archive time, against whatever the
  live spec reads then. Structure-editor may still change before
  either change lands.

- `specs/studio-form-editor/spec.md`'s MODIFIED requirement renames a
  base-spec scenario. "Closing the editor keeps every change" becomes
  "Navigating away keeps every change." That rename sits inside a
  MODIFIED block, not a RENAMED one. `openspec-sync-specs` matches a
  scenario by name. A name change inside a MODIFIED block needs the
  same manual check against the code. This repo's archive history
  already required that check five times (commit `d88938e`'s message).

  Mitigation: task 6.1's browser walkthrough covers this scenario
  directly. Verify it by hand at sync or archive time. Do not rely on
  name-matching to carry it forward on its own.

## Migration Plan

This change needs no data migration. It touches `packages/web`
presentation only. `validation.rule` keeps its existing
`{ lang: "cel", src }` shape. A rule written today opens correctly in
the new builder. It falls back to its raw-CEL row if the builder cannot
parse it into rows.

Deploy is a normal `packages/web` build and release. Rollback is a
normal revert of that build.

## Open Questions

- Should "Add a field to the process" cover every field type the
  catalog supports? Or only the mockup's five: text, choice, date, file,
  section? This does not change the spec. The requirement is that
  minting works, not which types the palette lists first. Settle the
  initial type list during implementation.
