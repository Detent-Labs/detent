## ADDED Requirements

### Requirement: A process or step MAY declare itself not participant-cancellable

`ProcessBody` MAY declare `cancellable: boolean`. An absent key SHALL
default to `true`. `Step` MAY declare its own `cancellable: boolean`. An
absent key SHALL default to the owning `ProcessBody.cancellable`. Either MAY
override the other in either direction: a process declaring `cancellable:
false` MAY still declare one of its steps `cancellable: true`, and the
reverse.

Neither field SHALL change the cancel-sink injection, the synthetic cancel
path, or any other mechanism this capability specifies. Both fields SHALL
describe only whether a PARTICIPANT-initiated cancel command against a
running instance resting on that step may proceed. The `authorization`
capability's "An instance's starter may cancel it without the reserved role"
requirement governs that decision. An actor holding `system:cancel-any`, or a
stored per-process `cancel` grant, SHALL remain authorized regardless of
either field's value. Neither field SHALL be able to strand a running
instance beyond every operator's reach.

#### Scenario: An unset process defaults to cancellable

- **WHEN** a `ProcessBody` declares no `cancellable` key
- **THEN** every one of its non-terminal steps resolves as cancellable, absent
  a step-level override

#### Scenario: A step overrides its process's default

- **WHEN** a `ProcessBody` declares `cancellable: true` and one of its steps
  declares `cancellable: false`
- **THEN** a running instance resting on that step resolves as not
  cancellable. An instance resting on any other step still resolves as
  cancellable

#### Scenario: A step widens past a process-wide ban

- **WHEN** a `ProcessBody` declares `cancellable: false` and one of its steps
  declares `cancellable: true`
- **THEN** a running instance resting on that step resolves as cancellable

## MODIFIED Requirements

### Requirement: Downward-only subprocess cancel propagation

Cancelling a parent instance SHALL recursively cancel its active child instances
by following the `parent` links. A cancelled child SHALL surface
`child.outcome == "cancelled"`, which the parent MAY guard on. In v1, cancelling
a child independently MUST NOT propagate upward to its parent.

Propagation applies to active (running) children only: a child that has already
reached a terminal step is not re-cancelled. Cancelling an instance with no active
children cancels only that instance. The engine now implements this propagation
together with subprocess execution.

The propagation sweep MUST isolate each direct child's cancellation. A
child's failure may be an unresolvable body, or the cancel itself
throwing. Either MUST NOT prevent the engine from attempting to cancel the
child's siblings in the same sweep.

A child cancellation may observe a concurrency conflict on its own commit.
The sweep MUST then treat that outcome as neither a success nor a failure.
The conflict indicates a concurrent commit is advancing, or already
advanced, the child; the child's cancellation itself stays unaffected.

The engine SHALL durably record whether that parent's direct-child sweep
completed without a conflicted or failed child. It records this in the same
commit as the parent's own cancel transition.

An instance MAY already be `cancelled` while its sweep has not completed
that way. Re-invoking the cancel entry point on it SHALL re-attempt the
direct-child sweep. That retry SHALL use the same failure isolation as the
original try, rather than no-opping.

This resumption MUST NOT append a `HistoryEntry` or advance `transitionSeq`
for the already-cancelled instance itself. Only its child cascade resumes.
The "cancelling a non-running instance is a no-op" contract for the
instance's own record stays unaffected.

The sweep drives each child through the engine's cancel primitive directly.
It never goes through the participant/operator-facing authorization wrapper.

A child's own `cancellable`/`Step.cancellable` value, or its process's,
therefore MUST NOT block propagation. The parent's cancellation was already
authorized once, and the cascade is solely the engine's own consequence of
that decision.

#### Scenario: Parent cancel cascades to active children
- **WHEN** a parent instance with an active subprocess child transitions to cancelled
- **THEN** the child instance is also cancelled (recursively for nested children)

#### Scenario: Cancelled child exposes the reserved outcome
- **WHEN** a subprocess child ends in the cancelled state
- **THEN** the parent step observes `child.outcome == "cancelled"` and may evaluate a guard against it

#### Scenario: Independent upward child cancel is not allowed in v1
- **WHEN** a cancel targets a child instance independently of its parent
- **THEN** v1 does not propagate that cancellation upward to the parent

#### Scenario: Cancel of an instance with no active children touches only that instance
- **WHEN** an instance with no active (running) children transitions to cancelled
- **THEN** only that instance transitions to cancelled and the sweep starts no child cascade

#### Scenario: One failing child does not block its siblings
- **WHEN** a parent's cancel sweep attempts to cancel three active children and the second one's cancellation fails
- **THEN** the first and third children are still cancelled, and the sweep records the second as failed rather than aborting

#### Scenario: A concurrency conflict on a child is not treated as a sweep failure
- **WHEN** a child's own cancel commit loses a concurrency race during a sweep
- **THEN** the sweep records that child as conflicted, not failed, and continues with its remaining siblings

<!-- Why: the scenario header below has to match the base spec's heading in
     openspec/specs/cancellation/spec.md, byte for byte. -->
<!-- antislop: allow passive-voice -->
#### Scenario: An incomplete sweep is durably recorded
- **WHEN** a parent's cancel commits and its direct-child sweep ends with at least one conflicted or failed child
- **THEN** the parent's incomplete-sweep state survives a crash or process restart and is discoverable

#### Scenario: Re-invoking cancel resumes an incomplete sweep
- **WHEN** a caller invokes the cancel entry point again on a parent that is already `cancelled`. That parent's sweep previously ended with a conflicted or failed child
- **THEN** the engine re-attempts cancellation of that parent's still-active direct children, using the same per-child failure isolation

#### Scenario: A resumed sweep does not re-cancel the parent itself
- **WHEN** the cancel entry point resumes an incomplete sweep on an already-cancelled parent
- **THEN** the resumption appends no new `HistoryEntry` and leaves `transitionSeq` unchanged for that parent, matching the no-op contract for a non-running instance

<!-- Why: the scenario header below has to match the base spec's heading in
     openspec/specs/cancellation/spec.md, byte for byte. -->
<!-- antislop: allow negation-habit -->
#### Scenario: A fully successful sweep needs no further resumption
- **WHEN** a parent's cancel sweep cancels every active direct child with no conflicts or failures
- **THEN** re-invoking the cancel entry point on that parent again attempts no further child cancellation

#### Scenario: A child's own cancellable:false does not block propagation

- **WHEN** a parent instance transitions to cancelled. One of its active children
  currently rests on a step whose effective `cancellable` resolves to `false`
- **THEN** that child is still cancelled as part of the cascade
