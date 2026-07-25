## 1. Persistence groundwork

- [x] 1.1 Add `created_at timestamptz NOT NULL DEFAULT now()` to `instances` in `src/engine/store.ts::initSchema` via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, keeping the statement idempotent alongside the existing `CREATE TABLE IF NOT EXISTS` block
- [x] 1.2 Add the paging index `instances (created_at DESC, instance_id DESC)`
- [x] 1.3 Add the assignment indexes: an expression index over `(body->'assignment'->>'claimedBy')` and a GIN index over `(body->'assignment'->'candidates')`
- [x] 1.4 Confirm `createInstance` needs no change (the column defaults) and that a fresh `initSchema` on an existing database is a no-op beyond the additions

## 2. Instance listing (runtime layer)

- [x] 2.1 Define the `InstanceSummary` type in `src/runtime/api.ts` — `instanceId`, `processId`, `version`, `status`, `currentStepId`, `transitionSeq`, `assignment`, `startedBy`, `createdAt`; no `data`
- [x] 2.2 Define the filter and page types (`processId`, `status[]`, `currentStepId`, `startedBy`, `claimedBy`, `assignedTo`, `limit`, `cursor`) with a default and an enforced maximum `limit`
- [x] 2.3 Implement `listInstances`: conjunctive filters, `assignedTo` as the documented disjunction (claimed by the actor, OR unclaimed and the actor is among `candidates`), keyset paging on `(created_at, instance_id)` descending, returning the next cursor and omitting it on the last page
- [x] 2.4 Tests: unfiltered listing; `processId`+`status`; `currentStepId`; each `assignedTo` case (claimed match, unclaimed-candidate match, claimed-by-other exclusion); conjunctive combination; three-page walk with distinct coverage; newest-first ordering; limit capping; a page unaffected by an instance created mid-walk

## 3. Instance record read (runtime layer)

- [x] 3.1 Define the discriminated record element type (`{kind: "transition", ...}` / `{kind: "event", ...}`) in `src/runtime/api.ts`
- [x] 3.2 Implement `getInstanceRecord` as a single `UNION ALL` over `history_entries` and `instance_events` projecting a common `(transition_seq, at, id)` sort key, ordered ascending, keyset-paged in the database — with a comment stating the ordering rule and why the merge is not left to callers
- [x] 3.3 Tests: merged ordering across a two-transition instance with an event; two events sharing one `transitionSeq` ordering by `at`; unknown instance returns empty with no error; paging returns the same order across page boundaries

## 4. Definition store enumeration

- [x] 4.1 Implement `listProcesses` in `src/engine/definitions.ts`: one entry per process with a published version, carrying newest `version`, `definitionHash`, `status`, `publishedAt` and the process `key`/`label`/`baseLocale` from the newest body, ordered by `processId`, bodies excluded
- [x] 4.2 Implement `listVersions(processId)`: `version`, `definitionHash`, `status`, `publishedAt` per published version, ordered by `version`, bodies excluded, empty list for an unpublished process
- [x] 4.3 Tests: two published processes listed with newest version; version 2 reported after a changed re-publish; empty store lists nothing; twice-published process lists two versions; identical re-publish adds no version; unpublished process lists empty

## 5. HTTP error mapping

- [x] 5.1 Add a request-shape error type (or reuse an existing one) mapped to 400 in `src/http/errors.ts` for unparseable query parameters
- [x] 5.2 Map the publish-time validation families to 422 with located issues in `mapError`: `RegistryValidationError`, `CelValidationError`, `CrossProcessValidationError`, and the authored-schema / duration failures raised by `publishBody`
- [x] 5.3 Tests: each mapped family reaches its status with its issues intact; an unmapped error still falls back to 500

## 6. HTTP routes

- [x] 6.1 Thread the action `Registry` into `createServer` (supplied by `startHttpServer` from the same value it hands `startEngine`) so the publish route validates against the server's registry
- [x] 6.2 `GET /instances` — parse and validate query parameters (`limit` a positive integer, `status` values valid, repeatable), reject bad ones with 400, delegate to `listInstances`
- [x] 6.3 `GET /instances/:instanceId/record` — `limit`/`cursor`, delegate to `getInstanceRecord`
- [x] 6.4 `POST /instances/:instanceId/cancel` — resolve the actor, delegate to `cancelInstance`, return the resulting instance; non-running is a 200 no-op
- [x] 6.5 `POST /processes` — parse the authored body (malformed JSON is 400), publish via `publishBody` with the server registry, return `processId`/`version`/`definitionHash`/`status`
- [x] 6.6 `GET /processes` and `GET /processes/:processId/versions` — delegate to the enumeration reads
- [x] 6.7 Add `OPTIONS` preflight handling for each new route with the existing permissive CORS headers, and verify no new route shadows an existing one (`POST /processes` vs `POST /processes/:id/instances`, `GET /instances` vs `GET /instances/:id`)
- [x] 6.8 Tests via `createServer`'s plain `fetch(req)` (no real port): every route's happy path; listing filters and paging over HTTP; 400 on `limit=abc` and on an unknown status value; record of an unknown instance returns 200 empty; cancel twice stays cancelled; cancel with no resolvable credential is 401 and leaves the instance unchanged; publish happy path, identical re-publish returns the same version, changed body returns version 2, malformed JSON is 400; each 422 publish case including that a rejected publish consumes no version; process/version listings carry no bodies; preflight on each new route
- [x] 6.9 Test that a publish under a rejecting resolver returns 401 and publishes nothing

## 7. Documentation and verification

- [x] 7.1 Update `docs/current-state.md` with the new read surface, the `created_at` column and indexes, and the explicit note that publish and cancel are unauthenticated under the shipped `devHeaderResolver`
- [x] 7.2 Update `ROADMAP.md` — the read/query API as the step that unblocks frontend work, with auth named as the remaining gap
- [x] 7.3 Run `bun run typecheck` and the full `bun test` suite **with `DATABASE_URL` set**, and read the verdict off named tests and the skip count, not the pass count alone
- [x] 7.4 Re-index the codebase-memory knowledge graph (`index_repository`, full) once the change lands
