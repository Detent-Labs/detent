## Why

A `Path`'s `key` accepts an empty string today (`z.string()`, no `.min(1)`),
and `label` is fully optional. The canvas's drag-to-connect gesture and the
inspector's "add path" button both call `newPath()`, which seeds `key: ""`
and no `label` at all. An author can draw a path, never open the Paths tab,
and publish it unnamed. It passes the schema clean and shows up afterward as
a blank row or a raw `path_...` id. Nothing tells a later reader which
transition it is. Nothing in the definition contract or the studio stops
this today, for either a manual or an automatic path.

## What Changes

- **BREAKING**: `Path.key`, already a required string, becomes non-empty
  (trimmed). `Path.label` becomes required and non-empty (trimmed), losing
  its `.optional()`. Both apply to a path of either trigger kind, manual or
  automatic, with no carve-out.
- The rule lands directly in `src/schema/definition.ts` (the shared `path`
  Zod schema), not as a separate `compile.ts` write-path check. See
  design.md for why this placement is safe pre-1.0.
- `newPath()` (`packages/web/src/areas/studio/draft/createPath.ts`) stops
  seeding an empty `key`/absent `label`. Three creation gestures exist:
  drag-to-connect, "add path", and a step dropped on a path. All three now
  steer an author toward naming a path immediately. None of them can
  create the now-invalid state anymore. A hand-blanked field stays
  possible, and the checks rail flags it.
- The two subprocess example definitions get a non-empty `label` on every
  path: `subprocess-loan-parent` (three paths) and
  `subprocess-credit-check-child` (two). Those are the only label-less
  paths across `examples/`. `expense-approval` (nine paths) and
  `purchase-requisition` (twenty-two) already label every path; the audit
  in task 1.4 confirms that rather than re-touching them.
- `docs/authoring-guide.md`, `.claude/rules/process-contract.md`, and
  `.claude/rules/authoring-invariants.md` state the new rule.
- `openspec/specs/definition-contract/spec.md`'s existing line, "`Path.key`
  ... NOT constrained by this requirement, nothing reads them as
  identifiers," stays true for the CEL-identifier grammar specifically.
  `key` stays format-free. The new non-empty requirement gets its own
  requirement/scenario blocks alongside it, not a rewrite of that sentence.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `definition-contract`: `Path.key` becomes non-empty and `Path.label`
  becomes required and non-empty, for paths of either trigger kind.
- `studio-canvas`: a newly created path no longer defaults to an empty
  `key` and absent `label`. That applies via drag-to-connect, "add path",
  and a step dropped on a path alike. The new default prompts an author to
  name it before it reaches a published, unnamed state.

## Impact

- `src/schema/definition.ts`: `path.key`/`path.label` tighten in place.
- `src/schema/strip-compiled.ts` and the migration/timer checks in
  `definition.ts` fall within task 1.2's audit for `label`-absence
  assumptions. Task 1.2 expects no change there; a fix lands here if the
  audit finds one.
- `packages/web/src/areas/studio/draft/createPath.ts`: `newPath()`'s default
  shape changes.
- `packages/web/src/areas/studio/draft/insertOnPath.ts`: gains
  `contentLocale`/`baseLocale` params and the resolved
  `unnamedStepPlaceholder` param. These thread through to its own
  `newPath()` call, which now needs a resolved `DraftStep` target instead
  of a bare id.
- `packages/web/src/areas/studio/canvas/CanvasView.tsx`: both `newPath()`
  call sites (lines 608 and 616) gain the target `DraftStep`, the
  `contentLocale`/`baseLocale` args, and the resolved placeholder arg.
  Line 608 resolves `result.targetStepId` (a bare `string`) to the
  matching `DraftStep`; line 616 passes the just-created step itself.
- `packages/web/src/areas/studio/screens/EditScreen.tsx`: `insertOnPath()`'s
  one production call site (line 320) passes the three new arguments.
- `packages/web/test/studio-insertOnPath.test.ts`: six calls to
  `insertOnPath()` gain the three new arguments.
- `packages/web/test/studio-draftValidationLogic.test.ts`: its draft
  fixture (:150) builds a path with no `label` and asserts
  `zodValid === true` (:163-165) through
  `authoredProcessBody.safeParse`. It joins the task 1.3 sweep.
- `packages/web/src/areas/studio/panels/PathsPanel.tsx`: already renders
  `key`/`label` as editable text inputs. Its "add path" action gains the
  fix design.md describes. It also gains the `contentLocale`/
  `baseLocale` props the derivation helper needs.
- `packages/web/src/areas/studio/panels/StepsPanel.tsx`: threads
  `contentLocale`/`baseLocale` into `PathsPanel`'s new props.
- `packages/web/src/i18n/catalogs/studio.ts`: the new target
  `<select>`'s string keys land here. `CatalogKey` is
  `keyof typeof en`, so a missing key fails typecheck. The placeholder
  reuses the existing `paths.selectTargetStep`.
- `examples/*.json`: the two subprocess files gain a `label` on each of
  their five label-less paths. The other two files already label every path.
- `test/view-layout-hash.test.ts`: the label additions to
  `subprocess-loan-parent.json` and `subprocess-credit-check-child.json`
  move both files' `definitionHash`; `PRE_CHANGE_HASHES` gets a fresh
  measurement for each.
- `test/compile-validation.test.ts`: rejection tests for empty/whitespace
  `key` and for missing/empty/whitespace `label`. The automatic-path leg
  gets its own coverage for a missing label, alongside the task 3.9
  example-sweep guard.
- `packages/web/test/studio-createPath.test.ts` (new): the task 2.2 helper
  coverage, the task 2.4 drag-to-empty-canvas coverage, and the task 3.8
  `newPath()` composition test.
- `test/*.ts`, roughly 35 files and about 140 literals: the larger part of
  the impact. Each of
  these builds inline path literals (`{ id, key, to, trigger }`) with no
  `label`, expecting a successful publish, not a rejection.
  `runtime-api.test.ts` alone carries roughly 26. Five files also define a
  local `manualPath`/`autoPath` helper (`automatic.test.ts`,
  `cancel.runtime.test.ts`, `migration.test.ts`, `subprocess.test.ts`,
  `transition.test.ts`) reused dozens of times. None of them sets `label`
  today. Every one of these needs a `label` before the schema tightens.
  That backfill lands in the same commit as task group 1, or the bulk of
  the publish-path suite breaks.
- `docs/authoring-guide.md`, `.claude/rules/process-contract.md`,
  `.claude/rules/authoring-invariants.md`: rule statements added.
- `docs/browser-checks.md`: task 5.6's four manual checks register here
  (task 4.4).
- No engine runtime behavior changes. `key`/`label` are never read by CEL,
  the executor, or transition logic. This tightens authoring time only.
<!-- antislop: allow sentence-length -->
<!-- The sentence starting with a code span merges into the prior list item's word count; the actual sentence is short. -->
- `packages/form-ui/src/PathButtons.tsx`, `packages/web/src/areas/app/
  screens/TaskScreen.tsx`, and `packages/web/src/areas/studio/screens/
  PlayerScreen.tsx`: three new consumers of a guaranteed non-empty label
  (no change here: behavior consequence only).
  `PathButtons.tsx` renders `path.label ?? path.key` as the submit-button
  text a participant sees. `TaskScreen.tsx` and `PlayerScreen.tsx` mount
  it. Both now render a label for every manual path, hand-typed or
  auto-derived. See design.md's Risks section for the accepted trade-off.
- `packages/form-ui/src/types.ts`'s `AvailablePath` and
  `src/runtime/api.ts`'s own `AvailablePath` both declare `label` as
  optional, hand-written independently of the Zod schema. Neither type
  changes: both stay narrower, hand-maintained views over `Path`, not
  derived via `z.infer`, so this change leaves them typed optional on
  purpose rather than tightening them in step.
