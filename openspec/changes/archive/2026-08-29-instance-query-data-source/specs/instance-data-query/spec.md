## ADDED Requirements

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
