## 1. Masthead layout

- [x] 1.1 In `packages/web/src/areas/studio/panels/StepPage.tsx`'s `styles`
      object, add `labelKeyRow` (`display: "grid"`, `gridTemplateColumns: {
      default: "minmax(0, 2fr) minmax(0, 1fr)", [NARROW]: "minmax(0, 1fr)"
      }`, `columnGap: space.s4`, matching the shape of `styles.columns`) and
      `labelKeyColumn` (`display: "flex"`, `flexDirection: "column"`, `gap:
      space.s2`, holding LABEL's `<label>` and its warning together). Verify
      `bun run typecheck` passes with no new errors in this file.
- [x] 1.2 Restructure lines 722-741: wrap the LABEL `<label>` and its
      missing-translation warning `<p>` in a `<div
      {...stylex.props(styles.labelKeyColumn)}>`, keep the warning a sibling
      of the `<label>` (not nested inside it), and wrap that div plus the
      KEY `<label>` in a `<div {...stylex.props(styles.labelKeyRow)}>`.
      Leave DESCRIPTION (lines 743-749) untouched, immediately after the new
      row. Verify by reading the diff: only lines 722-741 change shape, no
      other masthead line moves.
- [x] 1.3 Run `bun run build` for `packages/web` and verify it completes with
      no new TypeScript or build errors.

## 2. Docs

- [x] 2.1 Add an entry to `docs/browser-checks.md` for the step page
      masthead's Label/Key row: wide-viewport side-by-side layout, collapse
      under the narrow breakpoint, and the missing-translation warning
      staying under LABEL's column. Verify with `sh scripts/gates/range.sh <
      /dev/null | sh scripts/gates/prose.sh` and `sh scripts/gates/range.sh <
      /dev/null | sh scripts/gates/whitespace.sh` over the branch's pushed
      range, both passing for the new entry.

## 3. Browser check

- [x] 3.1 Build and serve the app in the devcontainer, open the Steps tab on
      a step with a populated label and key (e.g. the example named in the
      brief, "Submit the Exit Notification" / `exit_notification`), and
      confirm with a real browser that LABEL and KEY render side by side,
      LABEL the wider column.
- [x] 3.2 Resize (or emulate) below the step page's narrow breakpoint (64rem)
      and confirm the row collapses to LABEL over KEY, each full width.
- [x] 3.3 Trigger a missing-translation state on LABEL (switch content locale
      to one the label has no entry for) and confirm the warning renders
      under LABEL's own column, not spanning the row under KEY.
- [x] 3.4 Run `/impeccable critique` and `/impeccable audit` against the
      Steps tab route and resolve every finding they report against this
      masthead row before treating the change as done.

## 4. Verification

- [x] 4.1 Run `bun run typecheck`, then `bun run build`, then the full
      `bun test` suite with `DATABASE_URL` set (never a single-file rerun).
      Confirm all three pass with no new failures and no silent skip. Check
      the skip count, not just the pass count.
