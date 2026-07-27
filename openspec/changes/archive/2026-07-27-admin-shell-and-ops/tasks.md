## 1. Role and the existing-read tightening

- [x] 1.1 Add `ADMIN_ROLE = "system:admin"` to `src/auth/authorize.ts` beside the two existing constants (no other change to that file)
- [x] 1.2 Widen `src/http/routes.ts::parseScope` to `"mine" | "all"`, with an omitted `scope` resolving to `"all"` and any other value still a `RequestShapeError`
- [x] 1.3 In `handleListInstances`, call `requireRole(actor, ADMIN_ROLE)` when the resolved scope is `"all"`, before the filter is built; leave the `scope=mine` + `assignedTo` rejection unchanged
- [x] 1.4 In `handleInstanceRecord`, call `requireRole(actor, ADMIN_ROLE)` unconditionally after actor resolution
- [x] 1.5 Tests in `test/http-*.test.ts`: `scope=mine` succeeds without the role; omitted `scope`, `scope=all` and the record route each 403 without it and 200 with it; `scope=sideways` is still 400; an unresolvable credential is still 401 on all three

## 2. `last_error` on the outbox row

- [x] 2.1 Add `ALTER TABLE outbox ADD COLUMN IF NOT EXISTS last_error text` to `store.ts::initSchema`, beside the existing idempotent adds
- [x] 2.2 In `outbox.ts::drainOutbox`, set `last_error` in both failure branches (dead-letter and retry) and clear it to `NULL` on the success branch
- [x] 2.3 Tests in `test/outbox*.test.ts`: a transient failure records the message and stays `pending`; a permanent one records it and is `dead-letter`; a later success clears it

## 3. `src/engine/admin-queries.ts`

- [x] 3.1 Create the module with `db: SQL = sql` as the last parameter of every function, matching the other engine modules
- [x] 3.2 `listOutbox(filter, page, db)` — `status[]` and `instanceId` filters, newest-first, keyset-paged on `(created_at, idempotency_key)` reusing the cursor encoding from `src/runtime/api.ts`; project the action's `type` only, never its `config`
- [x] 3.3 `countOutboxByStatus(db)` — one `GROUP BY status`, absent statuses simply absent
- [x] 3.4 `listPendingTimers(page, db)` — running instances with a non-null `next_timer_at`, ordered ascending, keyset-paged; carry instance, process, version, current step, fire time
- [x] 3.5 `requeueOutboxRow(key, db)` — `status='pending'`, `attempts=0`, `next_attempt_at=now()`, `claimed_at=NULL`, guarded by `status = 'dead-letter'`; report rows affected
- [x] 3.6 `discardOutboxRow(key, db)` — `status='discarded'` guarded by `status = 'dead-letter'`; report rows affected; never `DELETE`
- [x] 3.7 Tests in `test/admin-queries.test.ts` (DB-backed): status filter, config never returned, paging, counts, timer ordering with a non-running instance and a null-timer instance both excluded, requeue resets and is claimed by the next drain, requeue/discard are no-ops on a non-dead-letter row
- [x] 3.8 Test that a `discarded` row is inert: `drainOutbox` does not claim it, and `migrateInstances` migrates its instance (not skipped `pending-actions`) while bumping the discarded row's `field_version` with the rest

## 4. `src/http/admin-routes.ts`

- [x] 4.1 Create the file with the same handler shape and `guarded` wrapper as `routes.ts`; each handler resolves the actor then `requireRole(actor, ADMIN_ROLE)`
- [x] 4.2 `GET /admin/outbox` — `status` (repeatable), `instanceId`, `limit`, `cursor`; response carries the page and the per-status counts
- [x] 4.3 `POST /admin/outbox/:idempotencyKey/retry` and `.../discard` — 200 with the updated row, 404 when absent, 409 when present but not a dead letter
- [x] 4.4 `GET /admin/timers` — `limit`, `cursor`
- [x] 4.5 Dispatch the four routes in `src/http/server.ts`, including their CORS preflight, following the existing pattern
- [x] 4.6 Tests in `test/http-admin.test.ts`: for each route a 401 without a credential, a 403 without the role, a success with it; the retry/discard 404 and 409 cases

## 5. `packages/admin` scaffolding

- [x] 5.1 Create the package (`package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/app.css`) mirroring `packages/app`, without `form-ui`
- [x] 5.2 Copy and adapt `routing.ts` and `session.ts` from `packages/app`; add `api/client.ts` and `api/types.ts` for the routes this area calls
- [x] 5.3 Login screen against `POST /auth/login`; any 401 discards the token and returns to login
- [x] 5.4 Shell: read the roles from the login response and render the explanatory empty state when `system:admin` is absent
- [x] 5.5 Shared refresh behaviour — an explicit refresh control plus refetch-on-focus, no polling
- [x] 5.6 Tests: `routing.test.ts`, `session.test.ts` adapted from `packages/app`
- [x] 5.7 Confirm `bun run typecheck` covers the new package via the root `--filter './packages/*'` script

## 6. Operations screens

- [x] 6.1 `/instances`: list via `GET /instances?scope=all` with process / status / current step / `startedBy` / `claimedBy` filters and cursor paging; filter+paging state in a tested pure module under `src/screens/`
- [x] 6.2 `/instances/:id`: header (process, version, `definitionHash`, status, current step, `transitionSeq`, claim state, armed timers) plus the merged record timeline rendering both element kinds, with `ActionOutcome`s on a transition and the payload on an event
- [x] 6.3 Cancel action on the instance screen via `POST /instances/:id/cancel`; no forced transition, no `data` edit
- [x] 6.4 `/outbox`: per-status counts, filterable row list (action type, instance, attempts, last error, idempotency key), retry/discard offered on `dead-letter` rows only, retry behind a confirmation naming the re-run risk
- [x] 6.5 `/timers`: overdue-first list with overdue classification in a tested pure module
- [x] 6.6 Tests for the pure logic modules (`bun:test`); components stay untested

## 7. Verification and documentation

- [x] 7.1 Full `bun test` run inside the devcontainer with `DATABASE_URL` set; read the verdict off named failures and check the skip count
- [x] 7.2 `bun run typecheck` across the engine and every workspace package
- [x] 7.3 Manually exercise the area against `bun run serve` with an account granted `system:admin` via `src/auth/cli.ts set-roles` (recreate any demo state afterwards — `bun test` truncates the same database)
- [x] 7.4 Update `docs/current-state.md` with an "Admin area (operations)" entry covering `admin-queries.ts`, `admin-routes.ts`, the `last_error` column, the `discarded` status and `packages/admin`
- [x] 7.5 Update `ROADMAP.md` stage 10: mark `admin-shell-and-ops` done, keep the two remaining changes listed, and record the **BREAKING** tightening as shipped
- [x] 7.6 Re-index the codebase knowledge graph (`index_repository`, full) — attempted (full, then fast); the tool reports success but node/edge counts stayed byte-identical across calls and `search_graph` still finds nothing for new symbols (e.g. `requeueOutboxRow`) even after staging the new files so `detect_changes`/git-aware tooling could see them. Appears to be a limitation of the indexer in this environment, not fixable by retrying — flagged to the user rather than silently claimed done.
