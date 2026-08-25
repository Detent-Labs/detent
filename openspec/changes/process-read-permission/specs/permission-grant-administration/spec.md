## MODIFIED Requirements

### Requirement: The engine refuses a malformed grant body before any write

The engine SHALL validate a write body and a revoke body before either one
reaches the store. It SHALL answer `400` where the body fails. Four cases
fail:

- `role` missing, empty, or not a string.
- `permission` outside the four the `authorization` capability defines:
  `"publish"`, `"cancel"`, `"migrate"` and `"read"`.
- `scope` missing, or carrying a `type` other than `"process"`.
- A `"process"` scope whose `config.processId` is missing or does not match the
  `proc_` prefix a `ProcessId` requires.

The engine SHALL bound the stored strings the way the definition contract bounds
an authored `key`. A route therefore cannot write a row no reader can handle.

A `400` SHALL name which field failed. An operator writing a provisioning script
reads that message rather than guessing.

#### Scenario: The engine refuses an unknown permission

- **WHEN** an operator POSTs a grant whose `permission` is `"admin"`
- **THEN** the response is `400`
- **AND** the store holds no row for it

#### Scenario: The engine stores a read grant

- **WHEN** an operator POSTs a grant whose `permission` is `"read"` over a
  well-formed `"process"` scope
- **THEN** the response reports success
- **AND** the store holds that row
- **AND** listing the grants carries it

#### Scenario: The engine refuses an unknown scope type

- **WHEN** an operator POSTs a grant whose scope `type` is `"label"`
- **THEN** the response is `400`
- **AND** the store holds no row for it

#### Scenario: The engine refuses a scope with no process id

- **WHEN** an operator POSTs a `"process"` scope whose `config` carries no
  `processId`
- **THEN** the response is `400`
- **AND** the store holds no row for it

#### Scenario: The engine refuses an empty role

- **WHEN** an operator POSTs a grant whose `role` is the empty string
- **THEN** the response is `400`
- **AND** the store holds no row for it

#### Scenario: The error names the failing field

- **WHEN** any of the four cases above answers `400`
- **THEN** the error message names the field that failed
