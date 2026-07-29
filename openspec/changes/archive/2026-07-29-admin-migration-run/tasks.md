## 1. Engine-side route

- [x] 1.1 Add `handleAdminRunMigration(req, resolver, db)` to
      `src/http/admin-routes.ts`: resolve the actor, `requireRole(actor,
      ADMIN_ROLE)`, parse the JSON body (`RequestShapeError` on parse
      failure, matching `handlePutMigrationPlan`'s try/catch), coerce
      `fromVersion`/`toVersion` to integers with the same rejection rule
      `parseVersion` uses (`RequestShapeError` on a non-integer), call
      `migrateInstances(processId, fromVersion, toVersion, db)`, and return
      its `MigrationResult` with status 200.
- [x] 1.2 Wire `POST /admin/migrations/run` into `src/http/server.ts`'s
      path-parts dispatch, next to the other `/admin/*` routes.
- [x] 1.3 Add `test/admin-routes.test.ts` (or extend the existing admin
      route test file) covering: a successful run against a registered
      plan; a 409 for an unregistered plan (`MigrationPlanError` through
      `mapError`); a request error for a non-integer `fromVersion`/
      `toVersion`; a 403 for an actor without `system:admin`.

## 2. Admin UI: Migrations screen

- [x] 2.1 Add `packages/admin/src/screens/MigrationsScreen.tsx`: a
      process/`fromVersion`/`toVersion` picker backed by `GET /processes`
      and `GET /processes/:id/versions`, a confirmation step naming the
      process and both versions plus the orphan-key-check recommendation,
      and a result view grouping returned instance ids into four buckets.
- [x] 2.2 Add `packages/admin/src/screens/migrationsLogic.ts`: pure,
      `bun:test`-covered logic for grouping a `MigrationResult` into its
      four buckets and for the confirmation-text assembly, following
      `instancesLogic.ts`'s split between logic and component.
- [x] 2.3 Wire the `/migrations` route into `packages/admin/src/App.tsx`
      and `routing.ts`, alongside the existing Operations screens, gated
      the same way as every other screen (hidden without `system:admin`).
- [x] 2.4 Add a nav entry for Migrations in the admin shell.

## 3. Manual verification

- [x] 3.1 In the devcontainer, register a migration plan for two published
      versions of an example process (`PUT /migration-plans/...`, already
      built by `studio-lifecycle`), then run it from the new Migrations
      screen and confirm the bucketed result matches the instances that
      existed on the source version.
- [x] 3.2 Confirm a run against an unregistered plan shows the inline 409
      error and confirm an actor without `system:admin` cannot reach
      `/migrations`.

## 4. Verification

- [x] 4.1 Run `bun run typecheck` in the devcontainer.
- [x] 4.2 Run the full `bun test` suite in the devcontainer with
      `DATABASE_URL` set, and confirm the reported skip count is 0 (a
      silent skip is not a pass).
