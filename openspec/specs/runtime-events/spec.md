# runtime-events Specification

## Purpose

Defines `InstanceEvent`, the append-only record for runtime facts about an instance
that carry no step change. `HistoryEntry` is transition-shaped (`toStepId` is
required), so these have nowhere to go in it. Together the two records are the audit
backbone: they interleave by instant and correlate by `transitionSeq`, which an event
records but never advances.

Nine kinds are defined, added additively while the record shape stays settled.
This table is the canonical enumeration; three of the nine (`assignment.claimed`,
`assignment.released`, `instance.faulted`) are owned in detail by other
capabilities' specs (`assignment-claim-release-consolidation`,
`automatic-transitions`) and are listed here only for completeness:

| kind | fact recorded | enqueues actions |
| --- | --- | --- |
| `timer.fired` | a reminder timer fired without transitioning | yes |
| `timer.unarmed` | a declared timer produced no `fireAt` at entry, with the reason | no |
| `migration.skipped` | an instance was left on its source version, with the reason | no |
| `subprocess.spawn-enqueued` | creation at a subprocess `initialStep` enqueued its spawn | yes |
| `subprocess.outcome-unmatched` | a child returned an outcome no path on the parent's subprocess step matched | no |
| `migration.transform-dropped` | a migration `transforms` entry raised or produced a non-JSON-safe value, with the reason | no |
| `assignment.claimed` | an actor claimed an unclaimed, assignment-bearing step | no |
| `assignment.released` | the claimant released their claim on the current step | no |
| `instance.faulted` | an automatic cascade re-entered a step it already entered, parking the instance | no |

A kind that enqueues actions carries their `ActionOutcome`s; a kind that enqueues
none MUST NOT invite a reader to expect them.

## Requirements

### Requirement: An append-only record for runtime events that are not transitions

The system SHALL provide `InstanceEvent`, an append-only runtime record for facts
about an instance that carry no step change and therefore cannot be expressed as a
`HistoryEntry`. An event SHALL record the instance it belongs to, the definition
`version` in force, the `transitionSeq` in force, its `kind`, the instant it
occurred, and a kind-specific payload.

An event SHALL NOT advance `transitionSeq`. The sequence remains what it is for a
transition record: the optimistic-concurrency token, monotonic per instance, one
value per hop. An event records the sequence the instance was at, so several events
may share one sequence and may share it with a transition. This is expected, not a
collision.

Events SHALL be recorded in the same transaction as the state change that caused
them, so an event cannot survive a rolled-back commit and a commit cannot land
without its events.

`HistoryEntry` remains the record for transitions and is not replaced. The two
interleave by their recorded instant and correlate by `transitionSeq`.

#### Scenario: An event records the sequence without advancing it

- **WHEN** an event is recorded for an instance at `transitionSeq` N
- **THEN** the event carries N, and the instance's `transitionSeq` is still N
  afterwards

#### Scenario: Several events share one sequence

- **WHEN** two events are recorded for an instance while it rests at the same step
- **THEN** both are retained, both carry that sequence, and they are ordered by their
  recorded instant

#### Scenario: An event carries the definition version in force

- **WHEN** an event whose payload names a step or timer id is recorded
- **THEN** it carries the `version` active at that moment, so the id resolves against
  the definition that produced it

#### Scenario: An event does not outlive a rolled-back commit

- **WHEN** the transaction recording a state change and its events fails
- **THEN** neither the state change nor its events are persisted

### Requirement: A reminder-timer fire is recorded as an event

A reminder timer — one whose `onFire` declares actions but no `targetPath` — fires
without transitioning. That fire SHALL be recorded as a `timer.fired` event naming
the timer, rather than being observable only through the timer's `fired` flag.

The `ActionOutcome` for each action the fire enqueued SHALL attach to that event, not
to the `HistoryEntry` that happens to share the instance's `transitionSeq`. Without
this, a reminder's action results are recorded against the transition that entered
the step and are indistinguishable from that transition's own actions.

#### Scenario: A reminder fire is recorded

- **WHEN** a due reminder timer fires
- **THEN** a `timer.fired` event naming that timer is recorded, the timer is marked
  `fired`, and the instance's `currentStepId` and `transitionSeq` are unchanged

#### Scenario: A reminder's action outcome attaches to its own event

- **WHEN** an action enqueued by a reminder fire is delivered
- **THEN** its `ActionOutcome` is recorded on the `timer.fired` event, and the
  `HistoryEntry` at the same `transitionSeq` is unchanged

#### Scenario: A transition's action outcomes are unaffected

- **WHEN** an action enqueued by an ordinary transition is delivered
- **THEN** its `ActionOutcome` is recorded on that transition's `HistoryEntry`,
  exactly as before

### Requirement: A timer that cannot be armed is recorded as an event

Arming remains total: it runs inside the transition commit, so a timer whose fire
time cannot be computed is omitted from the armed set rather than failing the entry.
That omission SHALL be recorded as a `timer.unarmed` event naming the timer and the
reason it was dropped, so the loss is queryable instead of silent.

The armed-timer record SHALL NOT be used to carry the omission. It describes timers
that will fire; a timer that never armed has no fire time to hold.

Recording an omission makes it observable, not noticed. An instance whose only bound
was the dropped timer still waits until someone acts on it; this requirement
establishes that the fact is retrievable, and does not claim the instance recovers.

#### Scenario: An unresolvable deadline is recorded

- **WHEN** an instance enters a step whose deadline expression raises — most commonly
  reading a field not yet written
- **THEN** the entry commits, that timer is absent from the armed set, and a
  `timer.unarmed` event naming it and the reason is recorded in the same commit

#### Scenario: A non-instant deadline value is recorded

- **WHEN** a deadline expression evaluates successfully but yields a value that is not
  a parseable instant
- **THEN** the entry commits, that timer is not armed, and a `timer.unarmed` event
  distinguishing this reason from an unresolvable expression is recorded

#### Scenario: Other timers on the step are unaffected

- **WHEN** one timer on a step is dropped and another arms normally
- **THEN** the armed set contains the second timer, the earliest-timer selection
  reflects it, and exactly one `timer.unarmed` event is recorded

#### Scenario: Instances that lost a timer are queryable

- **WHEN** the event log is queried for `timer.unarmed`
- **THEN** every instance that dropped a timer is returned, with the timer and the
  reason

#### Scenario: An armed timer records no event

- **WHEN** every timer on an entered step arms successfully
- **THEN** no `timer.unarmed` event is recorded for that entry

### Requirement: A skipped migration is recorded as an event

The event union SHALL gain a `migration.skipped` kind, recorded when a migration
leaves an instance on its source version under `reject-and-pin`.

Its payload SHALL name the source version, the target version, and the reason the
instance could not be placed. Like every event, it records the `transitionSeq` in
force without advancing it, and lands in the same transaction as the invocation
step that produced it.

This is the additive kind the record shape was built to take: a skip changes no
step — it changes nothing at all — so it has nowhere to go in a `HistoryEntry`,
whose `toStepId` is required and load-bearing. A migration that *does* move an
instance is a transition and keeps its `HistoryEntry` with `cause: "migration"`;
the two records are not alternatives for the same fact.

The `version` an event carries is the version in force, which for a skip is the
source version — the instance did not move, so ids in its payload resolve there.

#### Scenario: A skip is recorded at the unchanged sequence

- **WHEN** an unmappable instance at `transitionSeq` N is skipped
- **THEN** a `migration.skipped` event carrying N is appended, and the instance's
  `transitionSeq` is still N

#### Scenario: A skip event names both versions and the reason

- **WHEN** a `migration.skipped` event is read back
- **THEN** it names the source version, the target version, and why the instance
  could not be placed

#### Scenario: A skip carries the source version

- **WHEN** an instance pinned to version 1 is skipped by a migration to version 2
- **THEN** the event's `version` is 1

#### Scenario: A migrated instance records no skip event

- **WHEN** an instance migrates successfully
- **THEN** no `migration.skipped` event is recorded for it, and its migration is
  recorded as a `HistoryEntry` instead

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

### Requirement: An unmatched subprocess return outcome is recorded as an event

When a subprocess child's return is delivered, the parent's `outputMapping`
is applied and its writeback committed, but no automatic path's guard
matches `child.outcome`, the engine SHALL record a `subprocess.outcome-unmatched`
event naming the parent's subprocess step and the unmatched outcome, so the
parent remaining parked is queryable rather than silent.

This follows the same posture as `timer.unarmed`: the return delivery stays
total and does not fail — the writeback it already applied is not undone,
and the outbox row is still marked delivered — but the fact that no path
advanced the parent becomes retrievable from the runtime record instead of
disappearing when the delivery's `child` namespace goes out of scope.

The event SHALL enqueue no actions and SHALL NOT advance `transitionSeq`,
matching `migration.skipped`: this is a "no transition, no actions" record,
not the "actions enqueued, no transition" shape `timer.fired` and
`subprocess.spawn-enqueued` use.

The event's `version` SHALL be the parent's version and its `transitionSeq`
SHALL be the parent's `transitionSeq` in force at the time of delivery — the
value read and re-checked under the same lock as the writeback, since no
transition changes either.

#### Scenario: An unmatched outcome is recorded

- **WHEN** a subprocess child's return is delivered, the parent's
  `outputMapping` is applied, and no automatic path on the parent's
  subprocess step matches `child.outcome`
- **THEN** a `subprocess.outcome-unmatched` event naming that step and the
  outcome is recorded in the same transaction as the writeback, the parent
  remains parked at the subprocess step, and its `transitionSeq` is
  unchanged

#### Scenario: A reserved cancel outcome that matches no path is recorded

- **WHEN** an independently cancelled subprocess child returns with the
  reserved `"cancelled"` outcome, and the parent's subprocess step declares
  no path guarding on it
- **THEN** a `subprocess.outcome-unmatched` event naming the `"cancelled"`
  outcome is recorded, exactly as for any other unmatched outcome

#### Scenario: A matched outcome records no event

- **WHEN** a subprocess child's return is delivered and an automatic path on
  the parent's subprocess step matches `child.outcome`
- **THEN** the parent advances along that path as before, and no
  `subprocess.outcome-unmatched` event is recorded

#### Scenario: The event carries no action outcomes

- **WHEN** a `subprocess.outcome-unmatched` event is recorded
- **THEN** it carries no `actions` field, since no actions were enqueued

### Requirement: A dropped migration transform is recorded as an event

Migration `transforms` evaluation remains total: an entry whose expression
raises, or whose result cannot be made JSON-safe, SHALL leave its target
field unwritten and SHALL NOT fail the migration. That omission SHALL be
recorded as a `migration.transform-dropped` event naming the target
`fieldId` and the reason it was dropped (`"expression-raised"` when the CEL
evaluation itself threw, `"value-out-of-range"` when evaluation succeeded
but the result could not be represented as a JSON-safe value), so the loss
is queryable instead of silent.

The event's `version` SHALL be the target version — the `fieldId` it names
is declared in the target catalog, so it resolves there, the same rule
`timer.unarmed` follows for the timer id it names. Its `transitionSeq` SHALL
be the sequence the migration commits to, without advancing it further. It
SHALL be recorded in the same transaction as the migration's own commit.

Like `timer.unarmed`, `migration.skipped`, and `subprocess.outcome-unmatched`,
this event enqueues no actions and SHALL carry no `ActionOutcome`s.

#### Scenario: A raising transform is recorded

- **WHEN** a migration's `transforms` entry for a target field reads a
  source field the instance never wrote, and its CEL evaluation raises
- **THEN** the migration commits, that field is absent from the migrated
  `data`, and a `migration.transform-dropped` event naming the field and
  reason `"expression-raised"` is recorded in the same transaction

#### Scenario: An out-of-range transform result is recorded

- **WHEN** a migration's `transforms` entry evaluates successfully but
  yields a value that cannot be represented as a JSON-safe number
- **THEN** the migration commits, that field is absent from the migrated
  `data`, and a `migration.transform-dropped` event naming the field and
  reason `"value-out-of-range"` is recorded in the same transaction

#### Scenario: A successful transform records no event

- **WHEN** every `transforms` entry in a migration evaluates successfully to
  a JSON-safe value
- **THEN** no `migration.transform-dropped` event is recorded for that
  migration

#### Scenario: The event carries no action outcomes

- **WHEN** a `migration.transform-dropped` event is recorded
- **THEN** it carries no `actions` field, since no actions were enqueued
