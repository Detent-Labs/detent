## Why

A step's assignment candidates come from a fixed list in the frozen definition.
Every instance of a definition therefore carries the same list. That cannot
express "the requester's manager". It also cannot scope a shared definition per
instance. A company-wide leave request listing
`["dept-a:manager", "dept-b:manager"]` lets department B's manager approve
department A's request, silently.

Assignment is the last plugin position in the body that resolves directly rather
than through a registry. Actions and data sources already resolve through one.
This change gives assignment the same seam, so a later strategy can answer per
instance. It ships no such strategy, and changes no behaviour.

## What Changes

- Add `AssignmentRegistry`, a `type -> def` map beside the action `Registry` and
  the `DataSourceRegistry`. An entry declares a resolver and may declare a
  config schema.
- `Step.assignment.strategy.type` resolves through that map instead of a direct
  comparison against the literal `"static"`.
- `"static"` becomes a registered entry. It keeps its behaviour, its
  `{ candidates: string[] }` config schema, and its status as the default.
- `publishBody` takes the `AssignmentRegistry` as a further argument, beside the
  two registries it already takes.
- `checkAssignmentRegistry` switches to the resolve-then-parse loop
  `checkActionRegistry` and `checkDataSourceRegistry` already share. Its
  hand-written loop and its local schema go away.
- A resolver answers asynchronously and receives a narrow context:
  `{ config, stepId, instance: { id, startedBy, data } }`.
- The engine resolves candidates in `commitTransition` and in `createInstance`,
  before the transaction opens. `planStepEntry` receives the resolved set as a
  caller-supplied override. It stays pure and synchronous.
- **No JSON contract change.** `Step.assignment.strategy` already uses the
  generic `plugin` envelope (`definition.ts:427`). No existing definition
  changes and nothing migrates.
- **No behaviour change.** `static` is the only registered entry, and it
  resolves what it resolves today.

Out of scope, by the approved design:

- the manager strategy itself, and an organizational field on the user
- a role hierarchy
- an expression-backed strategy
- an automatic fallback assignee

Deferred to change C, which ships the first fallible resolver: a resolution
deadline, a failure classification, and an `assignment.unresolved` event. See
`design.md`.

## Capabilities

### New Capabilities
- `assignment-strategy-registry`: the registry mapping an assignment strategy
  type to its config schema and its candidate resolver. Covers the built-in
  `static` entry and the resolver contract.

### Modified Capabilities
- `assignment-registry-validation`: the type check resolves against an injected
  registry, rather than comparing directly against `"static"`. The config schema
  comes from the resolved entry, not from a fixed local schema.
- `assignment-claim-enforcement`: resolution calls the registered resolver
  before the entry's transaction opens. `planStepEntry` consumes the result as
  an override rather than resolving. Carrying an assignment forward calls no
  resolver.

## Impact

- `src/engine/registry.ts`: `AssignmentStrategyDef`, `AssignmentRegistry`, and
  its create, register and resolve helpers. The built-in `static` entry.
- `src/engine/registry-check.ts`: `checkAssignmentRegistry` takes the registry,
  reuses `checkTypedConfig`, and drops `staticAssignmentConfigSchema`.
- `src/engine/definitions.ts`: `publishBody` takes and forwards the registry.
- `src/engine/transition.ts`: `resolveStepAssignment` leaves the module.
  `commitTransition` resolves and passes an override. `planStepEntry` no longer
  resolves. The claim path stays as it is: it reads candidates, and never
  resolves them.
- `src/engine/store.ts`: `createInstance` calls the resolver instead of reading
  `config.candidates` inline.
- `src/engine/migration.ts`: unchanged, but its `carryAssignment` flag now also
  suppresses the resolver call.
- Callers of `publishBody` in `src/http/`, `src/runtime/` and `test/` pass the
  registry.
- Docs stating that assignment is not an extension point: `CLAUDE.md`,
  `docs/current-state.md`, `docs/authoring-guide.md`.
