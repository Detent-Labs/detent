## MODIFIED Requirements

### Requirement: Downward-only subprocess cancel propagation

Cancelling a parent instance SHALL recursively cancel its active child instances
by following the `parent` links. A cancelled child SHALL surface
`child.outcome == "cancelled"`, which the parent MAY guard on. In v1 a child MUST
NOT be cancelled independently in a way that propagates upward to its parent.

Propagation applies to active (running) children only: a child that has already
reached a terminal step is not re-cancelled. Cancelling an instance with no active
children cancels only that instance. This propagation is now active — it is
implemented together with subprocess execution.

The propagation sweep MUST isolate each direct child's cancellation: one
child's failure (an unresolvable body, a thrown error) MUST NOT prevent the
engine from attempting to cancel the child's siblings in the same sweep. A
child cancellation that observes a concurrency conflict on that child's own
commit MUST be treated as neither a success nor a failure of the sweep — the
conflict indicates the child is being (or already was) advanced by a
concurrent commit, not that the child's cancellation is broken.

The engine SHALL durably record, in the same commit as the parent's own
cancel transition, whether that parent's direct-child sweep has completed
without a conflicted or failed child. Re-invoking the cancel entry point on
an instance that is already `cancelled` and whose sweep has not completed
that way SHALL re-attempt the direct-child sweep, using the same fault
isolation as the original attempt, instead of no-opping. This resumption
MUST NOT append a `HistoryEntry` or advance `transitionSeq` for the
already-cancelled instance itself — only its child cascade is resumed; the
"cancelling a non-running instance is a no-op" contract for the instance's
own record is unaffected.

#### Scenario: Parent cancel cascades to active children
- **WHEN** a parent instance with an active subprocess child is cancelled
- **THEN** the child instance is also cancelled (recursively for nested children)

#### Scenario: Cancelled child exposes the reserved outcome
- **WHEN** a subprocess child ends in the cancelled state
- **THEN** the parent step observes `child.outcome == "cancelled"` and may evaluate a guard against it

#### Scenario: Independent upward child cancel is not allowed in v1
- **WHEN** a cancel is directed at a child instance independently of its parent
- **THEN** v1 does not propagate that cancellation upward to the parent

#### Scenario: Cancel of an instance with no active children touches only that instance
- **WHEN** an instance with no active (running) children is cancelled
- **THEN** only that instance is cancelled and no child cascade is attempted

#### Scenario: One failing child does not block its siblings
- **WHEN** a parent's cancel sweep attempts to cancel three active children and the second one's cancellation raises an error
- **THEN** the first and third children are still cancelled, and the sweep records the second as failed rather than aborting

#### Scenario: A concurrency conflict on a child is not treated as a sweep failure
- **WHEN** a child's own cancel commit loses a concurrency race during a sweep
- **THEN** the sweep records that child as conflicted, not failed, and continues with its remaining siblings

#### Scenario: An incomplete sweep is durably recorded
- **WHEN** a parent's cancel commits and its direct-child sweep ends with at least one conflicted or failed child
- **THEN** the parent's incomplete-sweep state survives a crash or process restart and is discoverable

#### Scenario: Re-invoking cancel resumes an incomplete sweep
- **WHEN** the cancel entry point is invoked again on a parent that is already `cancelled` and whose sweep previously ended with a conflicted or failed child
- **THEN** the engine re-attempts cancellation of that parent's still-active direct children, using the same per-child fault isolation

#### Scenario: A resumed sweep does not re-cancel the parent itself
- **WHEN** the cancel entry point resumes an incomplete sweep on an already-cancelled parent
- **THEN** no new `HistoryEntry` is appended and `transitionSeq` does not change for that parent, matching the no-op contract for a non-running instance

#### Scenario: A fully successful sweep needs no further resumption
- **WHEN** a parent's cancel sweep cancels every active direct child with no conflicts or failures
- **THEN** re-invoking the cancel entry point on that parent again attempts no further child cancellation
