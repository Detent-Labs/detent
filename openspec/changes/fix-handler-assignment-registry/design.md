# Design

## Context

Two functions share the name `createDefaultAssignmentRegistry`. The leaf module
`src/engine/registry.ts` exports the one that registers `static`. It stays a
leaf. So `store.ts`, `transition.ts` and `definitions.ts` can default a
parameter to it. No import cycle forms. `src/engine/assignment-strategies.ts`
exports the full one, which adds the three `org.*` strategies. Those read the
database through `src/auth`, and `src/auth` imports `store.ts`. The full set
cannot live in the leaf.

`src/http/server.ts` imports the full one and passes it to `startEngine`.
`startEngine` hands it to the resolution worker, the timer worker and the
`core.*` subprocess handlers. Delivery is the gap. `deliver` builds a
`HandlerContext` from the outbox row, the registry and the tenant's database.
The context has no assignment registry. So `process.start` and
`instance.transition` import the static factory and build their own.

The owner ruled on 2026-10-12. The engine functions keep their static defaults.
The static factory gets a new name. The registry becomes a required context
field.

## Goals / Non-Goals

**Goals:**

- A handler cannot reach a registry other than the engine's. A missing
  registration becomes a type error. It no longer yields an empty candidate
  list.
- The two factories carry two names.

**Non-Goals:**

- No change to a default parameter on an engine function. About twenty of them
  keep a static default under the new name.
- No change to the definition contract, the publish checks or the resolution
  deadline.
- No fix for the other dead exports of audit finding B-14. The change
  `remove-dead-exports` owns those.

## Decisions

### The context carries the registry

`HandlerContext` gains a required `assignmentRegistry: AssignmentRegistry`,
beside the required `db`. An absent database handle has no sane fallback. An
absent registry has none either. `DeliverFn` takes the registry as a fourth
parameter. It copies the registry into the context. `drainOutbox` takes it as a
sixth parameter. `startEngine` passes the one it received.

The sixth parameter of `drainOutbox` has a static default, as its other trailing
parameters have. A test that drains with no registry keeps working. Production
reaches the call through `startEngine`, which always passes one.

Alternative: bind the registry into the two handlers with a factory, the way
`registerSubprocessHandlers` binds the `core.*` handlers. That needs a
per-tenant override of two entries in the shared registry. The shared registry
would still hold handlers built on the static default. A caller that skips the
override gets the bug back. The context field has no such path.

Alternative: the handlers import the full factory from `assignment-strategies.ts`.
That fixes the symptom and keeps the cause. Each delivery builds a registry, and
a registry the operator extends never reaches the handlers.

### Rename the static factory

`registry.ts` exports `createStaticAssignmentRegistry`. `assignment-strategies.ts`
keeps `createDefaultAssignmentRegistry` for the full set and drops its import
alias. Every importer of the old static name follows. That covers the engine
default parameters, `src/runtime/instances.ts` and the tests that mean the
static set. A test that wants the full set imports it from
`assignment-strategies.ts`. The old export is gone, so the TypeScript compiler
finds every importer.

The comment in `assignment-strategies.ts` that calls the shared name deliberate
goes. So does the matching comment in `registry.ts`.

### Tests drive the handler through the outbox

A unit test of the handler alone would pass the registry itself. It would prove
nothing about the wiring. Both tests enqueue an action and drain the outbox with
the full registry, the same call shape as `startEngine`'s worker. They assert
the candidates on the started or moved instance.

## Risks / Trade-offs

- [A test builds a `HandlerContext` by hand and fails the type check] → The
  compiler lists each one. Add the registry the test means.
- [The sixth `drainOutbox` parameter defaults to static, so a future caller
  repeats the bug] → The ruling keeps this default. The context field closes the
  handler path. `startEngine` is the only production caller.
- [The web package names the old factory in two comments] → Rename it in both
  comments in this change.
