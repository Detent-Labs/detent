<!-- antislop: allow-file passive-voice -->

## Context

See `proposal.md` for motivation, and
`docs/superpowers/specs/2026-08-02-pluggable-step-assignment-design.md` for the
approved shape and the decomposition into changes A, B and C. This is change B.

Four current properties shape the approach.

`commitTransition` (`transition.ts:417`) builds the plan **outside** the
transaction. It opens `withTransaction` only around `applyStepEntry`. The target
step is already known there.

`planStepEntry` is synchronous. Its `StepEntryOpts` already carries
caller-supplied overrides for the timer set, the status, the spawn and the
events. For migration, `carryAssignment` already suppresses fresh resolution.

`Registry` is `Map<string, HandlerDef>` (`registry.ts:35`). Beside it,
`DataSourceRegistry` is a second parallel map. That shape is deliberate
(`registry.ts:56`): a plain parallel structure, not a shared generic
abstraction. Both maps already reach `publishBody` as separate arguments.

`Step.assignment.strategy` already uses the generic `plugin` envelope
(`definition.ts:427`). Nothing in the authored schema changes.

## Goals / Non-Goals

**Goals:**

- One seam, shaped like the data-source registry, so a later strategy needs no
  core change.
- No behaviour change whatsoever. `static` is the only registered entry, and it
  resolves exactly what it resolves today.
- A resolver never runs inside an open database transaction.

**Non-Goals:**

- Any strategy beyond `static`. Change C ships the first one.
- A resolution deadline, a failure classification, and an
  `assignment.unresolved` event. See "Deferred to change C" below.
- Widening the eligible-candidate check, the inbox query, or the GIN index.
  Resolution changes where the list comes from, nothing about how it is read.

## Decisions

### A sibling `AssignmentRegistry`, passed as its own argument

`AssignmentRegistry` is `Map<string, AssignmentStrategyDef>`, a third map beside
`Registry` and `DataSourceRegistry`. `publishBody` takes it as a further
argument.

Folding the entries onto `Registry` is not possible: `Registry` is a `Map`, so
it carries no second field. Reshaping it into an object would touch every call
site. That is the churn such a fold would exist to avoid. The parallel-map shape
is also what `registry.ts:56` records as the deliberate choice, and
`publishBody` already threads two of them.

### Resolve in `commitTransition`, before the plan

`commitTransition` resolves the target step's candidates, then passes the
resolved set into `planStepEntry` as an override beside `opts.timers`.

This needs no new mechanism. The override slot exists, the plan is already built
outside the transaction, and the target step is already in hand. Two lines move,
and `planStepEntry` keeps its purity.

Making `planStepEntry` async would instead spread a promise through every
caller. That function's purity is load-bearing: the automatic cascade calls it
repeatedly, compares its output, and replans. Resolving inside the apply
transaction is worse again. It would hold a Postgres connection and the
instance's row lock open for an external call.

`resolveStepAssignment` therefore leaves `transition.ts` and becomes the
caller-side helper both `commitTransition` and `createInstance` call.

### Skip the resolver when the caller carries the assignment forward

Migration passes `carryAssignment: true`. The caller SHALL check that flag
before resolving, not after. Resolving and discarding would make every migrated
instance pay for a lookup whose result is thrown away.

### A narrow resolver context, and no transaction around the call

A resolver receives `{ config, stepId, instance }`. `instance` exposes `id`,
`startedBy`, and the planned `data` with any submitted patch merged.

The list is deliberately minimal. It follows the rule the CEL context follows:
widen it when the engine surfaces a concrete need. Change C needs `startedBy`
and nothing else. Passing the whole instance would make every internal field
part of the plugin contract by accident.

The resolver signature is asynchronous even though `static` needs no I/O. This
copies `DataSourceHandlerDef.resolve`. That signature is asynchronous for
exactly this reason (`registry.ts:67`). A later I/O-backed type becomes a
drop-in, not an interface change.

The call sits outside any open transaction. A strategy needing its own database
access therefore uses the shared pool, the same way `src/auth/users.ts` does. No
connection or transaction handle travels in the context.

### Reuse the existing resolve-then-parse loop

`checkTypedConfig` (`registry-check.ts:53`) already implements resolve, report
an unregistered type, then parse `config` against the entry's schema.
`checkAssignmentRegistry` switches to it. Its hand-written loop and the local
`staticAssignmentConfigSchema` both go away.

This change therefore deletes validation code rather than adding any.

## Deferred to change C

Change B registers `static`, which resolves synchronously from its own config
and cannot fail. No shipped code can raise, return a non-list, or hang.

Specifying a deadline, a failure classification and an `assignment.unresolved`
event here would decide semantics that nothing in B exercises. The same
judgement appears in `CLAUDE.md` for a dynamic data source. Its timeout and
failure semantics stay open until a concrete need exists. Change C introduces
the first
fallible resolver, and owns those rules.

B does define the one degenerate case it can reach. An unregistered type at step
entry resolves to an empty list rather than raising. That preserves what
`createInstance` does today.

## Risks / Trade-offs

- **An `await` enters the transition path where none was.** → The plan already
  sits outside the transaction. Every caller of `commitTransition` already
  awaits it. `static` resolves without yielding to I/O.
- **`resolveStepAssignment` moving out of `transition.ts` could miss a caller.**
  → Every authored entry routes through `commitTransition`, and creation is the
  one documented exception. Typecheck catches a missed site, since the planner
  loses the ability to resolve at all.
- **The context could prove too narrow for change C.** → Widening it later is
  additive. Guessing at it now would freeze a contract nobody has tested.

## Migration Plan

No data migration. No definition changes. No re-publish. No new event kind, so
nothing written under this change is unreadable by the code before it.

Deploy is a code change plus the registry's `static` entry. Rollback is a plain
code revert.

## Open Questions

None.
