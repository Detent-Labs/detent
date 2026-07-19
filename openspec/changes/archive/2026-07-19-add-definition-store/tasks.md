## 1. Schema (the `definitions` table)

- [x] 1.1 In `src/engine/store.ts` `initSchema`, add an idempotent `CREATE TABLE IF NOT EXISTS definitions (process_id text, version int, definition_hash text NOT NULL, status text NOT NULL, published_at timestamptz, body jsonb NOT NULL, PRIMARY KEY (process_id, version))`.
- [x] 1.2 Add index `definitions_hash_idx ON definitions (process_id, definition_hash)` for the idempotent-publish by-hash lookup.

## 2. Store module (`src/engine/definitions.ts`)

- [x] 2.1 `publishBody(processId, authoredBody, db)`: compile via `compileProcessBody` (`src/schema/compile.ts`), hash the compiled body via `definitionHash`. If a row exists for `(process_id, definition_hash)`, return that existing `ProcessVersion` (no-op). Else assign `version = COALESCE(MAX(version),0)+1` for the `processId` and `INSERT` with `status: "published"` (bind the body object directly to the jsonb param — never `JSON.stringify(...)::jsonb`). Return the persisted `ProcessVersion` (assembled from the columns; `definition` = the compiled body).
- [x] 2.2 Refuse an overwrite: an `INSERT` colliding on the `(process_id, version)` PK with a different `definition_hash` must error (the PK conflict already prevents the overwrite; surface a clear error rather than swallowing it).
- [x] 2.3 `createDefinitionStore(db)`: return `{ resolveBody }` closing over a `Map<string, ProcessBody>` keyed by `` `${processId}:${version}` ``. Hit → return cached; miss → `SELECT body FROM definitions WHERE process_id=? AND version=?`, parse via `processBody`, cache, return; no row → `undefined`.

## 3. Async resolver seam

- [x] 3.1 In `src/engine/resolution.ts`, widen `ResolveBody` to `(processId, version) => ProcessBody | undefined | Promise<ProcessBody | undefined>`.
- [x] 3.2 `await` the resolver at its call site in `drainResolutions` (`resolution.ts`) and in `drainTimers` (`timers.ts`). Confirm both are inside `async` functions (they are).
- [x] 3.3 Run `bun run typecheck` and `bun test` — existing synchronous test resolvers must still pass unchanged (`await` accepts a non-promise).

## 4. Host wiring (`src/engine/host.ts`)

- [x] 4.1 `startEngine(db = sql, registry: Registry = new Map())`: `const { resolveBody } = createDefinitionStore(db);` then start `startOutboxWorker(db, registry)`, `startResolutionWorker(db, resolveBody)`, `startTimerScheduler(db, resolveBody)`; return their combined `stop`. The `registry` is required for the outbox worker to deliver actions — without it, delivery stays inert even though re-resolution and timers go live.

## 5. Tests (`test/definitions.test.ts`)

- [x] 5.1 `publishBody` persists a version; a re-publish of the identical authored body is a no-op returning the same `version`.
- [x] 5.2 Publishing a changed body for the same `processId` assigns `version = latest + 1`.
- [x] 5.3 An `INSERT` targeting an existing `(processId, version)` with a different body errors (immutability); the persisted body is unchanged.
- [x] 5.4 `resolveBody` returns a body that passes `rehydrate`'s pin check for an instance created against it; an unpublished pin returns `undefined` (no throw). Create the instance from the resolved (compiled) body so `definitionHash` matches — an instance built from the authored body would hash-mismatch and requeue forever (the pin-consistency contract).
- [x] 5.5 A second `resolveBody` for the same pin is served from the cache (assert via a `db` spy/counter that no second `SELECT` fires).
- [x] 5.6 End-to-end via `startEngine` (or the store resolver directly): `publishBody` an authored body, create an instance from the store's resolved (compiled) body, flag re-resolution / arm a due timer, and assert the worker advances/fires it against the store-resolved body — the store-backed path is no longer inert.

## 6. Docs

- [x] 6.1 Update `CLAUDE.md` (Current state + roadmap item 3) and `README.md`: the definition store exists; the resolution and timer workers are live in production via `startEngine`.
