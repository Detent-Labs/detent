## Purpose

Reads the instances of one process by the values they hold in their `data`
payload. A feature serving another process then selects instances by the
values an author wrote, not by lifecycle state alone.

## ADDED Requirements

### Requirement: Comparisons against instance field values

A `dataWhere` filter SHALL carry a list of comparisons. Each comparison names a
field id, an operator, and a right side. The comparisons SHALL join
conjunctively with each other. They SHALL join conjunctively with every other
filter on the read that accepts them.

The right side SHALL be a literal of the definition contract's `Literal` type.
A comparison SHALL NOT carry a CEL expression. This change does not reopen the
standing decision that keeps CEL data-source-blind. A `dataWhere` right side
also resolves before any expression evaluates.

The operators SHALL be equality, inequality, and membership in a list of
literals. Ordering comparisons stay out of scope. An instance's `data` values
are jsonb, and their declared type belongs to a process version. Two versions
of one process can declare one field id under two types. So an ordering
comparison carries no version-independent meaning.

A comparison against a field id absent from an instance's `data` SHALL NOT
match. It SHALL NOT fail the read either. An instance that has not yet reached
the step writing a field is normal, not an error.

#### Scenario: Equality selects instances holding the value

- **WHEN** the read runs with an equality comparison on field F and value V
- **THEN** it returns the instances whose `data` holds V under F
- **AND** it omits an instance holding another value under F

#### Scenario: An absent field does not match

- **WHEN** the read runs with an equality comparison on field F
- **AND** an instance's `data` carries no F key
- **THEN** it omits that instance
- **AND** it succeeds

#### Scenario: An absent field does not match an inequality either

- **WHEN** the read runs with an inequality comparison on field F
- **AND** an instance's `data` carries no F key
- **THEN** it omits that instance

#### Scenario: Comparisons join conjunctively

- **WHEN** the read runs with comparisons on field F and field G
- **AND** an instance matches F but not G
- **THEN** it omits that instance

#### Scenario: Membership selects any listed value

- **WHEN** the read runs with a membership comparison on field F over V1 and V2
- **THEN** it returns the instances holding either V1 or V2 under F

#### Scenario: A comparison preserves the literal's JSON type

- **WHEN** the read runs with an equality comparison on field F and number 1
- **AND** an instance holds the string `"1"` under F
- **THEN** it omits that instance

#### Scenario: A data comparison joins a lifecycle filter

- **WHEN** the read runs with a `currentStepId` and a comparison on field F
- **AND** an instance matches F but stands on another step
- **THEN** it omits that instance

### Requirement: A read returning instance data without label resolution

The Runtime API Layer SHALL expose a read that returns two things per matched
instance: its `instanceId` and its `data` payload. It SHALL return nothing
else. The read SHALL accept the filters the instance list read accepts,
`dataWhere` included.

The read SHALL resolve no process or step labels. It SHALL NOT consult the
definition store. An option list re-resolves on every form render, every
submission, every timer fire and every automatic transition. Label resolution
is work each of those discards.

The read SHALL NOT page by cursor. A caller SHALL be able to bound the result
with a maximum count. The read SHALL report when that bound truncated the
result. A caller can then tell a complete answer from a cut one.

The read SHALL NOT scope results to the calling actor. It SHALL NOT need an
actor at all. The same filters SHALL resolve the same result for every caller.
That covers a timer, an outbox delivery, an automatic transition, a migration,
and a participant's open form. Any later per-instance visibility rule narrows
this read rather than replacing it.

The read SHALL still return an instance whose pinned `(processId, version)` has
no resolvable published body. This read exposes no field that the body
resolves. So what degrades a list summary has no effect here.

#### Scenario: The read returns ids and data alone

- **WHEN** the read runs and two instances match
- **THEN** each returned item carries `instanceId` and `data`
- **AND** no item carries `processLabel`, `stepLabel`, `status`, or
  `transitionSeq`

#### Scenario: The read resolves with no actor

- **WHEN** the read runs with no actor
- **THEN** it returns the items it returns for any given actor

#### Scenario: An unresolvable body does not remove an instance

- **WHEN** a matched instance pins a `(processId, version)` with no published
  body
- **THEN** the read still returns that instance with its `instanceId` and
  `data`

#### Scenario: The bound truncates and says so

- **WHEN** the read runs with a maximum count of 10 and 25 instances match
- **THEN** it returns 10 items
- **AND** it reports that the bound truncated the result

#### Scenario: An unbounded result reports no truncation

- **WHEN** the read runs with a maximum count of 10 and 3 instances match
- **THEN** it returns 3 items
- **AND** it reports no truncation

### Requirement: One predicate serves both reads

The instance list read and the data read SHALL resolve a shared filter to the
same set of instances. A filter that both accept SHALL select identically on
both. A caller comparing the two reads then sees one predicate, not two that
drifted.

#### Scenario: Both reads select the same instances

- **WHEN** both reads run with one `processId`, one `currentStepId` and one
  `dataWhere` comparison
- **THEN** the two results name the same instance ids

#### Scenario: The inbox predicate does not change

- **WHEN** the list read runs with `assignedTo` and no new filter
- **THEN** it returns the instances it returned before this capability
