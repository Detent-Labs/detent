## Context

`SubprocessSpecEditor.tsx`'s `MappingEditor` and `ActionListEditor.tsx`'s
`ActionRow` output-mapping block are near byte-for-byte duplicates of the same
UI shape — a field-id → CEL expression map editor (per-row `<select>` +
`ExpressionInput` + remove button, plus set/delete-entry and
add-first-unused-field logic). This is item 1 of `PONYTAIL-AUDIT.md` (scanned
2026-07-24). Verified against the current file contents (not just the audit
text) before starting this design:

- `packages/editor/src/panels/SubprocessSpecEditor.tsx:18-74` (`MappingEditor`)
- `packages/editor/src/panels/ActionListEditor.tsx:88-149` (inline block in
  `ActionRow`)

Both implement identical `Object.entries(mapping)` rendering, identical
delete-then-set semantics on field change, and identical "first field not
already used" logic in their add handler.

## Goals / Non-Goals

**Goals:**

- Extract one shared component, used by both call sites, removing the
  duplication. Behavior-preserving: no new invariant, no new UI behavior —
  with one exception found and fixed during verification, see the "Field
  switch" note under Decisions.

**Non-Goals:**

- **i18n key unification.** The editor's `catalog.ts` is namespaced per
  panel (`actions.*`, `subprocess.*`, `fieldCatalog.*`, ...), not per UI
  verb — even textually identical actions like "remove" get separate keys
  per panel today. The shared component takes label strings as props;
  existing `actions.*`/`subprocess.*` keys stay where they are, unchanged.
  Decided during design review — unifying keys would break an existing,
  deliberate convention for no functional gain.
- **Audit item 2** (the `addX`/`removeX`/`updateX`-by-index helper). Same
  audit report, unrelated call sites, separate change.
- **New automated test.** See Decisions below.

## Decisions

### Component shape

New file `packages/editor/src/panels/shared/FieldExpressionMapEditor.tsx`,
alongside the existing shared panel components (`ExpressionInput`,
`IssueList`, ...):

```tsx
interface FieldExpressionMapEditorProps {
  legend: string;
  addLabel: string;
  removeLabel: string;
  placeholder?: string;
  emptyLabel?: string;
  mapping: Partial<Record<FieldId, DraftOf<Expression>>> | undefined;
  fields: DraftField[];
  onChange: (next: Partial<Record<FieldId, DraftOf<Expression>>>) => void;
}
```

Body is the existing `MappingEditor` logic verbatim (entries via
`Object.entries`, `setEntry` with delete-then-set on field change, `addEntry`
picking the first field not already a key). No new behavior.

Alternative considered: keep the two implementations separate but factor out
only the shared helper functions (`setEntry`/`addEntry`), leaving rendering
duplicated. Rejected — the rendering JSX is the larger share of the
duplication and is itself identical between call sites, so factoring only the
helpers would leave most of the duplication in place.

### Call-site changes

- `SubprocessSpecEditor.tsx`: local `MappingEditor` function is deleted; two
  call sites (`inputMapping`, `outputMapping`) pass the existing
  `subprocess.*` label keys.
- `ActionListEditor.tsx` (`ActionRow`): the inline output-mapping JSX block
  is replaced by one call, passing the existing `actions.*` label keys
  (including `resultCelPlaceholder` as `placeholder`). Correction (this
  design originally assumed `ActionListEditor` shows an empty-state message
  for the output-mapping list and should pass it as `emptyLabel` — verified
  during implementation that neither the pre-refactor code nor any call
  site actually has one; only the outer action list's `actions.empty` does,
  which is unrelated. `emptyLabel` stays on the shared component, unused by
  either caller today.

### Field switch (bug found and fixed during verification)

The pre-consolidation `MappingEditor`/`ActionRow` logic handled a row's field
change with two sequential calls, `setEntry(oldField, undefined)` then
`setEntry(newField, expr)`. Both read the same `mapping` prop closure within
one synchronous event handler, so the first call's deletion was invisible to
the second — the row ended up duplicated under both the old and new field
id instead of moved. Confirmed live in the browser (fill an expression,
switch the row's field, see two rows instead of one). Present identically
in both pre-refactor duplicates, so not introduced by consolidation — but
cheap to fix once, in the one place both call sites now share. Fixed by
replacing the two `setEntry` calls with one `moveEntry(oldField, newField,
expr)` that computes the full next map and calls `onChange` once.

### Data flow

Unchanged. Mapping shape (`Partial<Record<FieldId, DraftOf<Expression>>>`)
and `onChange` bubbling stay exactly as they are today — only the location
of the rendering/update logic moves.

### Testing

No new automated test. This is a behavior-preserving extraction (no new
invariant is introduced), and no other editor panel
(`PathsPanel`/`TimersPanel`/`ViewEditor`/`FieldCatalogPanel`) has a
component-level render test today — adding one only for this component
would be inconsistent with the project's actual test coverage, not a fix to
a gap this change creates. Safety net: `tsc --noEmit` (catches prop
mismatches at both call sites) plus a manual dev-server check — add/edit/
remove one mapping entry in a subprocess step and one action output mapping.

## Risks / Trade-offs

- **[Trade-off] `emptyLabel` is optional and unused by both call sites
  today.** Corrected from the original assumption that `ActionListEditor`
  already shows an empty-state message for its output-mapping list — it
  doesn't; only the unrelated outer action list does. Neither call site
  passes `emptyLabel`; it stays available on the shared component for a
  future caller. Accepted — inventing empty-state text that doesn't exist
  today would be a new behavior, not a refactor. `placeholder` is used only
  by `ActionListEditor` (`resultCelPlaceholder`), which is accurate.

## Migration Plan

Pure refactor, no schema/contract/data changes. Rollback is reverting the
three touched files (new shared component, `SubprocessSpecEditor.tsx`,
`ActionListEditor.tsx`).

## Open Questions

None outstanding — i18n approach, component API, and test scope all
converged during design review.
