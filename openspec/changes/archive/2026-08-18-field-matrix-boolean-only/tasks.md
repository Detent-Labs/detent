## 1. Matrix cell rendering

- [x] 1.1 In `FieldMatrixGrid.tsx`, add `effectiveFlag` to the existing
      `../draft/view-flags` import.
- [x] 1.2 Replace the `BooleanOrExpressionInput` call in the live-cell
      boolean/undefined branch with a plain `<label>` + checkbox: `checked`
      reads `effectiveFlag(raw, key) === true`, `onChange` calls the
      existing `writeFlag(stepIndex, row.id, key, e.target.checked)`.
- [x] 1.3 Delete the now-unused `BooleanOrExpressionInput` import from
      `FieldMatrixGrid.tsx`.
- [x] 1.4 Confirm the `<fieldset className="studio-matrix-cell-flag"
      disabled={disabled}>` wrapper and its gating logic (`gatedKeys`)
      stay as they are.
- [x] 1.5 Confirm the `CelStamp` branch for CEL-carrying flags stays as
      it is, with no changes.

## 2. Dead CSS cleanup

- [x] 2.1 Delete the `.studio-matrix-cell-flag .bool-or-expr` rule from
      `app.css`.
- [x] 2.2 Delete the `.studio-matrix-cell-flag select` rule from
      `app.css`.
- [x] 2.3 Grep `app.css` and `packages/web/src` for any other reference
      to `.bool-or-expr` inside a matrix-cell context to confirm nothing
      else depends on the deleted rules.

## 3. Docs

- [x] 3.1 In `docs/browser-checks.md`'s field matrix walk, change "six
      elements, a select and a checkbox each" to "three checkboxes, one
      per flag".

## 4. Manual browser check

- [x] 4.1 Open the panels screen's field matrix on a draft with at
      least one boolean flag and one CEL flag, and confirm boolean cells
      show a checkbox with no select, and CEL cells still show the
      non-editable `CelStamp`.
- [x] 4.2 Toggle a boolean checkbox in the matrix and confirm the
      underlying view entry updates, matching the existing scenario in
      the `studio-app` spec.
- [x] 4.3 Set a cell's `visible` to `false` and confirm `required` and
      `readonly` still disable, matching the existing gating behavior.
- [x] 4.4 Open the canvas dock's Field matrix tab and confirm it renders
      the same checkbox-only cells, with no toolbar regression.

## 5. Verification

- [x] 5.1 Run `bun run typecheck` and confirm it passes.
- [x] 5.2 Run `bun run build` and confirm it passes.
- [x] 5.3 Run the full `bun test` suite with `DATABASE_URL` set and
      confirm it passes, checking the skip count as well as the pass
      count.
- [x] 5.4 Run the antislop linter on every Markdown file this change
      touched.
- [x] 5.5 Run `git diff --check` and confirm it reports nothing.
