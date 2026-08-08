## Why

`studio-canvas-first-structure-editor` redesigns the process-structure
screen. It explicitly defers `FormEditorDialog` and `EditPanelsModal`.
This change covers that deferred half: the form-builder design in the
same mockup (`Studio UI mockups project`, state B6).

Today's form editor is a native `<dialog>` modal, opened from a step's
view entry. Its left palette lists only catalog fields the step's view
does not yet reference. Minting a new process field happens in a
separate modal, `EditPanelsModal`'s Fields tab. Field validation's `rule`
key is a raw CEL text input.

The mockup reworks this into a dedicated, full-screen page. An author
reaches it from the structure editor's "Build the form" entry point. It
lets an author mint a field and place it in one drag. It gives the
`rule` key a structured row builder with a CEL escape hatch. That is the
same pattern the structure editor gives path guards.

`studio-field-validation-form`'s own spec already names this direction.
Its rule-editor requirement states that a future condition builder "may
later replace this input without changing any requirement above." This
change is that replacement.

<!-- antislop: allow synonym-rotation -->
<!-- "Edit as CEL" quotes literal mockup button copy. This document's use
     of "change" names the OpenSpec artifact instead, a separate concept. -->
## What Changes

- Move the form editor from a native `<dialog>` modal to a full-screen,
  routed page. It stays reached from the structure editor's step
  inspector, the same "Build the form" entry point
  `studio-canvas-first-structure-editor` adds. It keeps writing straight
  to the in-browser draft. It still offers no Save button of its own.
- Let the left palette mint a new process field, not only place an
  existing one. Dropping an "add a field" entry (by type: text, choice,
  date, file, section) SHALL mint a new catalog field. It SHALL place
  that field on the form in the same move. Placing an existing
  unreferenced catalog field keeps working as it does today.
- Add a structured row builder for a field's `validation.rule`. A row
  compares "this answer," or another field's value, against a literal or
  another field. Rows join by "and." The builder writes the same
  `{ lang: "cel", src }` shape the raw input already writes. It keeps an
  "Edit as CEL" escape hatch for an expression the builder cannot
  represent as rows. That is the same pattern `ConditionBuilder` already
  establishes for path guards.
- Give a selected field's override strip (`visible`, `required`,
  `readonly`) a "Developer view" placement for its existing CEL escape
  hatch. Give the process-field catalog's own panel the same placement
  for its JSON escape hatch. Both match the structure editor's own
  placement convention.

## Capabilities

### Modified Capabilities

- `studio-form-editor`: the editor moves from a modal dialog to a
  full-screen routed page. Its left palette gains a field-minting mode
  beside its existing place-an-existing-field mode.
- `studio-field-validation-form`: the `rule` key's editor moves from a
  raw CEL text input to a structured row builder with a CEL escape
  hatch. This follows that spec's own stated direction.
- `studio-canvas`: the view entry's trigger stops advertising
  `aria-haspopup="dialog"`. The form editor it opens is a routed page
  now, not a dialog, so the trigger describes navigation instead.

## Impact

- `routing.ts`, `screens/EditScreen.tsx`, `root.tsx`,
  `panels/StepsPanel.tsx`: the form editor becomes a `formStepId`
  sub-state of the existing `edit` route. It is not a new top-level
  `Route` (design.md's routing decision). `EditorArea` keeps one
  mounted `DraftProvider` across the navigation. `StepsPanel` gains a
  `navigate` callback. Its view entry drops `aria-haspopup="dialog"`
  and describes navigation instead. `test/studio-routing.test.ts`
  gains the new route shape's coverage.
- `packages/web/src/areas/studio/panels/FormEditorDialog.tsx`: moves from
  a `<dialog>` to a routed screen component. Its drag-and-drop placement
  logic (`draft/view-layout.ts`) does not change.
- `packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx`: gains the
  field-minting interaction the palette now offers. `EditPanelsModal`'s
  other two tabs (data sources, contract) stay out of scope.
- `packages/web/src/areas/studio/panels/shared/FieldValidationEditor.tsx`:
  the `rule` row gets the new builder. `min`, `max`, `minLength`,
  `maxLength`, and `pattern` stay as they are.
- New: a rule-row builder component. It reuses `ConditionBuilder`'s
  parse-back and CEL-readout patterns. Its operand model differs: a
  field's own answer, and other fields, not `data.*` at large.
- `docs/authoring-guide.md`: its "Compose the view for each step" walk
  through describes the old modal and the old single-purpose palette. It
  needs a rewrite for the routed page and the palette's two sections.
- Out of scope: `src/schema/definition.ts` and the CEL/validation engine.
  No contract change: every authoring surface still produces the same
  JSON definition. Dark-scheme visual QA is a separate change.
