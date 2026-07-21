## MODIFIED Requirements

### Requirement: A plan is frozen by an atomic guard once applied

Registering a plan for an existing key SHALL replace the stored spec only while the
plan has not been applied, and SHALL be refused once it has. The check and the
replacement SHALL be one atomic operation, not a read followed by a write.

An invocation SHALL read the plan and mark it applied — before processing any
instance, not on the first successful one — as one atomic operation, not a read
followed by a separate write. All instances in that invocation SHALL be migrated
under the spec that operation reads back. A read followed by a separate freeze
statement leaves the same window a non-atomic registration would: a registration
landing between the two can commit its spec after the read but before the freeze,
so the invocation migrates instances under the spec it already read while the row
is left frozen on a different, never-applied spec.

A rule that has moved instances describes history: the `HistoryEntry` of every
instance migrated under it is only interpretable against the rule that produced it,
and the outbox key rewrite reads the stored spec. A read-then-write leaves a window
in which one invocation migrates under spec A while another stores spec B, so the
record and the rule disagree with nothing to indicate it. Marking on first success
rather than first attempt leaves the plan editable for the whole of an invocation
that happens to skip everything it sees. Re-reading per batch would let one
invocation apply two rules to one population, contradicting the uniformity this
capability guarantees.

Before first use a plan describes only an intention, and an operator who finds a
typo must be able to correct it — without editing the process definition, which is
the only alternative when the rule belongs to an immutable version.

#### Scenario: An unused plan is replaced

- **WHEN** a plan is re-registered for a key under which nothing has migrated
- **THEN** the stored spec is replaced and governs subsequent migrations

#### Scenario: An applied plan is frozen

- **WHEN** a plan is re-registered after it has been applied
- **THEN** registration is refused and the stored spec is unchanged

#### Scenario: A registration racing an invocation does not slip through

- **WHEN** a registration and an invocation of the same plan run concurrently
- **THEN** either the registration is refused, or it commits before the invocation's
  atomic read-and-freeze observes it — never a state in which instances migrated
  under one spec while a different spec is left stored and frozen

#### Scenario: One invocation uses one spec throughout

- **WHEN** an invocation spans several batches
- **THEN** every instance it migrates is migrated under the spec its atomic
  read-and-freeze returned

#### Scenario: An invocation that migrates nothing still freezes the plan

- **WHEN** an invocation processes instances and skips all of them
- **THEN** the plan is marked applied and can no longer be replaced

#### Scenario: Freezing is per key

- **WHEN** `(1→4)` has been applied and `(2→4)` has not
- **THEN** `(2→4)` is still replaceable

#### Scenario: The frozen spec is always the one actually used

- **WHEN** a registration for the same key is attempted while an invocation's
  atomic read-and-freeze is in flight
- **THEN** the spec left permanently stored on the row is the same spec every
  instance in that invocation was migrated under, never a spec registered but
  applied to nothing
