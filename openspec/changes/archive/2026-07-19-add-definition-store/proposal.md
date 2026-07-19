## Why

The resolution and timer workers are built but inert in production: both take an
injected `resolveBody(processId, version) -> ProcessBody` and no store backs it,
so every call returns `undefined` and no parked wait-state re-resolves and no
timer fires. A persistent definition/version store is the one missing piece that
turns the already-built async machinery on.

## What Changes

- Add a `definitions` table (PK `(process_id, version)`) that persists each
  published version's frozen `ProcessBody` plus its pin metadata
  (`definition_hash`, `status`, `published_at`).
- Add a publish path that compiles an authored body (existing `compile.ts`),
  hashes it, and inserts it as an immutable version: an identical re-publish is a
  no-op (matched by hash), a different body at an existing version is an error,
  version numbers are assigned monotonically per `processId`.
- Add a DB-backed `resolveBody` with a process-local memoization cache. Published
  versions are immutable, so a cached body is never stale — the cache only grows.
- **BREAKING (internal seam only)**: widen the `ResolveBody` type to allow a
  `Promise` return and `await` it at the two worker call sites
  (`resolution.ts`, `timers.ts`). Backward-compatible with the existing
  synchronous test resolvers (`await` accepts a non-promise).
- Add a thin `startEngine(db)` host that builds the store and starts the three
  workers wired to the real resolver, so the workers are no longer inert.

## Capabilities

### New Capabilities
- `definition-store`: persist published process versions and resolve an
  instance's frozen `ProcessBody` from its `{processId, version}` pin; the
  production backing for the engine workers' `resolveBody`.

### Modified Capabilities
<!-- none: the workers' "takes an injected resolveBody" requirement is unchanged; the async widening is an implementation detail. -->

## Impact

- New: `src/engine/definitions.ts` (table DDL, `publishBody`, `createDefinitionStore`),
  `src/engine/host.ts` (`startEngine`), `test/definitions.test.ts`.
- Modified: `src/engine/resolution.ts` (`ResolveBody` type widened, `await` at
  call site), `src/engine/timers.ts` (`await` at call site), `src/engine/store.ts`
  (`initSchema` also creates the `definitions` table).
- Depends on existing `compile.ts` (publish-time compile) and `hash.ts`
  (`definitionHash`); reuses the `ProcessVersion` schema as the row shape.
- No schema-contract change: `definition.ts` is untouched.
