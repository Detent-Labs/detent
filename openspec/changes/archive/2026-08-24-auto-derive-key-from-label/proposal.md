## Why

Today an author types `key` by hand at every site it sits beside
`label`. Three sites do this: the process itself, a step, and a
catalog field. That is manual slug entry.

The no-code direction (ROADMAP stage 27) is meant to eliminate this.
An author typing no CEL and no JSON still has to invent and type an
identifier. Stage 45 (`ROADMAP.md`) raises this directly: derive `key`
from `label` as the author types it, so the key field never blocks
no-code authoring. It stays an ordinary editable text input an author
can override at any time.

## What Changes

- A new shared derivation utility (`deriveKey`/`dedupeKey`) turns a
  label into a slug matching `FieldDef.key`'s existing identifier
  grammar (`/^[a-z_][a-z0-9_]*$/`). It deduplicates that slug against
  a caller-supplied set of keys already in scope.
- Three entities auto-fill their key from their own label as the
  author types it. The process key lives in `ProcessHeaderBar`'s
  "Process, saved with the draft" menu group. A step's key lives in
  the inspector's identity zone, and also the canvas node's own
  inline rename. Both write through the same `step.label` patch path,
  so they share this behavior. A field's key lives in the field
  catalog, including a field nested inside a `group`.
- This auto-fill applies to a newly created entity, whose key starts
  empty. It also applies to any entity whose key still matches what
  live derivation would produce. `label` is `LocalizedText`. Derivation
  always reads the draft's base-locale entry, never whichever content
  locale the author is currently viewing. See design.md's Decisions.
- The first manual change to a key field stops auto-derivation for
  that one entity from then on. Every later label change leaves the
  key alone.
- A derived key that collides with a sibling's key in the same scope
  gets a `_2` suffix. A second collision gets `_3`, and each further
  collision gets the next number in turn. Ordinary same-label entry
  therefore never produces a duplicate key on its own. That scope is
  either the other steps in the draft, or the flattened field
  catalog, including group children.
- Out of scope: `Path.key`. A newly created path derives it from its
  two endpoint steps via the existing `derivePathDefaults`/`slugify`
  in `createPath.ts`. The `PathsPanel.tsx` screen also renders
  `path.key` and `path.label` as two independent text inputs, with no
  re-derivation
  after creation. That is the same gap this change closes for the
  other three sites, deferred here.

  The gap is not deferred because it differs. `Path.key` stays
  format-free ("nothing reads them as identifiers",
  `.claude/rules/authoring-invariants.md`). The CEL-collision risk
  that motivates this change for fields is absent for paths. A
  colliding `Path.key` is cosmetic, not a publish hazard. See
  design.md's Open Questions.

  No change touches `src/schema/definition.ts`, `compile.ts`'s
  publish-time checks, or the JSON view. The JSON view stays the
  unchanged escape hatch for any key.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-canvas`: three fields gain the same two behaviors. They are
  the process-identity header bar's key field, the inspector's
  identity zone key field, and the canvas node's inline rename. Each
  gains auto-derivation-from-label, and per-entity
  lock-on-manual-change. Each reads only the base-locale label.
- `studio-app`: the field catalog's key field, both top-level and
  nested `group` children, gains the same auto-derivation and lock
  behavior. It also gains dedup against every other key in the
  process's field catalog. This repo tracks the field catalog's own
  change behavior under `studio-app`, alongside its existing Field-tab
  requirements. It does not track that behavior under
  `studio-form-editor`, the separate drag-and-drop form-layout
  editor.

## Impact

- New file: `packages/web/src/areas/studio/draft/deriveKey.ts` (pure
  functions, no draft-shape dependency).
- `packages/web/src/areas/studio/panels/ProcessHeaderBar.tsx`'s own
  inline label `onChange` (`screens/processHeaderLogic.ts` owns only
  the base-locale control, not the label): process key
  auto-derivation.
- New file: `packages/web/src/areas/studio/panels/stepsPanelLogic.ts`
  (the step-key decision, extracted so it's testable without a DOM,
  the same reason `processHeaderLogic.ts` and `inlineRename.ts`
  exist). `packages/web/src/areas/studio/panels/StepsPanel.tsx`'s
  identity-zone label input wires to it, deduped against
  `draft.workflow.steps[].key`.
- `packages/web/src/areas/studio/canvas/CanvasView.tsx`:
  `commitRename` calls the same `stepsPanelLogic.ts` function,
  alongside the existing `canvas/inlineRename.ts::inlineRenamePatch`.
  This keeps the two existing routes to `step.label` in agreement,
  per `inlineRename.ts`'s own "cannot drift" comment.
- New file: `packages/web/src/areas/studio/panels/fieldCatalogLogic.ts`
  (the field-key decision, same extraction reason). Wires into
  `packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx`'s
  top-level and nested `group`-child field editors, deduped against
  `draftFields(draft)` (`draft/fields.ts`).
- `ROADMAP.md` stage 45 (marked DONE, noting `Path.key`/`Path.label`
  as the deliberately deferred site) and `docs/roadmap-history.md`
  (new entry).
- New test files: `packages/web/test/studio-deriveKey.test.ts` holds
  the shared `deriveKey`/`dedupeKey`/`shouldAutoDeriveKey` unit tests.
  `packages/web/test/studio-stepsPanelLogic.test.ts` and
  `packages/web/test/studio-fieldCatalogLogic.test.ts` drive the new
  logic modules directly, the `studio-processHeaderLogic.test.ts`
  pattern. Two more files extend existing tests:
  `studio-processHeaderLogic.test.ts` (process key) and
  `studio-inlineRename.test.ts` (canvas rename's key derivation).
- No API, schema, or engine changes. No new dependency.
