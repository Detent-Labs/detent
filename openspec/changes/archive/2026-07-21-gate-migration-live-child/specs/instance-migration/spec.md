## ADDED Requirements

### Requirement: A relocation off a subprocess step with a live child is deferred

A migration that changes the step and vacates a **subprocess-typed** source step SHALL check whether
that step has a live linked child, and SHALL skip the instance when one exists rather than commit the
relocation. A child is **live** when its `status` is `running`, OR when it holds any undelivered outbox
row — a terminal child whose `core.returnSubprocess` return has not yet delivered. The skip is
transient: the instance keeps its pin and step, is recorded as a `migration.skipped` event with the
`child-in-flight` reason, and is migrated by a later invocation once the child settles.

The engine SHALL NOT repoint a child's `parent.stepId` under migration. Repointing a live child
misdirects its pending return: relocating onto another subprocess step lets the old child's return
drive the parent off the new step under that step's `outputMapping` — orphaning the genuinely-spawned
new child — while relocating onto a non-subprocess step makes the return dead-letter (`return: not a
subprocess step`), orphaning the child forever. Declining is chosen over reconciling, consistent with
the in-flight-actions gate: a pending return is keyed to the enqueuing version's step and contract, so
re-pointing it is a snapshot-versus-live race preserving a result a later invocation delivers anyway.

A settled child — terminal with every outbox row delivered, including the parked-forever
`outcome-unmatched` case — SHALL NOT block the migration and SHALL NOT have its link repointed. A
settled child's `parent.stepId` is inert: `core.returnSubprocess` no longer fires for it, and the only
other reader, `cancelInstance`'s cascade sweep, keys on `parent.instanceId` and `status = 'running'`,
never on `parent.stepId`.

#### Scenario: A running child blocks the parent's relocation

- **WHEN** a parent parked at a subprocess step with a running child is relocated to a different step
- **THEN** the instance is not migrated, keeps its pin and step, and is recorded as skipped with the
  `child-in-flight` reason

#### Scenario: A terminal child with an undelivered return blocks the relocation

- **WHEN** the child has reached a terminal step but its `core.returnSubprocess` row is not yet
  delivered, and the parent is relocated to a different step
- **THEN** the instance is skipped with the `child-in-flight` reason, and the child's link is unchanged

#### Scenario: A settled child does not block the relocation and is not repointed

- **WHEN** the parent is relocated off a subprocess step whose child is terminal with all outbox rows
  delivered
- **THEN** the instance migrates normally and the child's `parent.stepId` is left unchanged

#### Scenario: A later invocation migrates the parent once the child settles

- **WHEN** the blocking child settles and the migration is invoked again
- **THEN** the parent migrates normally

#### Scenario: A relocation off a non-subprocess step is unaffected

- **WHEN** an instance not on a subprocess step is relocated
- **THEN** the live-child gate does not apply and the migration proceeds

## MODIFIED Requirements

### Requirement: A skipped instance is recorded as an event

An instance left behind — by `reject-and-pin`, because it holds actions in flight, or because it would
relocate off a subprocess step with a live child — SHALL be recorded as a `migration.skipped`
`InstanceEvent` naming the source version, the target version, and the reason. The reason SHALL
distinguish the three causes: `step-unmappable` is a property of the rule and will recur, while
`pending-actions` and `child-in-flight` are transient and clear on their own. It SHALL NOT advance
`transitionSeq` and SHALL NOT append a `HistoryEntry`.

The event is scoped to instances the rule could not place. An instance that could not be **read** SHALL
NOT produce one: an event envelope requires the instance's id, version, and sequence, which is exactly
what a row that fails to parse cannot supply. Such an instance is reported as failed instead.

#### Scenario: A skip is recorded without advancing the sequence

- **WHEN** an unmappable instance is skipped
- **THEN** a `migration.skipped` event is appended at its unchanged `transitionSeq`
  and no `HistoryEntry` is appended

#### Scenario: The residue is queryable

- **WHEN** the event log is queried for `migration.skipped`
- **THEN** every instance the rule could not place is returned, with both versions and
  the reason

#### Scenario: The three skip reasons are distinguishable

- **WHEN** the event log is queried after an invocation that skipped an unmappable instance, an
  in-flight-actions instance, and a live-child instance
- **THEN** each carries a distinct reason: `step-unmappable`, `pending-actions`, or `child-in-flight`

#### Scenario: An unreadable instance produces no event

- **WHEN** an instance's row cannot be parsed
- **THEN** no `migration.skipped` event is written for it
