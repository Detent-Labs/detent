## ADDED Requirements

### Requirement: Validator-to-EditorIssue mapping shares one implementation

`runValidation`'s four validator-dimension mapping loops — duration
(`validateDurations`), registry (`checkActionRegistry`), CEL on the main
body (`validateProcessBody`), and CEL on a subprocess child
(`checkSubprocessChildRefs`) — SHALL push their results into the issue
list through one shared helper (`pushIssues`), not independently
maintained, structurally identical loops. The Zod-issue mapping in the
Draft-is-structurally-invalid branch is exempt (different input shape and
`resolveLoc` target — see design.md). Each produced `EditorIssue`'s
`entityType`/`entityId`/`message`/`source` SHALL be unchanged from
pre-consolidation behavior.

#### Scenario: A duration-grammar error maps through the shared helper

- **WHEN** a timer's `duration` fails ISO-8601 grammar validation
- **THEN** the resulting `EditorIssue` has `source: "duration"` and the
  same `entityType`/`entityId`/`message` it had before the mapping loop
  was shared

#### Scenario: A registry config error maps through the shared helper

- **WHEN** an action's `config` fails its registered handler's
  `configSchema`
- **THEN** the resulting `EditorIssue` has `source: "registry"` and the
  same `entityType`/`entityId`/`message` it had before the mapping loop
  was shared

#### Scenario: A CEL type error on the main body maps through the shared helper

- **WHEN** a path's guard or a timer's deadline expression fails CEL
  type-checking
- **THEN** the resulting `EditorIssue` has `source: "cel"` and the same
  `entityType`/`entityId`/`message` it had before the mapping loop was
  shared

#### Scenario: A subprocess cross-process-ref error maps through the shared helper

- **WHEN** a subprocess step's input/output mapping references a field
  the loaded child contract doesn't declare
- **THEN** the resulting `EditorIssue` has `source: "cel"` and the same
  `entityType`/`entityId`/`message` it had before the mapping loop was
  shared
