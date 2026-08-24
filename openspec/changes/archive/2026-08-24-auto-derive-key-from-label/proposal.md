## Why

Today an author types `key` by hand at every site it sits beside `label`: the
process itself, a step, and a catalog field. That is manual slug entry the
no-code direction (ROADMAP stage 27) is meant to eliminate — an author
typing no CEL and no JSON still has to invent and type an identifier. Stage
45 (`ROADMAP.md`) raises this directly: derive `key` from `label` as the
author types it, so the key field never blocks no-code authoring, while
staying an ordinary editable text input an author can override at any time.

## What Changes

- A new shared derivation utility (`deriveKey`/`dedupeKey`) that turns a
  label into a slug matching `FieldDef.key`'s existing identifier grammar
  (`/^[a-z_][a-z0-9_]*$/`), and deduplicates it against a caller-supplied set
  of keys already in scope.
- The process key (`ProcessHeaderBar`'s "Process, saved with the draft" menu
  group), a step's key (the inspector's identity zone, and the canvas
  node's own inline rename, which write through the same `step.label`
  patch path and so share this behavior), and a field's key (the field
  catalog, including a field nested inside a `group`) each auto-fill from
  the entity's label as the author types it, for a newly created entity
  (key starts empty) or any entity whose key still matches what live
  derivation would produce. `label` is `LocalizedText`; derivation always
  reads the draft's base-locale entry, never whichever content locale the
  author is currently viewing — see design.md's Decisions.
- The first manual edit to a key field stops auto-derivation for that one
  entity from then on — every later label edit leaves the key alone.
- A derived key that collides with a sibling's key in the same scope (other
  steps in the draft; the flattened field catalog, including group children)
  gets a `_2`, `_3`, … suffix so ordinary same-label entry never produces a
  duplicate key on its own.
- Out of scope: `Path.key`. A newly created path derives it from its two
  endpoint steps via the existing `derivePathDefaults`/`slugify` in
  `createPath.ts`, but `PathsPanel.tsx` also renders `path.key` and
  `path.label` as two independent text inputs with no re-derivation after
  creation — the same gap this change closes for the other three sites.
  Deferred here, not because the gap differs: `Path.key` stays format-free
  (`.claude/rules/authoring-invariants.md` — "nothing reads them as
  identifiers"), so the CEL-collision risk that motivates this change for
  fields is absent, and a colliding `Path.key` is cosmetic, not a publish
  hazard. See design.md's Open Questions. No change to
  `src/schema/definition.ts`, to `compile.ts`'s publish-time checks, or to
  the JSON view, which stays the unchanged escape hatch for any key.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-canvas`: the process-identity header bar's key field, the
  inspector's identity zone key field, and the canvas node's own inline
  rename all gain auto-derivation-from-label and per-entity
  lock-on-manual-edit behavior, reading only the base-locale label.
- `studio-app`: the field catalog's key field (top-level and nested
  `group` children) gains the same auto-derivation and lock behavior, plus
  dedup against every other key in the process's field catalog — the field
  catalog's own edit behavior is tracked under `studio-app`, alongside its
  existing Field-tab requirements, not under `studio-form-editor` (the
  separate drag-and-drop form-layout editor).

## Impact

- New file: `packages/web/src/areas/studio/draft/deriveKey.ts` (pure
  functions, no draft-shape dependency).
- `packages/web/src/areas/studio/panels/ProcessHeaderBar.tsx`'s own inline
  label `onChange` (`screens/processHeaderLogic.ts` owns only the
  base-locale control, not the label): process key auto-derivation.
- New file: `packages/web/src/areas/studio/panels/stepsPanelLogic.ts`
  (the step-key decision, extracted so it's testable without a DOM, the
  same reason `processHeaderLogic.ts` and `inlineRename.ts` exist).
  `packages/web/src/areas/studio/panels/StepsPanel.tsx`'s identity-zone
  label input wires to it, deduped against `draft.workflow.steps[].key`.
- `packages/web/src/areas/studio/canvas/CanvasView.tsx`: `commitRename`
  calls the same `stepsPanelLogic.ts` function (alongside the existing
  `canvas/inlineRename.ts::inlineRenamePatch`), so the two existing routes
  to `step.label` stay in agreement per `inlineRename.ts`'s own "cannot
  drift" comment.
- New file: `packages/web/src/areas/studio/panels/fieldCatalogLogic.ts`
  (the field-key decision, same extraction reason). Wires into
  `packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx`'s top-level
  and nested `group`-child field editors, deduped against
  `draftFields(draft)` (`draft/fields.ts`).
- `ROADMAP.md` stage 45 (marked DONE, noting `Path.key`/`Path.label` as the
  deliberately deferred site) and `docs/roadmap-history.md` (new entry).
- New test files: `packages/web/test/studio-deriveKey.test.ts` (the shared
  `deriveKey`/`dedupeKey`/`shouldAutoDeriveKey` unit tests),
  `packages/web/test/studio-stepsPanelLogic.test.ts` and
  `packages/web/test/studio-fieldCatalogLogic.test.ts` (driving the new
  logic modules directly, the `studio-processHeaderLogic.test.ts` pattern),
  plus extensions to `studio-processHeaderLogic.test.ts` (process key) and
  `studio-inlineRename.test.ts` (canvas rename's key derivation).
- No API, schema, or engine changes. No new dependency.
