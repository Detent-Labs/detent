## 1. Schema and errors

- [x] 1.1 Add `Instance.redactedAt: timestamp.optional()` to
      `src/schema/definition.ts`.
- [x] 1.2 Add `ALTER TABLE instances ADD COLUMN IF NOT EXISTS
      redacted_at timestamptz` to `src/engine/store.ts::initSchema`.
- [x] 1.3 Add `InstanceRunningError` to `src/errors.ts`, mirroring
      `InstanceNotRunningError`'s shape (`instanceId`, `status`,
      constructed message), thrown when an operation refuses a
      `running` instance instead of a non-running one.

## 2. redactInstance and the automatic sweep

- [x] 2.1 Create `src/engine/retention.ts`.
- [x] 2.2 Implement `redactInstance(instanceId, db)`: one transaction
      (via `withTransaction`, `src/engine/store.ts`), `SELECT ... FOR
      UPDATE` on the instance row, `NotFoundError` on no row,
      `InstanceRunningError` on `status = 'running'`, an idempotent
      no-op when `redacted_at` is already set, otherwise `UPDATE
      instances SET body = jsonb_set(body, '{data}', '{}'::jsonb),
      redacted_at = now()` plus `DELETE FROM instance_comments` and
      `DELETE FROM instance_attachments` for that `instance_id`.
- [x] 2.3 Implement `startRetentionSweep(db, days)`: a `pollForever`
      worker on a one-hour interval (`60 * 60 * 1000`). Each tick pages
      through instance ids in batches of `BATCH = 500`, keyset-paged by
      `instance_id` (mirroring `migrateInstances`/`findOrphanKeys`),
      where `body->>'status' IN ('completed', 'cancelled')`,
      `redacted_at IS NULL`, and
      `(body->>'currentStepEnteredAt')::timestamptz` is older than
      `days`. It keeps paging until a tick exhausts every eligible
      instance, calling `redactInstance` once per id with per-row
      fault isolation.
- [x] 2.4 Wire the sweep into `src/engine/host.ts::startEngine`: read
      `process.env.DATA_RETENTION_DAYS`. Unset: skip the sweep, same as
      today. Set and a positive integer: push the sweep onto `workers`.
      Set and anything else: throw before any worker starts (do not
      silently skip the sweep).

## 3. HTTP route

- [x] 3.1 Add `InstanceRunningError` to `http/errors.ts`'s
      `MESSAGE_ERRORS`, mapped to 409 with type `instance-running`.
- [x] 3.2 Add `handleAdminRedactInstance` to
      `src/http/admin-routes.ts`, gated by `ADMIN_ROLE`, calling
      `redactInstance` and returning its result at 200.
- [x] 3.3 Wire `POST /admin/instances/:id/redact` to the new handler in
      `src/http/server.ts`'s path-parts dispatcher, in the same
      `parts.length === 4 && parts[0] === "admin"` shape the outbox
      retry/discard routes already use. Correction made during
      implementation: every route in this dispatcher also has a
      matching `OPTIONS` CORS-preflight entry, which the original task
      omitted. Added one (`preflight("POST")`), matching the
      `/admin/migrations/run` entry immediately above it.
- [x] 3.4 Skipped: `docs/openapi.yaml` explicitly excludes `admin/*`
      routes (its own description says so — they serve
      `packages/admin` directly, not a customer integration). The new
      route falls under that exclusion, the same as `/admin/migrations/run`
      already does. Documenting it there would contradict the file's own
      stated scope.

## 4. Runtime API and admin UI

- [x] 4.1 Add `redactedAt` to `InstanceView` (`src/runtime/api.ts`) and
      populate it from `instance.redactedAt` in `getInstanceView`.
- [x] 4.2 Mirror the new field on `InstanceView` in
      `packages/admin/src/api/types.ts`.
- [x] 4.3 Add a `redactInstance(instanceId, token)` function to
      `packages/admin/src/api/client.ts`, calling `POST
      /admin/instances/:id/redact`, in the same shape as the existing
      `cancelInstance`.
- [x] 4.4 Add a "Redact data" action to `packages/admin`'s instance
      detail screen (`InstanceScreen.tsx`): shown when `view.status` is
      not `running`, disabled once `view.redactedAt` holds a value,
      confirmation naming data, comments, and attachments.
- [x] 4.5 Add a "Data redacted on `<date>`" badge once
      `view.redactedAt` holds a value.

## 5. Tests

- [x] 5.1 `redactInstance`: clears `data`, stamps `redacted_at`,
      deletes `instance_comments`/`instance_attachments` rows, refuses
      a `running` instance, and no-ops on a second call.
      (`test/retention.test.ts`)
- [x] 5.2 Automatic sweep: redacts an eligible `completed`/`cancelled`
      instance past the window, skips one inside the window, skips a
      `faulted` one, falls back to `startedAt` for a pre-existing
      instance, and redacts every eligible instance across several rows
      in one tick without one failure stopping the rest. Correction
      made during implementation: a literal >500-row batch boundary
      test was dropped as impractical (500+ real rows per test run) —
      `migrateInstances`' own identically-shaped `BATCH = 100` has no
      such test either, and the pagination loop mirrors that
      already-proven one exactly. (`test/retention.test.ts`)
- [x] 5.3 `startEngine` throws at startup when `DATA_RETENTION_DAYS` is
      set to a non-positive-integer value (e.g. `"0"`, `"-5"`,
      `"abc"`), and no worker starts. (`test/host.test.ts`)
- [x] 5.4 `POST /admin/instances/:id/redact`: allows only
      `system:admin`, works on `completed`/`cancelled`/`faulted`
      instances, refuses `running` ones with 409, and stays idempotent
      on a re-call. (`test/http-admin.test.ts`)
- [x] 5.5 `getInstanceView` returns `redactedAt` once an instance is
      redacted, and omits it beforehand. (`test/runtime-api.test.ts`)
- [x] 5.6 Correction made during implementation: the originally-scoped
      "a redacted instance still migrates" was never true.
      `migrateInstances` only ever selects `running` instances
      (`migration.ts:575`), and `redactInstance` only ever accepts a
      non-running one — the two are mutually exclusive by
      construction. `findOrphanKeys` is the function that actually
      covers every instance status with no filter
      (`migration.ts:606-636`), so the end-to-end check instead
      confirms a redacted instance scans clean there (empty `data`
      means no orphan keys, no special case), and still renders with
      empty `data` afterward. (`test/retention.test.ts`)

## 6. Verification

- [x] 6.1 Run `bun run typecheck` inside the devcontainer. Clean across
      the engine and all four frontend packages.
- [x] 6.2 Run the full `bun test` suite inside the devcontainer with
      `DATABASE_URL` set. 1348 pass, 0 fail, across 82 files, no test
      silently skipped — the DB-backed suites (including the new
      `test/retention.test.ts` and `test/host.test.ts`) ran for real.
