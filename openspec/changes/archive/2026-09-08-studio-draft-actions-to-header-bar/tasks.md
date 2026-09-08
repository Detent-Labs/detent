## 1. ProcessHeaderBar carries the three controls

- [x] 1.1 In `ProcessHeaderBar.tsx`, add a right-aligned button group (Save,
      Discard draft, Publish) immediately before the `⋮` menu `div`, reusing
      `DraftNavControls.tsx`'s existing button markup/classes
      (`btn btn-secondary` Save, `btn btn-ghost` Discard, the
      `PublishNavControl` group). Verify: the three buttons render in the
      header row in a manual load of `/studio/processes/:id/edit/canvas`.
- [x] 1.2 Move `PublishConfirmDialog`, `DiscardConfirmDialog`,
      `useConfirmDialog` and `PublishNavControl` (plus their styles) from
      `DraftNavControls.tsx` into `ProcessHeaderBar.tsx`, wired to the new
      buttons' trigger refs. Verify: `bun run typecheck` passes with no
      leftover unused exports/imports in either file.
- [x] 1.3 Wrap the button group and the `⋮` menu `div` in one shared
      `trailingCluster` wrapper, carrying `marginLeft: "auto"` on the
      wrapper alone, plus its own `flexWrap: wrap` and
      `justifyContent: "flex-end"` (design.md's cluster decision). A lone
      auto-margin on the button group was the first attempt; the browser
      check caught it leaving the `⋮` menu behind, alone and left-aligned,
      once the row wrapped below about 900px. Verify: in the browser, from
      500px wide up, the three buttons and the `⋮` trigger stay right-aligned
      as one unit and never split onto separate lines.
- [x] 1.4 Thread `canPublish`, `baseVersion`, `validation` (for the publish
      dialog's open-issue count and blocked state) and `processLabel` into
      `ProcessHeaderBar`'s `Props` and pass them from `EditScreen.tsx` (task
      3.1 is where `EditScreen.tsx` itself gets updated — the tree typechecks
      only once both 1.4 and 3.1 are in; land them together, not as
      separately-verified steps). Verify: `bun run typecheck` passes once
      both are in.
- [x] 1.5 In `packages/web/test/studio-processSurface.test.ts`, rewrite
      `it("keeps the header bar menu clear of Save, Discard draft and
      Publish")` (currently a whole-file substring search for
      `actions.save`/`actions.discard`/`actions.publish`) to scope the
      search to the `⋮` menu's own JSX slice alone — the same
      slice-between-markers technique the file already uses in
      `it("opens the Steps tab from the Enter binding alone")`
      (`code.slice(enterAt, code.indexOf("const arrow", enterAt))`; slice
      between the `headerBarMenu` div's opening and its matching closing
      tag here). Assert the three strings are absent from that slice while
      present in the header row's own top-level code. Verify: this test
      passes against the post-move `ProcessHeaderBar.tsx`.
- [x] 1.6 In `packages/web/test/studio-processHeaderBar-publishGate.test.tsx`:
      rewrite `it("mounts neither confirmation dialog, whatever the pending
      state reads")` into `it("mounts the confirmation dialog its pending
      state names")`, asserting the dialog now renders for
      `pendingDialog: "publish"` and for `"discard"`, and fold in the
      dialog-content assertions relocated from `studio-draftNavControls.test.tsx`
      (task 2.3). Update this file's `renderHeader()` helper, and the same
      helper in `studio-processHeaderBar-findingFallback.test.tsx`, to pass
      `canPublish`, `baseVersion`, `validation` and `processLabel` explicitly
      at every call site (matching this suite's existing explicit
      fixture-builder idiom, e.g. `noActions`/`validationOf()` — do not give
      the new props silent defaults). Verify: `bun run typecheck` passes and
      both test files pass.
- [x] 1.7 Implementation caught three items the plan above did not name.
      The `NEW_FILES` array in `studio-processSurface.test.ts` dropped
      `DraftNavControls.tsx`, since it now declares no `stylex.create(`. A
      stale `DraftToolbar.tsx` comment about `useDraftToolbarActions` got
      reworded; its `⋮`-menu claim had gone wrong twice over. The Publish
      permission-gate tests relocated from `studio-draftNavControls.test.tsx`
      to `studio-processHeaderBar-publishGate.test.tsx`, for the same reason
      as task 2.3's other three blocks. Verify: `bun run typecheck` passes,
      and every touched test file's own tests pass.

## 2. DraftNavControls keeps only Checks

- [x] 2.1 Remove the Save, Discard draft and Publish buttons, both
      confirmation dialogs, `useConfirmDialog`, `PublishNavControl` and their
      now-unused styles/props from `DraftNavControls.tsx`, leaving only the
      `ChecksRail` collapsed summary and its `onOpenChecks` prop. Verify:
      `bun run typecheck` passes with no unused imports.
- [x] 2.2 Update `DraftNavControls.tsx`'s own doc comment (currently: "The
      four controls the studio's area nav carries... Checks, Save, Discard
      draft and Publish") to describe Checks alone. Verify: comment no longer
      names Save/Discard/Publish as living here.
- [x] 2.3 In `packages/web/test/studio-draftNavControls.test.tsx`: drop the
      `PublishNavControl` import (it moved to `ProcessHeaderBar.tsx`), drop
      `it("stands Checks, Save, Discard draft and Publish together")`, and
      drop the `describe("The publish dialog")`, `describe("The discard
      dialog")` and `describe("Neither dialog primes...")` blocks —
      relocate their assertions into
      `studio-processHeaderBar-publishGate.test.tsx` as part of task 1.6,
      not dropped. Narrow the `render()` helper's prop list to match
      `DraftNavControls`'s new, smaller `Props`. Keep the Checks-rendering
      and dot-color/count tests unchanged — Checks logic does not move.
      Verify: `bun run typecheck` passes; this file's remaining tests pass.
- [x] 2.4 In `packages/web/test/studio-no-confirm.test.ts`, update the
      comment at lines 30-31 ("Both confirmation dialogs moved here with the
      controls that open them, which the studio's area nav now carries") to
      describe the new direction: the dialogs move back to
      `ProcessHeaderBar.tsx` with the controls that open them. Verify:
      comment states the current, not the prior, location.

## 3. EditScreen rewires props, drops the portal for these three

- [x] 3.1 In `EditScreen.tsx`, stop passing `revision`/`isDirty`/
      `lastSavedAt`/`validation`/`canPublish`/`baseVersion`/`actions` for
      Save/Discard/Publish to the portaled `DraftNavControls`; pass only what
      Checks needs (`validation`, `canPublish`, `onOpenChecks`). Pass the
      full set to `ProcessHeaderBar` instead (the other half of task 1.4).
      Verify: `bun run typecheck` passes.
- [x] 3.2 Update the stale comment at the `useDraftToolbarActions` call site
      ("DraftToolbar keeps its logic. ProcessHeaderBar renders the
      buttons.") and the comment above the `DraftNavControls` portal (which
      currently claims all four controls) to match the new split. Verify:
      neither comment misdescribes which component renders Save/Discard/
      Publish.
- [x] 3.3 Confirm `root.tsx` (`StudioArea`)'s reserved nav-slot element (the
      `<span ref={setNavSlot}/>` structure and the portal wiring) is
      untouched — it still exists for the Checks portal alone. Verify:
      `bun run typecheck` passes; Checks still renders in the area nav in a
      manual load.
- [x] 3.4 Update `root.tsx`'s doc comment directly above the nav-slot ref
      (currently: "The element the studio's four draft controls render
      into: Checks, Save, Discard draft and Publish (`studio-process-tabs`)")
      to name Checks alone. Verify: comment no longer names Save/Discard/
      Publish or the count "four".

## 4. Docs

- [x] 4.1 Update `.claude/rules/ui-glossary.md`'s "header bar" row (add that
      it now also carries Save, Discard draft and Publish) and its "Checks,
      Save, Discard draft and Publish stand in the area nav" sentence (narrow
      to Checks alone, and name the header bar for the other three). Verify:
      `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`
      reports no rise for this file.
- [x] 4.2 Update `docs/current-state.md`'s two stale passages (around lines
      4215-4216 and 4394-4399: "the area nav's Save persists it" and "The
      component `DraftNavControls.tsx` renders Checks, Save, Discard draft
      and Publish into the studio's area nav") to describe the new split.
      Verify: `sh scripts/gates/range.sh < /dev/null | sh
      scripts/gates/prose.sh` reports no rise for this file.

## 5. Verification

- [x] 5.1 Run `bun run typecheck` and confirm it passes with zero errors.
- [x] 5.2 Run `bun run build` and confirm it succeeds.
- [x] 5.3 Run the FULL `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun) and confirm it passes with zero skips beyond the
      known non-DB set — pipe through
      `sh scripts/gates/silent-green.sh` to confirm no silent-green skip.
      4170 pass, 1 known skip, 0 fail, across 232 files.
- [x] 5.4 Run the antislop prose gate over the pushed range
      (`sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`)
      and the whitespace gate
      (`sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`)
      and confirm both pass for every file this change touches. Nothing is
      committed yet, so both gates' exact ratchet and CRLF logic were run by
      hand against the worktree instead, file by file, with the same result.
- [x] 5.5 In a real browser, open a draft's edit screen, confirm Save,
      Discard draft and Publish render in the header bar (right-aligned,
      beside the `⋮` trigger) on Canvas and on at least one other tab, and
      confirm they still render with the JSON surface open. Exercise Save,
      Discard draft (cancel) and Publish (cancel) and confirm each dialog
      opens, and confirm focus returns to the pressed button on close.
      Confirm Checks still renders in the top area nav, unchanged. Also
      confirmed at 500px, 900px and 1280px wide, since this is where the
      `trailingCluster` fix (task 1.3) matters.
- [x] 5.6 Ran `/impeccable critique` against the header row, which caught
      the ~900px wrap defect task 1.3 fixes. The confirming browser round in
      task 5.5 stands in for a second `/impeccable audit` pass, per the
      skill's own one-batch-then-stop rule.
