# Spec Delta

<!-- Why: each directive below covers text copied from the base requirement; its wording stays unchanged so the archive diff shows only the real edits. -->

## MODIFIED Requirements

### Requirement: Resolve a frozen body from an instance pin

The store SHALL provide `resolveBody(processId, version, pinHash?)` returning the persisted
`ProcessBody` for that pin, or `undefined` when no such version exists. The
returned body MUST hash to the version's persisted `definitionHash`, so an
instance rehydrating against it passes its pin check.

When it loads a body, `resolveBody` SHALL hash the parsed body. It SHALL compare
the result with the `definition_hash` of the row the body came from. A mismatch
SHALL throw. A caller that holds an instance SHALL pass the instance's
`definitionHash` as `pinHash`. `resolveBody` SHALL throw when `pinHash` differs
from the row's `definition_hash`. That holds for a cached body and for a loaded one.

`version` identifiers occupy two disjoint spaces. A real published version is
always a positive number, assigned monotonically by publish. A test-instance
run claims a separate identifier space that never coincides with a published
version's identifier.

The store SHALL resolve a test-instance identifier to the exact `ProcessBody`
frozen when that run started. It SHALL never resolve to the process's
live/current draft body. It SHALL never resolve to any published version's
body. A test-instance run's frozen body stays immutable once written, the
same as a published version's. The check above applies to it too.

#### Scenario: Resolving a persisted pin returns its body

- **WHEN** `resolveBody(processId, version)` is called for a persisted version
- **THEN** it returns that version's `ProcessBody`, which passes `rehydrate`'s
  pin check

#### Scenario: Resolving an absent pin returns undefined

- **WHEN** `resolveBody` is called for a `(processId, version)` that was never
  published
- **THEN** it returns `undefined` and does not throw

#### Scenario: Resolving a test-instance's reserved identifier returns its frozen body

- **WHEN** a caller calls `resolveBody(processId, version)` with the
  identifier assigned to a test-instance run
- **THEN** it returns the exact `ProcessBody` frozen when that run started,
  not the process's current draft body

#### Scenario: The two identifier spaces never resolve to each other's body

- **WHEN** a process has both a real published version and a test-instance
  run
- **AND** a caller might otherwise expect one identifier to reach the
  other's body
- **THEN** resolving the published version's identifier returns only that
  published body
- **AND** resolving the test-instance's reserved identifier returns only
  that test-instance's frozen body, never the other's

#### Scenario: Resolving an ordinary published pin stays unchanged

- **WHEN** a caller calls `resolveBody(processId, version)` for a real,
  positive published `version`
- **THEN** it resolves exactly as it did before test-instance runs existed
- **AND** it returns that version's persisted body with no change in
  behavior for every caller resolving a published pin

#### Scenario: A row whose body no longer matches its hash fails

- **WHEN** the `body` of a `definitions` row changes while its
  `definition_hash` stays, and `resolveBody` loads that version
- **THEN** it throws and returns no body

#### Scenario: A caller's pinned hash that differs from the row fails

- **WHEN** a caller passes `pinHash` for an instance and the version's row
  holds another `definition_hash`
- **THEN** `resolveBody` throws, whether the body is cached or not

#### Scenario: A matching pinned hash resolves as before

- **WHEN** a caller passes the `definitionHash` of its instance's pin
  and the row holds the same value
- **THEN** `resolveBody` returns the body

### Requirement: Resolved bodies are cached without invalidation

Published versions are immutable. The store MAY memoize resolved published bodies
process-locally and SHALL never need to invalidate a cached entry. A cache hit
SHALL return the same body a fresh read would. The store SHALL NOT cache a
test-instance's frozen body. Each test-instance run adds a new identifier, so
the cache would grow with every run until a restart.

#### Scenario: A second resolve of the same pin does not re-read the store

- **WHEN** `resolveBody` is called twice for the same persisted pin
- **THEN** both calls return the identical body and the second is served from the
  process-local cache

#### Scenario: A test-instance's body is not kept in the cache

- **WHEN** `resolveBody` resolves a test-instance's reserved identifier
- **THEN** a second call for the same identifier reads the store again
- **AND** if the snapshot row is gone by then, the second call returns `undefined`
