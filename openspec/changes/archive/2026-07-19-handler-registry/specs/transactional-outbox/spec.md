# transactional-outbox

## MODIFIED Requirements

### Requirement: A worker delivers pending rows at-least-once after commit

A delivery worker SHALL deliver pending outbox rows in three separable steps: it
SHALL **claim** a due row — marking it `claimed` with a lease — and commit before
invoking the handler; it SHALL invoke the handler **outside any transaction**; and
it SHALL **mark** the row `delivered` in a second transaction that compare-and-sets
on the `claimed` state and applies the action's effects in the same commit.
Delivery SHALL be at-least-once: a row not yet marked delivered — including after a
process restart, and a `claimed` row whose lease has expired (a crashed worker) —
MUST be reclaimed and delivered, never dropped.

#### Scenario: The handler runs off the row lock
- **WHEN** the worker claims a due row
- **THEN** it commits the claim and releases the row lock before invoking the handler, so the handler executes holding no database lock

#### Scenario: The delivered mark and its effects are one atomic, once-only unit
- **WHEN** the mark transaction runs after a successful handler invocation
- **THEN** it compare-and-sets the row from `claimed` to `delivered` and applies the action's effects in the same commit, so a reclaimed-then-late worker cannot mark or apply twice

#### Scenario: A stale claim is reclaimed
- **WHEN** a `claimed` row's lease has expired because its worker crashed before marking it
- **THEN** a later drain re-leases it (a fresh claim) and delivers it, never dropping it

#### Scenario: Undelivered rows survive a restart
- **WHEN** the worker process restarts while pending or expired-claim rows remain
- **THEN** those rows are claimed and delivered after restart
