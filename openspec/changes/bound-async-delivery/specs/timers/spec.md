## MODIFIED Requirements

### Requirement: The timer scan isolates a poison instance from the batch

Each instance in a scheduler pass SHALL be processed inside its own error boundary, covering the row body
parse and the body resolution as well as `fireTimer`. A parse failure, a resolver miss, or a resolver
that throws SHALL skip that one instance and leave every other due instance in the pass to be processed.
A single poison instance SHALL NOT abort the pass.

Skipping is not sufficient on its own: the scan is ordered by `next_timer_at`
and capped, and a skipped instance leaves `next_timer_at` due, so an
unprocessable instance is re-selected on **every** pass — a permanent write
loop at the poll interval, and, at a hundred such instances, a batch that no
other instance can enter. The pass SHALL therefore also make **progress** on a
failed instance by pushing it out of the due scan for a bounded interval.

The push SHALL be predicated on the `next_timer_at` value this pass observed,
so a concurrent re-arm — a firing, or a step entry that armed a new timer —
is not clobbered: the predicated update matches zero rows and changes nothing.
The interval is a bounded delay, not a terminal state; a genuinely transient
fault therefore heals on a later pass without operator action.

#### Scenario: A poison instance at the head of the scan does not block the rest

- **WHEN** a scheduler pass selects a batch containing one instance whose stored body cannot be parsed
  (or whose resolver throws), ordered ahead of instances with due timers
- **THEN** the due timers on the other instances fire in that same pass

#### Scenario: A failing instance leaves the due scan

- **WHEN** an instance fails to process in a scheduler pass
- **THEN** its `next_timer_at` is pushed out by a bounded interval, so the
  next pass does not select it and it is not retried at the poll interval

#### Scenario: A concurrent re-arm is not clobbered

- **WHEN** an instance's `next_timer_at` changes between the pass reading it
  and the push — because its timer fired, or a step entry armed a new one
- **THEN** the push matches no row and the newly armed time stands

#### Scenario: A transient fault heals without intervention

- **WHEN** an instance failed one pass for a transient reason and the cause
  clears
- **THEN** it is selected again after the bounded interval and its timer fires
