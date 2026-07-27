# admin-operations-api Specification

## Purpose

The operator-facing server surface stage 10's first change adds:
`system:admin` gating (defined by, and shared with, the `authorization`
capability), `src/engine/admin-queries.ts` (outbox rows by status, outbox
counts, pending timers, and the two outbox dead-letter repairs — requeue and
discard), and the `/admin/*` routes in their own file,
`src/http/admin-routes.ts`, that expose them. Kept separate from
`src/http/routes.ts`, which stays the participant-facing surface routed by the
`http-wrapper` capability. See the `admin-app` capability for the frontend
that consumes these routes.

## Requirements

### Requirement: A third reserved role gates every operator-facing route

The engine SHALL define `ADMIN_ROLE = "system:admin"` in
`src/auth/authorize.ts`, alongside `PUBLISH_ROLE` and `CANCEL_ANY_ROLE`, and
SHALL check it with the same direct `requireRole` call — no policy engine, no
role hierarchy, no extension point. Every `/admin/*` route SHALL require it.
The check SHALL run after the actor resolves and before any read or write is
performed, so an unresolvable credential is still a 401 and an insufficient one
a 403.

Holding `system:admin` SHALL NOT imply `system:publish` or
`system:cancel-any`; the three roles are independent strings on `Actor.roles`.

#### Scenario: An authenticated actor without the role is refused

- **WHEN** any `/admin/*` route is requested with a resolvable credential whose
  `roles` does not include `"system:admin"`
- **THEN** the response is 403 with a typed error body, and no query or update
  is performed

#### Scenario: An unresolvable credential is refused before the role is considered

- **WHEN** any `/admin/*` route is requested with no resolvable credential
- **THEN** the response is 401

#### Scenario: The role does not imply the other two

- **WHEN** an actor holding only `"system:admin"` requests `POST /processes`
- **THEN** the response is 403, unchanged by this capability

### Requirement: Outbox rows are readable by status

`src/engine/admin-queries.ts` SHALL expose `listOutbox(filter, page, db)`
returning a `Page` of outbox rows, filterable by a set of `status` values and
by `instanceId`, ordered newest-first and keyset-paged on
`(created_at, idempotency_key)` with the same opaque cursor encoding
`listInstances` uses. Absent filters SHALL mean "unfiltered", never an error.

Each row SHALL carry `idempotencyKey`, `instanceId`, `transitionSeq`,
`actionId`, the action's `type`, `status`, `attempts`, `nextAttemptAt`,
`createdAt`, `claimedAt` and `lastError`. The action's `config` SHALL NOT be
included — it may hold credentials, and no operator screen needs it.

The read SHALL be exposed as `GET /admin/outbox`, translating `status`
(repeatable), `instanceId`, `limit` and `cursor` query parameters, rejecting a
`limit` that is not a positive integer as a request error.

#### Scenario: Listing dead letters

- **WHEN** `GET /admin/outbox?status=dead-letter` is requested by an actor
  holding `system:admin`
- **THEN** the response is 200 and carries only rows whose status is
  `dead-letter`

#### Scenario: Repeating the status parameter widens the filter

- **WHEN** `GET /admin/outbox?status=pending&status=dead-letter` is requested
  by an actor holding `system:admin`
- **THEN** rows of both statuses are returned

#### Scenario: Handler config is never returned

- **WHEN** an outbox row whose action carries a `config` is listed
- **THEN** the returned row carries the action's `type` and no `config`

#### Scenario: Paging

- **WHEN** `GET /admin/outbox?limit=2` is requested and more than two rows match
- **THEN** the response carries two rows and a cursor, and requesting the same
  route with that cursor carries the following rows

### Requirement: Outbox rows are countable by status

`admin-queries.ts` SHALL expose `countOutboxByStatus(db)` returning a count per
distinct `status` value present in the table, so the outbox screen can show the
backlog without paging through it. A status with no rows SHALL simply be absent
from the result rather than reported as zero.

The counts SHALL be carried on the `GET /admin/outbox` response alongside the
page.

#### Scenario: Counts reflect the table

- **WHEN** the outbox holds three `pending` rows and one `dead-letter` row and
  `countOutboxByStatus` is called
- **THEN** it reports `pending: 3` and `dead-letter: 1`

### Requirement: A failing delivery records its error on the outbox row

The `outbox` table SHALL carry a nullable `last_error text` column, added
idempotently by `initSchema` in the same manner as `claimed_at`, `event_id`
and `field_version`. `drainOutbox` SHALL write the failure message onto the row
in both failure branches — the dead-letter branch and the retry branch — and
SHALL clear it to `NULL` on a successful delivery, so the column always
describes the row's current state rather than a historical one.

This SHALL NOT replace or duplicate the `ActionOutcome` written to the record
that enqueued the action; it is a denormalized copy that makes an outbox
listing self-sufficient.

#### Scenario: A transient failure records the error and keeps retrying

- **WHEN** a delivery fails transiently and the row returns to `pending`
- **THEN** the row's `last_error` carries the failure message

#### Scenario: A dead-lettered row carries the error that killed it

- **WHEN** a delivery fails permanently, or exhausts its attempts
- **THEN** the row's status is `dead-letter` and its `last_error` carries the
  failure message

#### Scenario: A successful delivery clears a previous error

- **WHEN** a row that had failed at least once is subsequently delivered
- **THEN** its status is `delivered` and its `last_error` is null

### Requirement: A dead letter can be requeued

`admin-queries.ts` SHALL expose `requeueOutboxRow(idempotencyKey, db)`, which
SHALL set the row's `status` to `pending`, `attempts` to `0`, `next_attempt_at`
to now and `claimed_at` to null, guarded by `WHERE idempotency_key = $1 AND
status = 'dead-letter'`. It SHALL report whether a row was affected.

Resetting `attempts` is required: the row dead-lettered because it reached
`MAX_ATTEMPTS`, so requeueing without the reset would dead-letter again on the
next drain. The `idempotency_key` SHALL be preserved, so a handler that honours
it deduplicates a side effect that already partly happened.

The operation SHALL be exposed as `POST /admin/outbox/:idempotencyKey/retry`,
returning 200 with the updated row, 404 when no such row exists, and 409 when
the row exists but is not a dead letter.

#### Scenario: Requeueing a dead letter

- **WHEN** `POST /admin/outbox/:key/retry` is requested for a `dead-letter` row
  by an actor holding `system:admin`
- **THEN** the row's status is `pending`, its `attempts` is 0, its
  `next_attempt_at` is not in the future, and the next drain pass claims it

#### Scenario: Requeueing a row that is not a dead letter

- **WHEN** `POST /admin/outbox/:key/retry` is requested for a `delivered` row
- **THEN** the response is 409 and the row is unchanged

#### Scenario: Requeueing an unknown row

- **WHEN** `POST /admin/outbox/:key/retry` is requested for an
  `idempotencyKey` that does not exist
- **THEN** the response is 404

### Requirement: A dead letter can be discarded without deleting the row

`admin-queries.ts` SHALL expose `discardOutboxRow(idempotencyKey, db)`, which
SHALL set the row's `status` to `discarded`, guarded by `WHERE idempotency_key
= $1 AND status = 'dead-letter'`, and SHALL report whether a row was affected.
The row SHALL NOT be deleted: `idempotency_key` is the primary key and the
deduplication anchor, so removing it would let a replayed transition re-enqueue
the same action, turning a deliberate discard into a redelivery.

`discarded` SHALL be inert to every existing consumer without a change to it:
`drainOutbox` claims only a due `pending` row or a lease-expired `claimed` row,
and `migrateInstances` locks and remaps every non-`delivered` row of an
instance in `field_version` lock-step while skipping an instance only for a
*live-claimed* row.

The operation SHALL be exposed as `POST /admin/outbox/:idempotencyKey/discard`
with the same 200/404/409 mapping as retry.

#### Scenario: Discarding a dead letter

- **WHEN** `POST /admin/outbox/:key/discard` is requested for a `dead-letter`
  row by an actor holding `system:admin`
- **THEN** the row's status is `discarded` and the row still exists

#### Scenario: A discarded row is never delivered

- **WHEN** the outbox drain runs after a row was discarded
- **THEN** the row is not claimed and its status stays `discarded`

#### Scenario: A discarded row does not block or break a migration

- **WHEN** an instance holding a `discarded` outbox row is migrated
- **THEN** the instance migrates rather than being skipped `pending-actions`,
  and the discarded row's `field_version` is bumped with the rest

### Requirement: Pending timers are readable

`admin-queries.ts` SHALL expose `listPendingTimers(page, db)` returning
running instances whose `next_timer_at` is set, ordered by `next_timer_at`
ascending so the most overdue comes first, keyset-paged. Each entry SHALL carry
`instanceId`, `processId`, `version`, `currentStepId` and `nextTimerAt`.

The read SHALL be exposed as `GET /admin/timers`, accepting `limit` and
`cursor`.

#### Scenario: Overdue timers come first

- **WHEN** `GET /admin/timers` is requested by an actor holding `system:admin`
  and two running instances have `next_timer_at` values in the past and the
  future respectively
- **THEN** the past one is listed before the future one

#### Scenario: Instances with no armed timer are absent

- **WHEN** a running instance has a null `next_timer_at`
- **THEN** it does not appear in the listing

#### Scenario: A non-running instance is absent

- **WHEN** a completed or cancelled instance still carries a `next_timer_at`
- **THEN** it does not appear in the listing

### Requirement: The operator routes live in their own file

The `/admin/*` handlers SHALL live in `src/http/admin-routes.ts`, separate from
`src/http/routes.ts`, which stays the participant-facing surface. They SHALL
use the same framework-agnostic handler shape (`handleX(...): Promise<HttpResult>`),
the same error-to-status mapping from `src/http/errors.ts`, and SHALL be
dispatched from `src/http/server.ts` like every other route. No new error type,
no new response envelope, and no new CORS mechanism SHALL be introduced.

#### Scenario: Errors map through the existing mapping

- **WHEN** an `/admin/*` handler raises `AuthorizationError`
- **THEN** the response is 403 with the same typed error body shape publish
  already produces

#### Scenario: The participant route file gains no admin handler

- **WHEN** `src/http/routes.ts` is inspected
- **THEN** it contains no `/admin/*` handler
