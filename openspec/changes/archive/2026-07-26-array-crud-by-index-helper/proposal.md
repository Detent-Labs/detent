## Why

Item 2 of `PONYTAIL-AUDIT.md` (scanned 2026-07-24): the `removeX(index)`/
`updateX(index, patch)` half of the array-CRUD-by-index pattern is
reimplemented independently at six call sites across the editor's structural
panels, each ~2 lines of the same shape (`filter((_, i) => i !== index)` for
remove, `map((x, i) => i === index ? {...x, ...patch} : x)` for update).
Reconfirmed against current file contents (`PathsPanel.tsx:38-40`,
`TimersPanel.tsx:34-36`, `ViewEditor.tsx:36-39`, `ActionListEditor.tsx:34-40`,
`FieldCatalogPanel.tsx:42-44`, `FieldCatalogPanel.tsx:48-50`) before designing
this change. Extracting two shared pure functions removes the duplication
with no behavior change.

## What Changes

- Add a new pure-logic module, `packages/editor/src/draft/list-ops.ts`,
  exporting `removeAt<T>(list, index)` and `updateAt<T>(list, index, patch)` —
  direct stdlib delegation (`filter`/`map`), no new invariant.
- Six call sites collapse their `removeX`/`updateX` bodies to one-line
  delegates to the shared helpers, keeping their own domain naming and
  `onChange`/`setRows`/`setOptions` wiring unchanged:
  `PathsPanel.tsx`, `TimersPanel.tsx`, `ViewEditor.tsx`,
  `ActionListEditor.tsx`, and `FieldCatalogPanel.tsx` (option rows and
  sub-field rows — two sites in one file).
- No new automated test (pure stdlib delegation; no editor panel has
  component-level tests today). Safety net is `tsc --noEmit` plus a manual
  dev-server pass exercising add/edit/remove on each of the six lists.
- Out of scope: `FieldCatalogPanel`'s top-level field list (goes through
  `mutate`/Immer, a different shape), the `addX` half of the triple
  (add-logic differs meaningfully per site), and audit item 4
  (`migrateInstances`/`findOrphanKeys` pagination duplication — unrelated,
  separate change).

## Capabilities

### New Capabilities

- `array-crud-by-index-consolidation`: a structural requirement that
  remove-by-index and update-by-index operations on an in-memory array are
  implemented once (`removeAt`/`updateAt` in `draft/list-ops.ts`) and reused
  by every editor panel that needs them, instead of duplicated inline —
  the mechanism-level counterpart to `field-expression-map-consolidation`
  and `registry-error-consolidation` (added for earlier findings in the same
  audit report), recorded so the "don't re-duplicate this" constraint
  doesn't silently regress. External behavior (what each panel renders, how
  edits update its list) is unchanged.

### Modified Capabilities

None — no requirement in `openspec/specs/editor-structural-panels/spec.md`
changes. Each panel's observable remove/update behavior is unchanged; only
the location of the code implementing it moves, which the new capability
above documents.

## Impact

- **Affected code**: `packages/editor/src/draft/list-ops.ts` (new),
  `packages/editor/src/panels/PathsPanel.tsx`,
  `packages/editor/src/panels/TimersPanel.tsx`,
  `packages/editor/src/panels/ViewEditor.tsx`,
  `packages/editor/src/panels/ActionListEditor.tsx`,
  `packages/editor/src/panels/FieldCatalogPanel.tsx`.
- **Affected systems**: `packages/editor` only. No engine, schema, or runtime
  changes.
- **Rollback**: revert the new `list-ops.ts` file plus the five touched
  panel files.
