## 1. Implementation

- [x] 1.1 In `packages/form-ui/src/FieldForm.tsx`, add a new named StyleX
  style, e.g. `checkboxUnstretched: { alignSelf: "flex-start" }`.
  - Apply it only to the single standalone checkbox `<input
    type="checkbox">`, in the `boolean` + non-`radio` branch. It sits
    alongside the existing `styles.control, styles.checkboxRadioReset`.
  - Verify by reading the diff. No other branch changes: not the grouped
    radio branch, not the grouped checkbox branch, and not any other field
    type. Also verify `bun run typecheck` passes.

## 2. Regression test

- [x] 2.1 In `packages/form-ui/test/field-form.test.tsx`, extend the
  "boolean -> checkbox" coverage with a new case.
  - Assert the new style key's name (e.g. `checkboxUnstretched`) appears in
    the standalone checkbox's rendered `class` output. Assert the name is
    absent from a grouped boolean-under-`radio` or list-under-`checkboxes`
    render.
  - Per `test/preload-stylex.ts`'s stub, `stylex.props()` renders each
    applied style as its own key name. It never renders a compiled CSS
    declaration.
  - Verify red before green, on a scratch copy. Temporarily revert 1.1, and
    confirm the new assertion fails. Restore the fix, and confirm the
    assertion passes again.

## 3. Browser check

- [x] 3.1 Build and serve the app in the devcontainer.
  - Open the studio Player on a process with a standalone (non-grouped)
    boolean field. Confirm the checkbox now sits flush left under its
    label, at normal window width and at a wide window. Verify by eye, per
    CLAUDE.md's real-browser verification gate.
  - Run `/impeccable critique <route>` and `/impeccable audit <route>`
    against the Player route. `packages/form-ui` edits fall under
    CLAUDE.md's rule: UI work in `packages/web` or `packages/form-ui` goes
    through the design skills. The automatic detector hook only watches
    `packages/web/**` edits, so it will not fire for this form-ui-only
    diff. Critique and audit are the one design-skill touchpoint that still
    applies.
  - Also spot-check the app area's Task screen, the studio form editor's
    preview, and the field catalog's own inert field preview
    (`FieldCatalogPanel.tsx`). All four mount the same `FieldForm`.

## 4. Verification

- [x] 4.1 Run `bun run typecheck`. Confirm it passes with no errors.
- [x] 4.2 Run `bun run build`. Confirm it completes with no errors.
- [x] 4.3 Run the FULL `bun test` suite, with `DATABASE_URL` set. Never
  substitute a single-file rerun. Confirm all tests pass, and confirm the
  skip count is 0. Use `scripts/gates/silent-green.sh` against the captured
  output, per CLAUDE.md.
- [x] 4.4 Run the antislop prose gate over the changed Markdown:
  `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`.
  Confirm the finding count does not rise.
- [x] 4.5 Run the whitespace/CRLF gate:
  `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`.
  Confirm it passes.
