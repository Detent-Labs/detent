## MODIFIED Requirements

### Requirement: Each delivered action records an ActionOutcome

A terminal delivery SHALL append one `ActionOutcome` (`resolvedHandler`, terminal
`status`, `attempts`) to the runtime record that enqueued the action. The append
SHALL occur atomically with the delivered mark.

The enqueuing record SHALL be carried on the outbox row rather than derived from
`(instanceId, transitionSeq)`. That pair identifies a transition exactly — the
sequence is the concurrency token and advances once per hop — but a runtime event
does not advance it, so an action enqueued by a reminder-timer fire shares the
sequence of whatever transition preceded it. Deriving the target from the pair is
therefore wrong in two distinct ways:

- On a step reached by a transition, the reminder's outcome is appended to *that
  transition's* `HistoryEntry`, indistinguishable from the actions the transition
  itself enqueued.
- On a step an instance was created on, there is no `HistoryEntry` at all —
  instance creation writes none, and the instance rests at sequence 0. The update
  matches no row, raises nothing, and the outcome is silently discarded. A delivery
  that succeeded leaves no audit trace whatsoever.

An action enqueued by a transition SHALL continue to record its outcome on that
transition's `HistoryEntry`.

#### Scenario: A successful delivery is recorded on the originating entry
- **WHEN** a row for transition seq N is delivered successfully
- **THEN** the `HistoryEntry` at that instance and seq N carries an `ActionOutcome` with `status: "succeeded"`, the resolved handler, and the attempt count

#### Scenario: A dead-lettered action records a failed outcome
- **WHEN** an action exhausts its retries
- **THEN** an `ActionOutcome` with `status: "dead-letter"` is recorded and no value is written into `data`

#### Scenario: A reminder's outcome is recorded on its own event
- **WHEN** an action enqueued by a reminder-timer fire is delivered
- **THEN** its `ActionOutcome` is appended to that fire's `timer.fired` event, and
  the `HistoryEntry` sharing the instance's `transitionSeq`, if one exists, gains no
  outcome

#### Scenario: An outcome on a step with no history entry is still recorded
- **WHEN** a reminder fires on the step an instance was created on — sequence 0, no
  `HistoryEntry` — and its action is delivered
- **THEN** the `ActionOutcome` is recorded on the `timer.fired` event rather than
  discarded
