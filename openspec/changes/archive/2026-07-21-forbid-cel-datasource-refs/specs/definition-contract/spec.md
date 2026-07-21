## MODIFIED Requirements

### Requirement: Every field key and data source key is unique, and no data source key shadows a reserved CEL namespace

Field `key`s SHALL be unique across the full field tree (including fields
nested at any depth inside `group` fields), since CEL addresses fields by
`key` in the flat `data` namespace and a duplicate key is unresolvable
ambiguity, not merely redundant metadata. Data source `key`s SHALL be
unique among themselves, and SHALL NOT equal any of the reserved top-level
CEL namespace names (`data`, `instance`, `actor`, `child`, `result`): a data
source key is reserved as a top-level CEL identifier (registered only once
data-source resolution exists), so a collision with a reserved namespace name
would silently rewire expression scoping. The reservation holds now even though a
CEL reference to a data source is currently a publish error.

#### Scenario: Duplicate field keys are rejected
- **WHEN** two fields anywhere in the tree, including one nested inside a `group`, share one `key`
- **THEN** the process body fails to parse

#### Scenario: Duplicate data source keys are rejected
- **WHEN** two entries in `dataSources` share one `key`
- **THEN** the process body fails to parse

#### Scenario: A data source keyed as a reserved namespace name is rejected
- **WHEN** a `dataSources` entry has `key: "child"` (or `"data"`, `"instance"`, `"actor"`, `"result"`)
- **THEN** the process body fails to parse
