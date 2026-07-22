## Context

`publishBody` (`src/engine/definitions.ts`) already runs two authoring-time
checks on the compiled body before assigning a version: `validateProcessBody`
(CEL) and `validateCrossProcess` (subprocess wiring). Both run after the
hash-hit no-op return, so a body already published is never re-validated.
Neither consults the handler `Registry` (`src/engine/registry.ts`): an
unknown `Action.type`, or a `config` that violates the handler's own
`configSchema`, is invisible until the outbox worker tries to `resolve()` it
at delivery time, where it dead-letters after burning retries and parks the
instance.

`registry.ts` already carries the shape this needs: `HandlerDef` has optional
`configSchema`/`outputSchema` (`z.ZodTypeAny`), populated by whoever calls
`register()`, but nothing reads them today. No production code calls
`publishBody` yet (no API layer exists) — every call site is a test.

## Goals / Non-Goals

**Goals:**
- Make an unregistered action `type` or a schema-violating `config` a publish
  rejection, at the same placement CEL/cross-process checks use.
- Cover every action position a definition can declare one in: step
  `onEntry`/`onExit`/`onCancel`, path `onPath`, timer `onFire.actions`.
- Produce located, batched issues (all of them, not just the first) so a
  publish rejection is fixable in one pass — matching `CelValidationError`.
- Preserve the hash-hit no-op: a body published before a handler existed (or
  before its `configSchema` tightened) is not retroactively rejected on
  identical re-publish.

**Non-Goals:**
- Validating `outputSchema` (the handler's declared result shape). Nothing
  reads it yet either, and checking a result shape against nothing (no
  runtime result exists at publish time) has no meaning. Left for whenever a
  consumer of `outputSchema` is built.
- Touching `definition.ts`. It stays the deserializer for stored/authored
  bodies; it has no registry dependency today and this change does not give
  it one, for the same reason CEL/duration checks live on the write path.
- A production `publishBody` caller. None exists; this change only makes the
  function itself correct and updates its (test) callers.
- Runtime/delivery-side changes to `outbox.ts`'s existing "unregistered type
  dead-letters" behavior (`action-handlers` spec). That backstop stays: it is
  what protects a hand-assembled body that reaches the outbox without having
  gone through `publishBody` (there is no other gate today), and the
  registry a *worker* runs against can differ from the one a given publish
  validated against if handlers are registered/deregistered between the two.

## Decisions

### The registry parameter is required, with no default

`publishBody(processId, authoredBody, registry, db = sql)` — `registry`
inserted before the existing `db` default parameter, both because the two
project precedents for a check-adding parameter thread it explicitly and
because no non-empty default is *correct*: an empty default registry would
reject every action in every existing test body, which is a worse failure
mode than a compile error at every call site forcing an explicit registry.
Every current call site is a test; updating them is the entire migration
cost, and each already knows which handler types its fixture bodies use.

**Alternative considered:** optional `registry?: Registry`, skipping the
check when absent. Rejected — a check that can be silently opted out of
reintroduces exactly the "clean publish, runtime failure" gap this change
closes, and nothing in the codebase needs a registry-free publish path (no
production caller exists to need it).

### A new `src/engine/registry-check.ts`, mirroring `src/cel/check.ts`

A new module exports `checkActionRegistry(body: ProcessBody, registry:
Registry): RegistryIssue[]`, reusing the same action-position collector shape
`src/cel/check.ts`'s `collect()` already has (same five positions: onEntry,
onExit, onCancel, path.onPath, timer.onFire.actions). `RegistryIssue` is
`{ loc: string; type: string; message: string }` — same field shape as
`CelIssue` (`loc`, `message`), so `publishBody` can throw a sibling
`RegistryValidationError` the same way it throws `CelValidationError`.

**Alternative considered:** extending `src/cel/check.ts` itself. Rejected —
that module is deliberately CEL-only (`CLAUDE.md`: "Kept out of
definition.ts so the contract has no CEL dependency"); the registry check has
no CEL dependency of its own (it inspects `Action.type`/`config` structurally
via Zod, never an `Expression`) and putting it in `src/engine/` next to
`registry.ts` keeps the CEL module's import surface unchanged.

Each check is independent per action: `registry.resolve(type)` first (missing
→ one issue, `config` not checked further for that action), then
`configSchema.safeParse(config)` when a schema is declared (a handler with no
`configSchema` accepts any `config` — matches the field's existing optional,
opt-in-strictness semantics). A `ZodError` on the config is flattened into
one issue per Zod issue path, joined into `message` (mirroring how
`CelValidationError`'s constructor joins multiple `CelIssue`s into one
`Error.message`, but each Zod path stays a separate `RegistryIssue` so a
multi-field config violation is not collapsed to one opaque line).

### `core.` action types are exempt from "must resolve"

`SPAWN_ACTION_TYPE`/`RETURN_ACTION_TYPE` are never present in an authored
body (rejected by `authoredProcessBody`'s existing `core.`-prefix
refinement) and the compiler injects no action carrying either type into any
of the five positions this check visits (compile only injects the cancel
sink step and its identity, not a step-level action) — so in practice this
check will never observe a `core.` type. It is still worth a one-line
allow-list guard rather than relying on that absence implicitly, so a future
compile-pass change that *did* start injecting a `core.`-typed action would
not silently start failing publish (these two are dispatched internally by
`subprocess.ts`'s registered handlers, never through the author-facing
registry contract this check enforces).

### Placement: after the hash-hit return, alongside `validateProcessBody`

Same reasoning as the existing two checks: `publishBody` runs it on the
compiled body, after the identical-body no-op return, before
`validateCrossProcess` and before any persist. Ordering relative to CEL:
registry check first (cheaper, no DB round-trip, and an unregistered action
type is arguably a more fundamental defect than a bad guard), then CEL, then
cross-process (which needs a DB round-trip to resolve child bodies) — but
this ordering is not load-bearing; `publishBody` already collects
`CelValidationError` fully before throwing, and there is no scenario needing
issues from *both* checks in one thrown error, since they are different
error classes (matching `CelValidationError` vs `CrossProcessValidationError`
already being distinct).

## Risks / Trade-offs

- **Breaking change to `publishBody`'s signature.** Every test call site
  needs an explicit `Registry` argument. Mitigated by it being a compile
  error (TypeScript strict), not a silent behavior change — nothing can miss
  this. Four suites call it directly: `test/definitions.test.ts` (already
  builds a registry for delivery tests, but only registers `"sayYes"` —
  `"sayNo"` is used in fixture bodies at lines 95/103 and needs registering
  too, or those tests newly fail); `test/cross-process.test.ts` (fixtures
  declare zero actions, empty `createRegistry()` suffices);
  `test/migration.test.ts` (one non-reserved type, `"noop"`, used via its
  `action()` helper — but three of its own helpers, `publishV`, `publishN`,
  `twoVersions`, wrap `publishBody` and need the parameter threaded once
  each, not per call site); and `test/subprocess.test.ts` — the largest by
  far, with roughly 86 direct `publishBody` calls, entirely unmentioned by a
  first pass over this design and easy to miss. Its fixtures exercise
  subprocess spawn/return, whose only non-guard actions are the
  engine-internal `core.spawnSubprocess`/`core.returnSubprocess` types
  (exempted below), so an empty registry should suffice there too — verify
  against the file directly before relying on this.
- **`configSchema` is optional, so a handler that never declares one gets no
  config validation.** This is existing, deliberate looseness in
  `HandlerDef` (not introduced here) — a plugin author opts in by declaring
  the schema. Silently accepting an undeclared-schema handler's `config` is
  correct, not a gap this change should close (closing it would mean
  *requiring* every handler to declare a schema, which is a separate,
  bigger decision this TODO item does not ask for).
- **The registry a publish validates against can drift from the registry a
  later delivery runs against** (handlers registered/deregistered between
  the two, or a different process instantiating the registry). This is
  already true of the existing worker wiring (`host.ts` builds its own
  registry independently of any publish call) and is out of scope — see
  Non-Goals.

## Migration Plan

No data migration. Already-published rows are untouched (validation only
runs on the insert path, never on read). Code migration is: add the
`registry-check.ts` module and its error class, thread `registry` through
`publishBody`, update every existing `publishBody` call site (tests) to pass
one. No feature flag — this is a compile-time-enforced, all-at-once switch,
consistent with the project's "no backwards-compatibility shims" convention.

## Open Questions

None — the TODO item's own "Zu tun" list plus the CEL/cross-process
precedent fully determine placement, error shape, and coverage.
