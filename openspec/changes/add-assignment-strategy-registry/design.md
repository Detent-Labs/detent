<!-- antislop: allow-file passive-voice -->

## Context

See `proposal.md` for motivation, and
`docs/superpowers/specs/2026-08-02-pluggable-step-assignment-design.md` for the
approved shape and the decomposition into changes A, B and C. This is change B.

Three current properties shape the approach.

`planStepEntry` is pure and synchronous. The `planStepEntry`/`applyStepEntry`
seam splits deciding from committing. `transition-execution` already lets a
caller override the planned timer set and the spawn. It also lets a caller
supply events.

`Step.assignment.strategy` already uses the generic `plugin` envelope
(`definition.ts:427`). Nothing in the authored schema needs to change.

`publishBody` already takes the process's action `Registry`, and
`checkActionRegistry` already resolves an action `type` against it.

## Goals / Non-Goals

**Goals:**

- One seam, shaped like the action registry, so a later strategy needs no core
  change.
- No behaviour change for any body that declares `type: "static"`.
- An external resolver never holds a database transaction open.
- A resolver failure is visible in the record, never silent.

**Non-Goals:**

- Any strategy beyond `static`. Change C ships the first one.
- Re-resolving a frozen candidate list. Delegation covers that case.
- Widening the eligible-candidate check, the inbox query, or the GIN index.
  Resolution changes where the list comes from, nothing about how it is read.

## Decisions

### Resolve between plan and apply, not inside either

Resolution runs after `planStepEntry` returns and before `applyStepEntry`
commits.

Making `planStepEntry` async would spread a promise through every caller. That
function's purity is load-bearing: the automatic cascade calls it repeatedly,
compares its output, and replans. Resolving inside the apply transaction is
worse. It would hold a Postgres connection and the instance's row lock open for
an external call. That wait runs to the full deadline.

The plan therefore reports which entry needs which strategy. The caller
resolves. The caller then passes the result into apply. That reuses the same
override path which already carries the timer set and the events.

The widened window between plan and apply is safe because apply already commits
under an optimistic-concurrency predicate on `transitionSeq`. A concurrent
change fails the apply and replans.

Alternative considered: resolve eagerly at plan time for the whole cascade. That
requires knowing every step the cascade will enter before evaluating any guard,
which the cascade cannot provide.

### Carry the strategy entries on the existing `Registry`

`Registry` gains an assignment-strategy map beside its handler map.
`publishBody` and the engine keep taking one registry argument.

A separate `AssignmentRegistry` parameter would change the signature of
`publishBody` and of every call site in `src/http/`, `src/runtime/` and `test/`,
for no gain. One injected registry per process stays one injected registry.

### A narrow, frozen resolver context

A resolver receives `{ config, stepId, instance }`. `instance` exposes `id`,
`startedBy`, and the planned post-transition `data`.

The list is deliberately minimal. It follows the rule the CEL context follows:
widen it when the engine surfaces a concrete need. Change C needs `startedBy`
and nothing else. Passing the whole instance would make every internal field
part of the plugin contract by accident.

The `data` a resolver sees is the planned state, with the submitted patch
already applied. A resolver must see what the participant just wrote, since that
is what a later strategy will branch on.

### One deadline for every resolver, enforced by the caller

The caller wraps each resolve call in a timeout and passes an `AbortSignal`. The
default is 5 seconds, overridable by an environment variable.

The engine does not trust a strategy to bound itself. This mirrors the outbox,
where the worker's own deadline bounds a delivery no matter what the handler
does.

`static` resolves synchronously and returns before the timer matters, so a
cascade over static steps pays nothing.

### Validate the returned value, do not trust it

The caller parses the resolved value as `string[]`. A raise, a non-conforming
value and a timeout collapse into one outcome: failed, with a reason string.

Three failure modes with one handling path keeps the spec small and the record
readable. The reason distinguishes them for a human.

## Risks / Trade-offs

- **A long automatic cascade multiplies the deadline.** → Only a step declaring
  an `assignment` resolves at all. `static` returns immediately. The existing
  repeated-step guard already bounds a cascade.
- **A slow resolver delays a participant's submit by up to the deadline.** →
  The deadline is short and tunable. The submit always commits, so the cost is
  latency, never lost work.
- **An empty candidate list stalls an instance with no automatic recovery.** →
  Deliberate, per the approved design. The `assignment.unresolved` event names
  the reason, and the admin area surfaces it. An operator can delegate.
- **A future strategy could read a field this context does not expose.** →
  Widening the context later is additive. Guessing at it now would freeze a
  contract nobody has tested.

## Migration Plan

No data migration. No definition changes. No re-publish.

Deploy is a code change plus the registry's `static` entry. A body published
before this change resolves identically after it. The entry declares the same
config schema and the same resolver behaviour.

Rollback is a code revert. The new code writes one thing the old code cannot
read: an `assignment.unresolved` event would fail the old event union's parse.
Only a failing resolver writes that kind, and `static` cannot fail. No such
event exists until change C ships a strategy that can.

## Open Questions

None. The deadline's default value is set at 5 seconds and stays tunable.
Changing it later needs no spec change and no task change.
