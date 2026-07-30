## Why

The runtime record is append-only by design. Nothing is ever archived or
deleted today. Storage grows unbounded, and a GDPR erasure request has no
defined mechanism against an append-only audit trail. Roadmap #20's design
(`docs/superpowers/specs/2026-07-30-data-retention-deletion-design.md`) is
already approved. This change implements it, plus the addendum that stage
23b/23c (instance comments, instance attachments) added afterward.

## What Changes

- Add a new nullable `instances.redacted_at timestamptz` column and a
  matching optional `Instance.redactedAt` field.
- Add `redactInstance(instanceId, db)` (`src/engine/retention.ts`): clears
  `instances.body.data` to `{}`, stamps `redacted_at = now()`, refuses a
  `running` instance, and is idempotent (a second call affects zero rows).
  It also deletes that instance's `instance_comments` and
  `instance_attachments` rows in the same operation, per the roadmap's
  2026-07-30 addendum. Those two tables can carry personal data outside
  `instances.body.data`, and they post-date the original design.
- Add an automatic sweep (`src/engine/retention.ts`, wired into
  `src/engine/host.ts`'s existing poll-loop pattern, running hourly). It
  redacts `completed`/`cancelled` instances past a configured window,
  paging through eligible instances in bounded batches of 500. It
  excludes `faulted` instances.
- The sweep runs only once an operator sets `DATA_RETENTION_DAYS` to a
  positive integer. There is no default value, a deliberate departure
  from the `DATABASE_URL` convention: this behavior is destructive and
  irreversible. An invalid-but-set value fails engine startup outright,
  rather than silently leaving the sweep off.
- Add `POST /admin/instances/:id/redact` (`src/http/admin-routes.ts`),
  gated by the existing `system:admin` role, for the manual/on-demand
  erasure case. It works on `completed`/`cancelled`/`faulted` instances,
  refuses `running` ones, and matches `cancelInstance`'s existing
  non-running-precondition response shape.
- `InstanceView` (`src/runtime/api.ts`) gains a `redactedAt` field, mirrored
  in `packages/admin/src/api/types.ts`. `packages/admin/src/api/client.ts`
  gains a `redactInstance` call. Together these let the admin UI read
  redaction state and trigger the new route.
- `packages/admin`'s instance detail screen gains a "Redact data" action.
  It is hidden while `running` and disabled once already redacted. The
  screen also shows a "Data redacted on `<date>`" badge once
  `redactedAt` holds a value.

## Capabilities

### New Capabilities
- `data-retention`: `redactInstance`'s clearing semantics (data, comments,
  attachments), the `running`-instance refusal, and idempotency. Also the
  automatic sweep's eligibility rules (`completed`/`cancelled` past the
  window, `faulted` excluded), active only once an operator sets
  `DATA_RETENTION_DAYS`.

### Modified Capabilities
- `persistence`: new nullable `instances.redacted_at` column.
- `admin-operations-api`: new `POST /admin/instances/:id/redact` route.
- `admin-app`: instance detail screen gains the redact action and badge.

## Impact

- `src/schema/definition.ts`: `Instance.redactedAt` (optional).
- `src/engine/store.ts::initSchema`: additive column.
- `src/engine/retention.ts`: new module (`redactInstance`, sweep loop).
- `src/engine/host.ts`: wires the sweep into the existing worker set.
- `src/http/admin-routes.ts`, `src/http/server.ts`, `src/http/errors.ts`:
  new route, its dispatch entry, and a response mapping for the
  running-instance refusal.
- `src/runtime/api.ts`: `InstanceView` gains `redactedAt`.
- `packages/admin`: `api/types.ts` and `api/client.ts` gain the matching
  field and call; the instance detail screen gains the action and badge.
- This change does not touch `docs/openapi.yaml`. Its own description
  excludes `admin/*` routes, the same exclusion `/admin/migrations/run`
  already falls under; the new route is `admin/*` too.
