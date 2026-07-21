## Context

`src/cel/check.ts::validateProcessBody` parses and type-checks every `Expression`
in a `ProcessBody` and returns located `CelIssue[]`. It is complete, tested
(`test/cel.test.ts`) and **unreferenced by production code** — the only callers
are tests. `publishBody` (`src/engine/definitions.ts`) currently runs three
checks: `validateDurations` (inside `compileProcessBody`), the cancel-sink
compile, and `validateCrossProcess`.

The sibling function `validateMigrationSpec` in the same module *is* wired
(`src/engine/migration.ts::validatePlan`), which makes the gap read as a
deliberate scoping decision rather than an omission.

Two facts constrain the placement:

1. `definition.ts` is the deserializer every read goes through. A check that may
   tighten over time cannot live there — `harden-duration-timers` established
   this precedent and `compile.ts` documents it. CEL checking belongs on the
   write path for the same reason.
2. `publishBody` computes the hash from the compiled body, then looks for an
   existing version with that hash. Anything placed before the lookup runs
   against already-published bodies too.

A second defect is entangled with the wiring. `buildEnv` registers `data`,
`instance` and `actor` unconditionally, so an `Action.output` site is checked
against `{result, data, instance, actor}` while `buildOutputContext` supplies
`{result}` alone. `result.net + data.amount` type-checks and then throws on
every delivery attempt — and because `evalOutput` runs *after* the handler
returns, each retry re-invokes the external handler before dead-lettering. The
check as it stands would certify expressions the engine provably cannot
evaluate, so wiring it without deciding this scope makes the guarantee false in
a new way.

Separately, `collect()` walks `onEntry`, `onExit`, `onPath`, `timers[].onFire`
and both subprocess mappings, but never `step.onCancel`. Duration validation and
the structural refinements do cover `onCancel`; CEL checking alone does not.

## Goals / Non-Goals

**Goals:**

- `publishBody` rejects a body containing an invalid expression, before any
  persist, reporting all located issues.
- The `Action.output` authoring scope matches `buildOutputContext` exactly.
- `onCancel` action outputs are a checked site.
- Every new rejection ships with a test that fails without it.

**Non-Goals:**

- Data sources. `check.ts` registers each declared data source as `dyn`; the
  engine resolves them nowhere (`grep` over `src/engine/` finds no reference).
  A guard reading one is silently `false` forever and a mapping reading one
  throws. Closing that is a decision about an unbuilt feature — whether data
  sources become a publish error now or a runtime resolution later — and belongs
  to the validation-edge sweep, not to wiring an existing check.
- The `outputMapping`-reads-only-child-fields check (roadmap #1's deferred item):
  it needs CEL identifier extraction, which this change does not add.
- Changing `processBody.parse`, the hash, any pin, or any read path.

## Decisions

### Call `validateProcessBody` after the hash-hit lookup, alongside `validateCrossProcess`

Placement is *after* `compileProcessBody` (so the body checked is the body
persisted, and a step the compile pass injects is held to the same rule as an
authored one) and *after* the existing-version lookup (so an identical re-publish
of a body that predates a tightening stays a no-op rather than becoming an
error). This is exactly where `validateCrossProcess` already sits, and for the
same reason.

Only the second half of that is observable. The sink injected today carries no
expression and the check never reads `contract`, so compiled-vs-authored is
currently a distinction without a difference — no test can fail on it, and none
is written for it. It is the right order anyway: the alternative is a rule that
holds only until the first compile pass that injects an expression, and that
failure would surface as a published definition the engine cannot evaluate.

Alternative considered: check inside `compileProcessBody`. Rejected — compile is
also the idempotent re-compile path and its output feeds the hash, so a check
there runs against already-published bodies on every re-publish, and the read
side would inherit the coupling if compile is ever reused. Duration validation
is inside compile only because the hash cannot be taken from a body whose
durations the engine cannot arm.

### A dedicated `CelValidationError` carrying `CelIssue[]`

Mirrors `DurationValidationError` and `CrossProcessValidationError`: a named
error class whose `message` joins `loc: message (src)` and which retains the
structured issue list for a caller that wants to render them. All issues are
reported, not the first — `validateProcessBody` already returns the full list.

Alternative considered: reuse `CrossProcessValidationError`. Rejected — the two
failures are diagnosed differently (one is an expression, one is inter-process
wiring) and a caller distinguishing them should not string-match.

### Narrow `Action.output` to `result` alone at check time

`buildEnv` gains the rule: when `opts.result` is set, register `result` and
nothing else — no `data`, `instance`, `actor`, `child`, or data sources.

This resolves the drift toward what the contract already documents in three
places (`CLAUDE.md`: "value CEL over `result`"; the `cel-expressions` spec:
"Guard-context and output-context MUST be distinct"; the `buildOutputContext`
doc comment: "matching the authoring scope where `result` is the sole namespace
for Action.output"). Only the check was wrong.

Alternative considered: widen `buildOutputContext` to the full guard context.
Rejected on semantics, not effort — the writeback is dispatched post-commit and
delivered an unbounded interval later, so `data` and `instance` at evaluation
time are a *different* state than the one that enqueued the action. An output
expression reading them would be correct only by accident, and the `result`-only
rule is what the engine's transactional model actually supports.

Consequence: `child` also disappears from output scope. That is correct — the
`child` flag is currently threaded into `outputs()` from the enclosing step's
type, but a subprocess step's `child` namespace exists only during the return
delivery, which is `evalFieldMap` over the parent context, not `evalOutput`.
The `child` parameter on `outputs()` becomes dead and is removed rather than
left as a misleading argument.

### Add `onCancel` to `collect()`

One call alongside `onEntry`/`onExit`. `onCancel` actions are enqueued by
`cancelInstance` and their outputs are evaluated by the same `evalOutput` path,
so the omission was a walk gap, not a scope decision.

### The expression check runs before cross-process validation

`validateCrossProcess` is already `await`ed before the insert; the CEL check is
synchronous and cheap, so it runs first, ahead of the cross-process round trips
to the database. A body that fails both reports the expression issues, which are
the ones an author can fix without inspecting another process.

## Risks / Trade-offs

- **A body that publishes today may stop publishing.** → That is the change's
  purpose, and it cannot break a stored definition: the read path is untouched
  and the hash-hit path returns before the check, so every existing version
  still resolves and every pinned instance still rehydrates. The three shipped
  examples are verified to still publish as part of the change.
- **The `number` → CEL `double` papercut becomes a publish blocker.** A body
  written with `data.count == 5` (rather than `== 5.0`) against a `number` field
  now fails publish instead of silently evaluating `false` at runtime. → This is
  strictly an improvement in signal — the runtime behaviour was already wrong —
  but it will be the most common first encounter with the new check, so the
  error message must be the type-checker's own (`expected double, got int`)
  rather than a generic "invalid expression".
- **Narrowing output scope may reject an in-repo test fixture.** → Grep of
  `examples/` shows only `result.status`; any test fixture relying on the wider
  scope is a fixture asserting the drift, and is updated with the change rather
  than preserved.
- **Data-source drift stays open.** → Deliberate, recorded as a Non-Goal above
  and carried into the validation-edge sweep. The newly-enforced check is
  honest about what it enforces; it does not claim to cover data sources.

## Migration Plan

None. No schema change, no data migration, no stored body reinterpreted. The
change is additive on the publish path and is reverted by removing one call.

## Open Questions

None — the `Action.output` scope and the `onCancel` inclusion were decided
before this document; data sources are explicitly deferred.
