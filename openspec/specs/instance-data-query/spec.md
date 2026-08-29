# instance-data-query

## Purpose

Reads the instances of one process by the values they hold in their `data`
payload. A feature serving another process then selects instances by the
values an author wrote, not by lifecycle state alone.

## Requirements

### Requirement: Comparisons against instance field values

A `dataWhere` filter SHALL carry a list of comparisons. Each comparison names a
field id, an operator, and a right side. The comparisons SHALL join
conjunctively with each other. They SHALL join conjunctively with every other
filter on the read that accepts them.

The operators SHALL be equality, inequality, and membership in a list. Ordering
comparisons are not among them.

A right side SHALL be a scalar literal of the definition contract's `Literal`
type. That means a string, a number, a boolean, or null. A membership right
side SHALL be a list of such scalars. The read SHALL reject an array or an
object right side as a caller error.

A membership list SHALL carry at least one scalar. The read SHALL reject an
empty list as a caller error. An empty list matches nothing, so accepting one
would answer every comparison with an empty result.

A comparison SHALL compare at the JSON level, preserving each value's JSON
type. The number `1` and the string `"1"` are distinct values, and a JSON null
is distinct from an absent key. A text-level comparison collapses all three,
and the engine writes `Literal` values with their types intact.

The reason is the compilation. An equality comparison compiles to jsonb
containment, and containment over an array or an object is subset matching. So
a non-scalar right side would silently mean something other than equality. A
later change can widen the accepted right side once it also carries the
compilation that wider side needs.

A comparison carries no CEL expression. The comparison shape admits a field id,
an operator and a literal. No expression fits in it. So the standing decision
that keeps CEL data-source-blind stays untouched here.

A `dataWhere` filter SHALL accompany a `processId` filter. The read SHALL
reject a `dataWhere` with no `processId` as a caller error. A field id anchors
to one process's field catalog. A comparison with no `processId` compares an
opaque id across every process, over an unindexed payload.

A comparison SHALL name a field holding a scalar. The read SHALL check each
compared field id against the instances its other filters select. One of those
instances may hold an array or an object under a compared field id. The read
SHALL then fail as a caller error. A silent empty result would read as no
instance matching. A `multiselect` field holds `string[]`, so a comparison
naming one fails once a selected instance holds that array value.

That check reads values, not declared types. A comparison naming a
`multiselect` therefore passes while no selected instance has written the
field. The type-level check belongs at the consumer's publish step, where the
target process's field catalog resolves. This row check is the backstop. This
change builds no publish check.

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

#### Scenario: Inequality omits instances holding the value

- **WHEN** the read runs with an inequality comparison on field F and value V
- **THEN** it omits the instances whose `data` holds V under F
- **AND** it returns an instance holding another value under F

#### Scenario: A comparison preserves the literal's JSON type

- **WHEN** the read runs with an equality comparison on field F and number 1
- **AND** an instance holds the string `"1"` under F
- **THEN** it omits that instance

#### Scenario: The read rejects a non-scalar right side

- **WHEN** a caller passes a comparison whose right side is an array or an
  object
- **THEN** the read rejects the call as a caller error
- **AND** it runs no query

#### Scenario: The read rejects a membership list holding a non-scalar

- **WHEN** a caller passes a membership comparison whose list holds an array
- **THEN** the read rejects the call as a caller error

#### Scenario: The read rejects an empty membership list

- **WHEN** a caller passes a membership comparison whose list is empty
- **THEN** the read rejects the call as a caller error

#### Scenario: The read rejects a dataWhere with no processId

- **WHEN** a caller passes a `dataWhere` comparison and no `processId`
- **THEN** the read rejects the call as a caller error
- **AND** it runs no comparison query

#### Scenario: A selected instance holding a non-scalar value fails the read

- **WHEN** the read runs with a comparison on field F
- **AND** an instance the other filters select holds an array under F
- **THEN** the read fails as a caller error
- **AND** it returns no empty result in its place
- **AND** an instance holding an object under F fails the read the same way

#### Scenario: A data comparison joins a lifecycle filter

- **WHEN** the read runs with a `currentStepId` and a comparison on field F
- **AND** an instance matches F but stands on another step
- **THEN** it omits that instance

### Requirement: A read returning instance data without label resolution

The Runtime API Layer SHALL expose a read returning four things per matched
instance. They are its `instanceId`, its pinned `version`, its `data` payload,
and its `redactedAt` where redaction wrote one. It SHALL return nothing else.

The read SHALL accept these optional filters: `processId`, `version`, `status`,
`currentStepId`, `startedBy`, `claimedBy`, `excludeInstanceId`, `createdAfter`,
`createdBefore` and `dataWhere`. It SHALL combine them conjunctively.

The read SHALL reject `assignedTo`, `assignedToRoles`, `scope` and
`includeDegraded` as a caller error. Each names behaviour the list read
resolves and this read does not. Ignoring one would answer a question the
caller did not ask. A cursor is not among them, since this read takes no cursor
argument at all.

The read rejects `assignedTo` and `assignedToRoles`. Together those two form
the list read's inbox predicate, and this read resolves no inbox. It rejects
`scope` for the same reason. That value is the HTTP layer's derivation of the
same predicate from the credential.

A `claimedBy` filter names an actor too, and the read accepts it. A caller
states that id, and nothing derives it from the credential. An `includeDegraded`
flag has meaning only on a read that resolves a summary. A cursor belongs to a
paged read, and this read does not page.

A `version` filter SHALL accompany a `processId` filter, the rule the list read
carries. The read SHALL reject a `version` with no `processId` as a caller
error.

The four returned fields serve one consumer requirement. A report cell can be
empty for three different reasons, and its reader must tell them apart. The
field held no value. The field did not exist in that instance's version. Or
redaction cleared the value.

The pinned `version` separates the second case against that version's field
catalog, and `redactedAt` separates the third. Both already sit on the parsed
instance, so neither costs a definition-store lookup.

The read SHALL resolve no process or step labels. It SHALL NOT consult the
definition store. An option list re-resolves on every form render, every
submission, every timer fire and every automatic transition. Label resolution
is work each of those discards.

The read SHALL NOT page by cursor. It SHALL bound the result by a maximum
count, with a documented default and an enforced maximum. A caller asking for
more than the enforced maximum SHALL receive the enforced maximum, not the
number asked for.

The read SHALL report when that bound truncated the result. A caller can then
tell a complete answer from a cut one. A result filling the bound exactly SHALL
report no truncation. The read SHALL order by the instance's creation time,
newest first, breaking ties by instance id. So one filter selects one subset,
call after call.

The read SHALL NOT scope results to the calling actor implicitly.

The read SHALL still return an instance whose pinned `(processId, version)` has
no resolvable published body. This read exposes no field that the body
resolves. So what degrades a list summary has no effect here.

#### Scenario: The read returns identity, data and redaction state

- **WHEN** the read runs and two instances match
- **THEN** each returned item carries `instanceId`, `version` and `data`
- **AND** no item carries `processLabel`, `stepLabel`, `status`, or
  `transitionSeq`

#### Scenario: A redacted instance is distinguishable from an empty one

- **WHEN** redaction cleared one matched instance, and another never wrote
  field F
- **THEN** the redacted instance's item carries a `redactedAt` timestamp
- **AND** the other instance's item carries no `redactedAt`

#### Scenario: The read rejects a filter it does not accept

- **WHEN** a caller passes `assignedTo`, `assignedToRoles`, `scope` or
  `includeDegraded`
- **THEN** the read rejects the call as a caller error

#### Scenario: The read does not narrow to the calling actor

- **WHEN** two callers run the read with one identical filter
- **THEN** both receive the same items

#### Scenario: An unresolvable body does not remove an instance

- **WHEN** a matched instance pins a `(processId, version)` with no published
  body
- **THEN** the read still returns that instance with its `instanceId` and
  `data`

#### Scenario: The bound truncates and says so

- **WHEN** the read runs with a maximum count of 10 and 25 instances match
- **THEN** it returns 10 items
- **AND** it reports that the bound truncated the result

#### Scenario: The read hands back no cursor

- **WHEN** the read runs and the bound truncates the result
- **THEN** the envelope carries no cursor for a following page

#### Scenario: The read rejects a version with no processId

- **WHEN** a caller passes a `version` and no `processId`
- **THEN** the read rejects the call as a caller error

#### Scenario: An unbounded result reports no truncation

- **WHEN** the read runs with a maximum count of 10 and 3 instances match
- **THEN** it returns 3 items
- **AND** it reports no truncation

#### Scenario: A result filling the bound exactly reports no truncation

- **WHEN** the read runs with a maximum count of 10 and exactly 10 instances
  match
- **THEN** it returns 10 items
- **AND** it reports no truncation

#### Scenario: The enforced maximum caps an oversized request

- **WHEN** a caller asks for more items than the enforced maximum
- **THEN** the read returns at most the enforced maximum

#### Scenario: A truncated result is the same subset every time

- **WHEN** the read runs twice with one filter and a maximum count that cuts
  the result
- **THEN** both calls return the same items, newest first

### Requirement: One predicate serves both reads

The instance list read and the data read SHALL resolve a shared filter to the
same set of instances. A filter that both accept SHALL select identically on
both. A caller comparing the two reads then sees one predicate, not two that
drifted.

That property is about the predicate, not about what each read does with a
selected row afterwards. The list read still omits an instance whose summary
fails to resolve, when `includeDegraded` is false or absent. The data read
still returns it. The two reads also bound their results differently. So the
shared property holds over a result neither bound has cut.

#### Scenario: Both reads select the same instances

- **WHEN** both reads run with one `processId`, one `currentStepId` and one
  `dataWhere` comparison
- **AND** every matched instance resolves a summary, and neither read's bound
  cuts the result
- **THEN** the two results name the same instance ids

#### Scenario: The inbox predicate does not change

- **WHEN** the list read runs with `assignedTo` and no new filter
- **THEN** it returns the instances it returned before this capability

#### Scenario: The inbox predicate keeps its role half

- **WHEN** the list read runs with `scope: "mine"` for an actor holding role R
- **AND** an unclaimed instance lists role R among its candidates
- **THEN** it returns that instance

### Requirement: The current-step filter accepts a set of steps

The read's `currentStepId` filter SHALL accept a single step id or a list of
them. A list SHALL select an instance standing on any of those steps. The
entries SHALL join disjunctively with each other. The filter as a whole SHALL
keep joining conjunctively with every other filter.

An empty list SHALL be a caller error. An empty list matches nothing, so
accepting one would answer the whole read with an empty result. This is the
rule a membership comparison's right side already carries.

The `status` filter on this same read is already a list. A caller selecting
instances across several steps asks the same shape of question. This read
serves a design that names a set of steps rather than one.

One predicate builder serves this read and the instance list read. The
widening SHALL live in that shared builder, so a single-id filter compiles
exactly as it does today.

#### Scenario: A step list selects instances on any of them

- **WHEN** the read runs with a `currentStepId` naming steps A and B
- **THEN** it returns the instances standing on A and the instances standing
  on B
- **AND** it omits an instance standing on step C

#### Scenario: A single step id keeps its behaviour

- **WHEN** the read runs with a `currentStepId` naming one step
- **THEN** it returns the instances standing on that step, exactly as before
  this change

#### Scenario: An empty step list is a caller error

- **WHEN** the read runs with a `currentStepId` that is an empty list
- **THEN** the read rejects the call as a caller error

#### Scenario: The step filter still joins conjunctively

- **WHEN** the read runs with a `currentStepId` naming steps A and B, and a
  `status` filter naming `running`
- **THEN** it returns only the running instances standing on A or B

### Requirement: The read selects an explicit set of instance ids

The read SHALL accept an optional `instanceIds` filter. It SHALL select the
instances whose id the list names. The entries SHALL join disjunctively with
each other, and the filter SHALL join conjunctively with every other filter.

An empty list SHALL be a caller error, the rule `currentStepId` carries above.

An id naming no instance SHALL contribute no row. It SHALL NOT fail the read.
A caller holding a stale reference is normal. The caller tells the two apart
by comparing what it asked for against what came back.

The read already carries `excludeInstanceId`, which removes one instance. That
filter answers a different question and stays as it is. Neither filter implies
the other, and a caller MAY pass both.

An option-list consumer needs this filter. It re-resolves the references an
instance already holds. Those references survive a step or status filter that
no longer selects them. Without an id filter that consumer would read the
instance table directly, which the layering forbids.

#### Scenario: An id list selects those instances

- **WHEN** the read runs with an `instanceIds` naming instances X and Y
- **THEN** it returns X and Y
- **AND** it omits an instance the list does not name

#### Scenario: An id filter overrides no other filter

<!-- Scenario bullets stay verbatim: the OpenSpec archive step matches this block by exact text, and the three filter clauses are what the scenario tests. -->
<!-- antislop: allow run-ons passive-voice -->
- **WHEN** the read runs with an `instanceIds` naming X, and a `status` filter
  naming `running`, and X is cancelled
- **THEN** it omits X, because the filters join conjunctively

#### Scenario: An unknown id contributes no row

- **WHEN** the read runs with an `instanceIds` naming an id no instance holds
- **THEN** it returns no row for that id, and does not fail

#### Scenario: An empty id list is a caller error

- **WHEN** the read runs with an `instanceIds` that is an empty list
- **THEN** the read rejects the call as a caller error
