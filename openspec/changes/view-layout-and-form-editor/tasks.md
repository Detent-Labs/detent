## 1. Design direction

- [ ] 1.1 Run `/frontend-design:frontend-design` and
      `web-design-guidelines` for the form editor (palette, canvas,
      selected-field strip, column toggle) and for the form grid, before
      writing either.
- [x] 1.2 Check both against `.claude/rules/design-language.md`: radius
      0 everywhere, the 4-point space scale for the grid gap, the 1px
      hairline between rows, one accent-filled primary per screen, and
      the mono face for the CEL badge.

## 2. Schema

- [x] 2.1 Add `columns?: 1 | 2` to `view` in `src/schema/definition.ts`.
- [x] 2.2 Add `span?: 1 | 2` to `viewField` in `src/schema/definition.ts`.
- [x] 2.3 Add a `test/validate.test.ts` case asserting
      `authoredProcessBody` rejects `view.columns: 3` and
      `viewField.span: 0`. Both literal unions are new authoring-time
      constraints, and every invariant that lands ships a test that
      rejects a violating input.
- [x] 2.4 Ship the hash-stability proof as a committed test, not a
      manual check. In `test/`, assert that every body under `examples/`
      hashes to the literal `definitionHash` it had before this change,
      and that `processBody.parse` of a body declaring neither key
      returns an object carrying neither key. Record the literals in the
      test. This is the change's load-bearing property, and a manual
      confirmation leaves it with no regression guard.

## 3. Runtime API Layer

- [x] 3.1 Add `span` to `ResolvedViewField` in `src/runtime/api.ts`,
      populated in `resolveFields` from the matching `ViewField.span`,
      defaulting to `1`.
- [x] 3.2 Add `columns` to `InstanceView` in `src/runtime/api.ts`,
      populated in `getInstanceView` from the current step's
      `view.columns`, defaulting to `1`.
- [x] 3.3 Add `span` to `packages/form-ui/src/types.ts`'s own
      `ResolvedViewField`. This is the only browser-side copy: the app
      and studio areas import and re-export it, so neither needs an
      edit.
- [x] 3.4 Add `columns` to the hand-mirrored `InstanceView` in
      `packages/web/src/areas/app/api/types.ts` and
      `.../studio/api/types.ts`. Leave `.../admin/api/types.ts` alone:
      its `InstanceView` carries no `fields`, because the admin
      instance screen renders no form.

## 4. form-ui grid rendering

- [x] 4.1 Add a `columns` prop to `FieldForm`
      (`packages/form-ui/src/FieldForm.tsx`), defaulting to `1`, and
      render root fields in a CSS grid of that width. The grid CSS goes
      in `form-ui`'s own stylesheet, never a consuming area's, per
      `form-ui`'s one-stylesheet requirement.
- [x] 4.2 Render each root field at `min(field.span ?? 1, columns)`
      grid columns.
- [x] 4.3 Render a group field's own members at the same `columns` the
      form uses. A group on a one-column form must stack exactly as it
      does today; a group declares no column count of its own.
- [x] 4.4 Keep declaration order as the render order within the grid
      (left to right, then down); no new sort key.
- [x] 4.5 Pass `columns={view.columns ?? 1}` at both `FieldForm` call
      sites: `packages/web/src/areas/app/screens/TaskScreen.tsx` and
      `packages/web/src/areas/studio/screens/PlayerScreen.tsx`.
- [x] 4.6 Collapse the grid to one column below a width threshold, in
      `form-ui`'s own stylesheet, keyed on the grid's own available
      width rather than the viewport's. Both consumers then reflow at
      the same point, which is what the `studio-player` delta's reflow
      requirement rests on. The collapse rewrites no stored `span`.
- [x] 4.7 Add the scenarios from the `form-ui` spec delta as tests in
      `packages/form-ui/test/field-form.test.tsx`, including the
      one-column group case that guards against a reflow of
      already-published forms.

## 5. Studio: form editor

- [x] 5.1 Build the new form-editor component under
      `packages/web/src/areas/studio/`, as a native `<dialog>`
      following the shared editing modal's pattern.
- [x] 5.2 Add the left palette: catalog fields not on the current
      view, draggable onto the canvas.
- [x] 5.3 Add the canvas: places fields at the view's `columns`, in
      array order; dragging a field changes the array to match its drop
      position.
- [x] 5.4 Extract the drop-coordinate-to-array-index mapping into a
      pure module with `bun:test` coverage, following
      `studio-canvas-layout.test.ts`. Cover a drop beside a `span: 2`
      card. `studio-canvas` requires canvas interaction logic to live in
      pure, tested functions.
- [x] 5.5 Add the column toggle above the canvas, writing `view.columns`
      and reflowing the canvas. A card whose `span` exceeds the new
      count renders clamped, and its stored `span` stays untouched.
- [x] 5.6 Add field cards with their override marks: required,
      readonly, a CEL badge for an expression override, a dashed
      border for conditional visibility.
- [x] 5.7 Add the selected-field strip: `visible`/`required`/`readonly`
      as a three-way choice, plus `group` and `span`. Reuse
      `panels/shared/BooleanOrExpressionInput.tsx` and
      `panels/shared/overrideMode.ts` rather than reimplementing the
      three-way choice; `studio-overrideMode.test.ts` already covers
      their edge cases.
- [x] 5.8 Add keyboard-operable move commands (up, down, move to
      group) alongside the drag handle, writing the same array change
      a drag would.
- [x] 5.9 Wire every change straight into the draft's `mutate()`, the
      same call `ViewEditor`'s own `move()` uses today. No Save button
      inside the editor.
- [x] 5.10 Wire `StepsPanel`'s View entry to open this editor instead
      of scrolling to the inline `ViewEditor` list. Remove the
      `<section id={sectionId("view")}>` element and its
      `registerSection("view")` scroll target with it. Leaving them
      gives the index two routes to one step's view, one of which
      nothing drives. The entry is no longer a disclosure, so it carries
      `aria-haspopup="dialog"` rather than `aria-expanded` /
      `aria-controls`. Every other entry keeps the disclosure shape
      `studio-edit-shared-modal` gave it.
- [x] 5.11 Delete `packages/web/src/areas/studio/panels/ViewEditor.tsx`
      once the new editor covers everything it did. Leave
      `panels/shared/BooleanOrExpressionInput.tsx` and
      `panels/shared/overrideMode.ts` in place: other panels use them.
- [x] 5.12 Put every string the new editor shows in
      `packages/web/src/areas/studio/catalog.ts` and read it through
      `t()`. Drop the `view.*` keys `ViewEditor` alone used
      (`view.legend`, `view.empty`, `view.moveUp`, `view.moveDown`,
      `view.remove`, `view.addFieldOverride`) unless the new editor
      reuses them. The design language admits no string a screen
      hardcodes.

## 6. Player reflow

- [x] 6.1 Change `PlayerScreen.tsx` styling so the form and record
      panes collapse to one column under the width threshold, in the
      order: instance access, form, record.
- [x] 6.2 Confirm a field's resolved `span` still renders correctly
      inside the form's own grid after the page-level reflow.

## 7. Documentation

- [x] 7.1 Change `docs/authoring-guide.md`: add `span` to the override
      list in §View and §4, add `columns` to §View, and rewrite §4's
      procedure for the drag-and-drop editor.
- [x] 7.2 Change `ROADMAP.md` stage 27: record that this change is the
      one exception to its "Nothing here enters
      `src/schema/definition.ts`" rule, with the reason, and add
      sub-item `e` for this change beside a–d. The stage header reads
      `DONE (a–d)` today, so change it to name `e`'s own status rather
      than leaving a header that stops matching its own list.

## 8. Verification

- [x] 8.1 Run `bun run typecheck`.
- [ ] 8.2 Run the full `bun test` suite with `DATABASE_URL` set, and
      confirm the DB-backed suites ran (not silently skipped).
- [ ] 8.3 Exercise the new flow in a real browser: build a two-column
      form with a spanning field in the new editor, confirm it renders
      identically in Player and in the participant's Task screen, and
      confirm a keyboard-only reorder works without a mouse.
- [ ] 8.4 Open a process published before this change that carries a
      group field, and confirm its form renders exactly as it did
      before: one column, group members stacked.
