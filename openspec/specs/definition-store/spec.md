# definition-store

## Purpose

Defines the store that persists published process versions and resolves the frozen
`ProcessBody` an instance is pinned to, backing the engine's resolution and timer
workers.

## Requirements

### Requirement: Persist a published version

The store SHALL persist each published process version keyed by
`(processId, version)`, holding the frozen `ProcessBody` and its pin metadata
(`definitionHash`, `status`, `publishedAt`). A persisted version is immutable:
the store SHALL NOT overwrite the body of an existing `(processId, version)`.

#### Scenario: A published version is persisted and retrievable

- **WHEN** a compiled, hashed version is published
- **THEN** a row keyed by `(processId, version)` exists carrying the body and its
  `definitionHash`, and the body recomputes to that hash

#### Scenario: Overwriting an existing version with a different body is refused

- **WHEN** a publish targets an existing `(processId, version)` with a body that
  hashes differently
- **THEN** the store rejects it and the persisted body is unchanged

### Requirement: Publish is monotonic and idempotent-on-identical

Publishing an authored body SHALL compile it (cancel-sink injection) and hash the
compiled body. If a version with that `definitionHash` already exists for the
`processId`, publish is a no-op returning the existing version. Otherwise the
store SHALL assign the next monotonic `version` for that `processId` and insert
the new version.

#### Scenario: Re-publishing an identical body is a no-op

- **WHEN** the same authored body is published twice
- **THEN** the second publish creates no new version and returns the first

#### Scenario: Publishing a changed body assigns the next version

- **WHEN** an authored body that differs from the latest published body is
  published for the same `processId`
- **THEN** the store assigns `version = latest + 1` and persists it

### Requirement: Resolve a frozen body from an instance pin

The store SHALL provide `resolveBody(processId, version)` returning the persisted
`ProcessBody` for that pin, or `undefined` when no such version exists. The
returned body MUST hash to the version's persisted `definitionHash`, so an
instance rehydrating against it passes its pin check.

#### Scenario: Resolving a persisted pin returns its body

- **WHEN** `resolveBody(processId, version)` is called for a persisted version
- **THEN** it returns that version's `ProcessBody`, which passes `rehydrate`'s
  pin check

#### Scenario: Resolving an absent pin returns undefined

- **WHEN** `resolveBody` is called for a `(processId, version)` that was never
  published
- **THEN** it returns `undefined` and does not throw

### Requirement: Resolved bodies are cached without invalidation

Because published versions are immutable, the store MAY memoize resolved bodies
process-locally and SHALL never need to invalidate a cached entry. A cache hit
SHALL return the same body a fresh read would.

#### Scenario: A second resolve of the same pin does not re-read the store

- **WHEN** `resolveBody` is called twice for the same persisted pin
- **THEN** both calls return the identical body and the second is served from the
  process-local cache

### Requirement: Workers run against the store's resolver

The resolution and timer workers SHALL accept a resolver that may return a
`Promise`. Wired to the store's `resolveBody`, a parked wait-state whose writeback
satisfies an automatic guard SHALL re-resolve to rest, and a due timer SHALL
fire — neither is inert.

#### Scenario: A parked wait-state re-resolves against the stored body

- **WHEN** an instance pinned to a published version is flagged for re-resolution
  and the store resolves its body
- **THEN** the resolution worker advances it exactly as an injected in-memory
  resolver would

#### Scenario: A due timer fires against the stored body

- **WHEN** an instance pinned to a published version has a due timer and the store
  resolves its body
- **THEN** the timer worker fires it exactly as an injected in-memory resolver
  would
