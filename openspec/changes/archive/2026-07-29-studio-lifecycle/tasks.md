## 1. HTTP error mapping

- [x] 1.1 Add a `MigrationPlanError` entry to `MESSAGE_ERRORS` in
      `src/http/errors.ts` (`status: 409`, `type: "migration-plan"`),
      importing the class from `src/engine/migration.ts`.

## 2. Publish-from-draft route

- [x] 2.1 Add a function to `src/engine/drafts.ts` that sets a draft's
      `base_version` via a plain `UPDATE … WHERE process_id = $1` (no
      `revision` check, no bump — `base_version` is not part of the
      `revision` optimistic-concurrency contract).
- [x] 2.2 Add `handlePublishDraft(processId, req, resolver, registry,
      dataSourceRegistry, db)` to `src/http/studio-routes.ts` — the first
      handler in that file needing `registry`/`dataSourceRegistry` (every
      existing one takes only `resolver`/`db`): requires `DEVELOPER_ROLE`
      then `PUBLISH_ROLE`, reads the draft via `getDraft`, 404s if absent,
      calls `publishBody` with the draft's stored `body` unchanged, stamps
      `base_version` on success (task 2.1's function), and returns
      `{processId, version, definitionHash, status}`.
- [x] 2.3 Wire `POST /drafts/:processId/publish` (and its `OPTIONS`
      preflight) in `src/http/server.ts`, passing through the `registry`/
      `dataSourceRegistry` the dispatcher already holds (currently threaded
      only into `handlePublish`).
- [x] 2.4 `bun:test` coverage: successful publish stamps `base_version` and
      leaves `revision` unchanged; 404 for a process with no draft; rejected
      when the actor holds only `system:developer`; rejected when the actor
      holds only `system:publish`.

## 3. Version-body fetch route

- [x] 3.1 Add `handleGetVersionBody` to `src/http/studio-routes.ts`: requires
      `DEVELOPER_ROLE`, parses the `:version` path segment to a number
      (`RequestShapeError` if non-numeric — no existing HTTP handler parses a
      numeric path param today, so there's no prior convention to match),
      resolves the compiled body via the definition store's
      `resolveBody(processId, version)`, 404s when unresolved.
- [x] 3.2 Wire `GET /processes/:processId/versions/:version` (and its
      `OPTIONS` preflight) in `src/http/server.ts`, disambiguated from the
      existing `GET /processes/:processId/versions` (metadata list) by path
      segment count.
- [x] 3.3 `bun:test` coverage: returns the compiled body for a published
      version; 404 for a version never published; rejected for an actor
      lacking `system:developer` even though the sibling metadata route
      requires no role.

## 4. Migration-plan routes

- [x] 4.1 Add `handleGetMigrationPlan` and `handlePutMigrationPlan` to
      `src/http/studio-routes.ts`: both require `DEVELOPER_ROLE` and parse
      `:fromVersion`/`:toVersion` to numbers (`RequestShapeError` if
      non-numeric, same as task 3.1); `GET` wraps `resolveMigrationPlan` (404
      when unregistered); `PUT` parses the JSON body's envelope
      (`RequestShapeError` on malformed JSON, matching `handleSaveDraft`'s
      pattern) and passes it to `registerMigrationPlan` unchanged, letting
      that function's own `migrationSpec.parse` and `validatePlan` raise
      their existing errors.
- [x] 4.2 Wire `PUT`/`GET /migration-plans/:processId/:fromVersion/:toVersion`
      (and their `OPTIONS` preflights) in `src/http/server.ts`.
- [x] 4.3 `bun:test` coverage: register-then-read round trip; re-registering
      an unapplied plan overwrites the stored spec; registering against an
      applied plan is rejected (409, `migration-plan`); reading an
      unregistered key is 404; rejected for an actor lacking
      `system:developer`.

## 5. Orphan-keys scan route

- [x] 5.1 Add `handleGetOrphanKeys` to `src/http/studio-routes.ts`: requires
      `DEVELOPER_ROLE`, parses `:version` to a number (same as task 3.1),
      wraps `findOrphanKeys(processId, version)` unchanged.
- [x] 5.2 Wire `GET /processes/:processId/versions/:version/orphan-keys` (and
      its `OPTIONS` preflight) in `src/http/server.ts`.
- [x] 5.3 `bun:test` coverage: returns offending instance ids/keys for a
      version with orphan data; returns an empty result for a clean version;
      rejected (409, `migration-plan`) for an unpublished version; rejected
      for an actor lacking `system:developer`.

## 6. Studio UI — Publish action

- [x] 6.1 Add a Publish action to the edit screen (`EditScreen.tsx` /
      `DraftToolbar.tsx`) calling `POST /drafts/:processId/publish`.
- [x] 6.2 When local edits are unsaved, the action prompts to save first and
      does not call the publish route until the save completes.
- [x] 6.3 On success, show the returned version number and `definitionHash`.
- [x] 6.4 Extract the save-before-publish gating decision into a pure module
      (following `screens/draftSaveLogic.ts`'s pattern) with `bun:test`
      coverage, independent of any component.

## 7. Studio UI — Versions screen

- [x] 7.1 New screen listing a process's published versions via the existing
      `GET /processes/:processId/versions`.
- [x] 7.2 Selecting two versions fetches both bodies (task 3) and renders a
      JSON diff.
- [x] 7.3 A "diff against base" option targets the open draft's
      `base_version` when set, and is hidden/disabled when it is `null`
      (never published).
- [x] 7.4 Extract the version-pair/diff-target selection logic into a pure
      module (following `screens/processListLogic.ts`'s pattern) with
      `bun:test` coverage.

## 8. Studio UI — migration-plan authoring screen

- [x] 8.1 New screen to author a plan for a chosen `(fromVersion, toVersion)`
      pair: load an existing plan via `GET /migration-plans/...`, edit
      `fieldMap`/`stepMap`/`transforms`/`onUnmappable`, save via
      `PUT /migration-plans/...`.
- [x] 8.2 An orphan-key dry-run panel triggers
      `GET /processes/:processId/versions/:version/orphan-keys` for the
      chosen `fromVersion` and renders the result.
- [x] 8.3 Surface `MigrationPlanError` responses (409, `migration-plan`)
      inline on the form, following the existing error-display convention
      for other 409s (e.g. the draft save-conflict message).
- [x] 8.4 Extract the plan form's validation/serialization logic into a pure
      module with `bun:test` coverage, independent of any component.

## 9. Verification

- [x] 9.1 `bun run typecheck` passes across the workspace.
- [x] 9.2 The full `bun test` suite passes with `DATABASE_URL` set — a full
      run, not a single-file rerun (the DB-backed suites share one database
      and contend when run back-to-back in isolation). 1140/1144 pass; the 4
      failures (`packages/editor/test/graph-diagram*`) are a pre-existing
      environment gap unrelated to this change — `mermaid-isomorphic` needs a
      Playwright Chromium binary the devcontainer image doesn't have
      installed (`packages/editor` was not touched by this change).
