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
store SHALL validate the compiled body's actions against the injected action
registry, its expressions, and its cross-process wiring, then assign the next
monotonic `version` for that `processId` and insert the new version.

Action-registry, expression, and cross-process validation SHALL run on the
insert path only, after the hash-hit lookup: a body already published is not
re-validated, so a tightening of any of the three checks — including a
handler being registered later, or its `configSchema` tightening later —
never retroactively rejects a definition that instances are already pinned
to. Duration validation is the exception by construction — it lives inside
the compile pass the hash itself derives from, so it necessarily precedes
the lookup.

#### Scenario: Re-publishing an identical body is a no-op

- **WHEN** the same authored body is published twice
- **THEN** the second publish creates no new version and returns the first

#### Scenario: Publishing a changed body assigns the next version

- **WHEN** an authored body that differs from the latest published body is
  published for the same `processId`
- **THEN** the store assigns `version = latest + 1` and persists it

#### Scenario: An already-published body is not re-validated

- **WHEN** a body identical to an already-published version is published again
  after the expression check has tightened
- **THEN** publish returns the existing version without raising, because the
  hash-hit path precedes expression validation

#### Scenario: An already-published body is not re-validated against a newly stricter registry

- **WHEN** a body identical to an already-published version is published
  again after a handler it uses gained a `configSchema` the original
  `config` would now fail
- **THEN** publish returns the existing version without raising, because the
  hash-hit path precedes the action-registry check

### Requirement: Publish round-trips through validation

The body a publish persists, the body it returns, and the `definitionHash` it
computes SHALL all derive from the validated parse output of the authored body,
not from the raw input. Content the contract schemas do not declare (unknown
keys, at any depth) therefore SHALL NOT reach the hash or the store: publishing
a body carrying such content is equivalent to publishing its stripped form. A
publish→read round trip is hash-stable — for every persisted version,
`definitionHash(resolveBody(pin)) === pin.definitionHash` — and both publish
return paths (fresh insert and idempotent hash-hit) return a body with this
property.

#### Scenario: Unknown authored keys never reach the hash or the store

- **WHEN** an authored body carrying an extra unknown key (e.g. an editor
  annotation on a step) is published
- **THEN** the persisted body and the returned `definition` do not contain the
  key, and the version's `definitionHash` equals the hash of the stripped body

#### Scenario: A publish→read round trip is hash-stable

- **WHEN** a body published with an extra unknown key is later resolved through
  the store
- **THEN** recomputing `definitionHash` over the resolved body yields the
  version's persisted `definitionHash`

#### Scenario: An instance created from the publish return value rehydrates

- **WHEN** an instance is created from the `definition` returned by the insert
  path of a publish whose authored input carried an unknown key
- **THEN** rehydrating that instance against the store-resolved body succeeds
  (no pin mismatch)

#### Scenario: Re-publishing the read-back body is a no-op

- **WHEN** the body resolved from a published version is published again for the
  same `processId`
- **THEN** no new version is created and the existing version is returned

### Requirement: Publish requires an action registry and rejects an invalid action

`publishBody` SHALL take the process's action `Registry` as a required
argument and SHALL reject the publish, before any persist, when the compiled
body carries an action whose `type` is not registered or whose `config`
violates its handler's declared `configSchema`. This closes the same class of
gap the expression check closes: an unknown handler type or an invalid
plugin config publishing cleanly today only fails at outbox delivery — retry,
dead-letter, parked instance — with no author-visible signal at the point the
mistake was made.

The rejection SHALL carry every located issue, not only the first, so an
author fixes one publish's worth of action defects at a time. This check
SHALL run on the compiled body, after the hash-hit no-op return, in the same
insert-path position as the expression check.

#### Scenario: A body with an unregistered action type is not published

- **WHEN** `publishBody` is called with a body containing an action whose
  `type` is absent from the given registry
- **THEN** it throws, reporting the location and the unregistered `type`,
  and no definitions row is written

#### Scenario: A body with a schema-violating action config is not published

- **WHEN** `publishBody` is called with a body containing an action whose
  `config` fails its resolved handler's declared `configSchema`
- **THEN** it throws, reporting the location and the violation, and no
  definitions row is written

#### Scenario: A rejected publish consumes no version number

- **WHEN** a publish is rejected for an invalid action and a valid body is
  then published for the same `processId`
- **THEN** the valid body receives the version the rejected publish would
  have received

#### Scenario: A body with only valid actions publishes normally

- **WHEN** `publishBody` is called with a body whose every action resolves in
  the registry and satisfies its handler's declared `configSchema` (or the
  handler declares none)
- **THEN** the action-registry check raises nothing and publish proceeds to
  its remaining checks

### Requirement: Publish rejects a body carrying an invalid expression

Publish SHALL parse- and type-check every `Expression` in the body it is about to
persist, and SHALL reject the publish when any expression is invalid. The check
runs over the **compiled** body — the compile pass's output, so a step that pass
injects is held to the same rule as an authored one — and **before any persist**,
so a rejected publish leaves no row, no version number consumed, and no partially
validated definition behind.

Receiving the compiled body is a **placement invariant, not an observable
behaviour**. The cancel sink injected today declares no expression, and the check
never reads `contract`, so for every body expressible now the compiled and
authored forms check identically and no test can distinguish them. It is stated
so that a compile pass which later injects an expression is covered by
construction, rather than by someone remembering to re-order the call.

The rejection SHALL carry every located issue, not only the first, so an author
fixes one publish's worth of expressions at a time.

An unknown handler type, an invalid plugin config and an invalid expression are
one class of failure: a publish error, never a runtime error. Deferring an
expression failure to runtime is unrecoverable in practice — a broken guard is
total, so it evaluates `false` forever and parks the instance on a wait-state
with no signal; a broken mapping throws inside outbox delivery, re-invokes the
external handler on each retry, and dead-letters, parking the parent.

#### Scenario: a body with an unparseable expression is not published

- **WHEN** `publishBody` is called with a body containing an expression whose
  `src` does not parse as CEL
- **THEN** it throws, reporting the location and message of each invalid
  expression, and no definitions row is written

#### Scenario: a body with an unknown field reference is not published

- **WHEN** `publishBody` is called with a body whose guard references a field key
  absent from the catalog
- **THEN** it throws and no version is assigned

#### Scenario: a body whose Action.output reads outside `result` is not published

- **WHEN** `publishBody` is called with a body whose `Action.output` expression
  references `data`, `instance`, `actor`, `child`, or a data-source result
- **THEN** it throws, rather than persisting a definition whose writeback would
  throw on every delivery attempt

#### Scenario: a rejected publish consumes no version number

- **WHEN** a publish is rejected for an invalid expression and a valid body is
  then published for the same `processId`
- **THEN** the valid body receives the version the rejected publish would have
  received

#### Scenario: the check is handed the compiled body

- **WHEN** publish validates a body's expressions
- **THEN** the value passed to the check is the compile pass's output, not the
  authored input — so an expression on an injected step would be checked, and the
  body validated is the body persisted

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

### Requirement: Resolve the newest published version for a process

`createDefinitionStore`'s returned object SHALL provide
`resolveLatest(processId): Promise<{ version: number; body: ProcessBody } | undefined>`,
returning the newest published `version` for `processId` together with its
`ProcessBody`, or `undefined` when `processId` has no published version. The
returned body MUST hash to that version's persisted `definitionHash`, so an
instance created against it pins and rehydrates correctly, exactly as
`resolveBody` guarantees for an explicit version.

#### Scenario: Resolving the latest version of a published process

- **WHEN** `resolveLatest(processId)` is called for a process with one or more
  published versions
- **THEN** it returns the highest `version` number published for that
  `processId` together with its `ProcessBody`

#### Scenario: Resolving the latest version after a new publish

- **WHEN** a process already has a published version and a new, differing
  body is published for it, and `resolveLatest` is then called
- **THEN** it returns the newly published (higher) version, not the prior one

#### Scenario: Resolving the latest version of an unpublished process

- **WHEN** `resolveLatest` is called for a `processId` with no published
  version
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
