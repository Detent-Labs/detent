<!-- antislop: allow-file passive-voice sentence-length em-dash run-ons synonym-rotation long-words -->
<!-- The MODIFIED Requirements section below carries the main spec's
     existing requirement bodies verbatim (per the MODIFIED-requirements
     workflow: paste the entire existing block, don't lose detail), plus
     one new scenario each. Normative text is unchanged; each invariant
     it already states was correct, only the implementation was wrong. -->
## MODIFIED Requirements

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

#### Scenario: Two rows created within the same millisecond page correctly

- **WHEN** two outbox rows were created within the same millisecond of each
  other
- **AND** the read is called with `limit: 1`, returning the newer one and a
  cursor
- **THEN** the older row is returned on the second page, not dropped from the
  walk

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

#### Scenario: Two timers armed within the same millisecond page correctly

- **WHEN** two running instances have `next_timer_at` values within the same
  millisecond of each other
- **AND** the read is called with `limit: 1`, returning the more-overdue one
  and a cursor
- **THEN** the other instance is returned on the second page, not duplicated
  from the first
