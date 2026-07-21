# subprocess-execution (delta)

## MODIFIED Requirements

### Requirement: Spawn a child instance on entry to a subprocess step

When a running instance commits a transition whose target is a `subprocess` step,
the engine SHALL spawn one child instance and leave the parent parked in that step
as a wait-state. The child instance MUST record a `parent` link
`{ instanceId, stepId }` identifying the parent instance and its subprocess step.
The spawn MUST be dispatched post-commit (the parent's entry into the subprocess
step is committed first, the child spawned after), consistent with the engine's
commit-then-dispatch ordering.

Creation SHALL trigger the same spawn: an instance created on a definition whose
`initialStep` is a `subprocess` step SHALL have its spawn enqueued in the same
transaction that creates the instance row, at `transitionSeq` 0, and dispatched
post-commit like any other. There MUST be no state in which the instance row
exists but its initial spawn was never enqueued (a crash between the two would
strand the instance on its wait-state with nothing to re-enqueue). A creation
that inserts no row — the instance already exists, as when a redelivered spawn
re-runs the creation of its child — SHALL enqueue nothing.

This applies uniformly to top-level creations and to subprocess children, so a
child whose own `initialStep` is a subprocess step spawns its grandchild through
the same mechanism (nested initial-step chains compose with no special casing).

A creation-enqueued spawn uses the same deterministic coordinates as a
transition-enqueued one, with the sequence being 0: the child id derives from
`(parent instanceId, 0, subprocess step id)`, so redelivery resolves to the same
child and is a no-op.

The parent parked at its initial subprocess step SHALL be returned to exactly as
one parked by a transition: the child's return finds it via the `parent` link and
drives it off the wait-state from sequence 0.

#### Scenario: Entering a subprocess step spawns a linked child
- **WHEN** an instance transitions into a `subprocess` step
- **THEN** a child instance is created whose `parent` link references the parent instance id and the subprocess step id, and the parent remains at the subprocess step

#### Scenario: Parent parks as a wait-state
- **WHEN** a subprocess child has been spawned and has not yet reached a terminal step
- **THEN** the parent instance stays at the subprocess step and takes no automatic path (a wait-state), unless a step timer fires

#### Scenario: Creation at a subprocess initial step spawns
- **WHEN** an instance is created from a definition whose `initialStep` is a `subprocess` step, and the outbox is drained
- **THEN** a child instance exists whose `parent` link references the created instance and its initial step, seeded from the step's `inputMapping`, and the created instance remains parked at the initial step at `transitionSeq` 0

#### Scenario: The child's return drives a parent parked at its initial step
- **WHEN** the child of a creation-enqueued spawn reaches a terminal step bound to an outcome, and the return is delivered
- **THEN** the parent's `outputMapping` is applied and the parent transitions off its initial subprocess step along the automatic path whose guard matches `child.outcome`

#### Scenario: A nested initial-step chain composes
- **WHEN** a subprocess child is created whose own `initialStep` is a subprocess step
- **THEN** the child's creation enqueues its own spawn, a grandchild is created on delivery, and each return propagates upward through the ordinary return path

#### Scenario: A redelivered creation enqueues nothing
- **WHEN** a redelivered spawn re-runs the creation of an already-existing child whose initial step is a subprocess step
- **THEN** no instance row is inserted, no spawn is enqueued, and exactly one spawn row exists for that child

#### Scenario: A creation-enqueued spawn respects the parent's status at delivery
- **WHEN** an instance created on a subprocess initial step is cancelled before its spawn is delivered
- **THEN** the delivery is a no-op and no child is created, exactly as for a transition-enqueued spawn
