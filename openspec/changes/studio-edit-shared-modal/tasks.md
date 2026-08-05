## 1. Design direction

- [ ] 1.1 Run `/frontend-design:frontend-design` and `web-design-guidelines`
      for the shared modal and the section index, before writing either
      component.
- [ ] 1.2 Check both against `.claude/rules/design-language.md`: radius 0
      everywhere, the 2px rule between major sections, the 1px hairline
      between rows, one accent-filled primary per screen, and the stamp
      tone for issue counts.

## 2. Shared modal component

- [ ] 2.1 Create `EditPanelsModal` under `packages/web/src/areas/studio/`,
      using the native `<dialog>` pattern from `StartPickerDialog` /
      `PromotionPreviewDialog` (`useRef<HTMLDialogElement>`, `showModal()`
      on mount, `onCancel` for Escape).
- [ ] 2.2 Add the two-bar chrome: a header naming the open view, and a
      footer with one Close button. State in the footer that Close keeps
      every change. Close is a ghost button, not the accent-filled
      primary, since the screen already spends its primary on Publish.
- [ ] 2.3 Add the left rail listing the three views (Fields, Data
      sources, Contract) with entity counts, and mount whichever of
      `FieldCatalogPanel`, `DataSourcesPanel`, or `ContractPanel` is
      `openView`. All three read the draft through `useDraft()`, so pass
      them no draft props; pass `token` to `DataSourcesPanel` alone.
- [ ] 2.4 For the Fields view, list the field catalog under the rail's
      Fields entry, indenting a group field's children once. Flatten
      anything past depth two into its own top-level rail entry.
- [ ] 2.5 Wire `openView` as component state (`"fields" | "dataSources" |
      "contract"`), seeded by whichever link opened the modal.
- [ ] 2.6 Group `validation.issues` by `EntityType` for the rail's three
      per-view counts: `field`, `dataSource`, `contract`.
- [ ] 2.7 Extract the rail's tree-flattening (the two-level cap) and the
      per-view issue grouping into a pure module beside `draft/issues.ts`,
      with `bun:test` coverage following `studio-issues.test.ts`. Cover
      the twice-nested group field case.

## 3. Structure-surface links into the modal

- [ ] 3.1 Add three links (Fields, Data sources, Contract) to
      `EditScreen.tsx`, at the top of the Structure surface.
- [ ] 3.2 Render the links inside the `surface === "structure"` branch,
      never beside the surface tabs. The tabs render on both surfaces,
      and `studio-json-view` forbids a reachable draft-body-mutating
      control while the JSON surface is active.
- [ ] 3.3 Wire each link to open `EditPanelsModal` with the matching
      `openView`, regardless of whether a step is selected on the
      canvas.
- [ ] 3.4 Remove `FieldCatalogPanel`, `DataSourcesPanel`, and
      `ContractPanel` from their current mount point above the canvas in
      `EditorArea`.

## 4. StepsPanel section index

- [ ] 4.1 Replace `StepsPanel`'s always-expanded step card body with a
      compact section index for the selected step. The sections are
      identity (key, label, description, type, terminal, outcome),
      assignment, paths, timers, actions, subprocess spec, and view.
      Actions is one entry whose count sums `onEntry`, `onExit` and
      `onCancel`.
- [ ] 4.2 Give the index one issue count for the step as a whole, read
      from `validation.issues` filtered on that step's `entityId`. Do
      not attempt a per-section count: `resolveLoc` resolves a view,
      assignment or subprocess-spec issue to the step itself.
- [ ] 4.3 Add a scroll-and-expand behavior: choosing a section entry
      scrolls to and expands that section beneath the canvas, collapsing
      any other expanded section.
- [ ] 4.4 Keep `assignmentWarning` rendered beside the assignment
      editor, per `studio-app`'s no-assignment-warning requirement.
- [ ] 4.5 Keep path-edge selection resolving to its source step's index,
      and keep deselection collapsing the expanded section while leaving
      the index (and "+ Add step") visible.
- [ ] 4.6 Keep the Remove action in the section index.

## 5. Canvas-first layout

- [ ] 5.1 Reorder `EditScreen.tsx` / `EditorArea` so the canvas renders
      at the top of the editing well, with the section index beside it,
      and the three links from task 3.1 above it.
- [ ] 5.2 Confirm canvas selection and inspector selection stay one
      selection (no regression from the reorder).
- [ ] 5.3 Update `ROADMAP.md` stage 11b's one-line layout description,
      which still reads "with the carried-over panels as a fixed
      inspector beside it".

## 6. Verification

- [ ] 6.1 Run `bun run typecheck`.
- [ ] 6.2 Run the full `bun test` suite with `DATABASE_URL` set, and
      confirm the DB-backed suites ran (not silently skipped).
- [ ] 6.3 Exercise the new flow in a real browser: open the shared modal
      from a link with no step selected, open it with a step selected,
      add a twice-nested group field and confirm the rail's two-level
      cap, and confirm Close discards nothing.
- [ ] 6.4 In the same browser session, switch to the JSON tab and
      confirm the three links are gone and no control opens the modal.
