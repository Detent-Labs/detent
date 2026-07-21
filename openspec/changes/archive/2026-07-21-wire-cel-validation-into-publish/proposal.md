## Why

`validateProcessBody` (`src/cel/check.ts`) — the authoring-time CEL parse and
type-check — has **zero production callers**. `publishBody` runs duration
validation, the cancel-sink compile and cross-process validation, and never the
CEL check. The "unknown type or invalid config is a publish error, not a runtime
error" promise the specs, `CLAUDE.md`, `openspec/config.yaml` and a comment in
`compile.ts` all make is therefore void for every expression in a definition.

The runtime consequence is not a loud failure. A broken guard is total, so it
evaluates `false` forever and the instance parks on a wait-state that no one
knows is stuck. A broken `inputMapping` or `Action.output` throws inside outbox
delivery, retries against the external handler, and dead-letters — parking the
parent. Both are silent, per-instance, and unfixable without a re-publish that
the pinned instances will not adopt. `validateMigrationSpec` *is* wired
(`migration.ts`), which makes the omission look deliberate.

Wiring the check exposes a second defect it was masking: the check registers
`data`, `instance` and `actor` at `Action.output` sites while the runtime
supplies `{ result }` alone. `result.net + data.amount` type-checks and then
throws on every delivery attempt. The scope must be decided as part of wiring,
or the newly-enforced check certifies expressions the engine cannot evaluate.

## What Changes

- `publishBody` calls `validateProcessBody` on the **compiled** body, before any
  persist, and throws a new `CelValidationError` carrying the located
  `CelIssue[]`. Placement matches `validateDurations`: on the write path, never
  as a Zod refinement, so a stored immutable body never becomes unreadable when
  the check tightens.
- **BREAKING (publish path only):** a body whose expressions do not parse or
  type-check is rejected at publish instead of accepted. No stored definition
  changes meaning and no instance rehydration is affected — `processBody.parse`
  on the read path is untouched.
- `Action.output` scope is narrowed to `result` alone at check time, closing the
  check/eval drift in the direction the contract already documents (`CLAUDE.md`:
  "value CEL over `result`"; the `buildOutputContext` comment: "matching the
  authoring scope where `result` is the sole namespace"). An output expression
  reading `data`/`instance`/`actor` becomes a publish error rather than a
  handler-re-invoking runtime throw.
- `collect()` visits `step.onCancel` action outputs — the one action position
  CEL checking never reached. Without it the newly-enforced check ships with a
  known hole.
- Tests: publish rejects an unparseable expression, an unknown field reference,
  a type mismatch, an `Action.output` reading `data`, and a broken `onCancel`
  output; publish of the shipped examples still succeeds.

Explicitly **out of scope** (deferred to the later validation-edge sweep): data
sources are registered at check time but resolved nowhere at runtime, so a guard
referencing one is silently false forever. That is a distinct decision about an
unbuilt feature, not the wiring of an existing check.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cel-expressions`: the authoring-time parse and type-check requirements gain
  an explicit enforcement point — publish — instead of "validation time"; the
  `Action.output` context is stated as `result` only; `onCancel` action outputs
  are named as a checked site.
- `definition-store`: `publishBody` gains CEL validation as a publish-time
  rejection alongside duration and cross-process validation, ordered before any
  persist.

## Impact

- `src/engine/definitions.ts` — `publishBody` gains the check call and a new
  exported `CelValidationError`.
- `src/cel/check.ts` — `buildEnv` registers `result` alone at output scope;
  `collect()` adds the `onCancel` site.
- `test/cel.test.ts`, `test/definitions.test.ts` — new rejecting tests.
- No schema change to `src/schema/definition.ts`; no migration; no change to any
  read path, hash, or pin.
- Any caller publishing a body with an invalid expression now fails at publish.
  The three shipped examples are checked to still publish.
