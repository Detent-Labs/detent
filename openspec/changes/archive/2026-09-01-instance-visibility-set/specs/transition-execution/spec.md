<!-- antislop: allow-file passive-voice -->
<!-- Every scenario here uses the fixed SHALL/WHEN/THEN Gherkin grammar the
     rest of this repo's specs use (see data-retention/spec.md's own
     allow-file passive-voice for the same reason). That grammar is
     structurally passive ("WHEN X is called", "THEN Y is deleted");
     rewriting it to dodge the rule would break the required Scenario
     format. -->

## ADDED Requirements

### Requirement: A step entry commits the entered step's principals

Applying a step entry SHALL write the entered step's resolved assignment
candidates into the instance's principal set, per the
`instance-visibility-set` capability. It SHALL do so in one transaction with
the instance row, the history entry, the events and the outbox rows.

The applier is the single write point on purpose. Every step entry reaches it,
whatever drove the transition. One insert therefore covers a participant's
submit, an automatic transition, a timer-forced transition and a migration
relocation alike. A second write point would leave one of those four behind.

A migration commits the assignment the instance already held, rather than
resolving the target step's. Its append therefore adds nobody, and the rule
above needs no exception for it.

The write SHALL be an append that tolerates a principal the set already holds.
An entry re-adding a candidate already present SHALL succeed and change nothing.

The write SHALL NOT change what the applier reports or what its optimistic
concurrency check compares. It adds a relation to the commit and nothing else.

Planning SHALL write no principal, the same way planning writes no instance
row, history entry, event or outbox row.

#### Scenario: An applied entry writes the entered step's candidates

- **WHEN** the applier commits a step entry for a step whose assignment
  resolves to candidates
- **THEN** those candidates are principals of the instance after the commit

#### Scenario: A failed commit writes no principal

- **WHEN** an applied step entry's transaction fails
- **THEN** the transaction leaves no principal row for that entry
- **AND** it leaves no instance row, history entry, event or outbox row either

#### Scenario: Planning performs no principal write

- **WHEN** the planner plans a step entry that never reaches the applier
- **THEN** planning writes no principal row

#### Scenario: Re-entering a step with the same candidates is a no-op for the set

- **WHEN** an instance re-enters a step whose candidates are already principals
- **THEN** the commit succeeds and the set holds what it held before

#### Scenario: A step with no assignment writes no principal

- **WHEN** the applier commits a step entry for a step declaring no assignment
- **THEN** the commit writes no principal, and the set holds what it held before

#### Scenario: The concurrency token advances as before

- **WHEN** the applier commits a step entry
- **THEN** its `transitionSeq` advances exactly as it did before the principal
  write existed
