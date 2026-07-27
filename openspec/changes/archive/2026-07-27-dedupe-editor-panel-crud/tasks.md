## 1. Shared helper

- [x] 1.1 Create `packages/editor/src/draft/draft-array-crud.ts` exporting
      `addToDraftArray`/`updateInDraftArray` (and `removeFromDraftArray` if
      it earns its keep — see design.md Open Questions) per `design.md`.
      Resolved: `removeFromDraftArray` dropped — a thin `mutate` pass-through
      with nothing shared to lift, so removes stay inline at each call site.

## 2. Call-site migration

- [x] 2.1 `DataSourcesPanel.tsx`: delegate `addDataSource`/`updateDataSource`
      (and `removeDataSource` if kept) to the shared helpers.
- [x] 2.2 `FieldCatalogPanel.tsx`: delegate `addField`/`updateField` (and
      `removeField` if kept) to the shared helpers.
- [x] 2.3 `StepsPanel.tsx`: delegate `addStep`/`updateStep` to the shared
      helpers, keeping `initialStep` bookkeeping and `setExpanded` composed
      around the calls. Leave `removeStep` as-is (filter-by-id +
      `initialStep` reassignment, not a plain splice — out of scope per
      design.md).

## 3. Dead prop removal

- [x] 3.1 `FieldExpressionMapEditor.tsx`: remove the `emptyLabel` prop from
      `FieldExpressionMapEditorProps`, the destructured parameter, and the
      `entries.length === 0 && emptyLabel` branch.
- [x] 3.2 Confirm (grep) neither `SubprocessSpecEditor.tsx` nor
      `ActionListEditor.tsx` references `emptyLabel`. Confirmed zero matches
      repo-wide after removal.

## 4. Manual verification

- [x] 4.1 In the dev server: add, edit, and remove a row in
      `DataSourcesPanel`, `FieldCatalogPanel`, and `StepsPanel`; for steps,
      confirm `initialStep` still updates correctly on add of the first
      step and on removal of the current initial step. Verified via
      playwright-cli against the containerized dev server — all three
      panels add/update/remove correctly, `initialStep` set on first add
      and cleared on removing the initial step, no new console errors.
- [x] 4.2 Confirm `FieldExpressionMapEditor`'s empty state renders the same
      as before (no label text) for both callers. Provably unchanged:
      zero call sites passed `emptyLabel` before removal (grep-confirmed),
      so the branch was already always-false.

## 5. Verification

- [x] 5.1 Run `bun run typecheck`. Passed (engine + editor).
- [x] 5.2 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun). 859 pass, 0 fail, 2286 expect() calls.
