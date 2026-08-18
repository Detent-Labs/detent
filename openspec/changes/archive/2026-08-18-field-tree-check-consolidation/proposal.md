## Why

Three small defects in `PONYTAIL-AUDIT.md` (findings 65-67) cluster around
the same field-tree-walking machinery.

The compile pass in `src/schema/compile.ts` walks `body.fields` six
separate times in total, through the shared `walkFieldsIndexed` helper.
Four of the six run one unrelated per-field property check each, with
nothing else in the walk. Those four are `checkPatterns`,
`checkColumnMapping`, `checkFieldKeyFormat`, and the field-key-length
loop inside `checkLengthBounds`. This change merges those four into
one pass.

The other two, `checkUnknownKeys` and `collectExpressionSites`, also
walk `body.fields`. Each does so as one part of a wider traversal that
covers other parts of the body too. Design.md's Context section covers
why they stay out of this change's scope.

The CEL check and eval modules, `src/cel/check.ts` and
`src/cel/eval.ts`, each re-derive "every leaf field" from
`collectFieldsDeep`. Each keeps its own copy of the group-filtering
loop. A schema field, `view.renderer`, has no reader anywhere in the
engine, the HTTP layer, or `packages/form-ui`.

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
- **Dropped from this change**: deleting the unread `renderer:
  plugin.optional()` field from the `view` object in
  `src/schema/definition.ts` (finding 67). Design.md's D1 and tasks.md's
  section 3 gate that deletion on a read-only audit query. The query runs
  against a production snapshot or read replica of the `definitions`
  table, before the schema change ships. This repository documents no way
  to reach such an environment. The query did not run; tasks.md's 3.1
  records why.
- The gate's own rule (tasks.md 3.2) and design.md's D1 treat an unrun
  query the same as a nonzero result. Finding 67 stays out of this change.
  It waits for its own proposal, once a reachable audit environment
  exists. Findings 65 and 66 above ship in this change unaffected.

## Capabilities

### New Capabilities

- `field-tree-check-consolidation`: structural (mechanism-level)
  requirements. Covers the merged field-tree walk in `compile.ts` and the
  shared `leafFields` helper. Companion to the existing
  `field-expression-map-consolidation`, `registry-config-check-consolidation`
  and `runtime-field-type-check-consolidation` capabilities, for the same
  `PONYTAIL-AUDIT.md` report's findings 65 and 66. This change drops
  finding 67 (the `view.renderer` deletion); see What Changes.

### Modified Capabilities

(none. `openspec/specs/definition-contract/spec.md` states no requirement
naming `view.renderer`, `dataSchema`, `contractFieldSchema`,
`fieldKeyById`, or the four consolidated `compile.ts` checks by name.
Two other capability specs do cite two of those checks by name:
`checkColumnMapping` in `studio-column-mapping-form/spec.md`,
`checkPatterns` in `studio-field-validation-form/spec.md`. Design.md's
D2 keeps both functions under those exact names, called per field from
inside the merged walk. Those citations stay accurate with no delta
spec against either capability. Design.md covers the search and the
naming decision.)

## Impact

- `src/schema/compile.ts`: `checkPatterns`, `checkColumnMapping`,
  `checkFieldKeyFormat`, `checkLengthBounds`, `structuralIssues`, and the new
  `checkFieldTree`. `walkViewKeys` and `collectPluginTypeSites` stay
  untouched: both would have changed under finding 67, which this change
  drops (see What Changes).
- `src/schema/definition.ts`: new exported `leafFields` helper, beside
  `collectFieldsDeep`. The `view` object schema keeps `renderer` declared.
- `src/cel/check.ts`: `dataSchema`, `contractFieldSchema`.
- `src/cel/eval.ts`: `fieldKeyById`.
- No `packages/web` code, no HTTP route, and no `packages/form-ui` code
  reads `view.renderer` or either consolidated helper. A repo-wide search
  confirmed this (design.md has the search). No area capability spec
  changes: `studio-column-mapping-form` and `studio-field-validation-form`
  cite `checkColumnMapping` and `checkPatterns` by name. Design.md's D2
  keeps both names intact, so neither citation goes stale.
- Existing regression coverage must keep passing with unchanged observed
  behavior: `test/compile-validation.test.ts`, `test/column-mapping.test.ts`,
  `test/cel.test.ts`, `test/eval.test.ts`. The merge and the helper
  extraction are behavior-preserving.
