## Context

Three panels reimplement the same add/remove/update-by-index triple against
a root-level Draft array via `mutate` (the editor's Immer-backed draft
setter):

- `DataSourcesPanel.tsx:16-34` (`addDataSource`/`removeDataSource`/`updateDataSource`
  on `d.dataSources`)
- `FieldCatalogPanel.tsx:167-185` (`addField`/`removeField`/`updateField`
  on `d.fields`)
- `StepsPanel.tsx:41-65` (`addStep`/`removeStep`/`updateStep` on
  `d.workflow.steps`, with extra bookkeeping — see Decisions)

Verified against current file contents before designing this change (not
just the audit text). This is a distinct convention from `removeAt`/
`updateAt` (`draft/list-ops.ts`, added in `array-crud-by-index-helper`):
that helper takes a plain array and returns a new one for a prop-driven
`onChange`; these three sites mutate a field on the root Immer draft inside
`mutate((d) => ...)` and have no return value.

Separately, `FieldExpressionMapEditor`'s `emptyLabel` prop
(`panels/shared/FieldExpressionMapEditor.tsx:11,23,57`) is declared,
threaded through, and rendered (`entries.length === 0 && emptyLabel`) but
neither of its two callers (`SubprocessSpecEditor.tsx`,
`ActionListEditor.tsx`) passes it — confirmed via full-repo grep for
`emptyLabel`, zero call sites.

## Goals / Non-Goals

**Goals:**
- Remove the three independent reimplementations of add/remove/update
  against a root-level draft array behind one shared, generic helper.
- Preserve every panel's external behavior exactly (rendered output, what
  gets written to the Draft).
- Drop `FieldExpressionMapEditor`'s dead `emptyLabel` prop and branch.

**Non-Goals:**
- The `array-crud-by-index-consolidation` sites (`PathsPanel`, `TimersPanel`,
  `ViewEditor`, `ActionListEditor`, `FieldCatalogPanel` option/sub-field
  rows) — already covered, different convention, out of scope here.
- `StepsPanel`'s `initialStep` bookkeeping and `setExpanded` local state —
  these are step-specific behavior layered around the CRUD triple, not part
  of the duplicated shape itself; they stay in `StepsPanel`.
- Any other `FieldExpressionMapEditor` prop or behavior.

## Decisions

### Helper shape and placement

New file `packages/editor/src/draft/draft-array-crud.ts` (pure logic, no
React — matching the `draft/` convention used by `list-ops.ts`, `ids.ts`,
`fields.ts`), exporting one generic helper parameterized over the draft
mutator already in scope:

```ts
export function addToDraftArray<D, T>(
  mutate: (fn: (d: D) => void) => void,
  getArray: (d: D) => T[] | undefined,
  ensureArray: (d: D) => T[],
  item: T,
): void {
  mutate((d) => {
    ensureArray(d).push(item);
  });
}
```

Considered a single object-returning `useDraftArrayCrud(mutate, path)`
hook wrapping all three operations behind one call. Rejected: `mutate`'s
signature takes a callback closing over the whole draft `d`, not a lensed
sub-object, so a generic "path" accessor would need get/set/ensure
functions per site anyway — no simpler than three small named functions.
Went instead with three plain functions (`addToDraftArray`,
`removeFromDraftArray`, `updateInDraftArray`) mirroring `removeAt`/
`updateAt`'s two-function shape from the sibling consolidation, each taking
`mutate` plus accessor callbacks:

```ts
export function removeFromDraftArray<D>(
  mutate: (fn: (d: D) => void) => void,
  removeFrom: (d: D) => void,
): void {
  mutate(removeFrom);
}

export function updateInDraftArray<D, T>(
  mutate: (fn: (d: D) => void) => void,
  getItem: (d: D) => T | undefined,
  patch: Partial<T>,
): void {
  mutate((d) => {
    const item = getItem(d);
    if (item) Object.assign(item, patch);
  });
}
```

`removeFromDraftArray` stays a thin `mutate` pass-through (splice varies
per site — `d.dataSources?.splice(index, 1)` vs `d.fields?.splice(index,
1)` — there's nothing generic to lift beyond "call mutate", so the helper
exists only to keep the three operations named as one triple at each call
site) — re-examined during implementation; if it turns out to add no value
over calling `mutate` directly, drop it and keep `removeX` inline, noting
that in the task instead of forcing a helper that doesn't earn its keep.

### Call-site changes

`DataSourcesPanel.tsx` and `FieldCatalogPanel.tsx` collapse their
add/remove/update trio to the shared helpers directly (same shape, no
extra logic). `StepsPanel.tsx` uses `addToDraftArray`/`updateInDraftArray`
for the base triple but keeps its `initialStep` bookkeeping and
`setExpanded(id)` call composed around the helper call, e.g.:

```ts
const addStep = () => {
  const id = mintId("step");
  addToDraftArray(mutate, (d) => d.workflow?.steps, (d) => {
    d.workflow ??= {};
    d.workflow.steps ??= [];
    return d.workflow.steps;
  }, { id, key: "", label: seedLocalizedText(contentLocale), type: "task" });
  mutate((d) => { if (!d.workflow!.initialStep) d.workflow!.initialStep = id; });
  setExpanded(id);
};
```

(Exact composition finalized during implementation — the constraint is
`initialStep`/`setExpanded` stay outside the shared helper, not inlined
into it.) `removeStep` keeps its `filter` + `initialStep` reassignment as
today (it isn't a plain splice-by-index like the other two removes — see
Risks) and is **not** migrated to `removeFromDraftArray`.

### Data flow

Unchanged. `mutate` semantics (Immer draft, single commit per call) are
untouched; the helpers only factor out the array-access boilerplate inside
the callback.

### Testing

No new automated test — direct `mutate`-callback delegation, no new
branching or invariant, consistent with `array-crud-by-index-helper`'s
precedent (no editor panel has component-level tests today). Safety net:
`tsc --noEmit` plus a manual dev-server pass — add, edit, and remove one
row via each of `DataSourcesPanel`, `FieldCatalogPanel`, and `StepsPanel`
(including confirming `initialStep` still updates correctly on add/remove),
and confirm `FieldExpressionMapEditor`'s empty state still renders nothing
(no `emptyLabel` was ever shown, since no caller passed it) after the prop
removal.

## Risks / Trade-offs

- [Risk] `StepsPanel.removeStep` is not a byte-identical `splice`-by-index
  like `DataSourcesPanel`/`FieldCatalogPanel` — it filters by `id` and
  reassigns `initialStep`. Forcing it through a shared "remove" helper
  would either lose that behavior or require the helper to grow
  `StepsPanel`-specific parameters, defeating the point. → Mitigation:
  `removeStep` is explicitly out of the consolidation (only `addStep`/
  `updateStep` use the shared helpers); the spec requirement below scopes
  itself to the two operations that are actually identical across sites.
- [Risk] Collapsing three call sites into one helper could hide a subtle
  per-site difference not caught by this design review. → Mitigation:
  manual dev-server verification per site (task below) plus `tsc --noEmit`
  catches signature drift.

## Migration Plan

Pure refactor, no schema/contract/data changes. Rollback is reverting the
new `draft-array-crud.ts` file plus the three touched panel files and
`FieldExpressionMapEditor.tsx`.

## Open Questions

Whether `removeFromDraftArray` earns its keep as a named helper versus
calling `mutate` inline at the two sites that use plain splice
(`DataSourcesPanel`, `FieldCatalogPanel`) — left to implementation
judgment per the note in Decisions; either outcome preserves behavior
identically, so it doesn't block this design.

**Resolved during implementation**: dropped. It would have been a
`mutate(removeFn)` pass-through with no shared logic to lift (the splice
target differs per site, and `mutate` is already the generic entry point),
so a named wrapper added indirection without earning it. `removeDataSource`/
`removeField` stay inline `mutate` calls, unchanged from before this
change. Final helper module exports only `addToDraftArray` and
`updateInDraftArray`.
