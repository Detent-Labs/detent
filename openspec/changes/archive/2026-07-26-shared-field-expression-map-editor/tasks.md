## 1. Shared component

- [x] 1.1 Create `packages/editor/src/panels/shared/FieldExpressionMapEditor.tsx`
      with the `FieldExpressionMapEditorProps` interface from `design.md`
      (`legend`, `addLabel`, `removeLabel`, `placeholder?`, `emptyLabel?`,
      `mapping`, `fields`, `onChange`).
- [x] 1.2 Move the existing `MappingEditor` logic
      (`packages/editor/src/panels/SubprocessSpecEditor.tsx:18-74`) into the
      new component verbatim: `Object.entries` rendering, delete-then-set
      `setEntry`, and first-unused-field `addEntry`.

## 2. Call-site migration

- [x] 2.1 In `SubprocessSpecEditor.tsx`, delete the local `MappingEditor`
      function and update its two call sites (`inputMapping`,
      `outputMapping`) to call `FieldExpressionMapEditor`, passing the
      existing `subprocess.*` label keys.
- [x] 2.2 In `ActionListEditor.tsx` (`ActionRow`), replace the inline
      output-mapping JSX block (`:88-149`) with one call to
      `FieldExpressionMapEditor`, passing the existing `actions.*` label
      keys and `resultCelPlaceholder` as `placeholder`. Correction (found
      during verification): neither the pre-refactor code nor
      `ActionListEditor.tsx` has an empty-state message for the
      output-mapping list — only the outer action list does (`actions.empty`,
      unrelated). No `emptyLabel` is passed by either call site; it remains
      on the shared component, unused, for a future caller.

## 3. Verification

- [x] 3.1 Run `bun run typecheck` — confirms both call sites match the new
      component's prop types.
- [x] 3.2 Manual dev-server check: add/edit/remove one mapping entry in a
      subprocess step's input and output mapping, and one action's output
      mapping.
- [x] 3.3 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun) and confirm no regressions.

## 4. Bug fix found during verification

- [x] 4.1 Fix `FieldExpressionMapEditor`'s field-switch handler
      (`packages/editor/src/panels/shared/FieldExpressionMapEditor.tsx`):
      the pre-consolidation `setEntry(oldField, undefined)` followed by
      `setEntry(newField, expr)` both read the same stale `mapping` closure
      within one synchronous handler, so the delete never lands — switching
      a row's field duplicated the entry under both the old and new field
      instead of replacing it. Replaced with a single `moveEntry` that
      computes the new map once and calls `onChange` once. Present
      identically in the pre-refactor `MappingEditor`/`ActionRow` code, so
      not a regression from consolidation — a real latent bug, fixed here
      instead of deferred, since it was cheap to fix in the one place both
      call sites now share.
- [x] 4.2 Re-run `bun run typecheck`, the manual dev-server check (switch a
      mapping row's field, confirm one row survives with the field changed
      and the expression preserved, not two rows), and the full `bun test`
      suite with `DATABASE_URL` set. No regressions (same 4 pre-existing,
      unrelated `graph-view-rendering.test.tsx` failures as before, caused
      by a missing Playwright browser binary in the container).
