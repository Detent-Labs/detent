<!-- antislop: allow-file passive-voice -->
# assignment-strategy-registry

## Purpose

Defines the registry that maps a `Step.assignment.strategy.type` to its config
schema and its candidate resolver. Assignment then resolves through the same
seam that actions and data sources already use. Covers the built-in `static`
entry and the resolver contract a later strategy implements.
## Requirements
### Requirement: An assignment registry maps a strategy type to a config schema and a resolver

The system SHALL provide an `AssignmentRegistry`, a `type -> def` map. It is a
sibling of the action `Registry` and the `DataSourceRegistry`, a plain parallel
structure rather than a shared abstraction. Each entry SHALL declare a candidate
resolver and MAY declare a config schema. The schema validates an authored
`config` at publish. The resolver produces the candidate list before a step
entry commits.

The registry is injected, matching how the engine already threads the action
`Registry` and the `DataSourceRegistry`. No engine code SHALL decide a strategy
by comparing its type against a literal.

#### Scenario: A registered type resolves to its entry

- **WHEN** a body declares a step assignment whose `strategy.type` is registered
- **THEN** the engine uses that entry's schema at publish, and that entry's
  resolver before step entry

#### Scenario: An entry declaring no config schema accepts any config

- **WHEN** a registered entry declares no config schema
- **THEN** the engine accepts any `config` for that strategy type

### Requirement: A resolver receives a narrow context and answers asynchronously

A resolver SHALL receive `{ config, stepId, instance }`. `instance` SHALL expose
`id`, `startedBy`, and the `data` the entering instance will carry, with any
submitted patch already merged. It SHALL expose nothing else.

A resolver SHALL return a `Promise<string[]>` of role names and actor ids in one
flat namespace. The signature is asynchronous even for a resolver that needs no
I/O. A later strategy that reaches a database or an external directory is then a
drop-in, not an interface change. This matches `DataSourceHandlerDef.resolve`,
which is asynchronous for the same reason.

The engine SHALL call a resolver outside any open database transaction. One path
is carved out. The subprocess return advances the parent while holding that
parent's row lock. It derives the step it enters from the row it read under that
lock.

Every other path SHALL resolve before its transaction opens. Those paths are a
manual transition, an automatic cascade hop, and a timer-forced transition. They
also include a cancellation, a top-level creation, and a subprocess spawn.

Every resolution SHALL be bounded by the resolution deadline defined below. That
holds on the carved-out path and on every other. The bound is what makes the
carve-out safe. A resolver that exceeds it cannot hold the parent's row lock open
past the deadline.

A resolver that needs its own database access uses the shared pool, the same way
`src/auth/users.ts` does. No connection or transaction handle travels in the
context, on either kind of path.

#### Scenario: A spawn resolves before its transaction opens

- **WHEN** a subprocess spawn creates a child at an assignment-bearing initial
  step
- **THEN** the resolver has already answered when that spawn's transaction
  opens, and the child is written with the resolved candidates

#### Scenario: The subprocess return is the one path holding a lock

- **WHEN** a child returns an outcome that advances the parent off its
  subprocess step, onto a step with a declared `assignment`
- **THEN** the parent's candidates resolve while its row lock is held, and no
  connection or transaction handle reaches the resolver

#### Scenario: A slow resolver on the return path releases the lock at the deadline

- **WHEN** a child returns an outcome advancing the parent onto a step whose
  resolver does not answer within the deadline
- **THEN** the resolution is abandoned at the deadline
- **AND** the parent's transition commits with empty candidates, and its row lock
  is released

#### Scenario: A resolver sees the merged submitted data

- **WHEN** a participant submits a field patch and transitions onto a step whose
  strategy resolves candidates
- **THEN** the resolver's `instance.data` includes that patch

#### Scenario: A resolver receives no field beyond the declared context

- **WHEN** a resolver runs
- **THEN** its `instance` exposes `id`, `startedBy` and `data`
- **THEN** its `instance` exposes no other instance field

### Requirement: The built-in static strategy is a registry entry

The engine SHALL ship `"static"` as a registered entry rather than as a
hard-coded branch. Its declared config schema SHALL be
`{ candidates: string[] }`. Its resolver SHALL return `config.candidates`
verbatim, with no CEL evaluation and no dynamic lookup.

`"static"` SHALL remain the strategy an author gets by default. No existing
published body needs to change, and nothing migrates.

#### Scenario: A static strategy resolves its configured list verbatim

- **WHEN** a step declares `assignment: { strategy: { type: "static", config:
  { candidates: ["finance-approver", "user_42"] } } }`
- **THEN** entering that step sets `instance.assignment.candidates` to exactly
  `["finance-approver", "user_42"]`

#### Scenario: A body published before the registry existed still resolves

- **WHEN** an instance runs against a body published before this change, whose
  steps declare `type: "static"`
- **THEN** its candidates resolve identically to before, with no migration and
  no re-publish

### Requirement: An unregistered type at runtime resolves to no candidates

Publish-time validation rejects an unregistered strategy type, so a running
instance cannot normally carry one. Should one reach step entry anyway, the
engine SHALL resolve it to an empty candidate list rather than raising. This
preserves the defensive behaviour `createInstance` has today.

An empty candidate list means no actor is an eligible candidate. The engine
SHALL NOT substitute a fallback assignee.

#### Scenario: An unregistered type at entry yields an empty list

- **WHEN** an instance enters a step whose `strategy.type` the injected registry
  does not hold
- **THEN** `instance.assignment.candidates` is empty, and the entry commits

#### Scenario: No fallback assignee is substituted

- **WHEN** a step's resolved `candidates` is empty
- **THEN** no actor satisfies the eligible-candidate check for that step

### Requirement: A resolution deadline bounds every strategy on every path

The engine SHALL bound each assignment resolution by a deadline. The bound SHALL
be engine-wide rather than declared per strategy. It SHALL be configurable
through the `ASSIGNMENT_RESOLUTION_TIMEOUT_MS` environment variable, defaulting
to 5000 milliseconds.

A resolution that has not answered when the deadline expires SHALL be abandoned.
The step entry SHALL then proceed with an empty candidate list. That matches a
resolution which raised.

Abandoning a resolution SHALL return control to the caller at the deadline. The
engine SHALL NOT wait for an abandoned resolver to settle. It SHALL ignore that
resolver's answer if it settles later.

#### Scenario: A resolver exceeding the deadline is abandoned

- **WHEN** a step declares a strategy whose resolver does not answer within the
  configured deadline
- **THEN** the entry commits with empty candidates

#### Scenario: A late answer is ignored

- **WHEN** an abandoned resolver settles after its deadline
- **THEN** its value is not written to the instance

#### Scenario: The deadline is configurable

- **WHEN** `ASSIGNMENT_RESOLUTION_TIMEOUT_MS` is set
- **THEN** that value bounds each resolution instead of the default

### Requirement: A failed or empty resolution commits the entry and records why

Assignment resolution SHALL be total. Three cases SHALL NOT roll back the step
entry. Those are a resolver that raises, a resolver that exceeds the deadline,
and a resolver that yields no candidate. The state change that reached the step
is real. It SHALL commit whatever the resolution produced.

In each of those three cases the engine SHALL write an empty candidate list. It
SHALL also record an `assignment.unresolved` event, in the same transaction that
commits the entry. The `runtime-events` capability defines that event.

The three cases SHALL be distinguished by reason. The resolver raised, the
deadline expired, or the resolution produced no candidate.

The engine SHALL apply this uniformly across every registered strategy. It SHALL
NOT decide whether to record the event by comparing a strategy type against a
literal. A `static` strategy configured with an empty list therefore records the
no-candidate reason like any other.

A step declaring no `assignment` SHALL record nothing. Resolution does not run
for an unrestricted step.

#### Scenario: A raising resolver still commits the entry

- **WHEN** a participant submits a form transitioning onto a step whose resolver
  raises
- **THEN** the transition commits, the submitted data is written, and the
  instance's candidates are empty

#### Scenario: Each failure mode records its own reason

- **WHEN** a resolution raises, exceeds the deadline, or returns an empty list
- **THEN** an `assignment.unresolved` event is recorded naming the step
- **AND** each of the three carries a different reason

#### Scenario: A static strategy with an empty list records the event

- **WHEN** a step declares `{ "type": "static", "config": { "candidates": [] } }`
  and is entered
- **THEN** the entry commits and an `assignment.unresolved` event records the
  no-candidate reason

#### Scenario: An unrestricted step records nothing

- **WHEN** an instance enters a step that declares no `assignment`
- **THEN** no `assignment.unresolved` event is recorded

#### Scenario: The event does not survive a rolled-back entry

- **WHEN** the transaction committing a step entry fails
- **THEN** neither the entry nor its `assignment.unresolved` event is persisted
