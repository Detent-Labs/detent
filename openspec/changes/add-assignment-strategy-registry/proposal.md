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
instance. It ships no such strategy.

## What Changes

- `Step.assignment.strategy.type` resolves through an `AssignmentRegistry`
  instead of a direct comparison against the literal `"static"`.
- `"static"` becomes a registered strategy. It keeps its behaviour, its
  `{ candidates: string[] }` config schema, and its status as the default.
- Publish-time validation resolves the type against the injected registry. It
  parses `config` against the registry entry's declared schema. An unknown type
  or a violating config stays a publish-time failure.
- Step entry resolves candidates by calling the registered strategy. A strategy
  may return a value asynchronously, and may fail.
- A deadline bounds the resolution. A failed or timed-out resolution commits the
  transition, leaves `candidates` empty, and records the reason.
- The event union gains an `assignment.unresolved` kind. It carries the step and
  the reason.
- **No JSON contract change.** `Step.assignment.strategy` already uses the
  generic `plugin` envelope (`definition.ts:427`). No existing definition
  changes, and nothing migrates.

Out of scope, by the approved design:

- the manager strategy itself, and an organizational field on the user
- a role hierarchy
- an expression-backed strategy
- an automatic fallback assignee

## Capabilities

### New Capabilities
- `assignment-strategy-registry`: the registry mapping an assignment strategy
  type to its config schema and its candidate resolver. Covers the built-in
  `static` entry, and the deadline that bounds a resolution.

### Modified Capabilities
- `assignment-registry-validation`: the type check resolves against an injected
  registry, rather than comparing directly against `"static"`. The config schema
  comes from the resolved entry, not from a fixed local schema.
- `assignment-claim-enforcement`: step entry resolves candidates through the
  registry. Resolution may be asynchronous, and a deadline bounds it. A failure
  yields empty candidates plus a recorded reason, rather than throwing.
- `runtime-events`: the union gains an `assignment.unresolved` kind. It enqueues
  no actions, advances no `transitionSeq`, and writes no HistoryEntry.

## Impact

- `src/engine/registry.ts`: the `AssignmentRegistry` type, and the built-in
  `static` entry.
- `src/engine/registry-check.ts`: `checkAssignmentRegistry` takes the registry
  as an argument, and reads the entry's schema.
- `src/engine/definitions.ts`: `publishBody` passes the registry through.
- `src/engine/transition.ts`: `planStepEntry` and the claim path call the
  resolver.
- `src/engine/store.ts`: creation at an assignment-bearing initial step calls
  the resolver.
- `src/schema/definition.ts`: the `assignment.unresolved` event kind only. The
  authored body's schema does not change.
- Callers of `publishBody` in `src/http/`, `src/runtime/` and `test/` pass the
  registry.
- Docs stating that assignment is not an extension point: `CLAUDE.md`,
  `docs/current-state.md`, `docs/authoring-guide.md`.
