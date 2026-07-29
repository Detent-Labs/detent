# writeback-reresolution Specification

## Purpose

Closes the loop between asynchronous action results and automatic transitions.

Actions are dispatched post-commit, so an instance that transitions into a
wait-state comes to rest *before* the action whose result its exit guards read has
run. Nothing in the transition path re-examines that instance afterwards: the guards
were already evaluated, found no match, and left it parked. Without a mechanism
here, a result-driven wait-state — the engine's idiom for a gated side effect —
would never advance.

An `Action.output` writeback that changes a non-terminal instance's `data` therefore
marks that instance for re-resolution, durably and in the same transaction as the
data patch, and a worker re-evaluates the parked step's automatic paths against the
new data. The marking must be transactional for the same reason the outbox is: a
flag written separately from the data it describes can be lost by a crash between
the two, leaving an instance parked on a guard that would now match.

Re-resolution is idempotent and race-safe — delivery is at-least-once, so the same
writeback may mark an instance more than once, and the worker may run concurrently
with a transition moving that instance off the step.

## Requirements
### Requirement: A data-affecting writeback marks the instance for re-resolution

When an outbox writeback applies a patch that changes a non-terminal instance's
`data`, the engine SHALL mark that instance for re-resolution durably, within the
same transaction that commits the data patch. A writeback that affects no row
(terminal instance, suppressed) SHALL NOT mark it.

#### Scenario: Writeback flags the instance
- **WHEN** the outbox delivers an action whose writeback changes an instance's data
- **THEN** the instance is left in a state the re-resolution worker will pick up,
  set atomically with the data change

#### Scenario: Suppressed writeback flags nothing
- **WHEN** a writeback targets a completed or cancelled instance and affects no row
- **THEN** the instance is not marked for re-resolution

### Requirement: Re-resolution advances a parked wait-state when a guard now matches

A re-resolution worker SHALL pick up marked instances, load the instance's pinned
frozen body, and run automatic-path evaluation with a system actor. If the changed
data now satisfies an automatic path's guard, the instance SHALL transition and
run to rest; if no guard matches, the instance SHALL remain parked on the
wait-state.

#### Scenario: Result-driven path taken after writeback
- **WHEN** a marked instance sits on an all-automatic wait-state and the written-back
  data satisfies one of its automatic paths' guards
- **THEN** the worker transitions the instance along that path and advances it to rest

#### Scenario: Still no match leaves it parked
- **WHEN** a marked instance's written-back data satisfies no automatic path guard
- **THEN** the instance stays on the wait-state and no transition is committed

#### Scenario: Body not resolvable is left for a later pass
- **WHEN** the injected body resolver cannot return a body for a marked instance
- **THEN** the worker leaves the instance marked and moves on, rather than failing
  the pass

### Requirement: Re-resolution is idempotent and race-safe

Re-resolution SHALL be safe to run redundantly. A re-resolved instance that has
already moved off the wait-state, or that has no matching guard, SHALL be a no-op.
A writeback that marks an instance while the worker is mid-pass SHALL NOT be lost:
the mark SHALL survive to the next pass rather than being cleared by the in-flight
one.

#### Scenario: Re-resolving an already-moved instance is a no-op
- **WHEN** the worker re-resolves an instance that a concurrent manual transition
  already advanced to a manual step
- **THEN** no transition is committed and no error is raised

#### Scenario: A writeback during a pass is not lost
- **WHEN** a new data-affecting writeback marks an instance after the worker has
  claimed it but before the worker clears the mark
- **THEN** the mark remains set and the instance is re-resolved on a later pass

#### Scenario: A claim abandoned by a crashed pass is reclaimed
- **WHEN** a worker claims an instance for re-resolution and then crashes before
  clearing or requeuing it, and the claim's lease elapses
- **THEN** a later pass reclaims the instance and re-resolves it, rather than
  leaving it stranded in the claimed state

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

