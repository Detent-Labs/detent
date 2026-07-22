## Why

An unregistered action `type` or a `config` that fails its plugin's schema
publishes cleanly today and only fails at outbox delivery — retry, then
dead-letter, then a parked instance with no author-visible signal. This
violates the project's "publish error, never a runtime error" principle
already stated for CEL and duration validation (`definition-store` spec: "An
unknown handler type, an invalid plugin config and an invalid expression are
one class of failure: a publish error, never a runtime error."). `registry.ts`
declares an optional `configSchema`/`outputSchema` per handler but nothing
reads them, and `publishBody` never consults the registry at all.

## What Changes

- `publishBody` gains a registry check: every `Action` reachable from a
  compiled body — `onEntry`, `onExit`, `onCancel`, each path's `onPath`, and
  each timer's `onFire.actions` — is resolved against the injected
  `Registry`. An unresolved `type`, or a `config` that fails the handler's
  `configSchema` (when declared), is a publish rejection carrying every
  located issue — same shape as `CelValidationError`.
- A handler with no declared `configSchema` accepts any `config` (opt-in
  strictness, matching how `HandlerDef.configSchema` is already optional).
- Reserved `core.` action types (`SPAWN_ACTION_TYPE`, `RETURN_ACTION_TYPE`) are
  exempt from the "must be registered" check — they are engine-internal and
  already rejected in *authored* bodies by the existing `core.`-prefix
  refinement; the compiler injects no action of this type into `Action`
  positions this check visits.
- `publishBody` takes the process's `Registry` so the check has something to
  validate against (`createDefinitionStore` is unaffected — it only resolves
  already-published bodies, never publishes); every `publishBody` call site
  (today, only tests — no production caller exists yet) is updated to pass a
  registry built via `createRegistry()`/`register()`.
- Placement matches CEL/cross-process validation: on the compiled body, after
  the hash-hit no-op return, so a body published before a handler was
  registered (or before its `configSchema` tightened) is not retroactively
  rejected on identical re-publish.
- `definition.ts` is unchanged — it stays the deserializer for stored bodies
  and does not gain registry awareness.

## Capabilities

### New Capabilities
- `action-registry-validation`: authoring-time validation that resolves every
  action's `type` against the handler registry and checks its `config`
  against the handler's declared `configSchema`, producing located issues
  analogous to `CelIssue`.

### Modified Capabilities
- `definition-store`: `publishBody` additionally runs the registry check
  (same insert-path placement as the expression check) and rejects an
  unknown action type or a schema-violating config before any persist.

## Impact

- `src/engine/definitions.ts`: `publishBody` signature gains a `Registry`
  parameter; new validation step wired in alongside `validateProcessBody`.
- `src/engine/registry.ts`: new exported check function (analogous to
  `src/cel/check.ts`); no change to `HandlerDef`'s existing optional schema
  fields.
- `src/engine/host.ts` is unaffected: it never calls `publishBody` today (no
  API layer exists yet); the registry it builds for the three workers is a
  separate concern from the registry a publish call must supply.
- Test suites that call `publishBody` (`test/definitions.test.ts`,
  `test/cross-process.test.ts`, `test/migration.test.ts`,
  `test/subprocess.test.ts` — the largest, with ~86 direct call sites) pass a
  registry covering the handler types their fixture bodies use. Wrapper
  helpers that themselves call `publishBody` (`test/migration.test.ts`'s
  `publishV`, `publishN`, `twoVersions`) are updated once at the helper, not
  per call site.
