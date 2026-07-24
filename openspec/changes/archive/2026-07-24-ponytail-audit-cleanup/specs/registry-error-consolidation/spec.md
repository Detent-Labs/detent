## ADDED Requirements

### Requirement: One error base per registry-validation family

`RegistryValidationError` (thrown by `checkActionRegistry`),
`AssignmentRegistryValidationError` (thrown by `checkAssignmentRegistry`),
and `DataSourceRegistryValidationError` (thrown by
`checkDataSourceRegistry`) SHALL share one implementation — a common base
class or a single class parameterized by `name` — rather than
independently-maintained, structurally identical classes. All three class
names SHALL remain distinct, importable identifiers, each carrying its own
`name` and every located issue, so existing
`instanceof RegistryValidationError` /
`instanceof AssignmentRegistryValidationError` /
`instanceof DataSourceRegistryValidationError` checks and error messages at
every call site are unaffected.

#### Scenario: Action-registry violation still throws its own named error

- **WHEN** `publishBody` rejects a body for an unregistered action type or a
  schema-violating action config
- **THEN** it throws an error that is `instanceof RegistryValidationError`,
  named `"RegistryValidationError"`, carrying every located issue

#### Scenario: Assignment-registry violation still throws its own named error

- **WHEN** `publishBody` rejects a body for a non-static assignment strategy
  type or an invalid `candidates` config
- **THEN** it throws an error that is `instanceof AssignmentRegistryValidationError`,
  named `"AssignmentRegistryValidationError"`, carrying every located issue

#### Scenario: Data-source-registry violation still throws its own named error

- **WHEN** `publishBody` rejects a body for an unregistered data source type
  or a schema-violating data source config
- **THEN** it throws an error that is `instanceof DataSourceRegistryValidationError`,
  named `"DataSourceRegistryValidationError"`, carrying every located issue

### Requirement: One shared helper maps Zod config issues to RegistryIssue

`checkActionRegistry`, `checkAssignmentRegistry`, and
`checkDataSourceRegistry` SHALL map a failed `configSchema` parse to
`RegistryIssue[]` through one shared helper (location path join + push),
not independent copies of the same mapping loop. The mapped `RegistryIssue`
shape and field values SHALL be identical to the pre-consolidation output
for all three checks.

#### Scenario: An action config-schema violation maps through the shared helper

- **WHEN** `checkActionRegistry` encounters an action whose `config` fails
  its handler's `configSchema`
- **THEN** the resulting `RegistryIssue` has the same `path`/`message`
  shape it had before the mapping loop was shared

#### Scenario: An assignment config-schema violation maps through the shared helper

- **WHEN** `checkAssignmentRegistry` encounters a `static` assignment whose
  `config` fails the `{ candidates: string[] }` check
- **THEN** the resulting `RegistryIssue` has the same `path`/`message`
  shape it had before the mapping loop was shared

#### Scenario: A data-source config-schema violation maps through the shared helper

- **WHEN** `checkDataSourceRegistry` encounters a data source whose `config`
  fails its handler's `configSchema`
- **THEN** the resulting `RegistryIssue` has the same `path`/`message`
  shape it had before the mapping loop was shared
