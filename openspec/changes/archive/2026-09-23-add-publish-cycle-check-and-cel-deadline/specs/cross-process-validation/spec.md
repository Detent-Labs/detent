## ADDED Requirements

### Requirement: A published process does not reach itself through subprocess references

Publish SHALL reject a body with a cross-process validation error when the body
reaches its own `processId` through subprocess references. The walk follows
every subprocess step of the published body and of each child it reaches. Each
reference SHALL resolve the way the child-first check resolves it at publish: a
`pinned` reference to its `pinnedVersion`, a `latest-at-spawn` reference to the
latest published version whose contract signature matches its `contractRef`.

The rule compares process ids, not versions, so a reference to any version of
the published process counts. A direct reference from a process to itself is
the shortest such cycle. The error SHALL name the chain of process ids that
closes the cycle. Publish SHALL persist no version.

A `process.start` action is not a subprocess reference and SHALL NOT take part
in this walk. A chained start runs as an independent instance that its starter
does not wait on.

#### Scenario: Publish rejects a process that references itself as a subprocess
- **WHEN** the author publishes process A. A new version of A then adds a subprocess step whose child is A
- **THEN** publish rejects the new version with a cross-process validation error naming the chain A → A. It persists no version.

#### Scenario: Publish rejects the version that closes a two-process cycle
- **WHEN** A v1 has no subprocess step. The author publishes B with a `latest-at-spawn` subprocess step whose child is A. Then A v2 adds a subprocess step whose child is B.
- **THEN** publish rejects A v2 with a cross-process validation error naming the chain A → B → A. It does not persist A v2.

#### Scenario: Publish rejects a pinned reference to an earlier version of the same process
- **WHEN** B pins A v1 as its subprocess child. A new version of A adds a subprocess step whose child is B
- **THEN** publish rejects the new version of A with a cross-process validation error. The rejection holds although A v1 itself calls nothing.

#### Scenario: An acyclic subprocess chain publishes
- **WHEN** the author publishes C, B references C as a subprocess, and A references B as a subprocess
- **THEN** each publish succeeds, subject to the other cross-process checks

#### Scenario: A process.start loop publishes
- **WHEN** A carries a `process.start` action that starts B, and B carries a `process.start` action that starts A
- **THEN** both publishes succeed, because the subprocess cycle check does not follow `process.start` actions
