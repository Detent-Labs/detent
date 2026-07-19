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
