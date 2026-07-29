## Context

`src/engine/migration.ts` already ships the full migration path. A developer
registers a plan first. `registerMigrationPlan` does this; `studio-lifecycle`
exposes it to Studio as
`PUT /migration-plans/:processId/:fromVersion/:toVersion`. The engine
freezes the plan on first use. `migrateInstances` then executes the plan,
fault-isolated per instance. It reports instance ids grouped
`migrated`/`skipped`/`conflicted`/`failed`. Nothing calls `migrateInstances`
outside `test/migration.test.ts` today.

`admin-operations-api` already sets the pattern this change follows. A thin
`handleX` in `src/http/admin-routes.ts` resolves the actor. It calls
`requireRole(actor, ADMIN_ROLE)`. Then it calls one existing engine function
and returns its result.

`studio-routes.ts::handlePutMigrationPlan` shows the closest existing
migration-plan route. It parses path params with `parseVersion`. It parses
the JSON body inside a try/catch that raises `RequestShapeError` on a parse
error. It lets `MigrationPlanError` fall through to `mapError`. `mapError`
already maps that error to 409 with type `migration-plan`.

## Goals / Non-Goals

**Goals:**
- Let an actor holding `system:admin` execute an already-registered
  migration plan from `packages/admin`. Show which instances migrated,
  which the engine skipped, and why.
- Reuse `migrateInstances` and its errors unchanged.

**Non-Goals:**
- Authoring or editing a migration plan (`studio-lifecycle`'s job).
- Live progress reporting during a run. `migrateInstances` runs to
  completion and returns one result. A running-instance-count-sized plan
  finishes inside an HTTP request's normal timeout. This change adds no job
  queue and no polling.
- Per-skip-reason detail beyond the id lists `MigrationResult` already
  carries. Each instance's own `migration.skipped` `InstanceEvent` already
  carries that detail. An operator reads it through the existing
  instance-record route. Duplicating it into the run response would open a
  second, driftable source for the same fact.

## Decisions

**One route, request-body-carried target.** `POST /admin/migrations/run`
takes a JSON body: `{ processId, fromVersion, toVersion }`. It does not take
three path segments like the Studio plan routes do. A run is an action, not
a resource fetch. Two existing routes already carry a body for an action
with no further input this way: `POST /instances/:id/cancel` and
`POST /admin/outbox/:key/retry`. This route follows that convention.

`fromVersion`/`toVersion` need the same type coercion `parseVersion` applies
to path segments. The handler applies that check to the body fields itself.
It does not import `parseVersion` from `studio-routes.ts`: that file is
`system:developer`-scoped, and `admin-routes.ts` must not depend on it.

**Return `MigrationResult` verbatim.** No new response envelope. The
operator screen groups by the four existing arrays. Nothing about the
response needs a shape `migrateInstances` does not already return.

**No new outbox, schema, or engine code.** `migrateInstances` already
commits each instance in its own row-locked transaction. It reports
migrated/skipped/conflicted/failed with no caller-visible partial state. The
route is a pass-through.

**Confirmation lives in the UI, not the API.** The route runs the migration
on any valid request. It takes no dry-run flag. `findOrphanKeys` (already
exposed at `GET /processes/:id/versions/:version/orphan-keys`) is the
existing pre-flight check, but that route needs `system:developer`, which a
`system:admin` actor does not necessarily hold. The admin screen names that
check in its confirmation text as a recommendation, not a link it calls
itself. The route itself SHALL NOT add a second, redundant dry-run mode.

## Risks / Trade-offs

- [Risk] A plan covering a large running-instance population could exceed a
  request timeout. → Mitigation: none added in this change. No current
  process has a running-instance population close to blocking one HTTP
  request. A later change can add an async job path if that changes. This
  change does not build that path ahead of need.
- [Risk] An operator picks the wrong `fromVersion`/`toVersion` pair for a
  run. → Mitigation: the confirmation step names the process and both
  versions. The engine also rejects a bad pair on its own, via
  `MigrationPlanError`.

## Migration Plan

Additive only: one new route, one new admin screen. No schema change, no
existing route touched, no rollback beyond reverting the change.

## Open Questions

None. The engine already settles the migration behavior. This change only
exposes it.
