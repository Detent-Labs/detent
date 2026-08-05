## 1. Design direction

- [ ] 1.1 Run `/frontend-design:frontend-design` and
      `web-design-guidelines` for the form editor (palette, canvas,
      selected-field strip, column toggle) and for the form grid, before
      writing either.
- [ ] 1.2 Check both against `.claude/rules/design-language.md`: radius
      0 everywhere, the 4-point space scale for the grid gap, the 1px
      hairline between rows, one accent-filled primary per screen, and
      the mono face for the CEL badge.

## 2. Schema

- [ ] 2.1 Add `columns?: 1 | 2` to `view` in `src/schema/definition.ts`.
- [ ] 2.2 Add `span?: 1 | 2` to `viewField` in `src/schema/definition.ts`.
- [ ] 2.3 Add a `test/validate.test.ts` case asserting
      `authoredProcessBody` rejects `view.columns: 3` and
      `viewField.span: 0`. Both literal unions are new authoring-time
      constraints, and every invariant that lands ships a test that
      rejects a violating input.
- [ ] 2.4 Confirm an existing serialized process body (e.g. under
      `examples/`) still parses unchanged, and that its
      `definitionHash` is byte-identical to the one it had before.

## 3. Runtime API Layer

- [ ] 3.1 Add `span` to `ResolvedViewField` in `src/runtime/api.ts`,
      populated in `resolveFields` from the matching `ViewField.span`,
      defaulting to `1`.
- [ ] 3.2 Add `columns` to `InstanceView` in `src/runtime/api.ts`,
      populated in `getInstanceView` from the current step's
      `view.columns`, defaulting to `1`.
- [ ] 3.3 Add `span` to `packages/form-ui/src/types.ts`'s own
      `ResolvedViewField`. This is the only browser-side copy: the app
      and studio areas import and re-export it, so neither needs an
      edit.
- [ ] 3.4 Add `columns` to the hand-mirrored `InstanceView` in
      `packages/web/src/areas/app/api/types.ts` and
      `.../studio/api/types.ts`. Leave `.../admin/api/types.ts` alone:
      its `InstanceView` carries no `fields`, because the admin
      instance screen renders no form.

## 4. form-ui grid rendering

- [ ] 4.1 Add a `columns` prop to `FieldForm`
      (`packages/form-ui/src/FieldForm.tsx`), defaulting to `1`, and
      render root fields in a CSS grid of that width. The grid CSS goes
      in `form-ui`'s own stylesheet, never a consuming area's, per
      `form-ui`'s one-stylesheet requirement.
- [ ] 4.2 Render each root field at `min(field.span ?? 1, columns)`
      grid columns.
- [ ] 4.3 Render a group field's own members at the same `columns` the
      form uses. A group on a one-column form must stack exactly as it
      does today; a group declares no column count of its own.
- [ ] 4.4 Keep declaration order as the render order within the grid
      (left to right, then down); no new sort key.
- [ ] 4.5 Pass `columns={view.columns ?? 1}` at both `FieldForm` call
      sites: `packages/web/src/areas/app/screens/TaskScreen.tsx` and
      `packages/web/src/areas/studio/screens/PlayerScreen.tsx`.
- [ ] 4.6 Add the scenarios from the `form-ui` spec delta as tests in
      `packages/form-ui/test/`, including the one-column group case
      that guards against a reflow of already-published forms.

## 5. Studio: form editor

- [ ] 5.1 Build the new form-editor component under
      `packages/web/src/areas/studio/`, as a native `<dialog>`
      following the shared editing modal's pattern.
- [ ] 5.2 Add the left palette: catalog fields not on the current
      view, draggable onto the canvas.
- [ ] 5.3 Add the canvas: places fields at the view's `columns`, in
      array order; dragging a field changes the array to match its drop
      position.
- [ ] 5.4 Extract the drop-coordinate-to-array-index mapping into a
      pure module with `bun:test` coverage, following
      `studio-canvas-layout.test.ts`. Cover a drop beside a `span: 2`
      card. `studio-canvas` requires canvas interaction logic to live in
      pure, tested functions.
- [ ] 5.5 Add the column toggle above the canvas, writing `view.columns`
      and reflowing the canvas. A card whose `span` exceeds the new
      count renders clamped, and its stored `span` stays untouched.
- [ ] 5.6 Add field cards with their override marks: required,
      readonly, a CEL badge for an expression override, a dashed
      border for conditional visibility.
- [ ] 5.7 Add the selected-field strip: `visible`/`required`/`readonly`
      as a three-way choice, plus `group` and `span`. Reuse
      `panels/shared/BooleanOrExpressionInput.tsx` and
      `panels/shared/overrideMode.ts` rather than reimplementing the
      three-way choice; `studio-overrideMode.test.ts` already covers
      their edge cases.
- [ ] 5.8 Add keyboard-operable move commands (up, down, move to
      group) alongside the drag handle, writing the same array change
      a drag would.
- [ ] 5.9 Wire every change straight into the draft's `mutate()`, the
      same call `ViewEditor`'s own `move()` uses today. No Save button
      inside the editor.
- [ ] 5.10 Wire `StepsPanel`'s View entry to open this editor instead
      of scrolling to the inline `ViewEditor` list.
- [ ] 5.11 Delete `packages/web/src/areas/studio/panels/ViewEditor.tsx`
      once the new editor covers everything it did. Leave
      `panels/shared/BooleanOrExpressionInput.tsx` and
      `panels/shared/overrideMode.ts` in place: other panels use them.

## 6. Player reflow

- [ ] 6.1 Change `PlayerScreen.tsx` styling so the form and record
      panes collapse to one column under the width threshold, in the
      order: instance access, form, record.
- [ ] 6.2 Confirm a field's resolved `span` still renders correctly
      inside the form's own grid after the page-level reflow.

## 7. Documentation

- [ ] 7.1 Change `docs/authoring-guide.md`: add `span` to the override
      list in §View and §4, add `columns` to §View, and rewrite §4's
      procedure for the drag-and-drop editor.
- [ ] 7.2 Change `ROADMAP.md` stage 27: record that this change is the
      one exception to its "Nothing here enters
      `src/schema/definition.ts`" rule, with the reason, and add a
      sub-item for this change beside a–d.

## 8. Verification

- [ ] 8.1 Run `bun run typecheck`.
- [ ] 8.2 Run the full `bun test` suite with `DATABASE_URL` set, and
      confirm the DB-backed suites ran (not silently skipped).
- [ ] 8.3 Exercise the new flow in a real browser: build a two-column
      form with a spanning field in the new editor, confirm it renders
      identically in Player and in the participant's Task screen, and
      confirm a keyboard-only reorder works without a mouse.
- [ ] 8.4 Open a process published before this change that carries a
      group field, and confirm its form renders exactly as it did
      before: one column, group members stacked.
