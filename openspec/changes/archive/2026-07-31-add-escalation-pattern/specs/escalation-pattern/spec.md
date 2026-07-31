## Purpose

Documents a reusable SLA-escalation recipe built entirely from existing
engine primitives (timers, assignment, the action registry). Ships a
concrete, tested instance of it in `examples/expense-approval.json`. A
customer copies a working example instead of designing the shape from
scratch.

## ADDED Requirements

### Requirement: A step composes a reminder and an escalation timer

A step that carries a human `assignment` MAY declare two independent
timers, both counted from step entry. When it does, the engine SHALL
treat them independently: neither timer's fire time depends on the
other's.

The first is a non-forcing reminder. Its `onFire.actions` dispatches a
notifying action to the current assignee. The instance stays on the step.

The second is a forcing escalation timer. Its `onFire.targetPath` names a
path to a different step.

#### Scenario: The reminder timer fires without a transition

- **WHEN** a reminder timer's duration elapses on a step the instance has
  not left
- **THEN** the engine dispatches the timer's `onFire.actions` and the
  instance's current step does not change

#### Scenario: The escalation timer fires and forces a transition

- **WHEN** an escalation timer's duration elapses on a step the instance
  has not left
- **THEN** the engine transitions the instance along the timer's
  `onFire.targetPath`, bypassing that path's guard if it has one

### Requirement: The escalation target step reassigns to a different tier

The step an escalation timer's `targetPath` leads to SHALL declare an
`assignment` distinct from the escalated step's own assignment. The
target step's `onEntry` SHALL carry a notifying action addressed to the
new tier.

#### Scenario: An escalated instance is visible to the new tier and not the old

- **WHEN** an escalation timer forces a transition into the target step
- **THEN** an actor matching the target step's `assignment` sees the
  instance as an assignable task
- **AND** an actor matching only the original step's `assignment` no
  longer sees it as claimable on that step

### Requirement: `examples/expense-approval.json` demonstrates the pattern

`examples/expense-approval.json`'s `review` step SHALL keep its existing
reminder timer and gain a forcing escalation timer. That timer's target
SHALL be a new `escalated_review` step. `escalated_review` SHALL declare
an `assignment` different from `review`'s, an `onEntry` notifying action,
and outgoing paths that preserve `review`'s approve/reject outcomes.

#### Scenario: An unactioned expense approval escalates to a manager

- **WHEN** an `expense_approval` instance sits on `review` past the
  escalation timer's duration without a manual transition
- **THEN** the instance moves to `escalated_review`
- **AND** the engine dispatches `escalated_review`'s `onEntry` notify
  action
- **AND** an actor holding the `finance-manager` role can claim and act on
  the instance

#### Scenario: Escalation preserves the original decision paths

- **WHEN** an instance reaches `escalated_review`
- **THEN** it exposes the same approve and reject outcomes `review`
  exposed
- **AND** each outcome routes to the same downstream step `review`'s
  equivalent path routed to
