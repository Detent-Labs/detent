## Why

Roadmap stage 10 (Admin area) has one remaining NOT-STARTED item:
`admin-migration-run`. `studio-lifecycle` already lets a developer author and
register a migration plan (`registerMigrationPlan`/`resolveMigrationPlan`).
It also supports an orphan-key dry run. But *executing* a plan against
running instances
(`migrateInstances`, `src/engine/migration.ts`) has no operator-facing route
today. Only a test or a script can reach it. Running a migration is an
operations action: it mutates live instance state. It belongs with the
operator's other actions (cancel, outbox retry/discard) in `packages/admin`,
not with authoring in Studio.

## What Changes

- Add `POST /admin/migrations/run` to `src/http/admin-routes.ts`, gated by
  `system:admin` like every other `/admin/*` route. It accepts `processId`,
  `fromVersion`, `toVersion` and calls the existing `migrateInstances` engine
  function unchanged.
- Return the `MigrationResult` (`migrated`/`skipped`/`conflicted`/`failed`
  instance-id arrays) as the response body. No new result shape.
- Add a "Run migration" action to `packages/admin`: a form to pick
  `processId`/`fromVersion`/`toVersion`. A plan must already exist, matching
  `migrateInstances`' own precondition, so a missing plan returns 409 through
  the existing `MigrationPlanError` mapping. The form has a confirmation
  step, since this mutates live instances. A result view groups the returned
  instance ids by outcome bucket.
- No engine or schema change: `registerMigrationPlan`, `resolveMigrationPlan`,
  `migrateInstances`, and the `migration_plans` table are all reused
  unmodified.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `admin-operations-api`: adds the `POST /admin/migrations/run` route and its
  `system:admin` gating, error mapping, and request/response shape.
- `admin-app`: adds the "Run migration" screen/action and its result display.

## Impact

- `src/http/admin-routes.ts`: new route handler.
- `src/http/server.ts`: dispatch entry for the new route (same pattern as
  every existing `/admin/*` route).
- `packages/admin`: new screen/action, no changes to existing screens.
- No changes to `src/engine/migration.ts`, `src/auth/authorize.ts`, or any
  database schema.
