## 1. Layout

- [x] 1.1 In `packages/web/src/areas/studio/panels/PathsPanel.tsx`, add a
  `NARROW` breakpoint constant (`@media (max-width: 64rem)`, copied from
  `StepPage.tsx`) and a `labelKeyRow` StyleX style. Copy `labelKeyRow` from
  `StepPage.tsx`'s own version: a grid with `minmax(0, 2fr) minmax(0,
  1fr)` columns collapsing to `minmax(0, 1fr)` under `NARROW`,
  `columnGap: space.s4`, `rowGap: space.s2`. Verify the file still
  typechecks in isolation with `bun run typecheck`. The full verification
  run happens in Verification below.
- [x] 1.2 Wrap each path row's Label and Key `<label>` fields, around
  lines 222-238, in a `<div {...stylex.props(styles.labelKeyRow)}>`, with
  no further wrapper around either field. Leave the "to" field, around
  lines 239-260, as its own sibling row, unchanged. Verify by reading the
  rendered JSX. The Label and Key `<label>`s must be the `labelKeyRow`
  div's only two children. The "to" `<label>` must be a sibling of that
  div, outside it.

## 2. Verification

- [x] 2.1 Run `bun run check` inside the devcontainer. It runs `bun run
  typecheck`, `bun run build`, the full `bun test` suite with
  `DATABASE_URL` set, then `test:tz`, in that order. Confirm all four
  pass with no skipped DB suites.
- [x] 2.2 Run the antislop and whitespace push gates over this change's
  touched Markdown, each piped from `range.sh`, which falls back to
  `origin/main..HEAD` on its own:
  - antislop: `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`
  - whitespace: `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`

  Confirm both report no new findings.
- [x] 2.3 Open the Steps tab's "Path to" section on a step with at least
  one path, in a real browser. Check a wide viewport and the
  narrow-viewport breakpoint. On wide, confirm a path row's Label and Key
  stand side by side, with Label's column wider. Under narrow, confirm
  the row stacks Label over Key. Confirm the "to" select stays on its own
  row at both widths. Run `/impeccable critique` and `/impeccable audit`
  against the step page and resolve any finding they raise about this
  row.
