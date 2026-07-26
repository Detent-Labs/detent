## Why

`SubprocessSpecEditor.tsx`'s `MappingEditor` and `ActionListEditor.tsx`'s
`ActionRow` output-mapping block are near byte-for-byte duplicates of the same
UI shape — a field-id → CEL expression map editor (per-row `<select>` +
`ExpressionInput` + remove button, plus set/delete-entry and
add-first-unused-field logic). This is item 1 of `PONYTAIL-AUDIT.md` (scanned
2026-07-24), reconfirmed against current file contents
(`SubprocessSpecEditor.tsx:18-74`, `ActionListEditor.tsx:88-149`) before
designing this change. Extracting one shared component removes the
duplication with no behavior change.

## What Changes

- Add a new shared panel component, `FieldExpressionMapEditor`, in
  `packages/editor/src/panels/shared/`, holding the existing `MappingEditor`
  rendering/update logic verbatim (entries via `Object.entries`,
  delete-then-set semantics on field change, first-unused-field add logic).
- `SubprocessSpecEditor.tsx`: delete the local `MappingEditor` function; its
  two call sites (`inputMapping`, `outputMapping`) call the shared component
  instead, passing the existing `subprocess.*` label keys.
- `ActionListEditor.tsx` (`ActionRow`): replace the inline output-mapping JSX
  block with one call to the shared component, passing the existing
  `actions.*` label keys.
- No new automated test (behavior-preserving extraction; no other editor
  panel has a component-level render test today). Safety net is `tsc
  --noEmit` plus a manual dev-server check.
- Fix a latent bug found during verification: switching a mapping row's
  field duplicated the entry under both the old and new field id instead of
  replacing it, because the two `setEntry` calls handling the switch both
  read the same stale `mapping` closure. Present identically in both
  pre-refactor duplicates (not introduced by consolidation), fixed once in
  the shared component's `moveEntry` handler. See `design.md`.

## Capabilities

### New Capabilities

- `field-expression-map-consolidation`: a structural requirement that the
  field-id → CEL expression map UI (rendering, set/delete-entry, and
  first-unused-field add logic) is implemented once and shared by both
  `SubprocessSpecEditor` and `ActionListEditor`, instead of duplicated —
  the mechanism-level counterpart to `registry-error-consolidation` (added
  for the same audit report's finding 2/3), recorded so the "don't
  re-duplicate this" constraint doesn't silently regress. External
  behavior (what each panel renders, how edits update the mapping) is
  unchanged.

### Modified Capabilities

None — no requirement in `openspec/specs/editor-structural-panels/spec.md`
changes. The field/CEL mapping UI's observable behavior (what it renders,
how edits update the mapping) is unchanged; only the location of the code
implementing it moves, which the new capability above documents.

## Impact

- **Affected code**: `packages/editor/src/panels/shared/FieldExpressionMapEditor.tsx`
  (new), `packages/editor/src/panels/SubprocessSpecEditor.tsx`,
  `packages/editor/src/panels/ActionListEditor.tsx`.
- **Affected systems**: `packages/editor` only. No engine, schema, or runtime
  changes; no i18n key changes (existing `actions.*`/`subprocess.*` keys stay
  where they are).
- **Rollback**: revert the three touched files.
