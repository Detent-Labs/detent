## ADDED Requirements

### Requirement: A step's `type` and its `subprocess` spec presence agree

A step SHALL declare a `subprocess` spec if and only if its `type` is
`"subprocess"`. A step of `type: "subprocess"` with no `subprocess` spec, or
a step of any other `type` carrying a `subprocess` spec, SHALL fail to
parse.

#### Scenario: A subprocess-typed step with no subprocess spec is rejected
- **WHEN** a step has `type: "subprocess"` and no `subprocess` field
- **THEN** the process body fails to parse

#### Scenario: A non-subprocess step carrying a subprocess spec is rejected
- **WHEN** a step has `type: "task"` and a `subprocess` field
- **THEN** the process body fails to parse

#### Scenario: A subprocess-typed step with a subprocess spec parses
- **WHEN** a step has `type: "subprocess"` and a well-formed `subprocess` field
- **THEN** the process body parses successfully (subject to every other invariant)

### Requirement: A subprocess step's paths are all-automatic

A step of `type: "subprocess"` SHALL have only automatic paths (or none). A
manual path on a subprocess step SHALL fail to parse, since it would let an
actor advance the parent while its spawned child is still running,
orphaning it — the subprocess step is a wait-state, per the
`subprocess-execution` capability's existing requirement that the parent
parks until the child returns.

#### Scenario: A manual path on a subprocess step is rejected
- **WHEN** a step has `type: "subprocess"` and at least one path with `trigger: "manual"`
- **THEN** the process body fails to parse

#### Scenario: A subprocess step with only automatic paths parses
- **WHEN** a step has `type: "subprocess"` and every path has `trigger: "automatic"`
- **THEN** the process body parses successfully (subject to every other invariant)

### Requirement: Every identifier is unique within its kind across the whole body

For each id kind — path, action, timer, and data source — no two entities
of that kind within the same process body SHALL share an id. Field ids
SHALL be unique across the full field tree, including fields nested at any
depth inside a `group` field's `fields`, not only at the top level. A body
containing a duplicate SHALL fail to parse.

This closes the gap left by the two pre-existing checks (step id and
top-level field id uniqueness): a duplicate **action** id reachable within
one transition collides on the deterministic idempotency key; a duplicate
**timer** id breaks migration's id-keyed timer reconciliation; a duplicate
**field** id nested inside a `group` silently shadows another field across
the whole expression layer, since CEL flattens `group` sub-fields into the
same `data` namespace as top-level fields.

#### Scenario: Duplicate path ids across different steps are rejected
- **WHEN** two paths on different steps share one `path_` id
- **THEN** the process body fails to parse

#### Scenario: Duplicate action ids are rejected
- **WHEN** two actions anywhere in the body (onEntry, onExit, onPath, onCancel, or a timer's onFire) share one `action_` id
- **THEN** the process body fails to parse

#### Scenario: Duplicate timer ids are rejected
- **WHEN** two timers on different steps share one `timer_` id
- **THEN** the process body fails to parse

#### Scenario: Duplicate data source ids are rejected
- **WHEN** two entries in `dataSources` share one `ds_` id
- **THEN** the process body fails to parse

#### Scenario: A field id nested inside a group collides with a top-level field id
- **WHEN** a top-level field and a field nested inside a `group` field share one `field_` id
- **THEN** the process body fails to parse

#### Scenario: Two fields nested inside different groups share an id
- **WHEN** two fields nested inside two different `group` fields share one `field_` id
- **THEN** the process body fails to parse

### Requirement: Every field key and data source key is unique, and no data source key shadows a reserved CEL namespace

Field `key`s SHALL be unique across the full field tree (including fields
nested at any depth inside `group` fields), since CEL addresses fields by
`key` in the flat `data` namespace and a duplicate key is unresolvable
ambiguity, not merely redundant metadata. Data source `key`s SHALL be
unique among themselves, and SHALL NOT equal any of the reserved top-level
CEL namespace names (`data`, `instance`, `actor`, `child`, `result`): a data
source is registered as its own top-level CEL variable named by its `key`,
so a collision with a reserved namespace name silently rewires expression
scoping wherever that data source is visible.

#### Scenario: Duplicate field keys are rejected
- **WHEN** two fields anywhere in the tree, including one nested inside a `group`, share one `key`
- **THEN** the process body fails to parse

#### Scenario: Duplicate data source keys are rejected
- **WHEN** two entries in `dataSources` share one `key`
- **THEN** the process body fails to parse

#### Scenario: A data source keyed as a reserved namespace name is rejected
- **WHEN** a `dataSources` entry has `key: "child"` (or `"data"`, `"instance"`, `"actor"`, `"result"`)
- **THEN** the process body fails to parse

### Requirement: View field references resolve against the full recursive field set

A `view.fields[].ref` SHALL resolve against every field id in the body,
including fields nested at any depth inside a `group` field, matching the
field set the CEL layer already type-checks expressions against. A
`view.fields[].ref` naming a nested field id SHALL NOT be rejected, and one
naming no field at any depth SHALL fail to parse.

#### Scenario: A view referencing a nested group field's id resolves
- **WHEN** a step's `view.fields` includes an entry whose `ref` names a field id declared inside a `group` field's `fields`
- **THEN** the process body parses successfully (subject to every other invariant)

#### Scenario: A view reference to an unknown field id is still rejected
- **WHEN** a step's `view.fields` includes an entry whose `ref` names no field id at any depth
- **THEN** the process body fails to parse
