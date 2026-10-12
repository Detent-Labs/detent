# Spec Delta

## ADDED Requirements

### Requirement: A guard test reads the set it guards from the tree

A test that guards every member of a set kept in the tree SHALL read that set
from the tree. It SHALL NOT keep its own list. The sets are the files of a
directory and the example definitions under `examples/`. A test that scans
source text SHALL fail when the scan finds no file. A list kept by hand goes
stale without a signal.

#### Scenario: A new example needs a change to neither guard

- **WHEN** a contributor adds a wrapper under `examples/` with a correct
  `definitionHash`
- **THEN** the hash guard and the `stripCompiledContent` round trip cover it
- **AND** neither test file changes

#### Scenario: A SQL reader in a new runtime file gets scanned

- **WHEN** a contributor adds a file under `src/runtime/` that filters
  `instances` on `body->>'status'`
- **THEN** the index guard fails and names the file and the key

#### Scenario: An empty scan fails

- **WHEN** the index guard finds no file to scan
- **THEN** the guard fails instead of passing on an empty set

### Requirement: The hash guard covers every example

The hash guard SHALL cover every file under `examples/`. A wrapper that holds a
`definitionHash` SHALL store the hash of its compiled body. A bare body SHALL
have a row in the table of recorded hashes. A file with neither SHALL fail the
guard.

#### Scenario: A stale wrapper hash fails

- **WHEN** a wrapper under `examples/` holds a `definitionHash` that differs
  from the hash of its compiled body
- **THEN** the hash guard fails and names the file

#### Scenario: A bare body outside the recorded table fails

- **WHEN** a file under `examples/` has no wrapper and no row in the table of
  recorded hashes
- **THEN** the hash guard fails and names the file

### Requirement: A test asserts the outcome its name claims

A test SHALL fail when the behavior its name states is absent. An assertion
that every outcome but one satisfies does not meet this. A test with an empty
body does not meet it either. A test whose name claims how a route answers
SHALL pin that answer's status and `error.type`. A test of a list that a spec
requires SHALL iterate that list.

#### Scenario: A missing route fails the body-size test

- **WHEN** the route that the body-size test posts to answers 404, 401 or 500
- **THEN** the test fails, since it pins the status and the `error.type` of the
  malformed-body answer

#### Scenario: A frozen plan stays frozen

- **WHEN** a migration has run for plan (1→4)
- **THEN** a registration for (1→4) fails
- **AND** a registration for (2→4) replaces that plan's spec

#### Scenario: A required route missing from the document fails

- **WHEN** `docs/openapi.yaml` lacks one route of the `http-api-documentation`
  list
- **THEN** the documentation test fails and names the route

### Requirement: Every invariant has a test that rejects a violating input

Each authoring invariant of the validation layer SHALL have a test. The test
feeds it a violating input and expects a refusal. The input SHALL differ from a valid
one in the single respect that the invariant names. The same test file SHALL
hold the nearest valid input, which the validation accepts. A refusal test that
fails for another reason proves nothing. The valid twin shows the reason.

The scenarios below name the invariants that carry this test.

#### Scenario: A terminal step with an outgoing path fails

- **WHEN** a body declares a terminal step that owns a path
- **THEN** validation refuses the body
- **AND** the same body without that path validates

#### Scenario: A timer naming a foreign path fails

- **WHEN** a timer's `targetPath` names a path that another step owns
- **THEN** validation refuses the body

#### Scenario: A timer with both limits or neither fails

- **WHEN** a timer declares both `duration` and `deadline`, or neither
- **THEN** validation refuses the body

#### Scenario: A pinned reference without a version fails

- **WHEN** a subprocess reference binds `pinned` and omits `pinnedVersion`
- **THEN** validation refuses the body
- **AND** a `latest-at-spawn` reference that names `pinnedVersion` fails too

#### Scenario: A latest-at-spawn reference without a contract reference fails

- **WHEN** a subprocess reference binds `latest-at-spawn` and omits
  `contractRef`
- **THEN** validation refuses the body

#### Scenario: A contracted terminal step without an outcome fails

- **WHEN** a body declares a contract and a terminal step without an outcome
- **THEN** validation refuses the body

#### Scenario: A declared outcome that no step binds fails

- **WHEN** a contract declares an outcome that no terminal step names
- **THEN** validation refuses the body

#### Scenario: A string past its length bound fails

- **WHEN** a `Plugin.type`, a duration, a `FieldDef.key` or a `columnMapping`
  key exceeds its bound by one character
- **THEN** validation refuses the body
- **AND** a string of exactly the bound validates

#### Scenario: A mismatched unmappable step fails

- **WHEN** `unmappableStep` appears without `onUnmappable: "route-to-step"`, or
  the route-to-step value appears without it
- **THEN** validation refuses the migration spec

#### Scenario: A duplicate step id fails

- **WHEN** two steps share one id
- **THEN** validation refuses the body

#### Scenario: The reserved sink key alone fails

- **WHEN** an authored body carries a step with the reserved cancel-sink `key`
  and another id
- **THEN** validation refuses the body
