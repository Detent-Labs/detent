<!-- antislop: allow-file passive-voice -->

## Purpose

Defines the registry that maps a `Step.assignment.strategy.type` to its config
schema and its candidate resolver. Assignment then resolves through the same
seam that actions and data sources already use. Covers the built-in `static`
entry and the deadline that bounds a resolution.

## ADDED Requirements

### Requirement: An assignment registry maps a strategy type to a config schema and a resolver

The system SHALL provide an `AssignmentRegistry` mapping each supported
`Step.assignment.strategy.type` to an entry. An entry SHALL declare a config
schema and a candidate resolver. The schema validates an authored `config` at
publish. The resolver produces the candidate list at step entry.

A resolver SHALL receive the strategy's `config` and the instance it resolves
for. It SHALL return a `string[]` of role names and actor ids in one flat
namespace. It MAY return that list asynchronously.

The registry is injected, matching the action `Registry`. Nothing in the engine
SHALL compare a strategy type against a literal.

#### Scenario: A registered type resolves to its entry

- **WHEN** a body declares a step assignment whose `strategy.type` is registered
- **THEN** the engine uses that entry's schema at publish and that entry's
  resolver at step entry

#### Scenario: A resolver returning a promise is awaited

- **WHEN** a registered resolver returns a promise for its candidate list
- **THEN** the engine awaits it and writes the resolved list to
  `instance.assignment.candidates`

### Requirement: The built-in static strategy is a registry entry

The engine SHALL ship `"static"` as a registered entry rather than as a
hard-coded branch. Its declared config schema SHALL be
`{ candidates: string[] }`. Its resolver SHALL return `config.candidates`
verbatim, with no CEL evaluation and no dynamic lookup. It SHALL never fail.

`"static"` SHALL remain the strategy an author gets by default. No existing
published body needs to change.

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

### Requirement: A deadline bounds every candidate resolution

The engine SHALL bound each resolver call by a deadline. A resolver that has not
returned by the deadline SHALL be abandoned, and the resolution SHALL be treated
as failed. The deadline SHALL apply to every registered strategy, including one
that reaches an external system.

A resolver that exceeds its deadline SHALL NOT block the commit that enters the
step. A hung external directory therefore cannot stop a participant from
submitting.

#### Scenario: A hanging resolver is abandoned at the deadline

- **WHEN** a registered resolver has not returned by the deadline
- **THEN** the engine abandons the call, treats the resolution as failed, and
  commits the step entry

### Requirement: A failed resolution leaves candidates empty and records the reason

A resolution fails when its resolver raises, returns a value that is not a
`string[]`, or exceeds its deadline. A failed resolution SHALL NOT roll back the
transition or the creation that triggered it. The commit SHALL proceed. The
engine SHALL set
`instance.assignment.candidates` to the empty list. It SHALL record an
`assignment.unresolved` event naming the step and the reason, in the same
transaction as the commit.

An empty candidate list means no actor is an eligible candidate. The engine
SHALL NOT substitute a fallback assignee.

#### Scenario: A raising resolver still commits the transition

- **WHEN** a resolver raises while an instance enters a step
- **THEN** the transition commits, `instance.assignment.candidates` is empty,
  and an `assignment.unresolved` event records the reason

#### Scenario: A resolver returning a non-list is treated as failed

- **WHEN** a resolver returns a value that is not a `string[]`
- **THEN** the engine treats the resolution as failed, and does not write the
  returned value to `instance.assignment.candidates`

#### Scenario: No fallback assignee is substituted

- **WHEN** a resolution fails and leaves `candidates` empty
- **THEN** no actor satisfies the eligible-candidate check for that step, and
  the engine assigns the step to nobody
