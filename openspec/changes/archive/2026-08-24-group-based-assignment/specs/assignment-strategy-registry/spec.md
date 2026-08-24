<!-- antislop: allow-file passive-voice sentence-length -->
<!-- Why: most of the requirement text below is copied from the base spec (openspec/specs/assignment-strategy-registry/spec.md) verbatim, per this repo's MODIFIED-delta convention; that base spec is itself exempt from antislop back-fill, and its prose style (long compound sentences, "is bounded"/"is held"-style passive naming a mechanism rather than an actor) carries over unchanged into the sentences this delta does not touch. -->

## Purpose

A factual correction to the resolver-context requirement.
`AssignmentContext` (`src/engine/registry.ts`) has always carried a
required `db: SQL` field. `org.manager-of-starter` already reads it. The
base spec's "A resolver receives a narrow context and answers
asynchronously" requirement still states the opposite: that no connection
or transaction handle travels in the context.
`.claude/rules/process-contract.md` already documents `db` as required and
load-bearing, matching the code, not the base spec. This change is the
second strategy (`org.group-members`) to use `ctx.db`. It corrects the
drift instead of adding a third strategy atop an inaccurate spec. Placement,
the deadline rule, and every other fact this requirement states stay
unchanged.

## MODIFIED Requirements

### Requirement: A resolver receives a narrow context and answers asynchronously

A resolver SHALL receive `{ config, stepId, instance, db }`. `instance` SHALL
expose `id`, `startedBy`, and the `data` the entering instance will carry,
with any submitted patch already merged. It SHALL expose nothing else. `db`
is the per-request, per-tenant database handle threaded through the whole
resolution path, the same handle `HandlerContext.db` and
`DataSourceContext.db` carry for the same reason: a handle bound once at
registry construction would resolve every tenant's assignment against one
tenant's directory.

A resolver SHALL return a `Promise<string[]>` of role names and actor ids in one
flat namespace. The signature is asynchronous even for a resolver that needs no
I/O. A later strategy that reaches a database or an external directory is then a
drop-in, not an interface change. This matches `DataSourceHandlerDef.resolve`,
which is asynchronous for the same reason.

The engine SHALL call a resolver outside any open database transaction. One path
is carved out. The subprocess return advances the parent while holding that
parent's row lock. It derives the step it enters from the row it read under that
lock.

Every other path SHALL resolve before its transaction opens. Those paths are a
manual transition, an automatic cascade hop, and a timer-forced transition. They
also include a cancellation, a top-level creation, and a subprocess spawn.

Every resolution SHALL be bounded by the resolution deadline defined below. That
holds on the carved-out path and on every other. The bound is what makes the
carve-out safe. A resolver that exceeds it cannot hold the parent's row lock open
past the deadline.

A resolver that needs its own database access SHALL take it from the
context's `db` field, never from a handle bound at registry construction.
`db` SHALL travel in the context on both kinds of path, the carved-out
subprocess-return path and every other, required rather than optional: an
absent handle has no sane fallback once one process serves many tenants.

#### Scenario: A spawn resolves before its transaction opens

- **WHEN** a subprocess spawn creates a child at an assignment-bearing initial
  step
- **THEN** the resolver has already answered when that spawn's transaction
  opens, and the child is written with the resolved candidates

#### Scenario: The subprocess return is the one path holding a lock

- **WHEN** a child returns an outcome that advances the parent off its
  subprocess step, onto a step with a declared `assignment`
- **THEN** the parent's candidates resolve while its row lock is held, and no
  transaction-scoped handle reaches the resolver, only the shared-pool `db`
  the context always carries

#### Scenario: A slow resolver on the return path releases the lock at the deadline

- **WHEN** a child returns an outcome advancing the parent onto a step whose
  resolver does not answer within the deadline
- **THEN** the resolution is abandoned at the deadline
- **AND** the parent's transition commits with empty candidates, and its row lock
  is released

#### Scenario: A resolver sees the merged submitted data

- **WHEN** a participant submits a field patch and transitions onto a step whose
  strategy resolves candidates
- **THEN** the resolver's `instance.data` includes that patch

#### Scenario: A resolver receives no field beyond the declared context

- **WHEN** a resolver runs
- **THEN** its `instance` exposes `id`, `startedBy` and `data`
- **THEN** its `instance` exposes no other instance field
- **THEN** the context also carries `db`, the shared-pool, per-request handle
