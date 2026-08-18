## Why

`checkUnknownKeys` in `src/schema/compile.ts` hand-mirrors the Zod schema
tree in `src/schema/definition.ts`. The check and its supporting walk
helpers span lines ~184-435, about 200 lines. It defines 22
`shapeKeys(...)`-derived key-set constants. It defines 10 `walkXKeys`
recursive walker functions, one pair per schema node kind: step, path,
action, timer, timerAction, view, viewField, assignment, subprocessSpec,
fieldDef, fieldOption, fieldValidation, plugin, expression, dataSourceDef,
workflow, processContract, and the process body itself.

Every field added to, removed from, or renamed in `definition.ts`'s
process-body schema tree needs a matching change to this mirror. Miss one and
the unknown-key check silently stops firing at that level.
`test/compile-validation.test.ts` already carries a dedicated regression
test, named for exactly this failure mode: it plants a `zz`-prefixed key at
every walked level and asserts the check still catches it. That test's
existence proves this is a real hazard, not a hypothetical one.

The schema already knows its own key set. `shapeKeys` reads that key set out
of `.shape`. `authoredProcessBody.parse` uses the same information to
silently strip unknown keys on every read. `checkUnknownKeys` walks that
information a second time by hand, to turn stripped keys into located
rejections. That second, hand-authored walk is what should go. A small,
schema-driven mechanism can derive the same located issues directly from
Zod, with no parallel per-node-kind walker to keep in sync.

## What Changes

- Replace `checkUnknownKeys` and its supporting mirror with a small,
  schema-driven mechanism. The mechanism derives located unknown-key issues
  directly from the `authoredProcessBody`/`publishedProcessBody` schema tree.
  The replaced mirror covers `shapeKeys`, the 22 constants derived from it,
  the 10 `walkXKeys` functions, `checkKnownKeys`, and the
  `walkFieldsIndexed`/`collectActionSites` traversal helpers, to the extent
  those helpers exist only to serve this check. A field added to or removed
  from `definition.ts` will no longer force a matching change in
  `compile.ts`.
- Preserve the exact external contract `checkUnknownKeys` upholds today. The
  replacement reports one `CompileIssue` per offending key. It keeps the same
  `loc`/`value` shape and the same location strings: `workflow.steps[i]...`,
  `contract.*`, `dataSources[i].*`, `fields[i].*` including nested group
  fields. It reports those issues together with the other six structural
  checks, in one `CompileValidationError` batch. The read path
  (`processBody.parse`) keeps silently stripping unknown keys, so
  `definitionHash` stays reproducible. The already-compiled branch still
  cannot bypass the check.
- Add a regression test for a case no existing test exercises: a body that
  carries an unknown key and an unrelated, genuine Zod-level violation in the
  same body (for example an invalid enum value on a required field). The
  test asserts the unknown key is still located and reported. See design.md's
  Risk section for why this combination matters, and for which mechanism the
  design picks.
- Leave the other six structural checks unchanged: `checkReservedActionPrefix`,
  `checkPatterns`, `checkIdResolution`, `checkColumnMapping`,
  `checkFieldKeyFormat`, `checkLengthBounds`. Leave `compileProcessBody`'s
  control flow unchanged. Leave its placement relative to the
  `publishedProcessBody`-valid early return unchanged. Leave the
  `CompileValidationError` exception type unchanged.
- Change `.claude/rules/authoring-invariants.md`'s cross-reference to
  `compile.ts::checkUnknownKeys` if the replacement renames the function.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
(none. Before writing this proposal I read
`openspec/specs/definition-contract/spec.md`'s "Authored bodies reject
unknown keys instead of dropping them" requirement in full. It states the
rule in black-box terms: a located issue per offending key, every unknown
key reported, the check not bypassable via the compiled branch, the read
path unaffected. It does not mandate the current hand-mirrored
implementation. This change preserves that requirement's observable
behavior exactly, so it needs no delta. design.md confirms this check. It
re-confirms the check against the chosen mechanism before this change
reaches apply. This change's `.openspec.yaml` sets `skip_specs: true`. It is
a pure internal refactor with no spec-level behavior change.)

## Impact

- **Code**: `src/schema/compile.ts` only. No other `src/` or `packages/`
  file changes. The change removes roughly 200 lines of hand-rolled mirror.
  It replaces them with a materially smaller schema-driven mechanism.
- **Tests**: `test/compile-validation.test.ts`. The existing "compile:
  unknown-key rejection" describe block, all four `it`s including the
  per-level table-driven regression test, must keep passing unchanged. The
  change adds one new test for the combined-violation case above.
- **Docs**: `.claude/rules/authoring-invariants.md`'s
  `compile.ts::checkUnknownKeys` cross-reference, if the function gets a new
  name.
- **No API, schema, or wire-format change.** `definitionHash`
  reproducibility stays as it is today. The `CompileIssue`/
  `CompileValidationError` shapes stay as they are today. Every other
  structural check's behavior stays as it is today.
