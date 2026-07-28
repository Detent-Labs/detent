## Why

Studio (`packages/studio`) can author and canvas-edit a draft (`studio-shell-and-drafts`,
`studio-canvas`) but cannot publish it, inspect published versions, or plan a
migration. Every real publish still goes through the legacy `packages/editor`'s
export path plus a manual `POST /processes` call — the exact dependency stage 11
exists to remove. This is the largest remaining functional gap blocking
`packages/editor`'s retirement (deleted only in the last of five stage-11 changes)
and it also blocks `admin-migration-run`: there is no HTTP path today to create a
migration plan, so an admin "run" action would have nothing to run against.

## What Changes

- Add a **Publish** action to Studio's process detail/edit screen, backed by a
  new `POST /drafts/:processId/publish` route (`system:developer` AND
  `system:publish`-gated) that publishes the *persisted* draft server-side
  through the existing `publishBody` — not a raw client-side call to `POST
  /processes` — and reflects the resulting `{version, definitionHash,
  status}` on screen. `POST /processes` itself is untouched.
- Add a **published version's body** fetch route so two versions (or a draft
  against its `base_version`) can be diffed — today `GET
  /processes/:processId/versions` returns metadata only, no body.
- Add a Studio **Versions** screen: list of published versions plus a JSON diff
  between any two (or draft-vs-latest).
- Add **migration-plan authoring** in Studio: create/inspect a
  `(processId, fromVersion, toVersion)` plan (`registerMigrationPlan` /
  `resolveMigrationPlan`, already engine-side per roadmap #3) and run a
  read-only `findOrphanKeys` dry run against it — both newly exposed over HTTP
  for the first time, `system:developer`-gated, as unprefixed studio routes
  (not under `/admin`).
- Lift the "publishing is not part of this screen" constraint `studio-app`
  currently states.

Out of scope, deliberately: **executing** a migration plan (`POST
/admin/migrations/run` stays `admin-migration-run`'s route, an operator action,
not a developer one), the registry/CEL-scratchpad tools screen and Player
(`studio-tools-and-player`), and the JSON editing surface (`studio-json-view`)
— those remain separate stage-11 changes.

## Capabilities

### New Capabilities
- `process-version-inspection`: HTTP route to fetch a specific published
  version's compiled body, plus the Studio Versions screen (list + JSON diff
  between two versions or a draft against its base version).
- `studio-migration-planning`: HTTP exposure of the existing engine-side
  `registerMigrationPlan`/`resolveMigrationPlan`/`findOrphanKeys`
  (`system:developer`-gated, unprefixed routes — studio-only by role gate,
  not by URL prefix, same as `process-drafts`'s `/drafts` routes; no
  execution route),
  plus the Studio migration-plan authoring screen with an orphan-key dry run.
- `studio-publish`: a new `POST /drafts/:processId/publish` route that
  publishes the persisted draft through the existing `publishBody` (reused
  unchanged) and stamps the draft's `base_version`, plus the Studio UI publish
  action that calls it.

### Modified Capabilities
- `studio-app`: process list/detail screens gain a publish action and
  navigation to the new Versions and migration-plan screens; the
  `studio-shell-and-drafts`-era "publishing is not part of this screen"
  constraint is removed.

## Impact

- `packages/studio`: new Versions screen (list + diff), new migration-plan
  screen (author + orphan-key dry run), publish action wired into the existing
  process list/edit screen.
- `src/http/studio-routes.ts`: new routes for draft publish, version-body
  fetch, migration plan create/get, and orphan-key dry run — all
  `system:developer`-gated (publish additionally `system:publish`-gated),
  unprefixed (not `/admin`). The publish route is the first `studio-routes.ts`
  handler that needs `registry`/`dataSourceRegistry` (currently plumbed only
  to `routes.ts`'s `handlePublish`), so `src/http/server.ts` gains that
  plumbing for `studio-routes.ts` for the first time.
- No schema change: `migration_plans` and `drafts` tables already exist
  (roadmap #3, #11). No change to `POST /processes` (`system:publish`) itself
  — Studio no longer calls it directly at all, publishing through the new
  draft-scoped route instead.
- Does not touch `packages/admin` or `admin-migration-run`'s eventual `POST
  /admin/migrations/run` — that route consumes plans this change lets a
  developer create, but stays a separate change.
