## Context

The engine's resolution worker (`src/engine/resolution.ts`) and timer scheduler
(`src/engine/timers.ts`) both take an injected
`resolveBody: (processId, version) => ProcessBody | undefined`. No store backs
it, so the default is `() => undefined`: both workers select due rows, fail to
resolve a body, and skip — inert in production. Tests exercise the full logic by
injecting a resolver that returns a known body.

Everything needed to build the backing already exists: `compile.ts` performs the
publish-time cancel-sink injection, `hash.ts` computes the `definitionHash` an
instance pins to, and the `ProcessVersion` schema (`definition.ts:484`) already
models the versioned wrapper — `{ processId, version, definitionHash, status,
publishedAt, definition }` — a natural row shape. Instances already pin
`{processId, version, definitionHash}` and `rehydrate` recomputes the hash to
verify the body.

## Goals / Non-Goals

**Goals:**
- Persist published versions so `resolveBody` returns a real body in production,
  making the resolution and timer workers live.
- A publish path that is immutable and idempotent-on-identical per the contract.
- Minimal, correct wiring: one thin host that starts the three workers against
  the store.

**Non-Goals:**
- Delete-guard ("a version cannot be deleted while an instance references it") —
  no delete path is built in this change; deferred until deletion is needed.
- Migration (a separate roadmap item; the `migration` field on `ProcessVersion`
  is persisted but unused here).
- The editor, an HTTP API, or version-number policy beyond monotonic-per-process.
- Changing `writeback-reresolution` or `timers` requirements — only the resolver
  seam widens (async), which is an implementation detail of those workers.

## Decisions

### DB-backed resolver + async signature, over a load-at-startup in-memory map

The current `ResolveBody` is synchronous. A DB read is async, so the resolver
must either (a) become async, or (b) stay sync behind an in-memory map hydrated
at startup. Chosen: **(a) widen `ResolveBody` to `=> ProcessBody | undefined |
Promise<ProcessBody | undefined>` and `await` at the two call sites.**

- (b) strands instances across processes: a version published by process A is
  absent from process B's map until B reloads, so B's worker returns `undefined`
  forever for that instance. A DB read is authoritative for every process.
- The widening is backward-compatible: `await` accepts a non-promise, so the
  existing synchronous test resolvers keep working untouched. Both call sites
  (`resolution.ts:76`, `timers.ts:38`) are already inside `async` functions.

### Process-local immutable cache in front of the DB read

Published versions are immutable (enforced by the store), so a resolved body can
be memoized forever with no invalidation logic. `createDefinitionStore(db)`
returns a `resolveBody` closing over a `Map<string, ProcessBody>` keyed by
`${processId}:${version}`: hit → return; miss → `SELECT body ... `, parse, cache,
return. This keeps steady-state resolution off the DB without any staleness risk
— the correctness comes free from immutability, not from a TTL.

### `publishBody(processId, authoredBody, db)` owns compile + version assignment

Publish is: `compileProcessBody(authoredBody)` → `definitionHash(compiled)` →
look up an existing version for `processId` with that hash. Hit → return it
(no-op, the contract's "identical re-publish is a no-op"). Miss → `version =
COALESCE(MAX(version),0)+1` for that `processId`, insert with
`status: "published"`. The immutable-and-idempotent semantics live in one place,
expressed as an `INSERT ... ON CONFLICT` plus a by-hash pre-check, rather than
spread across callers.

### Pin consistency: instances are created from the compiled body

The resolution worker verifies `definitionHash(resolvedBody) ===
inst.definitionHash` and, on mismatch, requeues rather than running against the
wrong definition (`resolution.ts:85`) — so a mismatch does not crash, it strands
the instance forever. `createInstance` pins `definitionHash(body)` of whatever
body it is handed. Therefore an instance MUST be created from the **compiled**
body the store persists and `resolveBody` returns, never from the pre-compile
authored body. The store is the single source of that body: create instances
from `resolveBody(processId, version)` (or from `publishBody`'s return), and the
hashes line up by construction.

### One `definitions` table, `initSchema` extends

`definitions (process_id text, version int, definition_hash text, status text,
published_at timestamptz, body jsonb, PRIMARY KEY (process_id, version))`, created
idempotently inside the existing `initSchema` alongside `instances`/`outbox`.
Bind the body object directly to the jsonb param (per the Bun.sql jsonb rule),
never `JSON.stringify(...)::jsonb`.

### `startEngine(db, registry)` is the production wiring

A five-line host: build the store, then `startOutboxWorker(db, registry)`,
`startResolutionWorker(db, resolveBody)`, `startTimerScheduler(db, resolveBody)`.
The `registry` is the existing handler `Registry` the outbox worker needs to
deliver actions (`startOutboxWorker(db, registry, intervalMs)`); passing it
through is what keeps action delivery live, not just re-resolution and timers.
This host is the object that makes "the workers are no longer inert" literally
true and testable end-to-end.

## Risks / Trade-offs

- [A body cached before a hypothetical in-place edit would go stale] → Versions
  are immutable by requirement and the store refuses body overwrites, so an
  in-place edit cannot occur; the cache has nothing to go stale against.
- [Async widening touches two live workers] → The change is `await` at the call
  site plus a union type; existing tests pin the behavior and pass unchanged, so
  a regression surfaces immediately in `bun test`.
- [Unbounded cache growth over many versions] → Entries are small and versions
  accrue slowly; if it ever matters, an LRU bound is a drop-in. `ponytail:`
  unbounded map, cap it if a process ever holds thousands of versions.
- [Version-assignment race] `MAX(version)+1` is check-then-insert: two concurrent
  publishes of different bodies for one `processId` can compute the same next
  version; the `(process_id, version)` PK makes one fail. → v1 publish is not
  concurrent, so the PK is a sufficient backstop; the loser errors and retries.
  `ponytail:` MAX+1 under the PK guard; a sequence per process only if concurrent
  publish becomes real.
- [Instance created from an authored (uncompiled) body] → hash mismatch, the
  worker requeues it forever. Mitigated by the pin-consistency decision above:
  instances come from the store's compiled body. The e2e test exercises exactly
  this path so a regression fails `bun test`.

## Migration Plan

Additive: a new table via `initSchema` (idempotent `CREATE TABLE IF NOT EXISTS`)
and new modules. The `ResolveBody` type change is internal; no persisted data or
public contract changes. Rollback is dropping the new modules and reverting the
two-line worker edits — existing instances and their pins are untouched.

## Open Questions

- Where does an authored body enter `publishBody` in production — an HTTP publish
  endpoint, a CLI, or a test harness? Out of scope here; the store exposes the
  function, the caller is a later concern (the editor/API epic).
- Should `startEngine` own worker lifecycle (stop/restart, health) beyond
  starting them? Deferred until a process supervisor need appears.
