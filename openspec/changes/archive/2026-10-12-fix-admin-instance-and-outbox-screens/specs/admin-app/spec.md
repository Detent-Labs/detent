# Spec Delta

## MODIFIED Requirements

### Requirement: An instance's diagnostic view is the merged record

<!-- antislop: allow sentence-length - copied from the live spec -->

The `/instances/:id` screen SHALL show a header carrying process, version,
`definitionHash`, status, current step, `transitionSeq`, claim state and armed
timers, above a single chronological timeline built from
`GET /instances/:id/record`.

The header SHALL read `transitionSeq`, the claim state and the label locale of
the current step from `GET /instances/:id`. The claim state SHALL come from
the view's `assignment.claimedBy`. The armed timer SHALL come from
`GET /admin/timers` filtered to the instance. The header SHALL NOT derive any
of these from the loaded part of the record.

<!-- antislop: allow sentence-length passive-voice em-dash - copied from the live spec -->

Both element kinds SHALL be rendered: a `transition` element with its cause,
path, resulting step and per-action `ActionOutcome`s, and an `event` element
with its `kind` and kind-specific payload. The diagnostic kinds SHALL be
legible as such — in particular `subprocess.outcome-unmatched`, `timer.unarmed`
and `instance.faulted`, which are what answers "why is this parked?".

The screen SHALL offer cancellation via the existing
`POST /instances/:id/cancel`. It SHALL NOT offer a forced transition or a
direct edit of instance `data`.

#### Scenario: A parked instance shows why

<!-- antislop: allow passive-voice - copied from the live spec -->
- **WHEN** an instance holds a `subprocess.outcome-unmatched` event
- **THEN** that event appears in the timeline with its payload

#### Scenario: Action outcomes are visible

<!-- antislop: allow passive-voice - copied from the live spec -->
- **WHEN** a transition enqueued actions
- **THEN** each action's outcome, including a `dead-letter` one, is shown with
  that transition

#### Scenario: No state-writing controls beyond cancel

<!-- antislop: allow passive-voice - copied from the live spec -->
- **WHEN** the instance screen is inspected for write actions
- **THEN** cancel is the only one

#### Scenario: A submitted step does not show its old claim

- **WHEN** an actor claims a step and submits it
- **AND** the instance moves to a step with no claimant
- **AND** the operator opens the instance screen
- **THEN** the claim state reads as unclaimed, as `GET /instances/:id` does
- **AND** the record still holds the earlier `assignment.claimed` event

#### Scenario: A long record leaves the header right

- **WHEN** the instance holds more than one page of record elements
- **AND** the screen has loaded the first page only
- **THEN** `transitionSeq` in the header equals the value from
  `GET /instances/:id`

#### Scenario: A timer beyond the first 200 still shows

- **WHEN** more than 200 running instances have an armed timer
- **AND** this instance's timer sorts after place 200
- **THEN** the header shows this instance's fire time
- **AND** the header does not read "No timer armed"

### Requirement: The outbox screen exposes the two repairs

<!-- antislop: allow sentence-length long-words - copied from the live spec -->

The `/outbox` screen SHALL show the per-status counts and a filterable list of
rows carrying action type, instance, attempt count, last error and idempotency
key. On a `dead-letter` row it SHALL offer retry and discard, each calling the
corresponding `/admin/outbox/:key/*` route.

<!-- antislop: allow passive-voice sentence-length - copied from the live spec -->

Retry SHALL be presented with a confirmation that states the side effect may
re-run, and that a handler honouring the idempotency key deduplicates it
downstream.

Discard SHALL ask for a confirmation as well. That confirmation SHALL state
three facts: the discard is final, the side effect never goes out, and no
retry follows. A declined confirmation SHALL send no request.

#### Scenario: Retrying from the list

<!-- antislop: allow passive-voice - copied from the live spec -->
- **WHEN** the operator retries a dead-lettered row
- **THEN** `POST /admin/outbox/:key/retry` is called and the row's status is
  shown as `pending` after the refresh

<!-- antislop: allow passive-voice - copied from the live spec -->
#### Scenario: Repairs are offered only on dead letters

<!-- antislop: allow passive-voice - copied from the live spec -->
- **WHEN** a `pending`, `claimed` or `delivered` row is displayed
- **THEN** neither retry nor discard is offered on it

#### Scenario: Discarding asks first

- **WHEN** the operator chooses discard on a dead-lettered row
- **THEN** a confirmation states that the discard is final and no retry
  follows
- **AND** the screen calls `POST /admin/outbox/:key/discard` only after the
  operator confirms

#### Scenario: Declining the discard sends nothing

- **WHEN** the operator declines the discard confirmation
- **THEN** the screen sends no request
- **AND** the row stays `dead-letter`
