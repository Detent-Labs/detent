# writeback-reresolution Specification

## Purpose
TBD - created by archiving change reresolve-after-writeback. Update Purpose after archive.
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

