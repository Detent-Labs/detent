## Why

Three small defects in `PONYTAIL-AUDIT.md` (findings 65-67) cluster around
the same field-tree-walking machinery.

The compile pass in `src/schema/compile.ts` walks `body.fields` four
separate times to check four unrelated per-field properties. The CEL check
and eval modules, `src/cel/check.ts` and `src/cel/eval.ts`, each re-derive
"every leaf field" from `collectFieldsDeep`. Each keeps its own copy of the
group-filtering loop. A schema field, `view.renderer`, has no reader
anywhere in the engine, the HTTP layer, or `packages/form-ui`.

None of these carries product risk on its own. Each is a duplicated
traversal or a dead surface. Each grows silently once a fourth caller
copies the pattern instead of sharing it. The audit groups them as one
finding set because they share one mechanism. This change fixes them
together for the same reason.

## What Changes

- Consolidate `checkPatterns`, `checkColumnMapping`, `checkFieldKeyFormat`,
  and the field-key-length loop inside `checkLengthBounds`
  (`src/schema/compile.ts`) into one `walkFieldsIndexed` pass over
  `body.fields` that runs all four per-field checks together. Every emitted
  issue keeps its pre-change `loc`, `value` and message text.
- Add a shared `leafFields(fields: FieldDef[]): FieldDef[]` helper to
  `src/schema/definition.ts`, beside `collectFieldsDeep`. Rewrite
  `dataSchema`/`contractFieldSchema` (`src/cel/check.ts`) and `fieldKeyById`
  (`src/cel/eval.ts`) to call it, replacing each function's own copy of
  "call `collectFieldsDeep`, then drop `group`-typed entries."
- **BREAKING** (schema, authoring-time only): delete the unread
  `renderer: plugin.optional()` field from the `view` object in
  `src/schema/definition.ts`. Delete the two now-dead call sites that
  reference it in `src/schema/compile.ts`: the `view.renderer`-shape check
  inside the view-keys walk. It also deletes the `view.renderer` push inside
  `collectPluginTypeSites`. A newly authored body that sets `view.renderer`
  now fails to publish as an unknown key. Pre-change, the value published but
  the engine silently discarded it. Design.md covers the `definitionHash`
  impact on bodies published before this change.

## Capabilities

### New Capabilities

- `field-tree-check-consolidation`: structural (mechanism-level)
  requirements. Covers the merged field-tree walk in `compile.ts` and the
  shared `leafFields` helper. Covers the deletion of the unread
  `view.renderer` field, including the new publish-time rejection of an
  authored `view.renderer` as an unknown key. Companion to the existing
  `field-expression-map-consolidation`, `registry-config-check-consolidation`
  and `runtime-field-type-check-consolidation` capabilities, for the same
  `PONYTAIL-AUDIT.md` report's findings 65-67.

### Modified Capabilities

(none. `openspec/specs/definition-contract/spec.md` states no requirement
naming `view.renderer`, `dataSchema`, `contractFieldSchema`,
`fieldKeyById`, or the four consolidated `compile.ts` checks by name.
Design.md covers the search that confirmed this.)

## Impact

- `src/schema/compile.ts`: `checkPatterns`, `checkColumnMapping`,
  `checkFieldKeyFormat`, `checkLengthBounds`, `structuralIssues`,
  `walkViewKeys`, `collectPluginTypeSites`.
- `src/schema/definition.ts`: the `view` object schema (removes `renderer`),
  new exported `leafFields` helper.
- `src/cel/check.ts`: `dataSchema`, `contractFieldSchema`.
- `src/cel/eval.ts`: `fieldKeyById`.
- No `packages/web` code, no HTTP route, and no `packages/form-ui` code
  reads `view.renderer` or either consolidated helper. A repo-wide search
  confirmed this (design.md has the search). No area capability spec
  changes.
- Existing regression coverage must keep passing with unchanged observed
  behavior: `test/compile-validation.test.ts`, `test/column-mapping.test.ts`,
  `test/cel.test.ts`, `test/eval.test.ts`. The merge and the helper
  extraction are behavior-preserving.
