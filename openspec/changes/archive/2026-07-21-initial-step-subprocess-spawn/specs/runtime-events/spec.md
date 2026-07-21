# runtime-events (delta)

## ADDED Requirements

### Requirement: A creation-enqueued subprocess spawn is recorded as an event

The event union SHALL gain a `subprocess.spawn-enqueued` kind, recorded in the
creation transaction when an instance is created on a definition whose
`initialStep` is a `subprocess` step. Its payload SHALL name the subprocess step.
Like every event it records the `transitionSeq` in force — 0, creation advancing
no sequence — without advancing it, and it SHALL NOT be recorded when the
creation inserted no instance row.

The `ActionOutcome` of the spawn the creation enqueued SHALL attach to this
event. Creation writes no `HistoryEntry`, so without a carrier the outcome's
fallback — the transition record at `(instanceId, 0)` — matches nothing and the
outcome is silently discarded; a dead-lettered initial spawn is exactly the
"instance parked forever" diagnostic and MUST be retrievable from the runtime
record. This is the `timer.fired` shape: an "actions enqueued, no transition"
record that carries the outcomes of what it enqueued.

An ordinary instance — one whose initial step is not a subprocess step — SHALL
record no event at creation. A transition-enqueued spawn is unaffected: its
outcome keeps attaching to the transition's `HistoryEntry`.

#### Scenario: Creation on a subprocess initial step records the event

- **WHEN** an instance is created on a definition whose `initialStep` is a
  subprocess step
- **THEN** a `subprocess.spawn-enqueued` event naming that step is recorded at
  `transitionSeq` 0 in the same transaction, and the instance's `transitionSeq`
  is 0 afterwards

#### Scenario: The spawn's outcome attaches to the event

- **WHEN** the creation-enqueued spawn is delivered
- **THEN** its `ActionOutcome` is recorded on the `subprocess.spawn-enqueued`
  event, and no `HistoryEntry` is created or modified

#### Scenario: A transition-enqueued spawn's outcome is unaffected

- **WHEN** an instance transitions into a subprocess step and that spawn is
  delivered
- **THEN** the `ActionOutcome` attaches to that transition's `HistoryEntry`,
  exactly as before, and no `subprocess.spawn-enqueued` event exists for it

#### Scenario: An ordinary creation records no event

- **WHEN** an instance is created on a definition whose `initialStep` is not a
  subprocess step
- **THEN** no `subprocess.spawn-enqueued` event is recorded

#### Scenario: A creation that inserted nothing records nothing

- **WHEN** a redelivered spawn re-runs the creation of an already-existing child
  whose initial step is a subprocess step
- **THEN** no additional `subprocess.spawn-enqueued` event is recorded
