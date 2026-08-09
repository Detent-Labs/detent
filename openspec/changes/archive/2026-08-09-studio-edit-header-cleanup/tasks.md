<!-- antislop: allow-file synonym-rotation -->
<!-- "Discard" throughout this file is the literal `DraftToolbar` button label, not a synonym choice against "remove"/"delete" used for deleting code elsewhere in this file. -->

## 1. Sequencing check

- [x] 1.1 Run `openspec list` and confirm `fix-canvas-pan-dead-zone` has
      archived. Do not start section 4 before that lands, per design.md
      - Risks/Trade-offs.

## 2. The merged rail

- [x] 2.1 Build an `EditRail` component under
      `packages/web/src/areas/studio/canvas/` (or `panels/`, matching
      the existing split) with two labeled groups: the palette
      (Step, Subprocess, End) and Process (Fields, Data sources,
      Contract).
- [x] 2.2 Port `StepPalette`'s drag-source entries into `EditRail`'s
      palette group, unchanged in behavior and mutation path.
- [x] 2.3 Add the Process group's three rows (count + chevron), each
      opening `EditPanelsModal` to its own view through the same call
      `studio-panel-links` makes today.
- [x] 2.4 Remove `StepPalette` and the `studio-panel-links` nav once
      `EditRail` replaces both call sites.

## 3. ChecksRail collapse

- [x] 3.1 Add a `collapsed` prop to `ChecksRail`. The collapsed state
      renders a one-line summary and an expand control; the expanded
      state renders today's grouped list. The summary carries three
      states: a count, "no count" when clear, and a held-back
      indicator when any group holds back (never read as clear).
- [x] 3.2 Add a `totalOpenIssueCount`-style pure function to
      `draft/checksRail.ts`, covering the held-back state from 3.1, and
      cover it in `packages/web/test/studio-checksRail.test.ts` beside
      the existing `groupChecksBySource`/`allChecksClear` coverage.
- [x] 3.3 Wire the summary to that function over the same
      `validation.issues[]` traversal the grouped view already uses.
      Do not add a second counting path.
- [x] 3.4 Mount `ChecksRail` (collapsed) inside `StepsPanel`, docked at
      its bottom edge, whenever a step or a path is selected.
- [x] 3.5 Mount `ChecksRail` (expanded) beside the canvas whenever
      nothing is selected, replacing the always-mounted column.
- [x] 3.6 Drop the inspector's standalone no-selection "+ Add step"
      button; confirm the palette's Step entry still covers that case.

## 4. Header bar and overflow menu

- [x] 4.1 Extract `DraftToolbar`'s save, discard, and publish handlers
      (and their pending/error state) so `ProcessHeaderBar` can call
      them without duplicating the logic.
- [x] 4.2 Add the content-locale badge (the switch) and the
      Structure/JSON toggle to `ProcessHeaderBar`, sourced from
      `ContentLocaleSwitcher` and the existing `surface` state in
      `EditScreen.tsx`.
- [x] 4.3 Add the `⋮` overflow menu to `ProcessHeaderBar`, with Save,
      Discard draft, and Publish wired to the handlers from 4.1. Keep
      the error message, the save-conflict banner (with its Reload
      action), and the publish-success confirmation inline in the
      header row, outside the menu, per design.md - Decisions.
- [x] 4.4 Add the "Process, saved with the draft" menu group: the
      editable key, `ContentLocaleSwitcher`'s base-locale control, and
      its add-locale input and button (`resolveAddLocaleAttempt`).
- [x] 4.5 Add the "This session only" menu group: `RegistryPanel`'s
      selector, with a caption stating it never saves to the draft.

## 5. Screen composition

- [x] 5.1 Rewire `EditScreen.tsx`'s `EditorArea` to mount the new
      header row, then `EditRail`, the canvas, and the context-sensitive
      third column, per design.md - Context. In the same pass, remove
      the `ProcessHeader` fieldset, the bare surface tablist, and the
      Back/Versions/Player buttons once their content moves into
      `ProcessHeaderBar`. The old and new chrome cannot coexist
      mid-task.
- [x] 5.2 Confirm `formStepId` routing (the form editor's full-screen
      page) still renders in place of the canvas layout, unaffected by
      this change.

## 6. Copy and styling

- [x] 6.1 Add new `packages/web/src/i18n/catalogs/studio.ts` keys for
      the menu group labels and the registry caption, in `en` only.
      This catalog exports `studioCatalog = { en }`; studio's UI chrome
      ships English-only today.
- [x] 6.2 Add rail, header-row, and overflow-menu styles to
      `packages/web/src/areas/studio/app.css`, on the existing tokens:
      zero radius, ruled rows, the mono face for machine values.

## 7. Browser verification

- [x] 7.1 Load the edit screen in a real browser. Confirm the header
      row, the rail, and both context-sensitive column states (nothing
      selected, a step selected) match design.md's decisions.
- [x] 7.2 Switch the locale to `de` and check the header row for
      overflow or clipping, per design.md - Open Questions. Fix in CSS
      if it overflows.
- [x] 7.3 Decide the narrow-viewport rail behavior from design.md - Open
      Questions, and add it to `docs/browser-checks.md` if it becomes a
      manual check.
- [x] 7.4 Update `docs/browser-checks.md`'s dark-scheme QA section: the
      "Palette" and "Checks rail: default state" bullets describe the
      pre-change layout. Replace them with the merged rail and the
      checks rail's collapsed and expanded states.

## 8. Verification

- [x] 8.1 Run `bun run typecheck` and confirm it passes.
- [x] 8.2 Run `bun run build` and confirm it passes.
- [x] 8.3 Run the full `bun test` suite with `DATABASE_URL` set and
      confirm it passes, checking the skip count as well as the pass
      count.
