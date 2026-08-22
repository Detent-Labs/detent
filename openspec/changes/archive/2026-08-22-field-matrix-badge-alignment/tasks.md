## 1. Shared grid layout

- [x] 1.1 In `packages/web/src/areas/studio/app.css`, add
      `--matrix-flag-col: 1.75rem;` to `.studio-matrix-table`.
- [x] 1.2 Change `.studio-matrix-flags` from `display: flex` to a grid:
      `grid-template-columns: repeat(3, var(--matrix-flag-col));
      column-gap: 0; justify-items: center;`. Drop its old `gap`. Keep
      `margin-top: var(--space-2)` unchanged; only `display` and `gap`
      change.
- [x] 1.3 Change `.studio-matrix-cell-flags` the same way: same
      `grid-template-columns`, `column-gap: 0`, `justify-items: center`.
      Drop its old `gap`. Keep `align-items: center` on the same rule. In
      today's flex row it centers each item on the cross axis; in the
      grid version it instead centers each item within its own row track
      on the block axis, which still matters here since a `CelStamp`
      (taller, a 2px border) sits in the same row as a plain checkbox.
      Without `align-items: center`, a grid item aligns to `stretch` by
      default and a checkbox would sit at the top of a track sized to fit
      the taller stamp. State this explicitly rather than leaving the
      property's fate unaddressed.
- [x] 1.4 Check `.studio-matrix-cel` and `.studio-matrix-cel-src` still
      truncate correctly inside a `1.75rem` grid track (they already use
      `min-width: 0` and ellipsis; confirm no new overflow past the cell
      border).
- [x] 1.5 Add a rule for `.studio-matrix-flag-empty` that sets an
      explicit `height`, not just matching font-size/line-height/padding.
      `.studio-matrix-flag-empty` is a truly empty `<span aria-hidden=
      "true" />` with no text content, so `line-height` alone produces no
      line box and the span's height collapses toward 0 regardless of
      what font-size or line-height it's given — unlike
      `.studio-matrix-flag-badge`, a `<button>` with real text ("REQ")
      whose line box is what gives it height. Compute the target height
      from `.studio-matrix-flag-badge`'s real CSS (verify the exact
      values in `app.css` rather than assuming): `font-size: 10px`,
      `line-height: 1.6`, `padding: 0 var(--space-1)` (0 top/bottom), and
      `border: 1px solid` (top and bottom) (source: `.studio-matrix-flag-badge`,
      app.css line 1703). With the codebase's global `box-sizing:
      border-box`, that gives a border-box height of `10px * 1.6 + 1px +
      1px = 18px` (`1.125rem`). Set `height: 1.125rem` (or
      `min-height: 1.125rem`) on `.studio-matrix-flag-empty`, alongside
      `visibility: hidden`. This keeps a header row with fewer than three
      real badges the same height as a row with all three.

## 2. BulkBadges keeps all three slots

- [x] 2.1 In `FieldMatrixGrid.tsx`, change `BulkBadges` to map over
      `FLAG_KEYS` instead of a pre-filtered `eligibleKeys` array.
- [x] 2.2 For a key with an empty eligible-target set, render an empty
      `<span aria-hidden="true" className="studio-matrix-flag-empty" />`
      in that grid slot instead of the button.
- [x] 2.3 For an eligible key, render the existing badge `<button>`
      unchanged (same `aria-pressed`, `aria-label`, `title`, `onClick`).
- [x] 2.4 Confirm `BulkBadges` still renders nothing at all (no grid,
      zero slots) when every key's eligible set is empty — the existing
      "column or row with no live cell carries no bulk badge" rule stays
      driven by the caller's `colTargets.length > 0` /
      `rowTargets.length > 0` guard in `FieldMatrixGrid`, unchanged.
- [x] 2.5 Add a `renderToStaticMarkup` test covering `BulkBadges` with
      badges actually present. Reuse only the no-DOM/`DraftProvider`
      mechanics from `packages/web/test/
      studio-editorDock-fieldMatrixTab.test.tsx` (`renderToStaticMarkup`,
      wrapping the render in `DraftProvider` from `../src/areas/studio/
      draft/store.js`) — not that file's `EditorDock` mount. That file
      mounts `FieldMatrixGrid` only via `EditorDock`, which never passes
      `showBulkBadges`, so it defaults to `false` (`FieldMatrixGrid.tsx`
      line 124) and the file's own assertions confirm
      `studio-matrix-flag-badge` never appears there. It is the one
      existing precedent that badges are ABSENT, not a pattern for
      rendering them present. Instead, import `FieldMatrixGrid` directly
      from `../src/areas/studio/panels/FieldMatrixGrid.js` and render it
      with `showBulkBadges={true}`, wrapped in the same `DraftProvider`
      (the `useDraft()` hook `FieldMatrixGrid` calls requires it). Build
      the draft fixture so a column's only live view entry is a `FieldDef`
      with `technical: true`: `gatedKeys` (`draft/view-flags.ts`) gates
      `required` and `readonly` unconditionally for any entry referencing
      a technical field, leaving `visible` as the column's sole eligible
      key. Assert the rendered markup carries exactly 3 grid slots for the
      column: one `studio-matrix-flag-badge` and two
      `studio-matrix-flag-empty`. This verifies the delta spec's "A column
      header with only one eligible badge still aligns with its column's
      checkboxes" scenario (`specs/studio-app/spec.md`) with an automated
      assertion, rather than the manual browser check in Group 3 alone.

## 3. Manual browser check

- [x] 3.1 In `docs/browser-checks.md`, under "The field matrix"
      (`field-matrix-toolbar-and-inline-editing`), add a check that
      reuses the "Technical fields" section's own fixture
      (`subprocess-loan-parent`, `examples/subprocess-loan-parent.json`).
      That file declares no `view` at all on any of its four steps
      (`submit`, `check`, `approved`, `rejected`), so this check adds
      both comparison views itself, the same manual, in-session,
      JSON-surface edit the existing Technical-fields check already uses
      for `submit` — neither edit persists to the example file on disk.
      First, mark `result` (`field_l_result`) Technical and add it to
      `submit`'s view, per the existing Technical-fields check.
      `columnLiveTargets`/`eligibleTargetEntries` (`fieldMatrixLogic.ts`)
      compute a bulk badge's eligibility over the WHOLE column's target
      set, not per cell, so adding an ordinary field to `submit`
      alongside `result` would make all three flags eligible again and
      defeat the fixture — leave `submit`'s view at that one Technical
      field only. `submit`'s column then has only `visible` eligible and
      shows a single badge. Second, add a view to the `check` step,
      containing one ordinary (non-technical) field, e.g. `amount`, with
      no `required`/`readonly` overrides at all — leave both unset so
      only `visible` is implicitly true. `gatedKeys` (`draft/view-flags.ts`)
      gates a flag only when `required` or `readonly` is explicitly
      `true`; with both left `undefined`, neither of its two gating
      conditions fires, so `gated` stays empty and all three flags stay
      eligible for `check`'s column, showing three badges. Setting
      `required: true` there would instead gate `readonly` out, leaving
      only two eligible badges and defeating the fixture. Confirm each badge sits directly
      above its own flag's checkbox column, with no visible drift, in
      both the one-badge `submit` column and the three-badge `check`
      column.
- [x] 3.2 Run that check in a real browser at the panels-screen field
      matrix, both light and default themes if the studio supports a
      theme toggle, and note the result. At the canvas dock's Field
      matrix tab, `showBulkBadges` defaults to `false`, so no badge
      renders there; confirm only that the cell checkboxes still line up
      correctly under the badge-less header now that
      `.studio-matrix-cell-flags` is a grid.

## 4. Verification

- [x] 4.1 Run `bun run typecheck` and confirm it passes.
- [x] 4.2 Run `bun run build` and confirm it passes.
- [x] 4.3 Run the full `bun test` suite with `DATABASE_URL` set and
      confirm it passes, checking the skip count as well as the pass
      count.
- [x] 4.4 `scripts/gates/prose.sh` and `scripts/gates/whitespace.sh` both
      read a commit RANGE from stdin (e.g. `origin/main..HEAD`), not a
      file list, so they run for real only at push time over the actual
      pushed range. For a manual, local check now, run the antislop
      linter directly, per file, against every Markdown file this
      change's Impact section names: `python $HOME/AI/
      AntiSlop/antislop.py check <path>` for each of `proposal.md`,
      `design.md`, `tasks.md`, `specs/studio-app/spec.md`, and
      `docs/browser-checks.md` (once task 3.1 edits it). Fix any finding
      (exit code 1).
- [x] 4.5 Run `git diff --check` against the actual working-tree diff and
      `git ls-files --eol` over the files this change touched, to check
      for trailing whitespace, a blank line at EOF, and CRLF — the same
      checks CLAUDE.md describes the push-gate scripts running, for a
      manual/local run outside the range-driven mechanism in 4.4. Do not
      pipe `/dev/null` into either gate script expecting it to lint
      anything; an empty range makes both report "nothing to check" and
      exit 0 with no lines checked.
