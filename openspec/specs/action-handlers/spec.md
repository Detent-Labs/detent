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
`action.type` and invoke it with the action's `config`, obtaining a structured
`result`. An action whose `type` is not registered SHALL be treated as a permanent
failure (dead-letter), never a transient retry. Because delivery is at-least-once,
a handler MAY be invoked more than once for the same row and MUST dedupe on the
row's idempotency key.

#### Scenario: A registered handler is invoked with the action config
- **WHEN** a delivered row's `action.type` is registered
- **THEN** the handler is invoked with the action's `config` and returns a structured `result`

#### Scenario: An unregistered type is a permanent failure
- **WHEN** a delivered row's `action.type` is not in the registry
- **THEN** the delivery fails permanently and the row dead-letters without consuming transient retries

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
`status`, `attempts`) to the originating transition's `HistoryEntry` — the entry
whose `transitionSeq` equals the outbox row's `transition_seq`. The append SHALL
occur atomically with the delivered mark.

#### Scenario: A successful delivery is recorded on the originating entry
- **WHEN** a row for transition seq N is delivered successfully
- **THEN** the `HistoryEntry` at that instance and seq N carries an `ActionOutcome` with `status: "succeeded"`, the resolved handler, and the attempt count

#### Scenario: A dead-lettered action records a failed outcome
- **WHEN** a row exhausts its attempts and dead-letters
- **THEN** an `ActionOutcome` with `status: "dead-letter"` is recorded and no value is written into `data`

### Requirement: A writeback to a terminal instance is suppressed

If the instance is `completed` or `cancelled` at delivery time, the `data`
writeback SHALL be suppressed so terminal instances remain data-immutable; the
`ActionOutcome` SHALL still be recorded, with its `suppressed` flag set so the
dropped writeback is auditable.

#### Scenario: A completed instance is not mutated by a late writeback
- **WHEN** a handler result arrives for an instance whose status is already `completed`
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
