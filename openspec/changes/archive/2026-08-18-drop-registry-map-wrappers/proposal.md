## Why

`src/engine/registry.ts` defines nine one-line functions. Each one calls a
single `Map` method and nothing else. The nine are
`createRegistry`/`register`/`resolve` for the action registry,
`createAssignmentRegistry`/`registerAssignmentStrategy`/
`resolveAssignmentStrategy` for the assignment registry, and
`createDataSourceRegistry`/`registerDataSource`/`resolveDataSource` for the
data-source registry. Every `register*` is `reg.set(type, def)`; every
`resolve*` is `reg.get(type)`.

The registry CONCEPT stays. Plugins behind `{ type, config }`, resolved
through a per-kind registry at publish time, form a deliberate v1 seam
(`CLAUDE.md`, `.claude/rules/process-contract.md`'s "Extensibility" section).
Only the six trivial setter/getter wrappers around `Map.set`/`Map.get` are
the target. A `Map` call needs no wrapper to stay a plugin seam.

`openspec/changes/registry-map-wrappers` proposes this exact refactor
already: same six functions, same call sites, same "keep the three `create*`
factories" decision. It predates this change and stays open, unarchived, and
unimplemented. This change supersedes it rather than running beside it;
`tasks.md` step 0.1 deletes it.

## What Changes

- Delete the six one-line `register*`/`resolve*` functions in
  `src/engine/registry.ts`: `register`, `resolve`,
  `registerAssignmentStrategy`, `resolveAssignmentStrategy`,
  `registerDataSource`, `resolveDataSource`. Replace every call site with the
  direct `Map` call it wrapped: `reg.set(type, def)` or `reg.get(type)`.
  Touched files: `src/engine/host.ts`, `src/engine/subprocess.ts`,
  `src/engine/outbox.ts`, `src/engine/registry-check.ts`,
  `src/engine/assignment-strategies.ts`, `src/engine/registry.ts` itself,
  `src/runtime/api.ts`,
  `packages/web/src/areas/studio/registry/exampleRegistry.ts`, and every
  `test/*.test.ts` fixture that builds a registry directly.
- Keep the three `create*` factories as they are:
  `createRegistry`, `createAssignmentRegistry`, `createDataSourceRegistry`.
  Each is a one-line `Map` factory too. `createRegistry` has a real external
  consumer through the engine package's exports map:
  `packages/web`'s `exampleRegistry.ts`. Keeping construction symmetric
  across the three deliberately parallel registries costs one line per
  registry. Making the three inconsistent with each other would cost more.
- Keep `createDefaultAssignmentRegistry` and `createDefaultDataSourceRegistry`
  exactly as they are. Neither is a one-liner; each carries real
  pre-population logic. Only what they call internally changes.
- No type changes: `Registry`, `AssignmentRegistry`, and `DataSourceRegistry`
  stay `Map<string, ...>` type aliases exactly as today. No behavior change:
  every call site keeps producing the same reads and writes it does now.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `data-source-resolution`: one requirement names
  `createDataSourceRegistry`/`registerDataSource`/`resolveDataSource` "by
  name, mirroring the action registry's own three functions." Its two
  scenarios name `resolveDataSource`/`registerDataSource` directly. The delta
  renames these to `createDataSourceRegistry` plus direct `Map.set`/`Map.get`
  calls. Construction, registration, and lookup keep behaving the way the
  requirement and scenarios already describe. The delta touches only the
  function-name-level wording.

## Impact

- `src/engine/registry.ts`: this change deletes six functions (about 21
  lines). The three `create*` factories and everything else in the file stay
  as they are.
- `src/engine/host.ts`, `src/engine/subprocess.ts`, `src/engine/outbox.ts`,
  `src/engine/registry-check.ts`, `src/engine/assignment-strategies.ts`,
  `src/runtime/api.ts`: call sites rewrite to direct `Map` calls. No
  signature or behavior changes.
- `packages/web/src/areas/studio/registry/exampleRegistry.ts`: its two
  `register(...)` calls become `.set(...)` calls. It keeps using
  `createRegistry`.
- `test/`: this change deletes `test/registry.test.ts` outright. Its two
  tests exercise only `register`/`resolve` against a bare `createRegistry()`.
  Once those two functions are gone, the file has no remaining subject.
  Every other test file that calls one of the six deleted functions switches
  its construction calls to `.set`/`.get`. Each call site already holds the
  `Map`. No test's assertions change.
- `openspec/specs/data-source-resolution/spec.md`: this change rewords one
  requirement and its two scenarios per the delta above.
