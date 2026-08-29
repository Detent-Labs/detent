## MODIFIED Requirements

### Requirement: Resolve a frozen body from an instance pin

The store SHALL provide `resolveBody(processId, version)` returning the persisted
`ProcessBody` for that pin, or `undefined` when no such version exists. The
returned body MUST hash to the version's persisted `definitionHash`, so an
instance rehydrating against it passes its pin check.

`version` identifiers occupy two disjoint spaces. A real published version is
always a positive number, assigned monotonically by publish. A separate space
of identifiers is reserved for test-instance runs and can never coincide with
a real published version's identifier. The store SHALL resolve a version
identifier reserved for test-instance runs to the exact `ProcessBody` frozen
at the moment that test-instance run was created, never to the process's
live/current draft body, and never to any published version's body. A
test-instance run's frozen body is immutable once written, the same as a
published version's, so it is cached without invalidation under the same
rule this capability already applies to published bodies.

#### Scenario: Resolving a persisted pin returns its body

- **WHEN** `resolveBody(processId, version)` is called for a persisted version
- **THEN** it returns that version's `ProcessBody`, which passes `rehydrate`'s
  pin check

#### Scenario: Resolving an absent pin returns undefined

- **WHEN** `resolveBody` is called for a `(processId, version)` that was never
  published
- **THEN** it returns `undefined` and does not throw

#### Scenario: Resolving a test-instance's reserved identifier returns its frozen body

- **WHEN** `resolveBody(processId, version)` is called with the reserved
  identifier assigned to a test-instance run
- **THEN** it returns the exact `ProcessBody` that was frozen when that run
  was created, not the process's current draft body

#### Scenario: The two identifier spaces never resolve to each other's body

- **WHEN** a process has both a real published version and a test-instance
  run whose reserved identifier a caller might otherwise expect to interact
  with it
- **THEN** resolving the published version's identifier returns only that
  published body, and resolving the test-instance's reserved identifier
  returns only that test-instance's frozen body — neither resolution ever
  returns the other's body

#### Scenario: Resolving an ordinary published pin is unaffected

- **WHEN** `resolveBody(processId, version)` is called for a real, positive
  published `version`
- **THEN** it resolves exactly as it did before test-instance runs existed,
  returning that version's persisted body with no change in behavior for
  every caller resolving a published pin
