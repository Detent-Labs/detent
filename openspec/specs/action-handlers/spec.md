# action-handlers

## Purpose

Defines the handler seam the outbox delivers into: how a declarative action
(`{ type, config }`) is resolved to a handler, invoked off the row lock, and how
its structured `result` is written back into the instance's flat `data` via
`Action.output`. Each delivery records an auditable `ActionOutcome`, writebacks to
terminal instances are suppressed, and authoring validation forbids two actions on
one transition from writing the same output field.
## Requirements
### Requirement: A handler is resolved by action type and invoked off the lock

A delivery SHALL resolve a handler from the registry by the outbox row's
`action.type`. It SHALL invoke that handler with the action's `config` and get
a structured `result`. An action whose `type` is not registered SHALL be
treated as a permanent failure (dead-letter), never a transient retry.
Delivery is at-least-once. A handler MAY therefore run more than once for the
same row. It MUST dedupe on the row's idempotency key.

The invocation SHALL also carry the actor ids the enqueuing commit froze onto
the row, when the row carries any. A handler MAY read them and MAY ignore
them. They are engine-supplied state, not authored config. A handler that
reads them still performs no instance lookup of its own.

The field SHALL be optional. A row enqueued before the engine recorded actor
ids carries none. A handler SHALL treat that case like a row whose recorded
lists are all empty.

#### Scenario: A registered handler is invoked with the action config
- **WHEN** a delivered row's `action.type` is registered
- **THEN** the handler is invoked with the action's `config` and returns a structured `result`

#### Scenario: An unregistered type is a permanent failure
- **WHEN** a delivered row's `action.type` is not in the registry
- **THEN** the delivery fails permanently and the row dead-letters without consuming transient retries

#### Scenario: A handler reads the frozen actor ids
- **WHEN** a delivered row carries frozen actor ids
- **THEN** the handler is invoked with those ids alongside the action's `config`

#### Scenario: A handler ignoring the actor ids is unaffected
- **WHEN** a delivered row carries frozen actor ids and its handler reads none of them
- **THEN** the delivery behaves exactly as it did before the ids existed

### Requirement: A handler result is written back into instance data

The engine SHALL evaluate each `Action.output` entry — a CEL expression over the
`result` namespace only — against the handler's `result`, and write each mapped
value into the instance's flat `data` under its target `FieldId`. The writeback
SHALL be path-scoped (it touches only `{data,<fieldId>}`) and orthogonal to
`transitionSeq` (it does not bump or optimistic-concurrency-guard on the seq).

#### Scenario: Mapped output values land in data
- **WHEN** a handler returns a `result` and the action's `Action.output` maps `FieldId f` to a CEL expression over that `result`
- **THEN** the evaluated value is written into the instance's `data` at `f`, leaving other fields untouched

#### Scenario: A writeback survives a later transition
- **WHEN** a writeback lands in `data` and the instance subsequently commits a manual transition
- **THEN** the written value is preserved (the transition does not overwrite `data`)

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

### Requirement: A writeback to a terminal instance is suppressed

If the instance is not `running` at delivery time — that is, `completed`,
`cancelled`, or `faulted` — the `data` writeback SHALL be suppressed so a
non-running instance remains data-immutable; the `ActionOutcome` SHALL still be
recorded, with its `suppressed` flag set so the dropped writeback is auditable.
Only a `running` instance accepts a writeback. A `faulted` instance is a dead-end
error park (nothing transitions out of it), so a late-arriving action's result is
suppressed just as for a `completed` or `cancelled` instance.

#### Scenario: A completed instance is not mutated by a late writeback
- **WHEN** a handler result arrives for an instance whose status is already `completed`
- **THEN** no value is written into `data` and the recorded `ActionOutcome` has `suppressed: true`

#### Scenario: A faulted instance is not mutated by a late writeback
- **WHEN** a handler result arrives for an instance whose status is `faulted`
- **THEN** no value is written into `data` and the recorded `ActionOutcome` has `suppressed: true`

### Requirement: Action output fields are disjoint within a transition

Authoring validation SHALL reject a process in which two actions reachable by the
same transition map the same target `FieldId` in their `Action.output`. The action
set is `onExit` + `onPath` + target `onEntry` for a normal transition, and
`onCancel` + the cancel-sink's `onEntry` for the cancel transition (since
`onCancel` actions also carry `output`). This removes the same-field last-writer
hazard at authoring time.

#### Scenario: Two actions writing the same output field are rejected
- **WHEN** a definition has two actions on one transition whose `Action.output` both target the same `FieldId`
- **THEN** validation rejects the definition

#### Scenario: Two onCancel actions writing the same output field are rejected
- **WHEN** a step's `onCancel` has two actions whose `Action.output` both target the same `FieldId`
- **THEN** validation rejects the definition

### Requirement: A handler that reads the database takes it from the invocation

A handler needing its own database access SHALL take that handle from its
invocation context. It SHALL NOT take one a caller bound when building the
registry.

Every context SHALL carry the handle. It is not optional, unlike the frozen
actor ids beside it. An absent handle has no sane fallback once one process
serves many tenants.

One registry then serves every tenant. A handle bound at construction would
send `notification.email`'s address lookup to one tenant's accounts for every
tenant's message.

A handler needing no database SHALL ignore the handle, exactly as it ignores
the frozen actor ids beside it.

#### Scenario: An address lookup reads the right tenant

- **WHEN** a `notification.email` delivery runs for an instance in tenant `acme`
- **THEN** its address lookup reads `acme`'s account directory

#### Scenario: One registry serves every tenant

- **WHEN** a single registry serves two tenants' deliveries
- **THEN** each delivery reads its own tenant's data

#### Scenario: A handler needing no database keeps its behaviour

- **WHEN** the outbox delivers an `http.request` action
- **THEN** it behaves exactly as it did before the handle existed
