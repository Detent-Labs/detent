# Spec Delta

## MODIFIED Requirements

### Requirement: Pending timers are readable

<!-- antislop: allow passive-voice - copied from the live spec -->

`admin-queries.ts` SHALL expose `listPendingTimers(page, db)` returning
running instances whose `next_timer_at` is set, ordered by `next_timer_at`
ascending so the most overdue comes first, keyset-paged. Each entry SHALL carry
`instanceId`, `processId`, `version`, `currentStepId` and `nextTimerAt`.

The read SHALL be available as `GET /admin/timers`, accepting `limit`, `cursor`
and `instanceId`. With `instanceId`, the read SHALL return only that
instance's entry. It SHALL return no entry when the instance is not running or
has no armed timer. The filter SHALL apply before the page limit.

#### Scenario: Overdue timers come first

<!-- antislop: allow passive-voice - the delta copies this scenario from the live spec verbatim -->
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

<!-- antislop: allow passive-voice trailing-negation - copied from the live spec -->
- **WHEN** two running instances have `next_timer_at` values within the same
  millisecond of each other
- **AND** the read is called with `limit: 1`, returning the more-overdue one
  and a cursor
- **THEN** the other instance is returned on the second page, not duplicated
  from the first

#### Scenario: Filtering by instance finds a timer past the first page

- **WHEN** more running instances with armed timers exist than the `limit`
  allows
- **AND** the instance named by `instanceId` sorts after them all
- **THEN** `GET /admin/timers?instanceId=<id>&limit=1` returns that
  instance's entry

#### Scenario: Filtering by an instance with no armed timer

- **WHEN** `instanceId` names a running instance with a null `next_timer_at`
- **OR** it names a non-running instance
- **OR** it names an unknown id
- **THEN** the response returns an empty item list and no cursor
