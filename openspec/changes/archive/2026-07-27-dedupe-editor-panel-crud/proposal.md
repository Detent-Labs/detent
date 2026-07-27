## Why

`packages/editor/src/panels/{DataSourcesPanel,StepsPanel,FieldCatalogPanel}.tsx`
each hand-roll an identical add/remove/update-by-index triplet against
`mutate` on a root-level draft array (`d.X ??= []; d.X.push(...)` /
`d.X?.splice(index, 1)` / `Object.assign(d.X?.[index], patch)`). This is a
distinct call convention from the `removeAt`/`updateAt` helper already
extracted for prop-array sites (which return a new array rather than
mutating a root draft field) — so the duplication survived that earlier
cleanup. Separately, `FieldExpressionMapEditor`'s `emptyLabel` prop is
declared and rendered but never passed by either of its two callers. Both
are flagged in `PONYTAIL-AUDIT.md` (findings 1 and 6, 2026-07-26 scan) and
bundled here because they live in the same directory
(`packages/editor/src/panels`) and are both zero-risk, behavior-preserving
editor-internal cleanups.

## What Changes

- Add a shared CRUD helper (e.g. `useDraftArrayCrud` or a plain
  `mutateArray` utility) for the "mutate a root-level draft array in place"
  convention, and use it in `DataSourcesPanel`, `StepsPanel`, and
  `FieldCatalogPanel` in place of their hand-rolled add/remove/update
  triplets.
  - `StepsPanel`'s `addStep`/`removeStep` carry extra bookkeeping beyond the
    plain triplet (`initialStep` maintenance, `setExpanded` local state) —
    the helper covers the common shape; the extra logic stays local to
    `StepsPanel`, composed around the helper, not folded into it.
- Remove `FieldExpressionMapEditor`'s unused `emptyLabel` prop and the
  `entries.length === 0 && emptyLabel` dead branch.

## Capabilities

### New Capabilities
- `draft-array-mutation-consolidation`: a structural requirement that
  in-place root-level-draft-array CRUD (add/remove/update via `mutate`) is
  implemented once and reused by every panel that needs it, instead of
  duplicated inline — the mechanism-level counterpart to
  `array-crud-by-index-consolidation` (which covers the sibling
  return-a-new-array convention, added for the 2026-07-24 scan's finding 2),
  distinguished because the two are structurally different call
  conventions, not variants of one shape. External behavior (what each
  panel renders, how edits update the Draft) is unchanged; this capability
  exists to keep the "don't re-duplicate this" constraint from silently
  regressing, the same reasoning `array-crud-by-index-consolidation`
  recorded.

### Modified Capabilities
None. Finding 6 (dropping `FieldExpressionMapEditor`'s unused `emptyLabel`
prop) has no capability coverage in `openspec/specs/` — the prop was never
reachable behavior (zero callers pass it), so there is no requirement to
delete or modify — it stays a plain deletion with no spec delta, matching
how the 2026-07-24 audit-cleanup change treated its dead-file deletion.

## Impact

- Affected files: `packages/editor/src/panels/DataSourcesPanel.tsx`,
  `StepsPanel.tsx`, `FieldCatalogPanel.tsx`, `shared/FieldExpressionMapEditor.tsx`.
  Likely a new `packages/editor/src/panels/shared/draftArrayCrud.ts` (or
  co-located hook) for the extracted helper.
  Callers of `FieldExpressionMapEditor` (`SubprocessSpecEditor.tsx`,
  `ActionListEditor.tsx`) lose access to a prop that was already dead —
  verified zero call sites currently pass `emptyLabel`.
- No change to `src/schema/definition.ts`, the JSON process definition
  contract, or any engine code — editor-internal only.
- No dependency changes.
