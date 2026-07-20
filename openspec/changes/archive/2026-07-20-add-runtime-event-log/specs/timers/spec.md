## MODIFIED Requirements

### Requirement: Fire a reminder timer as a side effect only

A timer whose `onFire` specifies `actions` but no `targetPath` SHALL, when due,
enqueue those actions and mark itself fired without transitioning. The instance
remains on the same step.

The fire SHALL additionally be recorded as a `timer.fired` runtime event naming the
timer, in the same commit that marks it fired. Because a reminder does not advance
`transitionSeq`, the timer's `fired` flag is otherwise the only trace it left, and
that flag says a fire happened without saying when or what it delivered.

#### Scenario: Reminder fires without transitioning
- **WHEN** a due reminder timer (actions, no `targetPath`) fires on a step
- **THEN** its actions are enqueued for delivery, the timer is marked `fired`, and
  the instance's `currentStepId` and `transitionSeq` are unchanged

#### Scenario: The fire is recorded as an event
- **WHEN** a due reminder timer fires
- **THEN** a `timer.fired` event naming that timer is recorded in the same commit,
  carrying the `transitionSeq` in force without advancing it

### Requirement: An unresolvable or unparseable deadline is not armed

Arming SHALL be total: it runs inside the transition commit and MUST NOT fail the
transition. If a deadline expression raises at evaluation — most commonly because
it reads a field not yet written into `data` — or yields a value that is not a
parseable instant, that timer SHALL be omitted from the armed set. The entry
commit proceeds and every other timer on the step is armed normally.

The omission SHALL be recorded as a `timer.unarmed` event naming the timer and
distinguishing the reason — an expression that raised, versus a value that was not
an instant — in the same commit that records the entry. An omitted timer is
otherwise indistinguishable from one that was never declared, and on an
all-automatic step whose only bound was that timer the instance waits indefinitely
with nothing recording why.

A deadline is evaluated once, at entry. A later action writeback that changes the
field the expression reads SHALL NOT re-arm or move an already-armed `fireAt`, and
SHALL NOT arm a timer that was omitted at entry.

#### Scenario: Deadline reading an unwritten field is omitted
- **WHEN** an instance enters a step whose deadline expression reads a field that
  holds no value in `data`
- **THEN** the transition commits, and `instance.timers[]` contains no entry for
  that timer

#### Scenario: Non-instant deadline value is omitted
- **WHEN** a deadline expression evaluates successfully but yields a string that
  is not a parseable instant
- **THEN** the transition commits and that timer is not armed

#### Scenario: A later writeback does not re-arm
- **WHEN** a deadline timer was omitted at entry and a post-commit action
  writeback subsequently writes the field its expression reads
- **THEN** the timer remains unarmed and never fires

#### Scenario: The omission is recorded with its reason
- **WHEN** a timer is omitted from the armed set
- **THEN** a `timer.unarmed` event naming it is recorded in the same commit as the
  entry, and its reason distinguishes an expression that raised from a value that
  was not an instant
