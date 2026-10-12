# Proposal

## Why

Process `access_request` puts `org.group-members` on its start step. Another
process starts it through a `process.start` action. The handler builds its own
registry, and that registry knows only `static`. The strategy resolves to
`candidates: []` with the reason `no-candidates`. The started instance sits at
its start step and nobody can work it. `instance.transition` has the same fault.
It hits every step the handler enters on its target, for all three `org.*`
strategies.

Two functions share one name. `registry.ts` and `assignment-strategies.ts` both
export `createDefaultAssignmentRegistry`. The server imports the full one. Both
handlers import the static one. No test combines either handler with an `org.*`
strategy.

## What Changes

- `HandlerContext` carries a required `assignmentRegistry`. It is the registry
  the running engine uses. `deliver` and `drainOutbox` pass it through, and
  `startEngine` supplies it.
- `process.start` and `instance.transition` read the registry from the context.
  Neither builds a registry of its own.
- The static factory in `registry.ts` becomes `createStaticAssignmentRegistry`.
  Only `assignment-strategies.ts` keeps the name `createDefaultAssignmentRegistry`.
  That name then means the full set.
- The engine functions that default a parameter to a registry keep a default.
  It is the static registry, under its new name.
- Two tests cover the fault. One sends `process.start` into a target whose start
  step uses `org.group-members`. The other sends `instance.transition` into an
  `org.*` step.

No definition-contract change. No schema change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `process-chaining`: the started instance's steps resolve their assignment with
  the engine's registry.
- `instance-transition-action`: the target's entered steps resolve their
  assignment with the engine's registry.
- `assignment-strategy-registry`: a handler receives the registry on its
  context. The static factory carries a name that says what it is.

## Impact

- `src/engine/registry.ts`, `src/engine/outbox.ts`, `src/engine/host.ts`,
  `src/engine/assignment-strategies.ts`, `src/handlers/process-start.ts`,
  `src/handlers/instance-transition.ts`.
- Every other file that imports the static factory from `registry.ts` follows
  the rename: engine default parameters, `src/runtime/instances.ts`, and tests.
- `HandlerContext` gains a required field. A test that builds a context by hand
  adds one. So does a test that calls `deliver` directly.
- Two comments in `packages/web` that name the old factory.
- Docs under `docs/` and `.claude/` that name the old factory or the context.
- `docs/decisions.md`: the audit index entry for this change is struck.
