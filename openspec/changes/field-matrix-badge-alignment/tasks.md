## 1. Shared grid layout

- [ ] 1.1 In `packages/web/src/areas/studio/app.css`, add
      `--matrix-flag-col: 1.75rem;` to `.studio-matrix-table`.
- [ ] 1.2 Change `.studio-matrix-flags` from `display: flex` to a grid:
      `grid-template-columns: repeat(3, var(--matrix-flag-col));
      column-gap: 0; justify-items: center;`. Drop its old `gap`.
- [ ] 1.3 Change `.studio-matrix-cell-flags` the same way: same
      `grid-template-columns`, `column-gap: 0`, `justify-items: center`.
      Drop its old `gap`.
- [ ] 1.4 Check `.studio-matrix-cel` and `.studio-matrix-cel-src` still
      truncate correctly inside a `1.75rem` grid track (they already use
      `min-width: 0` and ellipsis; confirm no new overflow past the cell
      border).

## 2. BulkBadges keeps all three slots

- [ ] 2.1 In `FieldMatrixGrid.tsx`, change `BulkBadges` to map over
      `FLAG_KEYS` instead of a pre-filtered `eligibleKeys` array.
- [ ] 2.2 For a key with an empty eligible-target set, render an empty
      `<span aria-hidden="true" className="studio-matrix-flag-empty" />`
      in that grid slot instead of the button.
- [ ] 2.3 For an eligible key, render the existing badge `<button>`
      unchanged (same `aria-pressed`, `aria-label`, `title`, `onClick`).
- [ ] 2.4 Confirm `BulkBadges` still renders nothing at all (no grid,
      zero slots) when every key's eligible set is empty — the existing
      "column or row with no live cell carries no bulk badge" rule stays
      driven by the caller's `colTargets.length > 0` /
      `rowTargets.length > 0` guard in `FieldMatrixGrid`, unchanged.

## 3. Manual browser check

- [ ] 3.1 In `docs/browser-checks.md`, under "The field matrix"
      (`field-matrix-toolbar-and-inline-editing`), add a check: open a
      draft where a column mixes technical and non-technical fields, so
      its header shows fewer than three badges, and confirm each badge
      sits directly above its own flag's checkbox column, with no visible
      drift, in both that column and a column with all three badges.
- [ ] 3.2 Run that check in a real browser at the panels-screen field
      matrix and at the canvas dock's Field matrix tab, both light and
      default themes if the studio supports a theme toggle, and note the
      result.

## 4. Verification

- [ ] 4.1 Run `bun run typecheck` and confirm it passes.
- [ ] 4.2 Run `bun run build` and confirm it passes.
- [ ] 4.3 Run the full `bun test` suite with `DATABASE_URL` set and
      confirm it passes, checking the skip count as well as the pass
      count.
- [ ] 4.4 Run the antislop linter over every Markdown file this change
      touched (`proposal.md`, `design.md`, `tasks.md`, the delta spec,
      and the `docs/browser-checks.md` edit) and fix any finding.
- [ ] 4.5 Run `git diff --check` and confirm no trailing whitespace or
      blank-line-at-EOF findings.
