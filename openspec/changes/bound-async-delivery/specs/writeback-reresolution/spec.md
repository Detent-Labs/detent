## MODIFIED Requirements

### Requirement: Re-resolution isolates a poison instance from the batch

Each claimed instance SHALL be processed inside its own error boundary, covering the row body parse and
the body resolution as well as `resolveAutomatic`. A parse failure, a resolver that returns nothing, or a
resolver that throws SHALL leave that one instance for a later pass and leave every other claimed instance
in the pass to be processed. A single poison instance SHALL NOT abort the pass and strand the rest of the
batch until their lease elapses.

A failing instance SHALL NOT be returned to the immediately-eligible `pending`
state. Requeueing to `pending` makes the row selectable again on the very next
pass, so a persistent per-instance fault becomes a write loop at the poll
interval, and — since the claim scan is ordered by `instance_id` and capped —
enough such rows occupy the whole batch and no other instance is ever
re-resolved. The row SHALL instead be left `claimed`, so the existing
lease-expiry predicate is its retry cadence: bounded, already implemented, and
already tested.

Leaving the row claimed keys on the claimed row's `instance_id`, which is available without parsing the
body, so a body that cannot be parsed is still handled correctly.

The cost is that a transient failure waits up to one lease before being
retried instead of being retried at once. For a worker whose job is to
re-drive a parked wait-state, that latency is not observable; an unbounded
retry loop is.

#### Scenario: A poison instance does not starve its batch

- **WHEN** a re-resolution pass claims a batch containing one instance whose stored body cannot be parsed
  (or whose resolver throws) alongside instances that resolve normally
- **THEN** the normally-resolving instances are processed in that same pass

#### Scenario: A failing instance is not immediately re-eligible

- **WHEN** an instance fails to re-resolve in a pass
- **THEN** it remains `claimed` and is not selected by the next pass; it
  becomes eligible again only once its claim lease expires

#### Scenario: A persistent fault cannot monopolize the batch

- **WHEN** many instances fail to re-resolve persistently
- **THEN** each is retried at most once per lease, so instances flagged for
  re-resolution behind them are still claimed and processed

#### Scenario: A concurrent writeback's re-flag is still honored

- **WHEN** a writeback sets an instance's state to `pending` while a pass
  holds it claimed
- **THEN** that flag is preserved and the instance is re-resolved, unchanged
  from today's behavior
