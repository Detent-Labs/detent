## Context

`src/cel/check.ts::CHILD_SCHEMA` is `{ outcome: "string", data: "dyn" }`, registered
once per body via `buildEnv({..., child: true})` and cached by the two-dimensional
key `(result, child)` in `validateProcessBody`. Because `data` is `dyn`, any
`child.data.<anything>` member access type-checks — CEL's `dyn` accepts arbitrary
member access with no field-name check. This is registered for every subprocess
step uniformly, since the current model has no per-step notion of "which child".

`src/engine/definitions.ts::validateCrossProcess` already resolves the actual child
`ProcessBody` per subprocess step (by `versionBinding`) to check `inputMapping`
targets against `child.contract.inputFields`. It runs after `validateProcessBody`
in `publishBody`, on the compiled body, before the version is persisted.

At runtime (`src/engine/subprocess.ts`), `child.data` is built by
`buildGuardContext(childBody, childInst, SYSTEM_ACTOR).data` — the child's complete
data object, re-keyed fieldId→key exactly like any process's own `data`. It is not
filtered to `contract.outputFields`.

## Goals / Non-Goals

**Goals:**
- A subprocess step's `outputMapping` values and automatic-path guards that
  reference `child.data.<key>` are rejected at publish when `<key>` is not one of
  the referenced child's `contract.outputFields` (resolved to field `key`, the same
  way every other CEL site addresses fields).
- Reuse the existing per-step child resolution in `validateCrossProcess`; no new
  I/O path.
- No change to `child.outcome` typing, to any other CEL site, or to the
  single-body `validateProcessBody` check (it keeps `child.data: dyn`, since it has
  no child body to type it against).

**Non-Goals:**
- Narrowing runtime `child.data` to `contract.outputFields`. See proposal.md — the
  publish-time check is the enforcement point this repo consistently uses (data
  sources, migration transforms), and narrowing the runtime value is a separate,
  larger, behavior-changing piece of work for no additional safety the publish
  check doesn't already provide going forward.
- Checking `child.data` references inside a subprocess step's `view` flags
  (`visible`/`required`/`readonly`). `check.ts::collect()` currently marks those
  sites `child: true` whenever the step's `type` is `"subprocess"`, but a view is
  rendered while the step is parked — before any child has returned — so `child.*`
  is not actually meaningful there yet. That looks like a pre-existing, separate
  gap (not introduced or worsened by this change) and is out of scope; flagged in
  CLAUDE.md instead of silently expanding this change's surface.
- Any change to how `contract.outcomes` is validated against `child.outcome` usage
  (unrelated: `outcome` stays typed `string`, not a literal union).

## Decisions

**Parameterize `child.data`'s schema instead of building a second, parallel check
path.** Add an optional `childDataSchema?: Record<string, string>` to the internal
`buildEnv` options; when absent (every existing call site), behavior is byte-for-byte
unchanged (`data: "dyn"`). A new exported function,
`checkSubprocessChildRefs(parentBody, stepIndex, childBody): CelIssue[]`, takes the
already-resolved child `ProcessBody` (the same value `validateCrossProcess` already
holds for the `inputMapping` check — no need to thread a separately-built schema
across the module boundary), derives the schema internally from
`childBody.contract?.outputFields` via the new (unexported) `contractFieldSchema`
helper, and builds one environment scoped to a single step (`data`/`instance`/
`actor` from the parent body, `child: { outcome: "string", data: <that schema> }`).
It checks exactly that step's `outputMapping` values and automatic-path guards —
the same two site kinds `collect()` already tags `child: true` for, just narrowed
to one step with a real schema instead of the whole body with `dyn`.

*Alternative considered: AST identifier-extraction.* Walk the parsed AST for
`child.data.<key>` member-access chains (mirroring `forbiddenTimeCall`'s pattern)
and check the extracted keys against the allowed set directly, without touching
`buildEnv`. Rejected: it only catches the single-level dot-access shape and misses
bracket access, and every other unknown-reference check in this codebase (`data`,
`instance`, `child` itself) is already enforced by typing the namespace correctly
and letting the CEL library's own checker do the work — reusing that mechanism is
less code and stays consistent with every existing scenario in
`cel-expressions/spec.md`.

**Build the child schema from `contract.outputFields`, empty when absent.**
`ProcessContract.outputFields` is `FieldId[] | undefined`. Add
`contractFieldSchema(fields: FieldDef[], ids: readonly string[] | undefined)` to
`check.ts` (a filtered sibling of the existing `dataSchema`, sharing
`collectFieldsDeep` + `celType`): resolves each allowed id to its `key`/`celType`.
An absent or empty `outputFields` yields an empty schema, so *any* `child.data.*`
reference on that step becomes an unknown-field error — correct: nothing is
contracted to read.

**Throw `CelValidationError`, not `CrossProcessValidationError`.** The new issues
are `CelIssue`-shaped (`loc`/`src`/`message`) and are, substantively, unknown-field
CEL errors — the same defect class `CelValidationError` already exists to report.
`CrossProcessValidationError` stays reserved for "the reference doesn't resolve /
declares no contract" wiring errors, which is what every existing test against it
asserts. Splitting this way keeps each error type's meaning stable for callers
already matching on `instanceof`.

**Collect all subprocess steps' issues before throwing, once, after the existing
`inputMapping` loop.** Matches `CelValidationError`'s existing contract ("every
located issue is retained, not just the first") and `validateProcessBody`'s
same behavior. The pre-existing `inputMapping`/resolvability checks in
`validateCrossProcess` keep their current early-throw-per-step behavior (out of
scope to refactor); if a body has both kinds of problems, the wiring error surfaces
first, which is fine — an unresolvable child makes its output schema unknowable
anyway.

## Risks / Trade-offs

- [Widening `buildEnv`'s signature touches a function every existing CEL check
  path calls] → The new parameter is optional and only read when `child.data` typing
  is being overridden for the one new call site; every existing call passes nothing
  for it, so behavior for `validateProcessBody`, `validateMigrationSpec`, and the
  deadline/output-scope checks is unchanged. A test asserting `validateProcessBody`'s
  existing `child.data: dyn` behavior is unchanged guards against regression.
- [A body with a subprocess step whose child later changes its *output field's
  type* (not just adds an uncontracted field) is not addressed here] → Out of
  scope: that's a genuine type-compatibility question already deferred by the
  broader "instance migration" / "contract change starts a new signature"
  machinery (`latest-at-spawn` pins by `contractRef`, a hash of the contract, so a
  child that changes an output field's type already gets a new signature and
  existing parents keep the old child version). Not a new gap this change opens.

## Migration Plan

Pure publish-time validation addition; no schema change, no data migration.
Already-published bodies are unaffected (validation runs only on new publishes).
Rollback is reverting the `check.ts` / `definitions.ts` changes.
