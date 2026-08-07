## 1. Design direction

- [x] 1.1 Run `/frontend-design:frontend-design` for visual direction on
      the routed form-builder page and the rule-row builder, per
      `CLAUDE.md`'s UI-work convention.

## 2. Form editor: modal to routed page

- [x] 2.1 Give the form editor a `formStepId` sub-state on the existing
      `edit` route, reached from the structure editor's "Build the
      form" entry point. Per design.md's decision, this is not a new
      top-level route.
- [x] 2.2 Touch points for 2.1: `routing.ts` (extend the `edit` route
      variant with an optional `formStepId`; extend `matchRoute` and
      `routePath` for `/processes/:id/edit/form/:stepId`);
      `EditScreenProps` and `EditorAreaProps` (`screens/EditScreen.tsx`)
      gain an optional `formStepId?: string`; `root.tsx`'s `EditScreen`
      render call passes `formStepId={route.formStepId}` — `StudioArea`'s
      render switch still gains no new entry, since the `edit` case
      stays the one branch, but that render call itself changes;
      `EditorArea` branches on `formStepId` and renders the form-editor
      screen in place of the canvas and inspector, inside the same
      mounted `DraftProvider`; `StepsPanel`'s `Props`
      (`panels/StepsPanel.tsx`) gains a `navigate` callback so the view
      entry (task 2.6) can navigate to `{ name: "edit", processId,
      formStepId }` instead of opening its current local dialog state.
- [x] 2.3 Move `FormEditorDialog`'s markup and layout to the new routed
      screen component. Its drag-and-drop placement logic
      (`draft/view-layout.ts`) does not change.
- [x] 2.4 Remove the `<dialog>` mount and its `showModal()`/`close()`
      wiring; confirm the editor still writes every change straight to
      the draft.
- [x] 2.5 Confirm navigating away and back shows the same draft state,
      per design.md's "sub-state of the `edit` route" decision.
- [x] 2.6 Change the view entry's trigger markup in `StepsPanel`
      (structure editor's step inspector) to drop
      `aria-haspopup="dialog"` and describe navigation instead, per the
      `studio-canvas` delta this change adds.
- [x] 2.7 Extend `packages/web/test/studio-routing.test.ts`'s
      `EVERY_ROUTE` array with a `formStepId` variant, and add an
      assertion that `/processes/:id/edit/form/:stepId` round-trips
      and stays distinct from the plain `/processes/:id/edit` path.
- [x] 2.8 Change `EditorArea`'s existing comment on `openPanel` state
      (`screens/EditScreen.tsx`), which states no studio route carries
      sub-panel state, to note the form editor's `formStepId` is now
      the one exception, and why: it preserves the mounted
      `DraftProvider` across navigation, per design.md's route-move
      decision.

## 3. Palette: mint a new field

- [x] 3.1 Add an "add a field to the process" section to the palette, by
      type (text, choice, date, file, section for the initial set; see
      design.md's open question on the full type list).
- [x] 3.2 Wire a drop from that section to mint a new catalog field and
      place it on the view, in one Draft-mutation call.
- [x] 3.3 Confirm a field minted this way appears in `FieldCatalogPanel`,
      the same as one minted through `EditPanelsModal`'s Fields tab.
- [x] 3.4 `bun:test` coverage for the mint-and-place mutation.

## 4. Rule-row builder

- [x] 4.1 Build the rule-row builder component, reusing
      `ConditionBuilder`'s parse-back and CEL-readout approach.
- [x] 4.2 Default a new row's operand to "this answer," writing
      `data.<the field's own key>` per design.md's decision.
- [x] 4.3 Support comparing against a literal or another catalog field;
      join additional rows by "and."
- [x] 4.4 Add the "Developer view" disclosure holding the raw CEL text
      input, as the escape hatch for a row the builder cannot represent.
- [x] 4.5 Wire the builder into `FieldValidationEditor`'s `rule` row,
      replacing the raw `ExpressionInput` there. `min`, `max`,
      `minLength`, `maxLength`, and `pattern` stay unchanged.
- [x] 4.6 `bun:test` coverage for the builder's parse-back, its
      raw-row fallback, and its CEL output, mirroring
      `ConditionBuilder`'s own test coverage shape. Include an
      assertion that the `celType` filter (task 4.7) excludes a
      mismatched-type field from the "another field" operand picker.
- [x] 4.7 Filter the "another field" operand list to fields whose
      `celType` matches the row's left operand, per design.md's
      field-against-field decision.

## 5. Developer-view placement elsewhere

- [x] 5.1 Give the selected field's override strip (`visible`,
      `required`, `readonly`) a "Developer view" placement for its
      existing CEL escape hatch.
- [x] 5.2 Give the process-field catalog panel a "Developer view"
      placement for its existing JSON escape hatch.

## 6. Browser verification

- [x] 6.1 Walk through the mockup's form-builder state (B6) in a real
      browser, per `docs/browser-checks.md`'s convention for UI changes:
      mint a field, place it, write a rule through the builder, and
      confirm the CEL readout.
- [x] 6.2 Confirm a form built before this change (fields with no
      builder-representable `rule`) still opens without error, showing
      the "Developer view" fallback.
- [x] 6.3 Confirm an unsaved change survives the navigation round trip,
      in both directions. Make a change on the canvas, navigate to the
      form editor and back. Make a change in the form editor, navigate
      to the canvas and back. Neither round trip loses the change.

## 7. Documentation

- [x] 7.1 Rewrite `docs/authoring-guide.md`'s "4. Compose the view for
      each step" walkthrough (lines 323-336) for the routed page and
      the palette's two sections: place an existing field, and mint a
      new one.
- [x] 7.2 Narrow `ROADMAP.md`'s stage 27b entry (item b, "A condition
      builder over CEL: DONE"), around line 629: "Grouping,
      field-against-field comparison and date ordering stay deferred"
      no longer holds as written once this change ships. State instead
      that field-against-field comparison is no longer deferred, scoped
      to `field.validation.rule`; `ConditionBuilder` itself and its
      other two sites (path guards, view overrides) keep literal-only
      comparison; grouping and date ordering stay deferred. Also
      replace the paragraph's closing sentence, which still describes
      `field.validation.rule`'s authoring surface as the plain
      `ExpressionInput` the `add-field-validation-editor` change
      mounted, with the row builder this change adds.
- [x] 7.3 Replace two statements `docs/current-state.md` makes false.
      Its `studio-field-validation-form` entry (around line 1445,
      `panels/shared/FieldValidationEditor.tsx`) states "`rule` uses
      the plain `ExpressionInput`, not the condition builder": replace
      that sentence with the row builder this change mounts there,
      keeping the rest of the entry (the `offeredKeys`, `pattern`, and
      clearing-a-key description) unchanged. Also add or extend
      whatever entry by then describes the studio-form-editor
      capability's opening interaction (a
      `studio-canvas-first-structure-editor` documentation task may
      already cover it under the "Process Studio" heading), so it
      names the routed page this change adds instead of the `<dialog>`
      it replaces.

## 8. Verification

- [x] 8.1 Run `bun run typecheck`.
- [x] 8.2 Run the full `bun test` suite with `DATABASE_URL` set, and
      confirm the reported skip count, not just the pass count. A
      single-file rerun is not a valid signal.
