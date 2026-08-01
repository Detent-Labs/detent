<!-- antislop: allow-file passive-voice -->

## Purpose

Defines the registry that maps a `Step.assignment.strategy.type` to its config
schema and its candidate resolver. Assignment then resolves through the same
seam that actions and data sources already use. Covers the built-in `static`
entry and the resolver contract a later strategy implements.

## ADDED Requirements

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
