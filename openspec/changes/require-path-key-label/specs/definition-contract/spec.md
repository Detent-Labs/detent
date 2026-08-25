## ADDED Requirements

### Requirement: A path carries a non-empty key and a non-empty label

`Path.key` SHALL be a non-empty string after trimming leading and trailing
whitespace. `Path.label` SHALL be present. It SHALL also be a non-empty
string after trimming. Both rules apply to a path of either trigger kind,
manual or automatic.

Neither is a format constraint. `Path.key` stays exempt from the
CEL-identifier grammar. The base requirement `A field key is a
CEL-referenceable identifier` states that grammar. Nothing reads a path key
as a CEL variable.

#### Scenario: Publishing rejects an empty path key

- **WHEN** a process definition declares a path whose `key` is `""`
- **THEN** publishing fails, naming that path

#### Scenario: Publishing rejects a whitespace-only path key

- **WHEN** a process definition declares a path whose `key` is `"   "`
- **THEN** publishing fails, naming that path

#### Scenario: Publishing rejects a missing path label

- **WHEN** a process definition declares a path with no `label`
- **THEN** publishing fails, naming that path

#### Scenario: Publishing rejects an empty path label

- **WHEN** a process definition declares a path whose `label` is `""`
- **THEN** publishing fails, naming that path

#### Scenario: Publishing rejects a whitespace-only path label

- **WHEN** a process definition declares a path whose `label` is `"   "`
- **THEN** publishing fails, naming that path

#### Scenario: Publishing rejects a missing label on an automatic path too

- **WHEN** a process definition declares an automatic path with no `label`
- **THEN** publishing fails, naming that path
- **AND** the rejection matches what a manual path would get

#### Scenario: Publishing accepts a path with a non-empty key and label

- **WHEN** a process definition declares a path whose `key` and `label` are
  both non-empty after trimming
- **THEN** publishing succeeds
