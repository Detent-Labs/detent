## Why

A subprocess step's `outputMapping` (and its automatic-path guards) can reference
`child.data.<key>` for *any* key present in the child's runtime data, not just the
keys the child's `contract.outputFields` declares. `child.data` at runtime is the
child's entire re-keyed data object (`src/engine/subprocess.ts`), and authoring-time
CEL validation types `child.data` as `dyn` (`src/cel/check.ts::CHILD_SCHEMA`), so a
reference to a non-contracted child field type-checks and publishes silently. This
lets a parent depend on a child's internal implementation detail; a later child
version that changes that internal field (while keeping its contract identical, so
`latest-at-spawn` still adopts it) can silently break the parent's mapping or guard
with no publish-time signal. This is the same class of problem the already-shipped
`forbid-cel-datasource-refs` change closed for data sources: a declared surface
(there: no data-source resolution; here: `contract.outputFields`) not enforced by
the CEL check that types the reference. Closing it now is cheap because
`validateCrossProcess` (`src/engine/definitions.ts`) already resolves the child body
per subprocess step for the existing `inputMapping` check — the same resolved body
gives us the child's output field catalog for free.

## What Changes

- Add a publish-time check: for each subprocess step, any CEL expression that can
  reference `child.data` (the step's `outputMapping` values and its automatic path
  guards) is type-checked with `child.data` typed to a schema built from the
  **referenced child's** `contract.outputFields` (by field `key`, matching how
  `data` is typed elsewhere) instead of `dyn`. A reference to a child field outside
  `contract.outputFields` becomes a publish error naming the offending expression,
  exactly like an unknown `data` field reference today.
- `child.outcome` typing is unchanged (`string`); this only tightens `child.data`.
- Runtime `child.data` stays the child's full data object — **not** narrowed to
  `contract.outputFields`. Decision, not an oversight: this repo tightens at
  publish, not at runtime, everywhere else this kind of surface has come up (data
  sources, migration transforms, CEL scoping in general); narrowing the runtime
  value would additionally require reworking `subprocess.ts`'s return handling for
  a behavior change with no new safety over the publish-time check, since any
  already-published body that reads an uncontracted field keeps running (pinned,
  immutable) regardless of what a later runtime narrowing would do.
- Minor doc correction bundled in: `CLAUDE.md`'s "Decided, not yet built" list still
  carries an entry for moving `resolveBody` inside the per-instance worker `try` —
  that shipped in `isolate-worker-poison-rows` (verified against
  `src/engine/timers.ts` / `resolution.ts`); the stale entry is removed as part of
  this change's doc sync since it touches the same file.

## Capabilities

### Modified Capabilities
- `cross-process-validation`: new requirement — a subprocess step's `outputMapping`
  and automatic-path guards may reference `child.data.<key>` only for a key in the
  referenced child's `contract.outputFields`.

## Impact

- `src/cel/check.ts`: generalize the fixed `CHILD_SCHEMA.data: "dyn"` into a
  parameterizable schema for the one cross-process check path; existing single-body
  `validateProcessBody` behavior (child.data as `dyn`) is unchanged for every other
  caller/site.
- `src/engine/definitions.ts::validateCrossProcess`: after resolving a subprocess
  step's child (already required for the `inputMapping` check), build the child's
  output-field schema and re-check the step's guards + `outputMapping` against it;
  throw `CelValidationError` (not `CrossProcessValidationError`) for a violation,
  since the defect is a CEL reference issue, not a wiring/resolvability one.
- `openspec/specs/cross-process-validation/spec.md`: new requirement + scenarios.
- `CLAUDE.md`: roadmap item 1's "Deferred" bullet becomes a recorded fact; the
  stale `resolveBody` "Decided, not yet built" entry is removed.
- No schema change, no migration, no runtime behavior change for already-published
  bodies.
