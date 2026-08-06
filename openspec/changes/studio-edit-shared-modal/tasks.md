## 1. Design direction

- [x] 1.1 Run `/frontend-design:frontend-design` and `web-design-guidelines`
      for the shared modal and the section index, before writing either
      component.
- [x] 1.2 Check both against `.claude/rules/design-language.md`: radius 0
      everywhere, the 2px rule between major sections, the 1px hairline
      between rows, one accent-filled primary per screen, and the stamp
      tone for issue counts.

## 2. Shared modal component

- [x] 2.1 Create `EditPanelsModal` under `packages/web/src/areas/studio/`,
      using the native `<dialog>` pattern from `StartPickerDialog` /
      `PromotionPreviewDialog` (`useRef<HTMLDialogElement>`, `showModal()`,
      `onCancel` for Escape). Keep the element mounted for as long as the
      Structure surface is active, and drive `showModal()` / `close()` off
      the open state.
      Mounting on open would drop `ContractPanel`'s half-typed outcome
      name and refetch `DataSourcesPanel`'s list keys every time.
- [x] 2.2 Add the two-bar chrome: a header naming the open view, and a
      footer with one Close button. State in the footer that Close keeps
      every change. Close is a ghost button, not the accent-filled
      primary, since the screen already spends its primary on Publish.
- [x] 2.3 Add the left rail listing the three views (Fields, Data
      sources, Contract) with entity counts, and mount whichever of
      `FieldCatalogPanel`, `DataSourcesPanel`, or `ContractPanel` is
      `openView`. All three read the draft through `useDraft()`, so pass
      them no draft props; pass `token` to `DataSourcesPanel` alone.
      Mark the open entry with `aria-current`, never `aria-expanded`: a
      rail entry switches a view, it discloses nothing.
- [x] 2.4 For the Fields view, list the field catalog under the rail's
      Fields entry, indenting a group field's children once. Flatten
      anything past depth two into its own top-level rail entry. Add the
      rail's Add entry, calling the same add the panel's own control
      makes, and scroll a chosen field's row into view.
- [x] 2.5 Wire `openView` as component state (`"fields" | "dataSources" |
      "contract"`), seeded by whichever link opened the modal.
- [x] 2.6 Group `validation.issues` by `EntityType` for the rail's three
      per-view ISSUE counts: `field`, `dataSource`, `contract`. These are
      not the entity counts of task 2.3. An entry carries both, and only
      the issue count takes the refusal tone.
- [x] 2.7 Extract the rail's tree-flattening (the two-level cap), the
      per-view issue grouping, and the step's nested-id collection of
      task 4.2 into a pure module beside `draft/issues.ts`, with
      `bun:test` coverage following `studio-issues.test.ts`. Cover the
      twice-nested group field case, and cover a step whose only issue
      sits on a path.
- [x] 2.8 Confirm `FieldCatalogPanel` still renders all three of its
      missing-translation warnings inside the modal: a field's label, a
      field's description, and a field option's label. The panel moves
      whole, so this is a check, not an edit.
- [x] 2.9 Add every new string to `catalog.ts`: the modal header per
      view, the rail entry labels, the Add entry, Close, and the footer
      sentence stating that Close keeps every change.

## 3. Structure-surface links into the modal

- [x] 3.1 Add three links (Fields, Data sources, Contract) to
      `EditScreen.tsx`, at the top of the Structure surface.
- [x] 3.2 Render the links inside the `surface === "structure"` branch,
      never beside the surface tabs. The tabs render on both surfaces,
      and `studio-json-view` forbids a reachable draft-body-mutating
      control while the JSON surface is active.
- [x] 3.3 Wire each link to open `EditPanelsModal` with the matching
      `openView`, regardless of whether a step is selected on the
      canvas.
- [x] 3.4 Remove `FieldCatalogPanel`, `DataSourcesPanel`, and
      `ContractPanel` from their current mount point above the canvas in
      `EditorArea`.

## 4. StepsPanel section index

- [x] 4.1 Replace `StepsPanel`'s always-expanded step card body with a
      compact section index for the selected step. The sections are
      identity (key, label, description, type, terminal, outcome),
      assignment, paths, timers, actions, subprocess spec, and view.
      Actions is one entry whose count sums `onEntry`, `onExit` and
      `onCancel`.
- [x] 4.2 Give the index one issue count for the step as a whole, over
      the step's own id PLUS the ids of its paths, its timers and its
      actions. `resolveLoc` returns the deepest entity it finds, so a
      guard's issue names the path; filtering on the step's id alone
      reads zero on a step whose only faults sit in its paths. Do not
      attempt a per-section count: `resolveLoc` resolves a view,
      assignment or subprocess-spec issue to the step itself.
- [x] 4.3 Add a scroll-and-expand behavior: choosing a section entry
      scrolls to and expands that section beneath the canvas, collapsing
      any other expanded section. Each entry is a
      `<button type="button">` with `aria-expanded` and `aria-controls`,
      the shape `spa-accessibility` requires of a disclosure.
- [x] 4.4 Keep `assignmentWarning` rendered beside the assignment
      editor, per `studio-app`'s no-assignment-warning requirement.
- [x] 4.5 Keep path-edge selection resolving to its source step's index,
      and keep deselection collapsing the expanded section while leaving
      the index (and "+ Add step") visible.
- [x] 4.6 Keep the Remove action in the section index.
- [x] 4.7 Keep both missing-translation warnings in the identity
      section, beside the step's label input and beside its description
      input. `add-content-translation-gap-warnings` requires a warning at
      every `LocalizedTextInput` site, and these are two of six.
- [x] 4.8 Keep the cross-process check fieldset in the subprocess spec
      section, beside `SubprocessSpecEditor`. Its file input is the only
      route to a loaded child body, which `checkSubprocessChildRefs`
      needs.

## 5. Canvas-first layout

- [x] 5.1 Reorder `EditScreen.tsx` / `EditorArea` so the Structure
      surface reads: the three links from task 3.1, then `ProcessHeader`,
      then the editing well with the canvas at its top and the section
      index beside it. `ProcessHeader` stays on the screen and out of
      the modal: it carries `baseLocale`, and `studio-app` requires an
      author to set that without leaving the structural surface.
- [x] 5.2 Confirm canvas selection and inspector selection stay one
      selection (no regression from the reorder).
- [x] 5.3 Update `ROADMAP.md` stage 11b's one-line layout description,
      which still reads "with the carried-over panels as a fixed
      inspector beside it".

## 6. Verification

- [x] 6.1 Run `bun run typecheck`.
- [ ] 6.2 Run the full `bun test` suite with `DATABASE_URL` set, and
      confirm the DB-backed suites ran (not silently skipped).
- [ ] 6.3 Exercise the new flow in a real browser: open the shared modal
      from a link with no step selected, open it with a step selected,
      add a twice-nested group field and confirm the rail's two-level
      cap, and confirm Close discards nothing. Check the platform
      behavior the `<dialog>` supplies: focus moves into the modal on
      open, Escape closes it, and a backdrop click behaves the way D2
      and D3 already behave.
- [ ] 6.4 In the same browser session, switch to the JSON tab and
      confirm the three links are gone and no control opens the modal.
- [ ] 6.5 In the same browser session, set the content locale to one the
      draft has not been translated into, and confirm every one of the
      six missing-translation warnings still renders: the process label
      on the screen, a step's label and description in the identity
      section, and a field's label, a field's description and a field
      option's label in the modal's Fields view.
