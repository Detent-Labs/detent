## 0. Precondition

- [x] 0.1 **`admin-shell-and-ops` must be archived before this change is archived.** Both `authorization` deltas `MODIFIED` the same enumerating requirement and the last archive wins; archived after this one, the admin delta's three-role block silently drops `DEVELOPER_ROLE` from the main spec. Implementation order is unconstrained — the two role constants are independent in code.

## 1. The developer role

- [x] 1.1 Add `DEVELOPER_ROLE = "system:developer"` to `src/auth/authorize.ts` beside the existing constants (no other change to that file; no role implies another)
- [x] 1.2 Test in `test/authorize.test.ts`: an actor whose `roles` is exactly `["system:developer"]` is rejected by `requireRole` for `PUBLISH_ROLE` and for `ADMIN_ROLE`

## 2. The `drafts` table

- [x] 2.1 Add `CREATE TABLE IF NOT EXISTS drafts (process_id text PRIMARY KEY, body jsonb NOT NULL, layout jsonb NOT NULL DEFAULT '{}', revision integer NOT NULL DEFAULT 0, base_version integer, updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())` to `store.ts::initSchema`, with a comment stating why it is not `definitions` with `status='draft'` and why `layout` sits beside the body
- [x] 2.2 Add the truncation of `drafts` to the DB test suites' `beforeEach` helper, alongside the existing tables (`test/drafts.test.ts` and `test/http-studio.test.ts`)

## 3. `src/engine/drafts.ts`

- [x] 3.1 Create the module with `db: SQL = sql` as the last parameter of every function, matching the other engine modules; export a `DraftConflictError` distinct from `runtime/api.ts::ConcurrencyConflict`
- [x] 3.2 `getDraft(processId, db)` — returns `{processId, body, layout, revision, baseVersion, updatedBy, updatedAt}` or `undefined`; body returned as stored, never parsed against `processBody`
- [x] 3.3 `saveDraft(processId, {body, layout, revision, updatedBy}, db)` — envelope check first (`body` a JSON object, `layout` an object, `revision` a non-negative integer, else `RequestShapeError`; no `processBody` parse, no size limit, no route/body id cross-check — `ProcessBody` has no `processId`). Then: `revision === 0` and no row → `INSERT` (a lost PK race raises `DraftConflictError`); otherwise `UPDATE … WHERE process_id = $1 AND revision = $2` with `revision = revision + 1`, zero affected rows → `DraftConflictError`. Bind `body`/`layout` as objects, never `JSON.stringify(x)::jsonb`
- [x] 3.4 `listDrafts(db)` — one summary per draft with process id, revision, base version, `updated_by`, `updated_at`; **no body**
- [x] 3.5 `deleteDraft(processId, db)` — removes the row; touches no `definitions` row; report whether a row was removed
- [x] 3.6 Tests in `test/drafts.test.ts` (DB-backed): a save at the matching revision persists body and layout and increments `revision`; a stale save raises `DraftConflictError` and leaves the row byte-identical; a structurally invalid body (a single step with no exit) saves and reads back unchanged; a `layout` key for an undeclared step round-trips; `getDraft` on an absent process returns `undefined`; `listDrafts` carries no body; `deleteDraft` leaves published versions intact
- [x] 3.6a Envelope tests: `body` as array / string / number / `null`, `layout` as non-object, and `revision` negative / non-integer / non-number each raise `RequestShapeError` and leave any stored row untouched
- [x] 3.7 Test the hash invariant: publish a draft's body via `publishBody`, save the draft again with only `layout` changed, publish the re-read body again — same `definitionHash`, same version, no second `definitions` row

## 4. `src/http/studio-routes.ts`

- [x] 4.1 Create the file with the same handler shape and `guarded` wrapper as `routes.ts`; each handler resolves the actor then calls `requireRole(actor, DEVELOPER_ROLE)` directly
- [x] 4.2 `GET /drafts` (listing) and `GET /drafts/:processId` (404 when absent)
- [x] 4.3 `PUT /drafts/:processId` — request carries `{body, layout, revision}`; `updated_by` comes from the resolved actor, never from the request; the envelope violations from 3.3 surface as 400
- [x] 4.4 `DELETE /drafts/:processId`
- [x] 4.5 Map `DraftConflictError` to 409 in `src/http/errors.ts` (`MESSAGE_ERRORS`, type `"draft-conflict"`)
- [x] 4.6 Dispatch the four routes in `src/http/server.ts` including their CORS preflight, following the existing pattern
- [x] 4.7 Tests in `test/http-studio.test.ts`: for each route a 401 without a credential, a 403 for an authenticated actor without the role, a success with it; a stale-revision `PUT` is 409 and leaves the row unchanged; a malformed envelope is 400; `GET /drafts/:processId` for an absent draft is 404

## 5. `packages/studio` scaffolding

- [x] 5.1 Create the package (`package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/app.css`) mirroring `packages/app`, plus `immer` and `zod`; no `form-ui`, `mermaid` or `@panzoom/panzoom` yet
- [x] 5.2 Copy and adapt `routing.ts` and `session.ts` from `packages/app` (own storage key); routes: `login`, `processes`, `edit`
- [x] 5.3 `api/client.ts` + `api/types.ts` for `POST /auth/login`, `GET /processes`, `GET /processes/:id/versions`, and the four draft routes; map the `draft-conflict` error type explicitly
- [x] 5.4 Login screen against `POST /auth/login`; any 401 anywhere clears the session and returns to login
- [x] 5.5 Shell: read the roles from the login response, render the explanatory empty state when `system:developer` is absent (no redirect, no partial UI)

## 6. Carrying the editing surface over

- [x] 6.1 Copy `draft/`, `panels/`, `i18n/` and `registry/` from `packages/editor/src` into `packages/studio/src`, leaving `packages/editor` untouched
- [x] 6.2 Drop the file-persistence pieces from the copy: `file-io.ts`, `file-system-access.d.ts`, `load-guard.ts`, the save half of `io.ts`, and `panels/FileToolbar.tsx`
- [x] 6.3 Add a `process` minter to the copied `draft/ids.ts` over the contract's `processId` schema, beside the existing six
- [x] 6.4 Wire the Draft store to the draft routes: load on mount (`GET`), explicit save (`PUT` with the loaded revision), discard (`DELETE` with confirmation); keep the revision in the store
- [x] 6.5 Replace `FileToolbar` with a save/discard toolbar; live validation stays as-is and never blocks saving
- [x] 6.6 Verify the copied `draft/validation.ts` still imports only through the exports map and that no studio module imports a database client or a deep engine path

## 7. Process list

- [x] 7.1 Pure module `screens/processListLogic.ts` merging `GET /processes` with `GET /drafts` into rows (draft-only, published-only, and both), following `packages/app/src/screens/inboxLogic.ts`
- [x] 7.2 `ProcessesScreen.tsx` rendering those rows: draft editor + timestamp, latest version + hash; actions new / open / discard (confirmed)
- [x] 7.3 "New process" mints a `proc_` id client-side and issues exactly one `PUT /drafts/:processId` at `revision = 0`
- [x] 7.4 Tests: `processListLogic` row derivation for all three row shapes without a DOM; the save/conflict state machine (409 → conflict state with local edits intact → reload adopts stored body/layout/revision → next save succeeds)

## 8. Verification

- [x] 8.1 `bun run typecheck` for the engine and `packages/studio`
- [x] 8.2 Full `bun test` with `DATABASE_URL` set, inside the devcontainer; read the verdict off named failures and the skip count, not the pass count alone
- [x] 8.3 Confirm `packages/editor` still builds and typechecks unchanged
- [x] 8.4 Update `ROADMAP.md` stage 11 and `docs/current-state.md` with a "Process Studio — shell and drafts" entry
