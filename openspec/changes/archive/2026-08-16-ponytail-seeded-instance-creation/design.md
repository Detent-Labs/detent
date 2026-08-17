## Context

See proposal.md - Why. Two handlers create an instance seeded from another
instance's data.

`makeSpawnHandler` (`src/engine/subprocess.ts:63-186`) is engine-internal. The
outbox dispatches it under the reserved type `core.spawnSubprocess`. A
factory builds it, closing over `db`, `resolveBody`, `resolveLatestByContract`
and an assignment registry.

`processStartHandler` (`src/handlers/process-start.ts:52-157`) is
author-visible. It resolves through the shared registry beside `http.request`
and `notification.email`. It reads `ctx.db` per delivery and builds its own
definition store. Its header comment names the `action-handlers` rule that
forbids a closed-over handle.

Both run inside the outbox, so both are at-least-once and both must stay
idempotent on a derived instance id.

## Goals / Non-Goals

**Goals:**

- One implementation of the seed-and-create block.
- One implementation of `loadInstance` for the engine's two spawn paths.
- The audit corrected where this change measured it wrong.

**Non-Goals:**

- No behavior change. Not one row, event, error message or ordering moves.
- No unification of the two guards. They differ for a reason, and the
  Decisions section states it.
- No shared handler factory. The two injection styles stay as they are. The
  new function takes `db` as a parameter, which both callers already hold.
- No sweep of the twelve other `instanceSchema.parse(typeof raw === "string"
  ? ...)` sites. Open Questions carries that.

## Decisions

**The seam is the five shared steps, not the whole handler.** The two
handlers agree on this block. They agree on nothing wider:

1. `evalFieldMap(mapping, buildGuardContext(sourceBody, source, SYSTEM_ACTOR))`
2. one `mapping.entry-dropped` event per drop, carrying the SOURCE
   instance's id, `transitionSeq` and `version`
3. `resolveStepAssignment` for the target body's initial step, before the
   transaction opens
4. `makeAssignmentUnresolvedEvent` on the CREATED instance at seq 0, when the
   resolver produced no candidate
5. `withTransaction`: `createInstance`, then `appendInstanceEvent` per drop

Everything before step 1 is target resolution, and the two resolve targets
from different places. Everything after step 5 is the drive-to-rest, which
both callers already write as one `resolveAutomatic` line.

**The signature.**

```ts
createSeededInstance(db: SQL, opts: {
  instanceId: string;
  processId: ProcessId;
  version: number;
  body: ProcessBody;
  source: { instance: Instance; body: ProcessBody };
  mapping: Record<FieldId, Expression>;
  link: { parent: { instanceId: string; stepId: StepId } } | { chainedFrom: string };
  assignmentRegistry: AssignmentRegistry;
}): Promise<Instance>
```

`link` is a union, not two optional fields. A caller cannot pass both, and
`createInstance` already takes the two as separate optional properties. The
union spreads into that call.

**The function lands in a new file, `src/engine/seeded-create.ts`.** Not in
`store.ts`, which is where this design first put it. That module states a
persistence-only remit, and three sites in the tree hold the author to it:

- `store.ts:2`: "Instance store: persist an instance and rehydrate it
  against its pinned frozen body."
- `store.ts:526-528`: the caller resolves the assignment, "never this
  function". The reason the comment gives: a resolver is asynchronous and
  may reach outside the process. That "would break the persistence-only
  remit stated above".
- `registry.ts:209-212`: the resolver is "called by the step-entry callers
  … never by `createInstance` (which stays persistence-only)".
- `transition.ts:696`: "createInstance calls no resolver, keeping its
  persistence-only remit."

`createSeededInstance` evaluates CEL and resolves an assignment. Both are
what those comments exclude. Putting it beside `createInstance` would make
the rule read as prose. The next reader would then take a resolver call
inside `store.ts` for permitted.

`subprocess.ts` is the other candidate and is worse. It would make
`process-start.ts` import the subprocess module for a function that has
nothing to do with subprocesses.

So the count of files rises by one. The remit is worth it: the boundary is
why `createInstance` takes resolved candidates as a parameter rather than
resolving them.

**`loadInstance` becomes an export of `store.ts`. `parseInstance` stays
private there.** `loadInstance` has two copies today, agreeing byte for byte.
Both callers pass `(db, instanceId)` and read `Instance | undefined`.
`parseInstance` has no caller outside `loadInstance` in either file, so it
needs no export.

**The audit's "three things differ" undercounts. Five differ.** The three it
names hold:

| | spawn | `process.start` |
|---|---|---|
| target | `versionBinding`, so pinned or `resolveLatestByContract` | `resolveLatest(config.processId)` |
| link | `parent: { instanceId, stepId }` | `chainedFrom` |
| after the drive-to-rest | cancel-race backstop | nothing |

Two more differ, and both stay outside the shared function:

**Difference four: the source-instance guard.** Spawn reads the parent. It
returns `{}` when the parent is missing or not `running`
(`subprocess.ts:87`). That is the "parent gone or cancelled while queued"
case. A silent success is correct there, since the delivery has nothing left
to do.

The `process.start` handler throws when the acting instance is missing
(`process-start.ts:78`). It does not check that instance's status. A started
process is fire-and-forget, so a cancelled actor does not stop it. A missing
actor is a real error worth a retry.

Merging these two rules would change one of the two handlers. That is a
behavior change, not a cleanup.

**Difference five: the injection style.** Spawn closes over `db` and its
resolvers because a factory builds it once at registration. The
`process.start` handler reads `ctx.db` per delivery. The `action-handlers`
rule requires that of a registry handler under multi-tenancy: a closed-over
handle would resolve every tenant against one database. The new function
takes `db` as its first parameter, which satisfies both callers.

**One duplicate registry construction goes.** `processStartHandler` calls
`createDefaultAssignmentRegistry()` at line 104 and again at line 155, in one
delivery. The registry is a `Map` of the strategies the engine ships, so the
second call builds an identical one. The handler binds one registry and
passes it to `createSeededInstance` and to `resolveAutomatic`. Spawn already
holds one, from its factory parameter.

## Risks / Trade-offs

- The drop events carry the SOURCE instance's id and the unresolved event
  carries the CREATED instance's id. A refactor that mixes them writes an
  event against the wrong instance → `test/subprocess.test.ts` and
  `test/process-chaining.test.ts` both assert on the recorded events. Read
  the assertions before the change, not after.
- `withTransaction` nests as a savepoint inside `createInstance`'s own
  transaction when `db` is already one. Both call sites depend on that.
  Both carry a comment saying so. The comment moves with the code → keep one
  copy of it in `createSeededInstance`.
- The new module imports `./store.js`, `../cel/eval.js` and `./registry.js`.
  A cycle would break compilation → measured first. None of the three
  reaches `seeded-create.ts`, and nothing imports that file yet. The store
  module imports `./duration.js`, `./idempotency.js`, `./registry.js` and
  the schema. The other two reach the schema, the CEL library and
  `./check.js`.
- Two suites cover this code and one is 1593 lines → run the full `bun test`,
  not the two files. A single-file rerun is not the signal, per CLAUDE.md.

## Migration Plan

No deploy step and no data step. The change edits three source files and two
documents, and it lands in one commit. A running instance, a queued outbox
row and a published body all see the same engine before and after.

Rollback is `git revert` of that commit.

## Open Questions

- Do the twelve other `instanceSchema.parse(typeof raw === "string" ?
  JSON.parse(raw) : raw)` sites move onto a shared `parseInstanceRow`? They
  stand in `admin-queries.ts`, `migration.ts` (twice), `reporting.ts`,
  `resolution.ts`, `retention.ts`, `store.ts`, `timers.ts`, `transition.ts`
  (twice) and `runtime/api.ts`. Each reads a `body` column. That is a wider
  sweep than finding 12, and the audit does not carry it yet. File it in the
  next scan rather than growing this change.
