## 1. Equal badge width

- [x] 1.1 In `packages/web/src/areas/studio/app.css`, on
      `.studio-matrix-flag-badge`, add `width: var(--matrix-flag-col);`
      and `text-align: center;`. Leave every other declaration —
      `font-family`, `font-size`, `line-height`, `text-transform`,
      `letter-spacing`, `color`, `background`, `border`, `padding`,
      `cursor` — unchanged. The value comes from `--matrix-flag-col`,
      already declared on `.studio-matrix-table` and sized to the widest
      badge.

## 2. Manual browser check

- [x] 2.1 In `docs/browser-checks.md`, extend the badge-to-checkbox
      alignment paragraph under "The field matrix"
      (`field-matrix-badge-alignment`). It already builds a `check`
      column whose three flags are all eligible, so it shows all three
      badges. Add one equal-width assertion to that setup, referencing
      `field-matrix-badge-equal-width`: on the `check` column, the
      `readonly` (`RO`) badge renders exactly as wide as `visible`
      (`VIS`) and `required` (`REQ`) — no narrower and no wider — while
      each badge still sits above its own checkbox column.

## 3. Verification

- [x] 3.1 Run `bun run typecheck` and confirm it passes.
- [x] 3.2 Run `bun run build` and confirm it passes.
- [x] 3.3 Run the full `bun test` suite with `DATABASE_URL` set and
      confirm it passes, checking the skip count as well as the pass
      count.
- [x] 3.4 Run `git diff --check` over the working-tree diff and
      `git ls-files --eol` over the files this change touched, to check
      for trailing whitespace, a blank line at EOF, and CRLF. Run the
      antislop linter per file against the Markdown this change touched:
      `proposal.md`, `design.md`, `tasks.md`, `specs/studio-app/spec.md`,
      and `docs/browser-checks.md` (once task 2.1 edits it).
