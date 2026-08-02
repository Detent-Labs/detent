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
- A resolver runs outside an open database transaction on every path but one.
  The subprocess return is that one. It is named rather than glossed. See "One
  path resolves under a lock" below.

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

`resolveStepAssignment` therefore leaves `transition.ts`. It becomes the
caller-side helper that `commitTransition` and the subprocess spawn handler
call. `createInstance` calls no resolver. It takes the resolved set as an
option, the way it already takes seed data and a parent link. That keeps the
persistence-only remit its own doc comment states. It also lets the spawn
handler resolve before opening its transaction.

### One path resolves under a lock

`store.ts::withTransaction` joins an already-open transaction through a
savepoint rather than starting a second one. `commitTransition` documents this
about itself. So "outside the transaction" holds only where the caller passes a
plain connection.

Two subprocess paths pass a transaction handle instead.

The spawn (`subprocess.ts`) calls `createInstance` inside its own transaction.
This one is fixed rather than accepted. The child body, its initial step and its
seed data are all in hand before that transaction opens. The handler therefore
resolves first, and passes the result in.

The return holds the parent row locked (`SELECT ... FOR UPDATE`) across the
parent's advance. It derives the parked step and the matched path from the row
it read under that lock. Hoisting resolution above the lock needs an optimistic
pre-read plus a sequence re-check on entry. That restructuring buys nothing
here, because `static` performs no I/O and cannot stall. Change C ships the
first resolver that can, and owns the fix. Recorded under Risks.

### State the carry case in the type, not in a flag beside it

Migration carries `instance.assignment` forward rather than resolving fresh.
Once `planStepEntry` stops resolving, an omitted candidate set and a deliberate
carry look identical to the compiler. The planner cannot tell them apart.

The resolved set therefore reaches the planner as a required field,
`assignment: Instance["assignment"] | { carry: true }`. It is not an optional
override beside `timers`. A caller that forgets it fails to compile.

An optional field would instead leave a missed caller silently unassigned. An
assignment-bearing step with no assignment falls back to the
starter-or-`system:admin` floor in `api.ts::submitAndTransition`. That widens
who may act, and it arrives with no compiler diagnostic.

The union also removes the `carryAssignment` flag. One field decides the
assignment, so no second mechanism can contradict it. Migration passes
`{ carry: true }`, resolves nothing, and pays for no lookup.

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

No connection or transaction handle travels in the context. A strategy needing
its own database access uses the shared pool, the same way `src/auth/users.ts`
does. On the one path that resolves under an open transaction, that strategy
competes with the lock its own caller holds. Change C therefore owns the
deadline, and the path is named above rather than left implicit.

### Reuse the existing resolve-then-parse loop

`checkTypedConfig` (`registry-check.ts:53`) already implements resolve, report
an unregistered type, then parse `config` against the entry's schema.
`checkAssignmentRegistry` switches to it. Its hand-written loop and the local
`staticAssignmentConfigSchema` both go away.

This change therefore deletes validation code rather than adding any.

### Reversing a recorded audit cut, one change early

`docs/current-state.md` records that an earlier design held assignment
strategies in a map beside the action registry. A ponytail audit cut it: the
strategy space never grew past one, so the indirection bought nothing. The note
sets a condition. Reintroduce a registry only once a second strategy is
authored.

This change reintroduces it one change ahead of that condition. Change C's
`org.manager-of-starter` is the second strategy, and it arrives next.

Landing the seam first is deliberate. B changes no behaviour, so the existing
suite alone reviews it. C changes who may act on a step, and answers to that
question alone. Folding them together would put an empty refactor and an
authorization change in one diff. The audit cut is a reason to keep the refactor
small, not a reason to bundle it.

`CLAUDE.md`, `docs/current-state.md` and `docs/authoring-guide.md` all state
today that assignment is not an extension point. This change corrects all
three, in the same commit.

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
- **The subprocess return resolves under a row lock.** → Accepted in B, and why
  the requirement carves that path out. No resolver shipped here performs I/O,
  so the lock is held no longer than today. A slow or fallible resolver would
  change that, and change C ships the first one. Change C either bounds the call
  with the deadline it already owns, or resolves above the lock. That second
  option needs an optimistic pre-read and a sequence re-check. B leaves the
  choice open on purpose.
- **`resolveStepAssignment` moving out of `transition.ts` could miss a caller.**
  → The resolved set reaches `planStepEntry` as a required field. A missed
  caller therefore fails to compile. An optional field would not have caught it.
  The planner would read `undefined` as "no assignment". It would then hand an
  assignment-bearing step to the starter-or-`system:admin` floor, with no
  diagnostic.
- **The registry has to reach every step-entry caller.** → It threads the way
  the two existing registries already do, from `startHttpServer` down. The chain
  is longer than theirs. `commitTransition` sits behind `resolution.ts`,
  `timers.ts`, `subprocess.ts` and `runtime/api.ts`. Task group 5 names each
  link.

  Each link carries a default of `createDefaultAssignmentRegistry()`. That is
  the house style. `startEngine` already defaults its own `registry` the same
  way. Making the registry required would have made the typecheck report a
  missed link. It would also have forced roughly 770 mechanical edits across
  `test/`. The default wins that trade.

  The default also bounds what a missed link can cost. The caller resolves
  against the built-in `static` entry rather than against nothing. A missed link
  therefore degrades to "a deployment's custom strategy does not reach this
  path". It never degrades to "an assignment-bearing step commits unassigned".

  That second failure is the one worth a compiler diagnostic, and it has one.
  The resolved set reaches `planStepEntry` as a required field. The bullet above
  therefore still holds in full. Do not read this bullet as a claim that the
  typecheck covers the threading. It does not.
- **The context could prove too narrow for change C.** → Widening it later is
  additive. Guessing at it now would freeze a contract nobody has tested.

## Migration Plan

No data migration. No definition changes. No re-publish. No new event kind, so
nothing written under this change is unreadable by the code before it.

Deploy is a code change plus the registry's `static` entry. Rollback is a plain
code revert.

## Open Questions

None.
