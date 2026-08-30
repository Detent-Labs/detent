## MODIFIED Requirements

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
instance matching. A `list` field holds `string[]`, so a comparison
naming one fails once a selected instance holds that array value.

That check reads values, not declared types. A comparison naming a
`list` field therefore passes while no selected instance has written the
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
