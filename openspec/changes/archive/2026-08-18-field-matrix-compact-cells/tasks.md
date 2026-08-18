## 1. Matrix cell rendering

- [x] 1.1 In `FieldMatrixGrid.tsx`, replace the live-cell
      `<fieldset className="studio-matrix-cell-flag" disabled={disabled}>
      <label>{t(FLAG_LABEL_KEY[key])}<input .../></label></fieldset>`
      block with a bare `<input type="checkbox"
      aria-label={t(FLAG_LABEL_KEY[key])} tabIndex={...}
      checked={effectiveFlag(raw, key) === true} disabled={disabled}
      onChange={...} key={key} />`.
- [x] 1.2 Confirm the `CelStamp` branch for CEL-carrying flags stays
      exactly as it is, unchanged.
- [x] 1.3 Widen `FLAG_LETTER` from `{ visible: "V", required: "R",
      readonly: "O" }` to `{ visible: "VIS", required: "REQ",
      readonly: "RO" }`.
- [x] 1.4 Confirm `gatedKeys`, `writeFlag`, `applyBulkToggle` and the
      keyboard model (`onGridKeyDown`, `moveFocus`, `activate`) stay
      unchanged.

## 2. CSS

- [x] 2.1 Change `.studio-matrix-cell` to `display: flex;
      align-items: center; gap: var(--space-2);` in `app.css`.
- [x] 2.2 Delete `.studio-matrix-cell-flag` and
      `.studio-matrix-cell-flag label` from `app.css`.
- [x] 2.3 Add a `.studio-matrix-cell input:disabled` rule carrying the
      same `opacity: 0.45` the deleted `.studio-matrix-cell-flag:disabled`
      rule gave.
- [x] 2.4 Reduce `.studio-matrix-cell`'s `min-width` to fit the
      narrower row; tune the exact value visually during the browser
      check.

## 3. Manual browser check

- [x] 3.1 Open the panels screen's field matrix and confirm each live
      cell shows its three flag controls side by side in one row, in
      visible/required/readonly order, with no visible text label
      beside any checkbox.
- [x] 3.2 Inspect a checkbox's accessible name (e.g. via the browser's
      accessibility tree or a DOM query on `aria-label`) and confirm
      it names its own flag ("Visible"/"Required"/"Readonly").
- [x] 3.3 Confirm a CEL-carrying flag still shows the `CelStamp` badge,
      now inline in the same row as the cell's other controls.
- [x] 3.4 Toggle a checkbox and confirm the underlying view entry
      still updates, and that `visible: false` still disables and
      clears `required`/`readonly`.
- [x] 3.5 Confirm the column and row bulk-toggle badges read
      "VIS"/"REQ"/"RO" and still flip the same cells they did before.
- [x] 3.6 Open the canvas dock's Field matrix tab and confirm it
      renders the same compact row layout, with no toolbar
      regression.

## 4. Verification

- [x] 4.1 Run `bun run typecheck` and confirm it passes.
- [x] 4.2 Run `bun run build` and confirm it passes.
- [x] 4.3 Run the full `bun test` suite with `DATABASE_URL` set and
      confirm it passes, checking the skip count as well as the pass
      count.
- [x] 4.4 Run the antislop linter on every Markdown file this change
      touched.
- [x] 4.5 Run `git diff --check` and confirm it reports nothing.
