## Context

The `addX`/`removeX(index)`/`updateX(index, patch)` array-CRUD-by-index
triple is reimplemented independently at six call sites in the editor's
structural panels, each ~2 lines of the same shape
(`filter((_, i) => i !== index)` for remove,
`map((x, i) => i === index ? {...x, ...patch} : x)` for update):

- `packages/editor/src/panels/PathsPanel.tsx:38-40` (`removePath`/`updatePath`)
- `packages/editor/src/panels/TimersPanel.tsx:34-36` (`removeTimer`/`updateTimer`)
- `packages/editor/src/panels/ViewEditor.tsx:36-39` (`removeRow`/`updateRow`)
- `packages/editor/src/panels/ActionListEditor.tsx:34-40` (`removeAction`/`updateAction`)
- `packages/editor/src/panels/FieldCatalogPanel.tsx:42-44` (`removeOption`/`updateOption`)
- `packages/editor/src/panels/FieldCatalogPanel.tsx:48-50` (`removeSubField`/`updateSubField`)

Verified against current file contents (not just the audit text) before
starting this design. This change extracts two generic pure functions, used
by all six sites, removing the duplication.

## Goals / Non-Goals

**Goals:**

- Remove the six independent reimplementations of remove-by-index and
  update-by-index behind two shared, generic, pure functions.
- Preserve every call site's external signature and behavior exactly.

**Non-Goals:**

- `FieldCatalogPanel`'s top-level field list (`addField`/`removeField`/
  `updateField`). These go through `mutate` (Immer `splice`/`Object.assign`),
  a different shape entirely — correctly excluded by the audit.
- The `addX` half of the triple. Add-logic differs meaningfully per site
  (seed values, first-unused-field lookups, availability checks) and isn't
  duplicated verbatim — only the remove/update shape is.
- Audit item 4 (the `migrateInstances`/`findOrphanKeys` keyset-pagination
  duplication). Unrelated code, separate change, low priority per the audit.

## Decisions

### Module shape

New file `packages/editor/src/draft/list-ops.ts` — pure logic, no React,
matching the existing `draft/` convention (`ids.ts`, `fields.ts`,
`localized-text.ts`, ...) rather than `panels/shared/` (reserved for
components; every file there today is `.tsx`):

```ts
export function removeAt<T>(list: T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

export function updateAt<T>(list: T[], index: number, patch: Partial<T>): T[] {
  return list.map((item, i) => (i === index ? { ...item, ...patch } : item));
}
```

Alternative considered: `panels/shared/`. Rejected because that directory is
reserved for components (every existing file there is `.tsx`) and these are
pure, React-free functions — `draft/` is the established home for that shape.

### Call-site changes

Each panel keeps its own named wrapper (`removePath`, `updateTimer`, ...) —
they carry domain naming and call the panel's own `onChange`/`setRows`/
`setOptions` — only the body collapses to a one-line delegate, e.g.:

```ts
const removePath = (index: number) => onChange(removeAt(list, index));
const updatePath = (index: number, patch: Partial<DraftPath>) =>
  onChange(updateAt(list, index, patch));
```

Six sites touched (same six listed under Context):

1. `PathsPanel.tsx`
2. `TimersPanel.tsx`
3. `ViewEditor.tsx`
4. `ActionListEditor.tsx`
5. `FieldCatalogPanel.tsx` — option rows (inside `setOptions`)
6. `FieldCatalogPanel.tsx` — sub-field rows

Alternative considered: collapsing all six wrappers into direct inline calls
to `removeAt`/`updateAt` at each JSX callback site, dropping the named
wrappers entirely. Rejected — the named wrappers carry domain-meaningful
names (`removePath` vs. a bare `removeAt` call inline in JSX) that keep the
call sites readable, and keeping them minimizes the diff against each
panel's existing structure.

### Data flow

Unchanged. Each call site's `onChange`/`setRows`/`setOptions` signature and
semantics stay exactly as today — only the removed/updated array is computed
via the shared helper instead of inline `filter`/`map`.

### Testing

No new automated test. `removeAt`/`updateAt` are direct stdlib delegation
with no branching or new invariant, and no editor panel has component-level
tests today — adding one only for this helper would be inconsistent with
actual project test coverage, not a fix to a gap this change creates. Safety
net: `tsc --noEmit` (catches signature drift at all six call sites) plus a
manual dev-server pass — add, edit, and remove one row in each of the six
lists (path, timer, view field, action, field option, sub-field).

## Risks / Trade-offs

None identified — pure, behavior-preserving extraction; every call site's
external signature is unchanged.

## Migration Plan

Pure refactor, no schema/contract/data changes. Rollback is reverting the new
`list-ops.ts` file plus the five touched panel files.

## Open Questions

None outstanding — placement (`draft/` vs. `panels/shared/`) was the only
open decision, resolved during design review by following the existing
pure-logic-vs-components split.
